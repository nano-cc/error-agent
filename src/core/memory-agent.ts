// Memory Agent - Error Agent
// 专门用于记忆管理的子 Agent

import {
  StateGraph,
  MessagesAnnotation,
  START,
  END,
  Annotation,
} from "@langchain/langgraph";
import { CustomToolNode } from "../tools/tool-node";
import {
  SystemMessage,
  HumanMessage,
  BaseMessage,
} from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { ToolRegistry } from "../tools/registry";
import {
  CreateMemoryItemTool,
  LoadMemoryItemTool,
  UpdateMemoryItemTool,
  DeleteMemoryItemTool,
  SearchMemoryItemsTool,
  ListMemoryItemsTool,
  MemoryFinishTool,
} from "../tools/memory";

export interface MemoryAgentConfig {
  mode: "save" | "retrieve";
}

// Prompts
const MEMORY_SAVE_PROMPT = `# Memory Save Agent
你是专门负责记忆存储的智能助手。

## 你的任务
根据用户的请求，将信息正确地存储到记忆系统中。

## 工作流程
1. 先使用 search_memory_items 搜索是否已有相关记忆
2. 如果找到相关记忆，判断是否需要更新
3. 如果没有找到，使用 create_memory_item 创建新记忆
4. 完成后调用 memory_finish 返回结果

## 分类建议
根据内容选择合适的分类：
- project_info: 项目相关信息
- api_doc: API 文档
- common_patterns: 通用模式
- troubleshooting: 故障排除指南
- decisions: 技术决策记录

## 注意事项
- 使用清晰、简洁的标题
- 内容要完整准确
- 完成后必须调用 memory_finish 返回操作结果
`;

const MEMORY_RETRIEVE_PROMPT = `# Memory Retrieve Agent
你是专门负责记忆检索的智能助手。

## 你的任务
根据用户的查询请求，从记忆系统中检索相关信息。

## 工作流程
1. 使用 list_memory_items 查看可用的分类结构
2. 使用 search_memory_items 搜索相关记忆项
3. 根据搜索结果，使用 load_memory_item 加载完整内容
4. 完成后调用 memory_finish 返回检索结果

## 记忆分类
根据内容选择合适的分类：
- project_info: 项目相关信息
- api_doc: API 文档
- common_patterns: 通用模式
- troubleshooting: 故障排除指南
- decisions: 技术决策记录

## 返回格式
使用 memory_finish 返回以下结构：
{
  result: [...],  // 找到的记忆项列表
  message: "..."   // 简要总结
}
`;

// 定义状态
const MemoryAgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  sessionId: Annotation<string>({
    reducer: (oldValue, newValue) => newValue ?? oldValue,
    default: () => `memory-${Date.now()}`,
  }),
});

export class MemoryAgent {
  private app: any;
  private config: any;
  private llm: any;
  private sessionId: string;
  private mode: "save" | "retrieve";

  constructor(model: ChatOpenAI, mode: "save" | "retrieve") {
    this.mode = mode;
    this.sessionId = `memory-${mode}-${Date.now()}`;

    console.log(
      `[MemoryAgent] Creating ${mode} agent with sessionId: ${this.sessionId}`,
    );

    // 创建专用的工具节点（只包含记忆工具）
    const tools = [
      new CreateMemoryItemTool(),
      new LoadMemoryItemTool(),
      new UpdateMemoryItemTool(),
      new DeleteMemoryItemTool(),
      new SearchMemoryItemsTool(),
      new ListMemoryItemsTool(),
      new MemoryFinishTool(), // 完成工具
    ];

    const toolNode = new CustomToolNode(tools, {
      autoApproveSafe: true, // 记忆工具都是安全的
    });

    // 绑定工具到 LLM
    console.log(`[MemoryAgent] Binding ${tools.length} tools to LLM...`);
    this.llm = model.bindTools(tools);

    // 构建工作流
    const workflow = new StateGraph(MemoryAgentState)
      .addNode("agent", (state) => this.callModel(state))
      .addNode("tools", toolNode.getRunnable())
      .addEdge(START, "agent")
      .addConditionalEdges("agent", (state: any) => {
        const lastMsg = state.messages[state.messages.length - 1];
        const hasToolCalls = lastMsg.tool_calls?.length > 0;
        console.log(
          `[MemoryAgent] Conditional edges: hasToolCalls=${hasToolCalls}, next=${hasToolCalls ? "tools" : END}`,
        );
        return hasToolCalls ? "tools" : END;
      })
      .addEdge("tools", "agent");

    this.app = workflow.compile({});
    this.config = {
      configurable: {
        thread_id: this.sessionId,
      },
    };

    console.log(`[MemoryAgent] Agent created successfully`);
  }

  private async callModel(state: any) {
    console.log("[MemoryAgent.callModel] Called with state:", {
      messageCount: state.messages.length,
      lastMessageType: state.messages[state.messages.length - 1]?._getType(),
    });

    const prompt =
      this.mode === "save" ? MEMORY_SAVE_PROMPT : MEMORY_RETRIEVE_PROMPT;
    const systemMsg = new SystemMessage(prompt);
    const filteredMessages = state.messages.filter(
      (m: any) => m._getType() !== "system",
    );

    console.log(
      `[MemoryAgent.callModel]` +
        ` Invoking LLM with ${filteredMessages.length} messages...`,
    );
    const response = await this.llm.invoke([systemMsg, ...filteredMessages]);

    console.log("[MemoryAgent.callModel] LLM response received:", {
      content: response.content,
      contentLength: response.content?.length || 0,
      toolCallCount: response.tool_calls?.length || 0,
      toolNames: response.tool_calls?.map((tc: any) => tc.name) || [],
    });

    return { messages: [response] };
  }

  public async *run(userMessage: string) {
    const input = {
      messages: [new HumanMessage(userMessage)],
      sessionId: this.sessionId,
    };

    const stream = await this.app.stream(input, this.config);
    for await (const chunk of stream) {
      yield chunk;
    }
  }

  public async runToEnd(userMessage: string): Promise<any> {
    console.log(`[MemoryAgent.runToEnd] Starting with message: ${userMessage}`);

    // 运行直到完成并返回最终结果
    for await (const chunk of this.run(userMessage)) {
      // 检查是否调用 memory_finish
      if (chunk.tools?.messages) {
        for (const msg of chunk.tools.messages) {
          const content = msg.content;
          if (typeof content === "string") {
            try {
              const parsed = JSON.parse(content);
              if (parsed.metadata?.specialAction === "finish") {
                console.log(
                  `[MemoryAgent.runToEnd] Received finish signal:`,
                  parsed,
                );
                return parsed.data;
              }
            } catch (e) {
              // Not JSON, skip
            }
          }
        }
      }
    }

    console.log(
      `[MemoryAgent.runToEnd] No finish signal received, returning null`,
    );
    return null;
  }
}

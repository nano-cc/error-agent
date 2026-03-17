// Explore Agent - Error Agent
// 专门负责代码调研的子 Agent

import {
  StateGraph,
  MessagesAnnotation,
  START,
  END,
  Annotation,
} from "@langchain/langgraph";
import { CustomToolNode } from "../tools/tool-node";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";

// LSP Tools
import {
  LSPHoverTool,
  LSPDefinitionTool,
  LSPReferencesTool,
  LSPDocumentSymbolsTool,
  LSPWorkspaceSymbolsTool,
  LSPDiagnosticsTool,
  LSPImplementationTool,
} from "../tools/lsp";

// File Tools (Read-only)
import { ListDirTool, FindFileTool } from "../tools/file";

// Search Tools
import { SearchInFileTool } from "../tools/search";
import { WebSearchTool } from "../tools/network";

// Explore Tools
import { ExploreFinishTool } from "../tools/explore";

const EXPLORE_PROMPT = `# Explore Agent
你是专门负责代码调研的智能助手。

## 你的任务
根据用户的调研主题，深入探索和分析项目中的相关代码、架构和模式。

## 可用工具

### LSP 工具（用于代码分析）
- lsp_hover: 获取符号的悬停信息（类型、文档等）
- lsp_definition: 跳转到符号定义位置
- lsp_references: 查找符号的所有引用位置
- lsp_document_symbols: 列出文件中的所有符号（类、函数、变量等）
- lsp_workspace_symbols: 搜索整个工作区的符号
- lsp_diagnostics: 获取文件的诊断信息（错误、警告、提示等）
- lsp_implementation: 查找接口或抽象类的实现

### 文件工具（只读）
- list_dir: 列出目录内容，支持正则过滤
- find_file: 递归查找匹配模式的文件

### 搜索工具
- search_in_file: 在文件中搜索正则表达式匹配的内容
- web_search: 使用 DuckDuckGo 进行网络搜索

## 工作流程

1. **理解调研主题**
   - 分析用户提供的调研主题
   - 确定需要探索的关键概念、组件或模块

2. **初步探索**
   - 使用 workspace_symbols 搜索相关符号
   - 使用 find_file 查找相关文件
   - 使用 web_search 搜索相关文档和最佳实践（如需要）

3. **深度分析**
   - 对于找到的关键文件，使用 document_symbols 获取结构
   - 使用 definition 和 references 理解代码关系
   - 使用 hover 获取详细类型和文档信息
   - 使用 diagnostics 检查代码质量

4. **总结发现**
   - 整理调研结果
   - 提供清晰的总结和建议

## 注意事项
- 系统性地探索，不要遗漏关键信息
- 优先使用 LSP 工具获取准确的代码信息
- 返回结构化、易于理解的调研结果
- 完成后必须调用 explore_finish 返回结果

## 返回格式
使用 explore_finish 返回：
{
  result: "详细的调研结果字符串...",
  summary: "简要的摘要说明"
}
`;

const ExploreAgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  sessionId: Annotation<string>({
    reducer: (oldValue, newValue) => newValue ?? oldValue,
    default: () => `explore-${Date.now()}`,
  }),
});

export class ExploreAgent {
  private app: any;
  private config: any;
  private llm: any;
  private sessionId: string;

  constructor(model: ChatOpenAI) {
    this.sessionId = `explore-${Date.now()}`;

    console.log(`[ExploreAgent] Creating agent with sessionId: ${this.sessionId}`);

    // 创建专用工具节点（只包含允许的工具）
    const tools = [
      // LSP Tools
      new LSPHoverTool(),
      new LSPDefinitionTool(),
      new LSPReferencesTool(),
      new LSPDocumentSymbolsTool(),
      new LSPWorkspaceSymbolsTool(),
      new LSPDiagnosticsTool(),
      new LSPImplementationTool(),
      // Read-only File Tools
      new ListDirTool(),
      new FindFileTool(),
      // Search Tools
      new SearchInFileTool(),
      new WebSearchTool(),
      // Finish Tool
      new ExploreFinishTool(),
    ];

    const toolNode = new CustomToolNode(tools, {
      autoApproveSafe: true, // 所有允许的工具都是安全的
    });

    // 绑定工具到 LLM
    console.log(`[ExploreAgent] Binding ${tools.length} tools to LLM...`);
    this.llm = model.bindTools(tools);

    // 构建工作流
    const workflow = new StateGraph(ExploreAgentState)
      .addNode("agent", (state) => this.callModel(state))
      .addNode("tools", toolNode.getRunnable())
      .addEdge(START, "agent")
      .addConditionalEdges("agent", (state: any) => {
        const lastMsg = state.messages[state.messages.length - 1];
        const hasToolCalls = lastMsg.tool_calls?.length > 0;
        console.log(
          `[ExploreAgent] Conditional edges: hasToolCalls=${hasToolCalls}, next=${hasToolCalls ? "tools" : END}`,
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

    console.log(`[ExploreAgent] Agent created successfully`);
  }

  private async callModel(state: any) {
    console.log("[ExploreAgent.callModel] Called with state:", {
      messageCount: state.messages.length,
      lastMessageType: state.messages[state.messages.length - 1]?._getType(),
    });

    const systemMsg = new SystemMessage(EXPLORE_PROMPT);
    const filteredMessages = state.messages.filter(
      (m: any) => m._getType() !== "system",
    );

    console.log(
      `[ExploreAgent.callModel] Invoking LLM with ${filteredMessages.length} messages...`,
    );
    const response = await this.llm.invoke([systemMsg, ...filteredMessages]);

    console.log("[ExploreAgent.callModel] LLM response received:", {
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
    console.log(`[ExploreAgent.runToEnd] Starting with message: ${userMessage}`);

    for await (const chunk of this.run(userMessage)) {
      if (chunk.tools?.messages) {
        for (const msg of chunk.tools.messages) {
          const content = msg.content;
          if (typeof content === "string") {
            try {
              const parsed = JSON.parse(content);
              if (parsed.metadata?.specialAction === "finish") {
                console.log(
                  `[ExploreAgent.runToEnd] Received finish signal:`,
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
      `[ExploreAgent.runToEnd] No finish signal received, returning null`,
    );
    return null;
  }
}

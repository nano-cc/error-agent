// Core Agent - Error Agent
// 诊断 Agent 核心实现

import {
  StateGraph,
  MessagesAnnotation,
  START,
  END,
} from "@langchain/langgraph";
import { CustomToolNode, ApprovalCallback } from "../tools/tool-node";
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  BaseMessage,
} from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import type { Runnable } from "@langchain/core/runnables";
import type { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import type { AIMessageChunk } from "@langchain/core/messages";
import { DIAGNOSTIC_SYSTEM_PROMPT, MAIN_SYSTEM_PROMPT } from "./prompts";
import { ToolRegistry } from "../tools/registry";

export interface DiagnosticContext {
  error: string;
  cmdHistory: string;
  projDir: string;
}
import { Annotation } from "@langchain/langgraph";

// 定义扩展状态
const DiagnosticGraphState = Annotation.Root({
  ...MessagesAnnotation.spec,
  // 添加 sessionId，并设置其 update 逻辑为“替换”
  sessionId: Annotation<string>({
    reducer: (oldValue, newValue) => newValue ?? oldValue,
    default: () => "default-session",
  }),
});

export class DiagnosticAgent {
  private app: any;
  private config: any;
  private context: DiagnosticContext | null = null;
  private llm: Runnable<BaseLanguageModelInput, AIMessageChunk>;
  private sessionId: string;
  private static toolNode: CustomToolNode | null = null;
  private static toolsInitialized = false;
  private static approvalCallback: ApprovalCallback | null = null;

  static setApprovalCallback(callback: ApprovalCallback): void {
    DiagnosticAgent.approvalCallback = callback;
  }

  private static getToolNode(): CustomToolNode {
    if (!DiagnosticAgent.toolNode) {
      console.log("[Agent] Initializing ToolNode from registry...");
      const registry = ToolRegistry.getInstance();
      const tools = registry.getToolList();
      console.log(`[Agent] Loaded ${tools.length} tools from registry`);
      DiagnosticAgent.toolNode = new CustomToolNode(tools, {
        approvalCallback: DiagnosticAgent.approvalCallback || undefined,
        autoApproveSafe: true,
      });
      DiagnosticAgent.toolsInitialized = true;
      console.log("[Agent] ToolNode initialized");
    }
    return DiagnosticAgent.toolNode;
  }

  constructor(model: ChatOpenAI, sessionId: string) {
    // 从 ToolRegistry 获取工具并绑定到 LLM
    const registry = ToolRegistry.getInstance();
    const tools = registry.getToolList();
    console.log(`[Agent] Binding ${tools.length} tools to LLM...`);
    this.llm = model.bindTools(tools);
    this.sessionId = sessionId;
    console.log("[Agent] Tools bound to LLM");

    this.config = {
      configurable: {
        thread_id: Math.random().toString(36).substring(7),
      },
    };
    console.log(
      `[Agent] Config thread_id: ${this.config.configurable.thread_id}`,
    );

    const toolNode = DiagnosticAgent.getToolNode();

    console.log("[Agent] Building StateGraph workflow...");
    const workflow = new StateGraph(DiagnosticGraphState)
      .addNode("agent", (state) => this.callModel(state))
      .addNode("tools", toolNode.getRunnable())
      .addEdge(START, "agent")
      .addConditionalEdges("agent", (state: any) => {
        const lastMsg = state.messages[state.messages.length - 1];
        const hasToolCalls = lastMsg.tool_calls?.length > 0;
        console.log(
          `[Agent] Conditional edges: hasToolCalls=${hasToolCalls}, next=${hasToolCalls ? "tools" : "END"}`,
        );
        return hasToolCalls ? "tools" : END;
      })
      .addEdge("tools", "agent");

    console.log("[Agent] Compiling workflow...");
    this.app = workflow.compile({});
    console.log("[Agent] DiagnosticAgent created successfully");
  }

  private async callModel(state: typeof MessagesAnnotation.State) {
    console.log("[Agent.callModel] Called with state:", {
      messageCount: state.messages.length,
      lastMessageType: state.messages[state.messages.length - 1]?._getType(),
    });

    const formattedPrompt = MAIN_SYSTEM_PROMPT;
    console.log("[Agent.callModel] System prompt prepared");

    const systemMsg = new SystemMessage(formattedPrompt);
    const filteredMessages = state.messages.filter(
      (m) => m._getType() !== "system",
    );

    console.log(
      `[Agent.callModel] Invoking LLM with ${filteredMessages.length} messages...`,
    );
    const response = await this.llm.invoke([systemMsg, ...filteredMessages]);

    console.log("[Agent.callModel] LLM response received:", {
      content: response.content,
      contentLength: response.content?.length || 0,
      toolCallCount: response.tool_calls?.length || 0,
      toolNames: response.tool_calls?.map((tc: any) => tc.name) || [],
    });

    return { messages: [response] };
  }

  /**
   * 运行 Agent（新接口，传入消息列表）
   */
  public async *runWithMessages(messages: BaseMessage[], feedback?: string) {
    console.log("[Agent.runWithMessages] Starting:", {
      messageCount: messages.length,
      hasFeedback: !!feedback,
      messageTypes: messages.map((m) => m._getType()),
    });

    // 如果有反馈，追加到消息列表
    const inputMessages = feedback
      ? [...messages, new HumanMessage(feedback)]
      : messages;

    console.log(
      `[Agent.runWithMessages] Total input messages: ${inputMessages.length}`,
    );

    const input = {
      messages: inputMessages,
      sessionId: this.sessionId,
    };

    console.log("[Agent.runWithMessages] Starting stream...");
    const stream = await this.app.stream(input, this.config);

    let chunkCount = 0;
    for await (const chunk of stream) {
      chunkCount++;
      console.log(`[Agent.runWithMessages] Stream chunk #${chunkCount}:`, {
        hasAgent: !!chunk.agent,
        hasTools: !!chunk.tools,
        agentMessageCount: chunk.agent?.messages?.length || 0,
        toolMessageCount: chunk.tools?.messages?.length || 0,
      });
      yield chunk;
    }

    console.log(
      `[Agent.runWithMessages] Stream completed, total chunks: ${chunkCount}`,
    );
  }
}

export default DiagnosticAgent;

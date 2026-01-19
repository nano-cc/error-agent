import { ChatOpenAI } from "@langchain/openai";
import {
  StateGraph,
  MessagesAnnotation,
  START,
  END,
  MemorySaver,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { DIAGNOSTIC_SYSTEM_PROMPT } from "./prompts";
import {
  listDir,
  findFile,
  readFile,
  editFileLines,
  searchInFile,
} from "../tools/fileTool";
import { duckDuckGoSearch } from "../tools/searchTool";
import { terminal } from "../tools/terminalTool";

const tools = [
  listDir,
  findFile,
  readFile,
  editFileLines,
  searchInFile,
  duckDuckGoSearch,
  terminal,
];
const toolNode = new ToolNode(tools);

export interface DiagnosticContext {
  error: string;
  cmdHistory: string;
  projDir: string;
}

export class ReactAgent {
  private app: any;
  private config: any;
  private context: DiagnosticContext | null = null;

  constructor(config: {
    apiKey: string;
    apiUrl: string;
    model: string;
    temperature: number;
  }) {
    // 为每个 Agent 实例生成唯一的 thread_id，防止跨任务记忆污染
    this.config = { configurable: { thread_id: Math.random().toString(36).substring(7) } };

    const llm = new ChatOpenAI({
      apiKey: config.apiKey,
      configuration: { baseURL: config.apiUrl },
      modelName: config.model,
      temperature: config.temperature,
      streaming: true,
    });

    const workflow = new StateGraph(MessagesAnnotation)
      .addNode("agent", (state) => this.callModel(state, llm))
      .addNode("tools", toolNode)
      .addEdge(START, "agent")
      .addConditionalEdges("agent", (state: any) => {
        const lastMsg = state.messages[state.messages.length - 1];
        return lastMsg.tool_calls?.length > 0 ? "tools" : END;
      })
      .addEdge("tools", "agent");

    this.app = workflow.compile({
      checkpointer: new MemorySaver(),
      interruptBefore: ["tools"],
    });
  }

  private async callModel(state: typeof MessagesAnnotation.State, llm: any) {
    const formattedPrompt = DIAGNOSTIC_SYSTEM_PROMPT.replace(
      "{projDir}",
      this.context?.projDir || "Unknown",
    )
      .replace("{cmdHistory}", this.context?.cmdHistory || "No history")
      .replace("{error}", this.context?.error || "No error text");

    const systemMsg = new SystemMessage(formattedPrompt);
    const filteredMessages = state.messages.filter(
      (m) => m._getType() !== "system",
    );

    const response = await llm
      .bindTools(tools)
      .invoke([systemMsg, ...filteredMessages]);
    return { messages: [response] };
  }

  public async *run(context: DiagnosticContext) {
    this.context = context;
    const initialInput = {
      messages: [
        new HumanMessage(
          `我在项目目录 ${context.projDir} 下遇到了错误：\n${context.error}`,
        ),
      ],
    };

    // 修复点：使用 for await 替代 yield*
    const stream = await this.app.stream(initialInput, this.config);
    for await (const chunk of stream) {
      yield chunk;
    }
  }

  public async *resume(feedback?: string) {
    const input = feedback ? { messages: [new HumanMessage(feedback)] } : null;
    const stream = await this.app.stream(input, this.config);
    for await (const chunk of stream) {
      yield chunk;
    }
  }
}

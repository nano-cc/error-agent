// Custom Tool Node - Error Agent
// 自定义 ToolNode 实现支持带确认的工具执行

import { BaseTool } from "./base-tool";
import { ToolExecutionResult, ToolExecutionContext } from "./types";
import { toolContextStorage } from "../storage/context";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import type { Runnable } from "@langchain/core/runnables";

/**
 * 工具调用信息接口
 */
export interface ToolCallRequest {
  id: string;
  name: string;
  args: Record<string, any>;
  tool: BaseTool<any>;
}

/**
 * 批准结果接口
 */
export interface ApprovalResult {
  /** 是否批准执行 */
  approved: boolean;
  /** 修改后的参数（如果用户选择了修改） */
  modifiedArgs?: Record<string, any>;
  /** 拒绝原因 */
  rejectionReason?: string;
}

/**
 * 批准回调函数类型
 */
export type ApprovalCallback = (
  request: ToolCallRequest,
) => Promise<ApprovalResult>;

/**
 * 自定义 ToolNode 配置
 */
export interface CustomToolNodeConfig {
  /** 批准回调函数 */
  approvalCallback?: ApprovalCallback;
  /** 是否自动批准 SAFE 级别的工具 */
  autoApproveSafe: boolean;
}

/**
 * 内部执行逻辑类
 */
class ToolNodeExecutor {
  private tools: Map<string, BaseTool<any>>;
  private config: CustomToolNodeConfig;
  private approvalCallback: ApprovalCallback;

  constructor(tools: BaseTool<any>[], config?: Partial<CustomToolNodeConfig>) {
    // 构建工具映射
    this.tools = new Map();
    for (const tool of tools) {
      this.tools.set(tool.name, tool);
    }

    // 配置
    this.config = {
      autoApproveSafe: true,
      ...config,
    };

    // 设置批准回调
    this.approvalCallback =
      this.config.approvalCallback || this.defaultApprovalCallback;
  }

  /**
   * 主执行方法
   */
  async invoke(state: any): Promise<{ messages: ToolMessage[] }> {
    console.log("[ToolNodeExecutor] Invoked with state:", {
      messageCount: state.messages?.length || 0,
    });

    // 获取最后一个消息（应该是包含 tool_calls 的 AI 消息）
    const messages = state.messages || [];
    if (messages.length === 0) {
      console.log("[ToolNodeExecutor] No messages, returning empty result");
      return { messages: [] };
    }

    const lastMsg = messages[messages.length - 1];

    // 检查是否有 tool_calls
    const toolCalls = this.extractToolCalls(lastMsg);
    if (toolCalls.requests.length === 0 && toolCalls.errors.length === 0) {
      console.log(
        "[ToolNodeExecutor] No tool calls found, returning empty result",
      );
      return { messages: [] };
    }

    console.log(
      `[ToolNodeExecutor] Processing ${toolCalls.requests.length} tool calls, ${toolCalls.errors.length} errors`,
    );

    // 执行所有工具调用
    const results: ToolMessage[] = [...toolCalls.errors]; // 先添加错误消息（工具未找到的情况）
    for (const toolCall of toolCalls.requests) {
      const result = await this.executeToolCall(toolCall);
      if (result) {
        results.push(result);
      }
    }

    console.log(
      `[ToolNodeExecutor] Executed ${results.length} tools successfully`,
    );
    return { messages: results };
  }

  /**
   * 提取工具调用信息
   */
  private extractToolCalls(message: any): { requests: ToolCallRequest[]; errors: ToolMessage[] } {
    const requests: ToolCallRequest[] = [];
    const errors: ToolMessage[] = [];

    // 尝试从 tool_calls 属性获取
    if (message.tool_calls && Array.isArray(message.tool_calls)) {
      for (const tc of message.tool_calls) {
        const tool = this.tools.get(tc.name);
        const toolCallId = tc.id || this.generateId();
        
        if (tool) {
          requests.push({
            id: toolCallId,
            name: tc.name,
            args: tc.args || {},
            tool,
          });
        } else {
          // 工具未找到，返回错误消息，让 Agent 知道这个工具调用失败了
          const errorMsg = JSON.stringify({
            success: false,
            error: `Tool "${tc.name}" not found. Available tools: ${Array.from(this.tools.keys()).join(", ")}`,
          });
          errors.push(new ToolMessage(errorMsg, toolCallId, tc.name));
          console.error(`[ToolNodeExecutor] Tool not found: ${tc.name}`);
        }
      }
    }

    return { requests, errors };
  }

  /**
   * 执行单个工具调用
   */
  private async executeToolCall(
    request: ToolCallRequest,
  ): Promise<ToolMessage | null> {
    const { id, name, args, tool } = request;

    console.log(`[ToolNodeExecutor] Executing tool: ${name}`, args);

    try {
      // 检查是否需要批准
      const needsApproval =
        !this.config.autoApproveSafe || tool.meta.dangerLevel !== "safe";

      let finalArgs = args;

      if (needsApproval) {
        console.log(`[ToolNodeExecutor] Tool ${name} requires approval`);

        // 调用批准回调
        const approval = await this.approvalCallback(request);

        if (!approval.approved) {
          console.log(`[ToolNodeExecutor] Tool ${name} was rejected`);

          // 返回拒绝消息
          return new ToolMessage(
            JSON.stringify({
              success: false,
              error:
                approval.rejectionReason ||
                "Tool execution was rejected by user",
            }),
            name,
            id,
          );
        }

        // 使用修改后的参数（如果提供）
        if (approval.modifiedArgs) {
          finalArgs = approval.modifiedArgs;
          console.log(`[ToolNodeExecutor] Using modified args for ${name}`);
        }
      }

      // 执行工具
      const result = await tool._call(finalArgs);

      // 转换为 ToolMessage
      const toolMessage = this.resultToToolMessage(result, name, id);
      console.log(`[ToolNodeExecutor] Tool ${name} executed successfully`);
      return toolMessage;
    } catch (error: any) {
      console.error(`[ToolNodeExecutor] Error executing tool ${name}:`, error);

      // 返回错误消息
      return new ToolMessage(
        JSON.stringify({
          success: false,
          error: error.message || "Tool execution failed",
        }),
        name,
        id,
      );
    }
  }

  /**
   * 将 ToolExecutionResult 转换为 ToolMessage
   */
  private resultToToolMessage(
    result: ToolExecutionResult,
    toolName: string,
    toolCallId: string,
  ): ToolMessage {
    const content = JSON.stringify({
      success: result.success,
      data: result.data,
      error: result.error,
      metadata: result.metadata,
    });

    return new ToolMessage(content, toolCallId, toolName);
  }

  /**
   * 默认批准回调（自动批准所有工具）
   */
  private async defaultApprovalCallback(
    request: ToolCallRequest,
  ): Promise<ApprovalResult> {
    return { approved: true };
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 添加工具（动态注册）
   */
  addTool(tool: BaseTool<any>): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * 移除工具
   */
  removeTool(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * 获取工具列表
   */
  getTools(): BaseTool<any>[] {
    return Array.from(this.tools.values());
  }

  /**
   * 更新批准回调
   */
  setApprovalCallback(callback: ApprovalCallback): void {
    this.approvalCallback = callback;
  }

  /**
   * 获取执行器实例
   */
  getExecutor(): ToolNodeExecutor {
    return this;
  }
}

/**
 * 自定义 ToolNode 实现
 * 对外提供工具管理功能，内部使用 ToolNodeExecutor
 */
export class CustomToolNode {
  private executor: ToolNodeExecutor;

  constructor(tools: BaseTool<any>[], config?: Partial<CustomToolNodeConfig>) {
    this.executor = new ToolNodeExecutor(tools, config);
  }

  /**
   * 添加工具（动态注册）
   */
  addTool(tool: BaseTool<any>): void {
    this.executor.addTool(tool);
  }

  /**
   * 移除工具
   */
  removeTool(name: string): boolean {
    return this.executor.removeTool(name);
  }

  /**
   * 获取工具列表
   */
  getTools(): BaseTool<any>[] {
    return this.executor.getTools();
  }

  /**
   * 更新批准回调
   */
  setApprovalCallback(callback: ApprovalCallback): void {
    this.executor.setApprovalCallback(callback);
  }

  /**
   * 获取可被 LangGraph 使用的 Runnable
   */
  getRunnable(): (state: any) => Promise<{ messages: any[] }> {
    return (state: any) => {
      // 从 state 中提取 sessionId
      const sessionId = state.sessionId || "default-session";

      // 使用 AsyncLocalStorage 包裹执行逻辑
      return toolContextStorage.run({ sessionId }, () => {
        console.log(
          `[CustomToolNode] Entering context for session: ${sessionId}`,
        );
        return this.executor.invoke(state);
      });
    };
  }

  /**
   * 获取执行器实例（用于直接访问）
   */
  getExecutor(): ToolNodeExecutor {
    return this.executor;
  }
}

export default CustomToolNode;

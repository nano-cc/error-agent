// Context Builder - 上下文构建模块

import { StorageManager } from '../storage/StorageManager';
import { Message, ChatMessage, ToolCall, ToolResult } from '../types/session';
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';

/**
 * 将数据库消息转换为 LangChain 消息格式
 */
export function toLangChainMessages(messages: Message[]): Array<HumanMessage | AIMessage | SystemMessage | ToolMessage> {
  const result: Array<HumanMessage | AIMessage | SystemMessage | ToolMessage> = [];

  for (const msg of messages) {
    switch (msg.role) {
      case 'user':
        result.push(new HumanMessage({
          content: msg.content,
        }));
        break;

      case 'agent':
        result.push(new AIMessage({
          content: msg.content,
          tool_calls: msg.toolCalls?.map(tc => ({
            id: tc.id,
            name: tc.name,
            args: tc.args,
          })),
        }));
        break;

      case 'tool':
        if (msg.toolResult) {
          result.push(new ToolMessage({
            content: msg.content,
            tool_call_id: msg.toolResult.callId,
            name: msg.toolResult.toolName,
          }));
        }
        break;

      case 'system':
        result.push(new SystemMessage(msg.content));
        break;
    }
  }

  return result;
}

/**
 * 将数据库消息转换为 UI 展示格式
 */
export function toChatMessages(messages: Message[]): ChatMessage[] {
  return messages.map(msg => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: msg.createdAt,
    toolCalls: msg.toolCalls,
    toolResult: msg.toolResult,
  }));
}

/**
 * Context Builder 类
 */
export class ContextBuilder {
  constructor(private storageManager: StorageManager) {}

  /**
   * 构建完整上下文（用于继续对话）
   */
  async buildContext(sessionId: string): Promise<Message[]> {
    return this.storageManager.getMessages(sessionId);
  }

  /**
   * 构建带系统提示的上下文
   */
  async buildContextWithSystemPrompt(
    sessionId: string,
    systemPrompt: string
  ): Promise<Message[]> {
    const messages = await this.storageManager.getMessages(sessionId);
    
    // 在开头插入系统消息
    const systemMessage: Message = {
      id: `system-${Date.now()}`,
      sessionId,
      role: 'system',
      content: systemPrompt,
      createdAt: Date.now(),
    };

    return [systemMessage, ...messages];
  }

  /**
   * 添加用户消息到上下文
   */
  async appendUserMessage(
    sessionId: string,
    content: string
  ): Promise<Message> {
    return this.storageManager.addMessage(sessionId, {
      role: 'user',
      content,
    });
  }

  /**
   * 添加 Agent 回复到上下文
   */
  async appendAgentMessage(
    sessionId: string,
    content: string,
    toolCalls?: ToolCall[]
  ): Promise<Message> {
    return this.storageManager.addMessage(sessionId, {
      role: 'agent',
      content,
      toolCalls,
    });
  }

  /**
   * 添加工具结果到上下文
   */
  async appendToolResult(
    sessionId: string,
    toolResult: ToolResult
  ): Promise<Message> {
    return this.storageManager.addMessage(sessionId, {
      role: 'tool',
      content: toolResult.output,
      toolResult,
    });
  }

  /**
   * 获取 UI 展示用的消息列表
   */
  async getChatMessages(sessionId: string): Promise<ChatMessage[]> {
    const messages = await this.storageManager.getMessages(sessionId);
    return toChatMessages(messages);
  }
}

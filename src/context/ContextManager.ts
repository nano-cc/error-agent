// Context Manager - 上下文和消息缓存管理

import { StorageManager } from '../storage/StorageManager';
import { Message, MessageInput, ToolCall, ToolResult, MessageRole, Todo } from '../types/session';
import { HumanMessage, AIMessage, SystemMessage, ToolMessage, BaseMessage } from '@langchain/core/messages';
import { DIAGNOSTIC_SYSTEM_PROMPT, TODO_SUMMARY_TEMPLATE } from '../core/prompts';

/**
 * 将数据库消息转换为 LangChain 消息格式
 */
function toLangChainMessages(messages: Message[]): BaseMessage[] {
  const result: BaseMessage[] = [];

  for (const msg of messages) {
    // 跳过内部消息（不发送给 LLM）
    if (msg.isInternal) {
      continue;
    }

    switch (msg.role) {
      case 'user':
        result.push(new HumanMessage({ content: msg.content }));
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
 * Context Manager 类
 */
export class ContextManager {
  // 会话 ID → 消息列表缓存
  private cache: Map<string, Message[]> = new Map();

  // 会话 ID → Todo 列表缓存
  private todoCache: Map<string, Todo[]> = new Map();

  constructor(private storageManager: StorageManager) {}

  /**
   * 切换会话（加载消息和 todo 列表）
   */
  async switchSession(sessionId: string): Promise<{ messages: Message[], todos: Todo[] }> {
    console.log('[ContextManager] Switching to session:', sessionId);

    // 1. 加载消息
    const messages = await this.storageManager.getMessages(sessionId);
    this.cache.set(sessionId, messages);

    // 2. 加载 todo 列表
    const todos = await this.storageManager.getTodos(sessionId);
    this.todoCache.set(sessionId, todos);
    console.log('[ContextManager] Loaded todos:', todos.length);

    // 3. 如果 todo 都已完成，自动清除
    if (this.areAllTodosCompleted(todos)) {
      console.log('[ContextManager] All todos completed, clearing...');
      await this.storageManager.deleteTodos(sessionId);
      this.todoCache.set(sessionId, []);
      return { messages, todos: [] };
    }

    // 4. 如果有 todo，插入摘要消息到缓存（不持久化）
    if (todos.length > 0) {
      this.insertTodoSummary(sessionId, todos);
    }

    return { messages, todos };
  }

  /**
   * 插入 todo 摘要到消息缓存（不持久化）
   */
  private insertTodoSummary(sessionId: string, todos: Todo[]): void {
    const todoSummaryContent = TODO_SUMMARY_TEMPLATE(todos);
    const todoSummary: Message = {
      id: `internal-todo-${Date.now()}`,
      sessionId,
      role: 'system',
      content: `当前任务列表：\n${todoSummaryContent}`,
      createdAt: Date.now(),
      isInternal: true, // 标记为内部消息
      todos: todos, // 附带 todo 数据给前端
    };

    // 只插入缓存，不调用 storageManager
    const messages = this.cache.get(sessionId) || [];
    messages.push(todoSummary);
    console.log('[ContextManager] Inserted todo summary to cache (not persisted)');
  }

  /**
   * 检查是否所有 todo 都完成
   */
  private areAllTodosCompleted(todos: Todo[]): boolean {
    return todos.length > 0 &&
           todos.every(t => t.status === 'completed' || t.status === 'failed');
  }

  /**
   * 获取消息（从缓存）
   */
  getMessages(sessionId: string): Message[] {
    return this.cache.get(sessionId) || [];
  }

  /**
   * 加载消息（从数据库到缓存）
   */
  async loadMessages(sessionId: string): Promise<Message[]> {
    const messages = await this.storageManager.getMessages(sessionId);
    this.cache.set(sessionId, messages);
    return messages;
  }

  /**
   * 追加消息（同时更新缓存和数据库）
   */
  async appendMessage(
    sessionId: string,
    role: MessageRole,
    content: string,
    extra?: { toolCalls?: ToolCall[]; toolResult?: ToolResult }
  ): Promise<Message> {
    const messageInput: MessageInput = {
      role,
      content,
      ...extra,
    };

    // 写入数据库
    const message = await this.storageManager.addMessage(sessionId, messageInput);

    // 更新缓存
    let messages = this.cache.get(sessionId);
    if (!messages) {
      messages = [];
      this.cache.set(sessionId, messages);
    }
    messages.push(message);

    return message;
  }

  /**
   * 清除缓存
   */
  clearCache(sessionId: string): void {
    this.cache.delete(sessionId);
    this.todoCache.delete(sessionId);
  }

  /**
   * 清除所有缓存
   */
  clearAllCache(): void {
    this.cache.clear();
    this.todoCache.clear();
  }

  /**
   * 获取当前会话的 todo 列表
   */
  getTodos(sessionId: string): Todo[] {
    return this.todoCache.get(sessionId) || [];
  }

  /**
   * 构建 Agent 用的上下文（LangChain 格式 + 系统提示 + todo 列表）
   */
  async buildLangChainContext(sessionId: string): Promise<BaseMessage[]> {
    const messages = this.getMessages(sessionId);
    const todos = this.getTodos(sessionId);

    // 系统提示
    const systemMessage = new SystemMessage(DIAGNOSTIC_SYSTEM_PROMPT);

    // 如果有 todo 列表，添加到上下文
    let todoMessage: BaseMessage | null = null;
    if (todos.length > 0) {
      const todoSummaryContent = TODO_SUMMARY_TEMPLATE(todos);
      todoMessage = new SystemMessage(`当前任务列表：\n${todoSummaryContent}`);
      console.log('[ContextManager] Adding todos to context:', todos.length);
    }

    // 转换为用户/AI/工具消息
    const langChainMessages = toLangChainMessages(messages);

    // 构建最终上下文：系统提示 + todo 摘要 + 消息
    const result: BaseMessage[] = [systemMessage];
    if (todoMessage) {
      result.push(todoMessage);
    }
    result.push(...langChainMessages);

    return result;
  }

  /**
   * 构建带项目上下文的系统提示
   */
  buildSystemPrompt(projDir: string, cmdHistory: string = ''): string {
    return DIAGNOSTIC_SYSTEM_PROMPT
      .replace('{projDir}', projDir || 'Unknown')
      .replace('{cmdHistory}', cmdHistory || 'No history')
      .replace('{error}', '用户在聊天中描述的问题');
  }
}

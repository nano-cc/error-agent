// Session 和 Message 类型定义

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  metadata: SessionMetadata;
}

export interface SessionSummary {
  id: string;
  title: string;
  updatedAt: number;
  preview?: string;
}

export interface SessionMetadata {
  projDir?: string;
  error?: string;
  [key: string]: any;
}

export type MessageRole = "user" | "agent" | "system" | "tool";

export interface Message {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  createdAt: number;

  // 仅 agent 角色
  toolCalls?: ToolCall[];

  // 仅 tool 角色
  toolResult?: ToolResult;

  // 内部消息标记（不持久化到数据库）
  isInternal?: boolean;

  // 附带的 Todo 数据（用于内部消息）
  todos?: Todo[];
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, any>;
}

export interface ToolResult {
  toolName: string;
  callId: string;
  output: string;
  success: boolean;
}

export interface MessageInput {
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  toolResult?: ToolResult;
}

export interface Todo {
  id: string;
  sessionId: string;
  task: string;
  status: string;
  orderIndex: number;
  createdAt: number;
}

export interface TodoInput {
  task: string;
  status?: string;
}

// Chat Message - 用于 UI 展示
export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  toolResult?: ToolResult;
}

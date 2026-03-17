// Danger Level Enum
export enum DangerLevel {
  SAFE = "safe",
  CAUTION = "caution",
  DANGEROUS = "dangerous",
  CRITICAL = "critical",
}

// Tool Category Enum
export enum ToolCategory {
  FILE = "file",
  TERMINAL = "terminal",
  NETWORK = "network",
  MEMORY = "memory",
  PROJECT = "project",
  SEARCH = "search",
  EDIT = "edit",
}

// Tool Execution Context Interface
export interface ToolExecutionContext {
  sessionId: string;
  traceId: string;
  workingDirectory?: string;
  envVariables?: Record<string, string>;
}

export interface ToolExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata: {
    duration: number;
    timestamp: number;
    toolName: string;
    tokens?: {
      input: number;
      output: number;
    };
    specialAction?: string;  // 特殊操作标记，如 "finish" 表示结束 agent
  };
}

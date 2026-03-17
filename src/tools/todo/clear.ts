import { z } from "zod";
import { BaseTool } from "../base-tool";
import {
  DangerLevel,
  ToolCategory,
  ToolExecutionContext,
  ToolExecutionResult,
} from "../types";
import { toolContextStorage } from "../../storage/context";

export const TodoClearSchema = z.object({}).describe("清除当前会话的所有待办事项");

export class TodoClearTool extends BaseTool<typeof TodoClearSchema> {
  constructor() {
    super({
      name: "todo_clear",
      description: "清除当前会话的所有待办事项。不需要任何参数",
      schema: TodoClearSchema,
      meta: {
        category: ToolCategory.MEMORY,
        dangerLevel: DangerLevel.SAFE,
        isPrivileged: false,
      },
    });
  }

  async _call(
    args: z.infer<typeof TodoClearSchema>,
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const timestamp = startTime;

    try {
      const { getStorageManager } = require("../../storage/StorageManager");
      const storageManager = getStorageManager();
      const context = toolContextStorage.getStore();
      const sessionId = context?.sessionId;

      await storageManager.deleteTodos(sessionId);

      const duration = Date.now() - startTime;

      return {
        success: true,
        data: {
          message: "Todo list cleared",
          cleared: true,
        },
        metadata: {
          duration,
          timestamp,
          toolName: "todo_clear",
        },
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;

      return {
        success: false,
        error: error.message || "Failed to clear todos",
        metadata: {
          duration,
          timestamp,
          toolName: "todo_clear",
        },
      };
    }
  }
}

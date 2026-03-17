import { z } from "zod";
import { BaseTool } from "../base-tool";
import {
  DangerLevel,
  ToolCategory,
  ToolExecutionResult,
} from "../types";
import { getMemoryManager } from "../../memory/MemoryManager";

export const UpdateMemoryItemSchema = z.object({
  category: z.string().describe("记忆项的分类"),
  title: z.string().describe("记忆项的标题"),
  content: z.string().describe("记忆项的新内容"),
});

export class UpdateMemoryItemTool extends BaseTool<typeof UpdateMemoryItemSchema> {
  constructor() {
    super({
      name: "update_memory_item",
      description: "更新已存在的记忆项内容，如果不存在则返回错误",
      schema: UpdateMemoryItemSchema,
      meta: {
        category: ToolCategory.MEMORY,
        dangerLevel: DangerLevel.SAFE,
        isPrivileged: false,
      },
    });
  }

  async _call(
    args: z.infer<typeof UpdateMemoryItemSchema>,
  ): Promise<ToolExecutionResult> {
    const { category, title, content } = args;
    const startTime = Date.now();
    const timestamp = startTime;

    try {
      const manager = getMemoryManager();

      // 检查记忆项是否存在
      const existing = await manager.getMemoryItem(category, title);
      if (!existing) {
        const duration = Date.now() - startTime;
        return {
          success: false,
          error: `Memory item "${title}" not found in category "${category}". Use create_memory_item to create a new one.`,
          metadata: {
            duration,
            timestamp,
            toolName: "update_memory_item",
          },
        };
      }

      // 更新记忆项
      const result = await manager.updateMemoryItem(category, title, { content });

      const duration = Date.now() - startTime;
      return {
        success: true,
        data: result,
        metadata: {
          duration,
          timestamp,
          toolName: "update_memory_item",
        },
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error.message || "Failed to update memory item",
        metadata: {
          duration,
          timestamp,
          toolName: "update_memory_item",
        },
      };
    }
  }
}

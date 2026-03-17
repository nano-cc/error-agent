import { z } from "zod";
import { BaseTool } from "../base-tool";
import {
  DangerLevel,
  ToolCategory,
  ToolExecutionResult,
} from "../types";
import { getMemoryManager } from "../../memory/MemoryManager";

export const LoadMemoryItemSchema = z.object({
  category: z.string().describe("记忆项的分类"),
  title: z.string().describe("记忆项的标题"),
});

export class LoadMemoryItemTool extends BaseTool<typeof LoadMemoryItemSchema> {
  constructor() {
    super({
      name: "load_memory_item",
      description: "加载指定记忆项的内容",
      schema: LoadMemoryItemSchema,
      meta: {
        category: ToolCategory.MEMORY,
        dangerLevel: DangerLevel.SAFE,
        isPrivileged: false,
      },
    });
  }

  async _call(
    args: z.infer<typeof LoadMemoryItemSchema>,
  ): Promise<ToolExecutionResult> {
    const { category, title } = args;
    const startTime = Date.now();
    const timestamp = startTime;

    try {
      const manager = getMemoryManager();
      const item = await manager.getMemoryItem(category, title);

      if (!item) {
        const duration = Date.now() - startTime;
        return {
          success: false,
          error: `Memory item "${title}" not found in category "${category}"`,
          metadata: {
            duration,
            timestamp,
            toolName: "load_memory_item",
          },
        };
      }

      const duration = Date.now() - startTime;
      return {
        success: true,
        data: {
          category: item.category,
          title: item.title,
          content: item.content,
        },
        metadata: {
          duration,
          timestamp,
          toolName: "load_memory_item",
        },
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error.message || "Failed to load memory item",
        metadata: {
          duration,
          timestamp,
          toolName: "load_memory_item",
        },
      };
    }
  }
}

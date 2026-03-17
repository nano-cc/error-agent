import { z } from "zod";
import { BaseTool } from "../base-tool";
import {
  DangerLevel,
  ToolCategory,
  ToolExecutionResult,
} from "../types";
import { getMemoryManager } from "../../memory/MemoryManager";

export const ListMemoryItemsSchema = z.object({
  category: z.string().optional().describe("可选，指定分类后返回该分类下的所有标题，不指定则返回所有分类列表"),
});

export class ListMemoryItemsTool extends BaseTool<typeof ListMemoryItemsSchema> {
  constructor() {
    super({
      name: "list_memory_items",
      description: "列出所有分类或指定分类下的所有标题",
      schema: ListMemoryItemsSchema,
      meta: {
        category: ToolCategory.MEMORY,
        dangerLevel: DangerLevel.SAFE,
        isPrivileged: false,
      },
    });
  }

  async _call(
    args: z.infer<typeof ListMemoryItemsSchema>,
  ): Promise<ToolExecutionResult> {
    const { category } = args;
    const startTime = Date.now();
    const timestamp = startTime;

    try {
      const manager = getMemoryManager();

      const duration = Date.now() - startTime;

      if (category) {
        // 返回指定分类下的所有标题
        const items = await manager.listMemoryItems(category);
        const titles = items.map(item => item.title);
        return {
          success: true,
          data: {
            category,
            titles,
            count: titles.length,
          },
          metadata: {
            duration,
            timestamp,
            toolName: "list_memory_items",
          },
        };
      } else {
        // 返回所有分类
        const categories = await manager.listCategories();
        return {
          success: true,
          data: {
            categories,
            count: categories.length,
          },
          metadata: {
            duration,
            timestamp,
            toolName: "list_memory_items",
          },
        };
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error.message || "Failed to list memory items",
        metadata: {
          duration,
          timestamp,
          toolName: "list_memory_items",
        },
      };
    }
  }
}

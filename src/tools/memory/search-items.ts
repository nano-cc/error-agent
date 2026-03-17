import { z } from "zod";
import { BaseTool } from "../base-tool";
import {
  DangerLevel,
  ToolCategory,
  ToolExecutionResult,
} from "../types";
import { getMemoryManager } from "../../memory/MemoryManager";

export const SearchMemoryItemsSchema = z.object({
  category: z.string().optional().describe("可选，在指定分类中搜索，不指定则搜索所有分类"),
  query: z.string().describe("搜索关键词，用于匹配标题或内容"),
});

export class SearchMemoryItemsTool extends BaseTool<typeof SearchMemoryItemsSchema> {
  constructor() {
    super({
      name: "search_memory_items",
      description: "搜索记忆项，支持按分类筛选和关键词搜索（匹配标题或内容）",
      schema: SearchMemoryItemsSchema,
      meta: {
        category: ToolCategory.MEMORY,
        dangerLevel: DangerLevel.SAFE,
        isPrivileged: false,
      },
    });
  }

  async _call(
    args: z.infer<typeof SearchMemoryItemsSchema>,
  ): Promise<ToolExecutionResult> {
    const { category, query } = args;
    const startTime = Date.now();
    const timestamp = startTime;

    try {
      const manager = getMemoryManager();
      const results = await manager.searchMemoryItems({ category, query });

      const duration = Date.now() - startTime;
      return {
        success: true,
        data: {
          items: results.map((result) => ({
            category: result.category,
            title: result.title,
            preview: result.preview,
          })),
          count: results.length,
        },
        metadata: {
          duration,
          timestamp,
          toolName: "search_memory_items",
        },
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error.message || "Failed to search memory items",
        metadata: {
          duration,
          timestamp,
          toolName: "search_memory_items",
        },
      };
    }
  }
}

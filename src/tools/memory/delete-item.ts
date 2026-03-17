import { z } from "zod";
import { BaseTool } from "../base-tool";
import {
  DangerLevel,
  ToolCategory,
  ToolExecutionResult,
} from "../types";
import { getMemoryService } from "./memory-service";

export const DeleteMemoryItemSchema = z.object({
  category: z.string().describe("记忆项的分类"),
  title: z.string().describe("记忆项的标题"),
});

export class DeleteMemoryItemTool extends BaseTool<typeof DeleteMemoryItemSchema> {
  constructor() {
    super({
      name: "delete_memory_item",
      description: "删除一个记忆项",
      schema: DeleteMemoryItemSchema,
      meta: {
        category: ToolCategory.MEMORY,
        dangerLevel: DangerLevel.SAFE,
        isPrivileged: false,
      },
    });
  }

  async _call(
    args: z.infer<typeof DeleteMemoryItemSchema>,
  ): Promise<ToolExecutionResult> {
    const { category, title } = args;
    const startTime = Date.now();
    const timestamp = startTime;

    try {
      const service = getMemoryService();
      await service.deleteItem(category, title);

      const duration = Date.now() - startTime;
      return {
        success: true,
        data: {
          message: `Memory item "${title}" deleted from category "${category}"`,
        },
        metadata: {
          duration,
          timestamp,
          toolName: "delete_memory_item",
        },
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error.message || "Failed to delete memory item",
        metadata: {
          duration,
          timestamp,
          toolName: "delete_memory_item",
        },
      };
    }
  }
}

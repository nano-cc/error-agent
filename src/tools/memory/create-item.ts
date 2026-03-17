import { z } from "zod";
import { BaseTool } from "../base-tool";
import {
  DangerLevel,
  ToolCategory,
  ToolExecutionResult,
} from "../types";
import { getMemoryService } from "./memory-service";

export const CreateMemoryItemSchema = z.object({
  category: z.string().describe("记忆项的分类"),
  title: z.string().describe("记忆项的标题"),
  content: z.string().describe("记忆项的内容"),
});

export class CreateMemoryItemTool extends BaseTool<typeof CreateMemoryItemSchema> {
  constructor() {
    super({
      name: "create_memory_item",
      description: "创建一个新的记忆项",
      schema: CreateMemoryItemSchema,
      meta: {
        category: ToolCategory.MEMORY,
        dangerLevel: DangerLevel.SAFE,
        isPrivileged: false,
      },
    });
  }

  async _call(
    args: z.infer<typeof CreateMemoryItemSchema>,
  ): Promise<ToolExecutionResult> {
    const { category, title, content } = args;
    const startTime = Date.now();
    const timestamp = startTime;

    try {
      const service = getMemoryService();
      const result = await service.createItem(category, title, content);

      const duration = Date.now() - startTime;
      return {
        success: true,
        data: result,
        metadata: {
          duration,
          timestamp,
          toolName: "create_memory_item",
        },
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error.message || "Failed to create memory item",
        metadata: {
          duration,
          timestamp,
          toolName: "create_memory_item",
        },
      };
    }
  }
}

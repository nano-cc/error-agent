import { z } from "zod";
import { BaseTool } from "../base-tool";
import { DangerLevel, ToolCategory, ToolExecutionResult } from "../types";

export const MemoryFinishSchema = z.object({
  result: z.any().describe("操作结果"),
  message: z.string().describe("操作结果描述"),
});

export class MemoryFinishTool extends BaseTool<typeof MemoryFinishSchema> {
  constructor() {
    super({
      name: "memory_finish",
      description: "完成记忆操作并返回结果给主 agent，这是最后一步必须调用的工具",
      schema: MemoryFinishSchema,
      meta: {
        category: ToolCategory.MEMORY,
        dangerLevel: DangerLevel.SAFE,
        isPrivileged: false,
      },
    });
  }

  async _call(args: z.infer<typeof MemoryFinishSchema>): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    // 设置特殊标记，让 agent 知道应该结束
    return {
      success: true,
      data: args,
      metadata: {
        specialAction: "finish",  // 特殊标记
        duration: Date.now() - startTime,
        timestamp: startTime,
        toolName: "memory_finish",
      },
    };
  }
}

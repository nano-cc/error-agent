import { z } from "zod";
import { BaseTool } from "../base-tool";
import { DangerLevel, ToolCategory, ToolExecutionResult } from "../types";

export const ExploreFinishSchema = z.object({
  result: z.string().describe("调研结果，以字符串形式返回"),
  summary: z.string().describe("结果摘要"),
});

export class ExploreFinishTool extends BaseTool<typeof ExploreFinishSchema> {
  constructor() {
    super({
      name: "explore_finish",
      description: "完成调研任务并返回结果给主 agent，这是最后一步必须调用的工具",
      schema: ExploreFinishSchema,
      meta: {
        category: ToolCategory.PROJECT,
        dangerLevel: DangerLevel.SAFE,
        isPrivileged: false,
      },
    });
  }

  async _call(args: z.infer<typeof ExploreFinishSchema>): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    return {
      success: true,
      data: args,
      metadata: {
        specialAction: "finish",
        duration: Date.now() - startTime,
        timestamp: startTime,
        toolName: "explore_finish",
      },
    };
  }
}

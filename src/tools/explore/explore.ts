import { z } from "zod";
import { BaseTool } from "../base-tool";
import { DangerLevel, ToolCategory, ToolExecutionResult } from "../types";
import { ExploreAgent } from "../../core/explore-agent";
import { getChatOpenAI } from "../../llm/llm";

export const ExploreSchema = z.object({
  topic: z.string().describe("调研主题，描述需要探索和分析的内容"),
});

export class ExploreTool extends BaseTool<typeof ExploreSchema> {
  constructor() {
    super({
      name: "explore",
      description: "探索和调研项目中的代码、架构或特定主题，返回详细的分析结果",
      schema: ExploreSchema,
      meta: {
        category: ToolCategory.PROJECT,
        dangerLevel: DangerLevel.SAFE,
        isPrivileged: false,
      },
    });
  }

  async _call(args: z.infer<typeof ExploreSchema>): Promise<ToolExecutionResult> {
    const { topic } = args;
    const startTime = Date.now();

    try {
      const model = getChatOpenAI();
      const agent = new ExploreAgent(model);
      const result = await agent.runToEnd(topic);

      const duration = Date.now() - startTime;
      return {
        success: true,
        data: result,
        metadata: {
          duration,
          timestamp: startTime,
          toolName: "explore",
        },
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error.message || "Failed to explore",
        metadata: {
          duration,
          timestamp: startTime,
          toolName: "explore",
        },
      };
    }
  }
}

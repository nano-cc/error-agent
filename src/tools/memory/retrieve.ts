import { z } from "zod";
import { BaseTool } from "../base-tool";
import { DangerLevel, ToolCategory, ToolExecutionResult } from "../types";
import { MemoryAgent } from "../../core/memory-agent";
import { getChatOpenAI } from "../../llm/llm";

export const MemoryRetrieveSchema = z.object({
  query: z.string().describe("检索查询关键词"),
  category: z.string().optional().describe("可选，限制在特定分类中检索"),
});

export class MemoryRetrieveTool extends BaseTool<typeof MemoryRetrieveSchema> {
  constructor() {
    super({
      name: "memory_retrieve",
      description: "从记忆系统中检索相关信息",
      schema: MemoryRetrieveSchema,
      meta: {
        category: ToolCategory.MEMORY,
        dangerLevel: DangerLevel.SAFE,
        isPrivileged: false,
      },
    });
  }

  async _call(args: z.infer<typeof MemoryRetrieveSchema>): Promise<ToolExecutionResult> {
    const { query, category } = args;
    const startTime = Date.now();

    try {
      // 获取 LLM 模型
      const model = getChatOpenAI();

      // 创建 MemoryAgent 并运行
      const agent = new MemoryAgent(model, "retrieve");

      const userMessage = category
        ? `分类: ${category}\n\n查询: ${query}`
        : `查询: ${query}`;

      // 运行 agent 直到完成
      const result = await agent.runToEnd(userMessage);

      const duration = Date.now() - startTime;
      return {
        success: true,
        data: result,
        metadata: {
          duration,
          timestamp: startTime,
          toolName: "memory_retrieve",
        },
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error.message || "Failed to retrieve memory",
        metadata: {
          duration,
          timestamp: startTime,
          toolName: "memory_retrieve",
        },
      };
    }
  }
}

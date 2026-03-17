import { z } from "zod";
import { BaseTool } from "../base-tool";
import { DangerLevel, ToolCategory, ToolExecutionResult } from "../types";
import { MemoryAgent } from "../../core/memory-agent";
import { getChatOpenAI } from "../../llm/llm";

export const MemorySaveSchema = z.object({
  content: z.string().describe("要保存的内容"),
  context: z.string().optional().describe("额外的上下文信息，帮助确定分类和标题"),
});

export class MemorySaveTool extends BaseTool<typeof MemorySaveSchema> {
  constructor() {
    super({
      name: "memory_save",
      description: "保存信息到记忆系统，会自动决定分类、标题和内容",
      schema: MemorySaveSchema,
      meta: {
        category: ToolCategory.MEMORY,
        dangerLevel: DangerLevel.SAFE,
        isPrivileged: false,
      },
    });
  }

  async _call(args: z.infer<typeof MemorySaveSchema>): Promise<ToolExecutionResult> {
    const { content, context } = args;
    const startTime = Date.now();

    try {
      // 获取 LLM 模型
      const model = getChatOpenAI();

      // 创建 MemoryAgent 并运行
      const agent = new MemoryAgent(model, "save");

      const userMessage = context
        ? `上下文: ${context}\n\n内容: ${content}`
        : content;

      // 运行 agent 直到完成
      const result = await agent.runToEnd(userMessage);

      const duration = Date.now() - startTime;
      return {
        success: true,
        data: result,
        metadata: {
          duration,
          timestamp: startTime,
          toolName: "memory_save",
        },
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error.message || "Failed to save memory",
        metadata: {
          duration,
          timestamp: startTime,
          toolName: "memory_save",
        },
      };
    }
  }
}

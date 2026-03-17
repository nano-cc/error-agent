import { z } from "zod";
import { BaseTool } from "../base-tool";
import {
  DangerLevel,
  ToolCategory,
  ToolExecutionResult,
} from "../types";
import { getLSPService } from "./lsp-service";

export const LSPHoverSchema = z.object({
  filePath: z.string().describe("文件路径"),
  line: z.number().describe("行号（从 0 开始）"),
  character: z.number().describe("字符位置（从 0 开始）"),
});

export class LSPHoverTool extends BaseTool<typeof LSPHoverSchema> {
  constructor() {
    super({
      name: "lsp_hover",
      description: "获取光标位置的悬停信息，显示类型、文档等",
      schema: LSPHoverSchema,
      meta: {
        category: ToolCategory.PROJECT,
        dangerLevel: DangerLevel.SAFE,
        isPrivileged: false,
      },
    });
  }

  async _call(
    args: z.infer<typeof LSPHoverSchema>,
  ): Promise<ToolExecutionResult> {
    const { filePath, line, character } = args;
    const startTime = Date.now();
    const timestamp = startTime;

    try {
      const service = getLSPService();
      const result = await service.hover(filePath, line, character);

      if (!result) {
        const duration = Date.now() - startTime;
        return {
          success: false,
          error: "No hover information available",
          metadata: {
            duration,
            timestamp,
            toolName: "lsp_hover",
          },
        };
      }

      const duration = Date.now() - startTime;
      return {
        success: true,
        data: { content: result },
        metadata: {
          duration,
          timestamp,
          toolName: "lsp_hover",
        },
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error.message || "Failed to get hover information",
        metadata: {
          duration,
          timestamp,
          toolName: "lsp_hover",
        },
      };
    }
  }
}

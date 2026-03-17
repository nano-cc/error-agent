import { z } from "zod";
import { BaseTool } from "../base-tool";
import {
  DangerLevel,
  ToolCategory,
  ToolExecutionResult,
} from "../types";
import { getLSPService } from "./lsp-service";

export const LSPImplementationSchema = z.object({
  filePath: z.string().describe("文件路径"),
  line: z.number().describe("行号（从 0 开始）"),
  character: z.number().describe("字符位置（从 0 开始）"),
});

export class LSPImplementationTool extends BaseTool<typeof LSPImplementationSchema> {
  constructor() {
    super({
      name: "lsp_implementation",
      description: "查找接口或抽象类的实现位置",
      schema: LSPImplementationSchema,
      meta: {
        category: ToolCategory.PROJECT,
        dangerLevel: DangerLevel.SAFE,
        isPrivileged: false,
      },
    });
  }

  async _call(
    args: z.infer<typeof LSPImplementationSchema>,
  ): Promise<ToolExecutionResult> {
    const { filePath, line, character } = args;
    const startTime = Date.now();
    const timestamp = startTime;

    try {
      const service = getLSPService();
      const result = await service.implementation(filePath, line, character);

      if (!result || result.length === 0) {
        const duration = Date.now() - startTime;
        return {
          success: false,
          error: "No implementation found",
          metadata: {
            duration,
            timestamp,
            toolName: "lsp_implementation",
          },
        };
      }

      const duration = Date.now() - startTime;
      return {
        success: true,
        data: { implementations: result },
        metadata: {
          duration,
          timestamp,
          toolName: "lsp_implementation",
        },
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error.message || "Failed to get implementation",
        metadata: {
          duration,
          timestamp,
          toolName: "lsp_implementation",
        },
      };
    }
  }
}

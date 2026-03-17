import { z } from "zod";
import { BaseTool } from "../base-tool";
import {
  DangerLevel,
  ToolCategory,
  ToolExecutionResult,
} from "../types";
import { getLSPService } from "./lsp-service";

export const LSPDefinitionSchema = z.object({
  filePath: z.string().describe("文件路径"),
  line: z.number().describe("行号（从 0 开始）"),
  character: z.number().describe("字符位置（从 0 开始）"),
});

export class LSPDefinitionTool extends BaseTool<typeof LSPDefinitionSchema> {
  constructor() {
    super({
      name: "lsp_definition",
      description: "跳转到符号的定义位置",
      schema: LSPDefinitionSchema,
      meta: {
        category: ToolCategory.PROJECT,
        dangerLevel: DangerLevel.SAFE,
        isPrivileged: false,
      },
    });
  }

  async _call(
    args: z.infer<typeof LSPDefinitionSchema>,
  ): Promise<ToolExecutionResult> {
    const { filePath, line, character } = args;
    const startTime = Date.now();
    const timestamp = startTime;

    try {
      const service = getLSPService();
      const result = await service.definition(filePath, line, character);

      if (!result || result.length === 0) {
        const duration = Date.now() - startTime;
        return {
          success: false,
          error: "No definition found",
          metadata: {
            duration,
            timestamp,
            toolName: "lsp_definition",
          },
        };
      }

      const duration = Date.now() - startTime;
      return {
        success: true,
        data: { definitions: result },
        metadata: {
          duration,
          timestamp,
          toolName: "lsp_definition",
        },
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error.message || "Failed to get definition",
        metadata: {
          duration,
          timestamp,
          toolName: "lsp_definition",
        },
      };
    }
  }
}

import { z } from "zod";
import { BaseTool } from "../base-tool";
import {
  DangerLevel,
  ToolCategory,
  ToolExecutionResult,
} from "../types";
import { getLSPService } from "./lsp-service";

export const LSPReferencesSchema = z.object({
  filePath: z.string().describe("文件路径"),
  line: z.number().describe("行号（从 0 开始）"),
  character: z.number().describe("字符位置（从 0 开始）"),
});

export class LSPReferencesTool extends BaseTool<typeof LSPReferencesSchema> {
  constructor() {
    super({
      name: "lsp_references",
      description: "查找符号的所有引用位置",
      schema: LSPReferencesSchema,
      meta: {
        category: ToolCategory.PROJECT,
        dangerLevel: DangerLevel.SAFE,
        isPrivileged: false,
      },
    });
  }

  async _call(
    args: z.infer<typeof LSPReferencesSchema>,
  ): Promise<ToolExecutionResult> {
    const { filePath, line, character } = args;
    const startTime = Date.now();
    const timestamp = startTime;

    try {
      const service = getLSPService();
      const result = await service.references(filePath, line, character);

      if (!result || result.length === 0) {
        const duration = Date.now() - startTime;
        return {
          success: false,
          error: "No references found",
          metadata: {
            duration,
            timestamp,
            toolName: "lsp_references",
          },
        };
      }

      const duration = Date.now() - startTime;
      return {
        success: true,
        data: { references: result },
        metadata: {
          duration,
          timestamp,
          toolName: "lsp_references",
        },
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error.message || "Failed to get references",
        metadata: {
          duration,
          timestamp,
          toolName: "lsp_references",
        },
      };
    }
  }
}

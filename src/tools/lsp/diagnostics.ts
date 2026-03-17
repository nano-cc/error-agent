import { z } from "zod";
import { BaseTool } from "../base-tool";
import {
  DangerLevel,
  ToolCategory,
  ToolExecutionResult,
} from "../types";
import { getLSPService } from "./lsp-service";

export const LSPDiagnosticsSchema = z.object({
  filePath: z.string().optional().describe("文件路径，不提供则获取所有文件的诊断"),
});

export class LSPDiagnosticsTool extends BaseTool<typeof LSPDiagnosticsSchema> {
  constructor() {
    super({
      name: "lsp_diagnostics",
      description: "获取文件的 LSP 诊断信息（错误、警告、提示等）",
      schema: LSPDiagnosticsSchema,
      meta: {
        category: ToolCategory.PROJECT,
        dangerLevel: DangerLevel.SAFE,
        isPrivileged: false,
      },
    });
  }

  async _call(
    args: z.infer<typeof LSPDiagnosticsSchema>,
  ): Promise<ToolExecutionResult> {
    const { filePath } = args;
    const startTime = Date.now();
    const timestamp = startTime;

    try {
      const service = getLSPService();
      const result = await service.diagnostics(filePath);

      const duration = Date.now() - startTime;
      return {
        success: true,
        data: { diagnostics: result },
        metadata: {
          duration,
          timestamp,
          toolName: "lsp_diagnostics",
        },
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error.message || "Failed to get diagnostics",
        metadata: {
          duration,
          timestamp,
          toolName: "lsp_diagnostics",
        },
      };
    }
  }
}

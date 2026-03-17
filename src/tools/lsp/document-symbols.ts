import { z } from "zod";
import { BaseTool } from "../base-tool";
import {
  DangerLevel,
  ToolCategory,
  ToolExecutionResult,
} from "../types";
import { getLSPService } from "./lsp-service";

export const LSPDocumentSymbolsSchema = z.object({
  filePath: z.string().describe("文件路径"),
});

export class LSPDocumentSymbolsTool extends BaseTool<typeof LSPDocumentSymbolsSchema> {
  constructor() {
    super({
      name: "lsp_document_symbols",
      description: "列出当前文件中的所有符号（类、函数、变量等）",
      schema: LSPDocumentSymbolsSchema,
      meta: {
        category: ToolCategory.PROJECT,
        dangerLevel: DangerLevel.SAFE,
        isPrivileged: false,
      },
    });
  }

  async _call(
    args: z.infer<typeof LSPDocumentSymbolsSchema>,
  ): Promise<ToolExecutionResult> {
    const { filePath } = args;
    const startTime = Date.now();
    const timestamp = startTime;

    try {
      const service = getLSPService();
      const result = await service.documentSymbols(filePath);

      if (!result || result.length === 0) {
        const duration = Date.now() - startTime;
        return {
          success: false,
          error: "No symbols found in document",
          metadata: {
            duration,
            timestamp,
            toolName: "lsp_document_symbols",
          },
        };
      }

      const duration = Date.now() - startTime;
      return {
        success: true,
        data: { symbols: result },
        metadata: {
          duration,
          timestamp,
          toolName: "lsp_document_symbols",
        },
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error.message || "Failed to get document symbols",
        metadata: {
          duration,
          timestamp,
          toolName: "lsp_document_symbols",
        },
      };
    }
  }
}

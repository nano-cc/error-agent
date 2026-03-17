import { z } from "zod";
import { BaseTool } from "../base-tool";
import {
  DangerLevel,
  ToolCategory,
  ToolExecutionResult,
} from "../types";
import { getLSPService } from "./lsp-service";

export const LSPWorkspaceSymbolsSchema = z.object({
  query: z.string().describe("搜索关键词"),
});

export class LSPWorkspaceSymbolsTool extends BaseTool<typeof LSPWorkspaceSymbolsSchema> {
  constructor() {
    super({
      name: "lsp_workspace_symbols",
      description: "在整个工作区中搜索符号",
      schema: LSPWorkspaceSymbolsSchema,
      meta: {
        category: ToolCategory.PROJECT,
        dangerLevel: DangerLevel.SAFE,
        isPrivileged: false,
      },
    });
  }

  async _call(
    args: z.infer<typeof LSPWorkspaceSymbolsSchema>,
  ): Promise<ToolExecutionResult> {
    const { query } = args;
    const startTime = Date.now();
    const timestamp = startTime;

    try {
      const service = getLSPService();
      const result = await service.workspaceSymbols(query);

      if (!result || result.length === 0) {
        const duration = Date.now() - startTime;
        return {
          success: false,
          error: "No workspace symbols found",
          metadata: {
            duration,
            timestamp,
            toolName: "lsp_workspace_symbols",
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
          toolName: "lsp_workspace_symbols",
        },
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error.message || "Failed to get workspace symbols",
        metadata: {
          duration,
          timestamp,
          toolName: "lsp_workspace_symbols",
        },
      };
    }
  }
}

import * as vscode from "vscode";
import { z } from "zod";
import { BaseTool } from "../base-tool";
import {
  DangerLevel,
  ToolCategory,
  ToolExecutionResult,
} from "../types";

export const ReadFileSchema = z.object({
  path: z.string().describe("文件路径。可以是相对路径、绝对路径，或使用特殊变量：~、$cwd"),
  offset: z.number().optional().describe("起始行号（从 0 开始）。用于分页读取大文件"),
  limit: z.number().optional().describe("读取的行数，默认 100。用于分页读取大文件"),
});

function getWorkspaceRoot(): string {
  return vscode.workspace.workspaceFolders?.[0].uri.fsPath || process.cwd();
}

function toAbsolutePath(relPath: string): string {
  if (relPath.startsWith("~")) {
    return relPath.replace("~", process.env.HOME || process.env.USERPROFILE || "");
  }
  if (relPath.startsWith("$cwd")) {
    return relPath.replace("$cwd", getWorkspaceRoot());
  }
  return relPath;
}

export class ReadFileTool extends BaseTool<typeof ReadFileSchema> {
  constructor() {
    super({
      name: "read_file",
      description: "读取文件内容，支持分页读取以处理大文件",
      schema: ReadFileSchema,
      meta: {
        category: ToolCategory.FILE,
        dangerLevel: DangerLevel.SAFE,
        isPrivileged: false,
      },
    });
  }

  async _call(args: z.infer<typeof ReadFileSchema>): Promise<ToolExecutionResult> {
    const { path: filePath, offset = 0, limit = 100 } = args;
    const startTime = Date.now();
    const timestamp = startTime;

    try {
      const fullPath = toAbsolutePath(filePath);
      const fileContent = await vscode.workspace.fs.readFile(vscode.Uri.file(fullPath));
      const content = Buffer.from(fileContent).toString("utf-8");
      const lines = content.split("\n");

      const startLine = Math.max(0, offset);
      const endLine = Math.min(lines.length, offset + limit);
      const selectedLines = lines.slice(startLine, endLine);

      const duration = Date.now() - startTime;
      return {
        success: true,
        data: {
          content: selectedLines.join("\n"),
          lines: selectedLines,
          totalLines: lines.length,
          startLine,
          endLine,
          truncated: endLine < lines.length,
        },
        metadata: {
          duration,
          timestamp,
          toolName: "read_file",
        },
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error.message || "Failed to read file",
        metadata: {
          duration,
          timestamp,
          toolName: "read_file",
        },
      };
    }
  }
}

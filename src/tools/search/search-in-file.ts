import * as vscode from "vscode";
import { z } from "zod";
import { BaseTool } from "../base-tool";
import {
  DangerLevel,
  ToolCategory,
  ToolExecutionResult,
} from "../types";

export const SearchInFileSchema = z.object({
  path: z.string().describe("文件路径。可以是相对路径、绝对路径，或使用特殊变量：~、$cwd"),
  pattern: z.string().describe("搜索模式，支持 JavaScript 正则表达式"),
  context: z.number().optional().describe("匹配行前前后的上下文行数，默认 2"),
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

export class SearchInFileTool extends BaseTool<typeof SearchInFileSchema> {
  constructor() {
    super({
      name: "search_in_file",
      description: "在文件中搜索匹配正则表达式的行，并返回上下文",
      schema: SearchInFileSchema,
      meta: {
        category: ToolCategory.SEARCH,
        dangerLevel: DangerLevel.SAFE,
        isPrivileged: false,
      },
    });
  }

  async _call(args: z.infer<typeof SearchInFileSchema>): Promise<ToolExecutionResult> {
    const { path: filePath, pattern, context: contextLines = 2 } = args;
    const startTime = Date.now();
    const timestamp = startTime;

    try {
      const fullPath = toAbsolutePath(filePath);
      const fileContent = await vscode.workspace.fs.readFile(vscode.Uri.file(fullPath));
      const content = Buffer.from(fileContent).toString("utf-8");
      const lines = content.split("\n");
      const regex = new RegExp(pattern);
      const matches: any[] = [];

      for (let i = 0; i < lines.length && matches.length < 20; i++) {
        if (regex.test(lines[i])) {
          const start = Math.max(0, i - contextLines);
          const end = Math.min(lines.length, i + contextLines + 1);
          matches.push({
            lineNumber: i + 1,
            line: lines[i],
            context: lines.slice(start, end),
          });
        }
      }

      const duration = Date.now() - startTime;
      return {
        success: true,
        data: {
          matches,
          count: matches.length,
        },
        metadata: {
          duration,
          timestamp,
          toolName: "search_in_file",
        },
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error.message || "Failed to search in file",
        metadata: {
          duration,
          timestamp,
          toolName: "search_in_file",
        },
      };
    }
  }
}

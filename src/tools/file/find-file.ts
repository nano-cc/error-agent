import * as vscode from "vscode";
import { z } from "zod";
import { BaseTool } from "../base-tool";
import {
  DangerLevel,
  ToolCategory,
  ToolExecutionResult,
} from "../types";

export const FindFileSchema = z.object({
  pattern: z.string().describe("文件名匹配模式，支持通配符：*.ts (所有 TypeScript 文件)、*.tsx、*.json、* (所有文件)"),
  directory: z.string().optional().describe("搜索的起始目录，默认为工作区根目录"),
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

export class FindFileTool extends BaseTool<typeof FindFileSchema> {
  constructor() {
    super({
      name: "find_file",
      description: "递归查找匹配文件名模式的文件。支持通配符：*.ts、*.tsx、*.json 等",
      schema: FindFileSchema,
      meta: {
        category: ToolCategory.FILE,
        dangerLevel: DangerLevel.SAFE,
        isPrivileged: false,
      },
    });
  }

  async _call(args: z.infer<typeof FindFileSchema>): Promise<ToolExecutionResult> {
    const { pattern, directory } = args;
    const startTime = Date.now();
    const timestamp = startTime;

    try {
      const baseDir = directory ? toAbsolutePath(directory) : getWorkspaceRoot();
      const results: string[] = [];
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$");

      async function searchDir(dirUri: vscode.Uri): Promise<void> {
        if (results.length >= 50) return;
        try {
          const items = await vscode.workspace.fs.readDirectory(dirUri);
          for (const [name, type] of items) {
            if (results.length >= 50) break;
            if (name === "node_modules" || name.startsWith(".")) continue;
            const itemUri = vscode.Uri.joinPath(dirUri, name);
            if (type === vscode.FileType.Directory) {
              await searchDir(itemUri);
            } else if (regex.test(name)) {
              results.push(itemUri.fsPath);
            }
          }
        } catch (e) {}
      }

      await searchDir(vscode.Uri.file(baseDir));

      const duration = Date.now() - startTime;
      return {
        success: true,
        data: {
          files: results,
          count: results.length,
        },
        metadata: {
          duration,
          timestamp,
          toolName: "find_file",
        },
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error.message || "Failed to find files",
        metadata: {
          duration,
          timestamp,
          toolName: "find_file",
        },
      };
    }
  }
}

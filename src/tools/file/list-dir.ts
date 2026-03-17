import * as vscode from "vscode";
import { z } from "zod";
import { BaseTool } from "../base-tool";
import {
  DangerLevel,
  ToolCategory,
  ToolExecutionResult,
} from "../types";

export const ListDirSchema = z.object({
  path: z.string().describe("目录路径。可以是相对路径、绝对路径，或使用特殊变量：~ (用户主目录)、$cwd (工作区根目录)"),
  filter: z.string().optional().describe("可选的文件名过滤正则表达式，例如：\\.ts$ (只显示 TypeScript 文件)、^app (只显示以 app 开头的文件)"),
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

export class ListDirTool extends BaseTool<typeof ListDirSchema> {
  constructor() {
    super({
      name: "list_dir",
      description: "列出指定目录中的文件和子目录，支持使用正则表达式过滤文件名",
      schema: ListDirSchema,
      meta: {
        category: ToolCategory.FILE,
        dangerLevel: DangerLevel.SAFE,
        isPrivileged: false,
      },
    });
  }

  async _call(args: z.infer<typeof ListDirSchema>): Promise<ToolExecutionResult> {
    const { path: dirPath, filter } = args;
    const startTime = Date.now();
    const timestamp = startTime;

    try {
      const fullPath = toAbsolutePath(dirPath);
      const items = await vscode.workspace.fs.readDirectory(vscode.Uri.file(fullPath));

      let filteredItems = items;
      if (filter) {
        const regex = new RegExp(filter);
        filteredItems = items.filter(([name]) => regex.test(name));
      }

      const displayedItems = filteredItems.slice(0, 50);
      const results = displayedItems.map(([name, type]) => ({
        name,
        type: type === vscode.FileType.Directory ? "directory" : "file",
      }));

      const duration = Date.now() - startTime;
      return {
        success: true,
        data: {
          items: results,
          count: results.length,
          total: filteredItems.length,
        },
        metadata: {
          duration,
          timestamp,
          toolName: "list_dir",
        },
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error.message || "Failed to list directory",
        metadata: {
          duration,
          timestamp,
          toolName: "list_dir",
        },
      };
    }
  }
}

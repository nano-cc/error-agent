import * as vscode from "vscode";
import { z } from "zod";
import { BaseTool } from "../base-tool";
import {
  DangerLevel,
  ToolCategory,
  ToolExecutionResult,
} from "../types";

export const EditFileLinesSchema = z.object({
  path: z.string().describe("文件路径。可以是相对路径、绝对路径，或使用特殊变量：~、$cwd"),
  startLine: z.number().describe("起始行号（从 0 开始）"),
  endLine: z.number().describe("结束行号（不包含）。要替换的范围是 [startLine, endLine)"),
  newContent: z.string().describe("新的内容，将替换指定行范围"),
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

export class EditFileLinesTool extends BaseTool<typeof EditFileLinesSchema> {
  constructor() {
    super({
      name: "edit_file_lines",
      description: "替换文件中指定行范围的内容",
      schema: EditFileLinesSchema,
      meta: {
        category: ToolCategory.EDIT,
        dangerLevel: DangerLevel.CAUTION,
        isPrivileged: true,
      },
    });
  }

  async _call(args: z.infer<typeof EditFileLinesSchema>): Promise<ToolExecutionResult> {
    const { path: filePath, startLine, endLine, newContent } = args;
    const startTime = Date.now();
    const timestamp = startTime;

    try {
      const fullPath = toAbsolutePath(filePath);
      const fileContent = await vscode.workspace.fs.readFile(vscode.Uri.file(fullPath));
      const content = Buffer.from(fileContent).toString("utf-8");
      const lines = content.split("\n");

      if (startLine < 0 || startLine > lines.length) {
        throw new Error(`起始行号 ${startLine} 超出范围 (0-${lines.length})`);
      }
      if (endLine < startLine || endLine > lines.length) {
        throw new Error(`结束行号 ${endLine} 超出范围 (${startLine}-${lines.length})`);
      }

      const newLines = newContent.split("\n");
      lines.splice(startLine, endLine - startLine, ...newLines);
      const newContentStr = lines.join("\n");

      await vscode.workspace.fs.writeFile(vscode.Uri.file(fullPath), Buffer.from(newContentStr, "utf-8"));

      const duration = Date.now() - startTime;
      return {
        success: true,
        data: {
          modifiedLines: endLine - startLine,
          insertedLines: newLines.length,
          totalLines: lines.length,
        },
        metadata: {
          duration,
          timestamp,
          toolName: "edit_file_lines",
        },
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error.message || "Failed to edit file",
        metadata: {
          duration,
          timestamp,
          toolName: "edit_file_lines",
        },
      };
    }
  }
}

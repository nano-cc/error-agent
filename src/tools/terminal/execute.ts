import { z } from "zod";
import { BaseTool } from "../base-tool";
import { DangerLevel, ToolCategory, ToolExecutionResult } from "../types";
import * as vscode from "vscode";

export const TerminalExecuteSchema = z.object({
  command: z
    .string()
    .describe("要执行的 shell 命令。例如：npm run build、git status、ls -la"),
  timeout: z
    .number()
    .optional()
    .describe("命令执行的超时时间（毫秒），默认 30000 (30秒)"),
});

function getWorkspace() {
  return vscode.workspace.workspaceFolders?.[0].uri.fsPath || process.cwd();
}

export class TerminalExecuteTool extends BaseTool<
  typeof TerminalExecuteSchema
> {
  constructor() {
    super({
      name: "terminal_execute",
      description: "在工作区中执行 shell 命令",
      schema: TerminalExecuteSchema,
      meta: {
        category: ToolCategory.TERMINAL,
        dangerLevel: DangerLevel.CRITICAL,
        isPrivileged: true,
      },
    });
  }

  async _call(
    args: z.infer<typeof TerminalExecuteSchema>,
  ): Promise<ToolExecutionResult> {
    const { command, timeout = 30000 } = args;
    const startTime = Date.now();
    const timestamp = startTime;

    return new Promise((resolve) => {
      const { exec } = require("child_process");

      const proc = exec(
        command,
        {
          cwd: getWorkspace(),
          timeout,
        },
        (error: any, stdout: string, stderr: string) => {
          const duration = Date.now() - startTime;
          if (error) {
            resolve({
              success: false,
              error: error.message || "Command execution failed",
              metadata: {
                duration,
                timestamp,
                toolName: "terminal_execute",
              },
            });
          } else {
            resolve({
              success: true,
              data: {
                stdout,
                stderr,
                exitCode: 0,
              },
              metadata: {
                duration,
                timestamp,
                toolName: "terminal_execute",
              },
            });
          }
        },
      );
    });
  }
}

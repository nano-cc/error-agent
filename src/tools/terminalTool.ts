import * as vscode from "vscode";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { CONFIG } from "../config";

/**
 * 移除 ANSI 转义序列（颜色代码等），使 Agent 能读懂纯文本
 */
function stripAnsi(str: string): string {
  // 简单的正则匹配 ANSI 代码
  const pattern = [
    "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d\\/#&.:=?%@~_]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*)?\\u0007)",
    "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))",
  ].join("|");
  const regex = new RegExp(pattern, "g");
  return str.replace(regex, "");
}

class TerminalSession {
  private terminal: vscode.Terminal | null = null;

  /**
   * 获取或创建终端，并确保 Shell Integration 已就绪
   */
  private async getTerminal(): Promise<vscode.Terminal> {
    // 如果终端存在且未关闭，直接返回
    if (this.terminal && this.terminal.exitStatus === undefined) {
      return this.terminal;
    }

    const activeTerminal = vscode.window.activeTerminal;
    let newOptions: vscode.TerminalOptions = {
      name: "Error Agent",
      isTransient: true,
    };

    if (activeTerminal) {
      const options = activeTerminal.creationOptions as vscode.TerminalOptions;
      newOptions = {
        ...newOptions,
        shellPath: options.shellPath,
        shellArgs: options.shellArgs,
        cwd: activeTerminal.shellIntegration?.cwd?.fsPath || options.cwd,
        env: options.env,
        iconPath: new vscode.ThemeIcon("debug-console"),
        color: new vscode.ThemeColor("terminal.ansiRed"),
      };
    }

    this.terminal = vscode.window.createTerminal(newOptions);
    this.terminal.show(true);

    // 【关键】等待 Shell Integration 激活
    // 如果不等待，立刻执行 executeCommand 会抛出异常
    await this.waitForShellIntegration(this.terminal);

    return this.terminal;
  }

  private async waitForShellIntegration(
    terminal: vscode.Terminal,
  ): Promise<void> {
    if (terminal.shellIntegration) return;

    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, 5000); // 5秒超时兜底
      const disposable = vscode.window.onDidChangeTerminalShellIntegration(
        (e) => {
          if (e.terminal === terminal) {
            clearTimeout(timeout);
            disposable.dispose();
            resolve();
          }
        },
      );
    });
  }

  /**
   * 执行命令
   */
  public async execute(
    command: string,
    timeoutMs: number = CONFIG.terminal.defaultTimeout,
  ): Promise<string> {
    const term = await this.getTerminal();

    // 检查当前环境是否支持 Shell Integration
    if (!term.shellIntegration) {
      return "[System Error]: 当前终端环境不支持 Shell Integration，无法捕获输出。请检查 VS Code 设置。";
    }

    const si = term.shellIntegration;

    return new Promise(async (resolve) => {
      let output = "";
      let isResolved = false;

      // 【核心】使用 executeCommand 获取 execution 对象
      const execution = si.executeCommand(command);

      // 异步读取输出流
      const readStream = async () => {
        try {
          for await (const chunk of execution.read()) {
            output += chunk;
          }
        } catch (e) {
          console.error("Read stream error:", e);
        }
      };
      readStream();

      // 监听命令结束
      const disposable = vscode.window.onDidEndTerminalShellExecution(
        (event) => {
          if (event.execution === execution) {
            isResolved = true;
            disposable.dispose();

            // 清理并截断输出
            const cleanOutput = stripAnsi(output).trim();
            const result = this.formatResult(
              command,
              cleanOutput,
              event.exitCode,
            );
            resolve(result);
          }
        },
      );

      // 超时处理
      setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          disposable.dispose();
          resolve(`[System Error]: 命令执行超时 (${timeoutMs}ms)`);
        }
      }, timeoutMs);
    });
  }

  private formatResult(
    command: string,
    output: string,
    exitCode: number | undefined,
  ): string {
    const maxLength = CONFIG.terminal.maxOutputLength || 5000;
    let processedOutput = output;

    if (output.length > maxLength) {
      processedOutput =
        output.slice(0, 1000) +
        `\n\n... [省略 ${output.length - maxLength} 字符] ...\n\n` +
        output.slice(-1000);
    }

    let result = `[执行命令]: ${command}\n`;
    result += `[退出状态]: ${exitCode === 0 ? "成功" : `失败 (Exit Code: ${exitCode})`}\n`;
    result += `[终端输出]:\n${processedOutput || "(无输出)"}`;
    return result;
  }

  public dispose() {
    if (this.terminal) {
      this.terminal.dispose();
      this.terminal = null;
    }
  }
}

// 单例
const session = new TerminalSession();

export const terminal = tool(
  async ({ command, timeout }) => {
    try {
      return await session.execute(command, timeout);
    } catch (error: any) {
      return `[System Error]: ${error.message}`;
    }
  },
  {
    name: "terminal",
    description:
      "在 VS Code 终端中执行命令并获取实时输出。支持自动继承当前 Conda/PWD 环境。命令执行完毕后会返回完整的标准输出和错误输出。",
    schema: z.object({
      command: z.string().describe("要在终端运行的 shell 命令"),
      timeout: z.number().optional().describe("超时时间(ms)，默认 30000"),
    }),
  },
);

export function disposeTerminal() {
  session.dispose();
}

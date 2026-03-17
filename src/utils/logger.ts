// Logger - 统一日志输出工具
// 使用 vscode.OutputChannel 确保 F5 调试时日志可见

import * as vscode from 'vscode';

export class Logger {
  private static instance: Logger | null = null;
  private channel: vscode.OutputChannel | null = null;
  private enabled: boolean = true;

  private constructor() {
    this.channel = vscode.window.createOutputChannel('Error Agent Debug');
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public info(message: string, ...args: any[]): void {
    if (!this.enabled) return;
    this.log('[INFO]', message, ...args);
  }

  public debug(message: string, ...args: any[]): void {
    if (!this.enabled) return;
    this.log('[DEBUG]', message, ...args);
  }

  public error(message: string, ...args: any[]): void {
    this.log('[ERROR]', message, ...args);
  }

  public warn(message: string, ...args: any[]): void {
    this.log('[WARN]', message, ...args);
  }

  private log(prefix: string, message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    const fullMessage = `${timestamp} ${prefix} ${message}`;

    // 输出到 OutputChannel（Debug Console 可见）
    this.channel?.appendLine(fullMessage);
    if (args.length > 0) {
      args.forEach(arg => {
        if (typeof arg === 'object') {
          this.channel?.appendLine(JSON.stringify(arg, null, 2));
        } else {
          this.channel?.appendLine(String(arg));
        }
      });
    }

    // 同时输出到控制台（开发时方便）
    console.log(fullMessage, ...args);
  }

  public show(): void {
    this.channel?.show(true);
  }

  public dispose(): void {
    this.channel?.dispose();
    this.channel = null;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

// 导出便捷函数
export const logger = Logger.getInstance();

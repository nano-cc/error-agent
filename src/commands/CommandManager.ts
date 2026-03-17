// Command Manager - 命令管理

import * as vscode from "vscode";
import { SideBarProvider } from "../ui/SideBarProvider";
import { StorageManager } from "../storage/StorageManager";
import { SessionManager } from "../session/SessionManager";
import { ContextManager } from "../context/ContextManager";
import { DiagnosticAgent } from "../core/agent";
import { CONFIG } from "../config";
import { ToolCall } from "../types/session";
import {
  ApprovalCallback,
  ApprovalResult,
  ToolCallRequest,
} from "../tools/tool-node";
import { createChatModel } from "../llm/llm";
import { DangerLevel } from "../tools/types";

export class CommandManager {
  private _disposables: vscode.Disposable[] = [];
  private _activeAgent: DiagnosticAgent | null = null;
  private _isRunning: boolean = false;
  private _shouldStop: boolean = false;

  // 管理器
  private _sessionManager: SessionManager;
  private _contextManager: ContextManager;

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _sideBar: SideBarProvider,
    private readonly _storageManager: StorageManager,
  ) {
    this._sessionManager = new SessionManager(_storageManager);
    this._contextManager = new ContextManager(_storageManager);
    this._registerCommands();
  }

  /**
   * 注册所有命令
   */
  private _registerCommands() {
    // 打开侧边栏命令
    this._disposables.push(
      vscode.commands.registerCommand("error-agent.focus", () => {
        vscode.commands.executeCommand("error-agent-sidebar.focus");
      }),
    );

    // 发送消息命令（从 UI 触发）
    this._disposables.push(
      vscode.commands.registerCommand(
        "error-agent.sendMessage",
        async (content: string, sessionId?: string) => {
          await this._sendMessage(content, sessionId);
        },
      ),
    );
  }

  /**
   * 发送消息并运行 Agent
   */
  private async _sendMessage(content: string, sessionId?: string) {
    console.log(
      "[CommandManager] Sending message:",
      content,
      "sessionId:",
      sessionId,
    );

    // 如果没有指定 sessionId，使用当前活跃会话或创建新会话
    let targetSessionId = sessionId;
    let isNewSession = false;

    if (!targetSessionId) {
      const session = await this._sessionManager.getOrCreateActiveSession();
      targetSessionId = session.id;
      isNewSession = true; // 标记这是新会话
      console.log("[CommandManager] Created new session:", targetSessionId);
    }

    // 如果是新会话，通知 UI 切换到聊天视图
    if (isNewSession) {
      await this._sideBar.navigateToChat(targetSessionId);
    }

    // 加载会话历史消息到缓存
    // TODO 这里可以优化，目前是每发送一条消息都需要重复从数据库中加载，如果缓存中保存了消息记录就不需要再从数据库加载，因为新增的时候二者会同步更新
    await this._contextManager.loadMessages(targetSessionId);
    console.log(
      "[CommandManager] Loaded messages for session:",
      targetSessionId,
    );

    // 追加并显示用户消息
    await this._contextManager.appendMessage(targetSessionId, "user", content);
    console.log("[CommandManager] User message saved");

    // 显示用户消息到 UI
    this._sideBar.postMessage({
      role: "👤 用户",
      content: content,
      type: "user",
    });

    // 获取配置
    const config = vscode.workspace.getConfiguration("errorAgent");
    const apiKey = config.get<string>("apiKey");

    if (!apiKey) {
      vscode.window.showErrorMessage("请先请先在设置中配置 errorAgent.apiKey");
      return;
    }

    // 如果是新会话的第一条消息，自动生成标题
    const messages = this._contextManager.getMessages(targetSessionId);
    if (messages.length === 1) {
      await this._sessionManager.autoGenerateTitle(targetSessionId, content);
    }

    // 运行 Agent
    console.log("[CommandManager] Running agent...");
    await this._runAgent(targetSessionId, config);
  }

  /**
   * 运行 Agent
   */
  private async _runAgent(
    sessionId: string,
    config: vscode.WorkspaceConfiguration,
  ) {
    const apiUrl = config.get<string>("apiUrl");
    const model = config.get<string>("model");
    const temperature =
      config.get<number>("temperature") ?? CONFIG.agent.defaultTemperature;
    const projDir = vscode.workspace.workspaceFolders?.[0].uri.fsPath || "";

    // 设置工具执行批准回调
    DiagnosticAgent.setApprovalCallback((request: ToolCallRequest) =>
      this._requestToolApproval(request),
    );

    const chatModel = createChatModel({
      apiKey: config.get<string>("apiKey")!,
      apiUrl: apiUrl || CONFIG.agent.defaultApiUrl,
      model: model || CONFIG.agent.defaultModel,
      temperature: temperature,
    });

    // 创建 Agent
    this._activeAgent = new DiagnosticAgent(chatModel, sessionId);

    this._isRunning = true;
    this._shouldStop = false;
    this._sideBar.setRunning(true);

    console.log("[CommandManager._runAgent] Agent created, starting main loop");

    try {
      // 构建完整的 LangChain 上下文
      const langChainMessages =
        await this._contextManager.buildLangChainContext(sessionId);
      console.log(
        "[CommandManager._runAgent] Built LangChain context with",
        langChainMessages.length,
        "messages",
      );

      // 运行 Agent（传入消息列表）
      let stream = this._activeAgent.runWithMessages(langChainMessages);
      console.log("[CommandManager._runAgent] Stream started");

      while (this._isRunning && !this._shouldStop) {
        // 快速检查是否应该停止
        if (this._shouldStop) {
          console.log(
            "[CommandManager._runAgent] Stop requested, breaking loop",
          );
          break;
        }

        // 检查暂停
        if (this._sideBar.hasPendingResume()) {
          console.log("[CommandManager._runAgent] Waiting for resume...");
          const resumeAction = await this._sideBar.waitForResume();

          if (resumeAction.stop || this._shouldStop) {
            console.log(
              "[CommandManager._runAgent] Stop requested during pause, breaking loop",
            );
            break;
          }

          if (resumeAction.message) {
            console.log(
              "[CommandManager._runAgent] Resuming with message:",
              resumeAction.message,
            );
            this._sideBar.postMessage({
              role: "🛠️ 干预",
              content: "正在根据您的建议调整方向...",
              type: "system",
            });

            // 追加干预消息
            await this._contextManager.appendMessage(
              sessionId,
              "user",
              resumeAction.message,
            );

            // 重新构建上下文并继续
            const newMessages =
              await this._contextManager.buildLangChainContext(sessionId);
            stream = this._activeAgent.runWithMessages(newMessages);
            continue;
          }
        }

        // 等待下一个 stream chunk，使用 Promise.race 实现可中断
        console.log(
          "[CommandManager._runAgent] Waiting for next stream chunk...",
        );
        const result = await Promise.race([
          stream.next(),
          new Promise<any>((resolve) => {
            const checkStop = setInterval(() => {
              if (this._shouldStop) {
                clearInterval(checkStop);
                resolve({ done: true, value: null });
              }
            }, 100);
          }),
        ]);

        if (result.done || !this._isRunning || this._shouldStop) {
          console.log("[CommandManager._runAgent] Stream completed or stopped");
          break;
        }

        const event = result.value;
        console.log("[CommandManager._runAgent] 🔍 Received event:", {
          hasAgent: !!event?.agent,
          hasTools: !!event?.tools,
          agentMessages: event?.agent?.messages?.length || 0,
          toolMessages: event?.tools?.messages?.length || 0,
          eventKeys: Object.keys(event || {}),
        });

        // 处理 Tools 消息（工具执行结果）
        if (event?.tools && event.tools.messages?.length > 0) {
          console.log(
            "[CommandManager._runAgent] 📦 Processing tools event, messages:",
            event.tools.messages.length,
          );
          for (const toolMsg of event.tools.messages) {
            const toolCallId = (toolMsg as any).tool_call_id || "";

            console.log("[CommandManager._runAgent] Tool result message:", {
              type: toolMsg._getType(),
              name: toolMsg.name,
              callId: toolCallId,
              hasContent: !!toolMsg.content,
              contentLength: toolMsg.content?.length || 0,
            });

            if (toolMsg._getType() === "tool") {
              const toolContent =
                typeof toolMsg.content === "string"
                  ? toolMsg.content
                  : JSON.stringify(toolMsg.content);

              console.log(
                "[CommandManager._runAgent] ===========================================",
              );
              console.log(
                "[CommandManager._runAgent] 📦 工具返回结果 -",
                toolMsg.name,
              );
              console.log("[CommandManager._runAgent] Call ID:", toolCallId);
              console.log("[CommandManager._runAgent] 返回内容:");
              console.log("[CommandManager._runAgent]", toolContent);
              console.log(
                "[CommandManager._runAgent] ===========================================",
              );

              // 保存工具结果到 SQLite
              await this._contextManager.appendMessage(
                sessionId,
                "tool",
                toolContent,
                {
                  toolResult: {
                    toolName: toolMsg.name || "Tool",
                    callId: toolCallId,
                    output: toolContent,
                    success: true,
                  },
                },
              );

              console.log(
                "[CommandManager._runAgent] 📨 Posting tool result to UI",
              );
              // 显示到 UI
              this._sideBar.postMessage({
                role: "📦 工具结果",
                content: toolContent,
                toolName: toolMsg.name || "Tool",
                type: "tool",
              });
            }
          }
          console.log(
            "[CommandManager._runAgent] ✅ Tools event processing completed",
          );
        } else {
          console.log(
            "[CommandManager._runAgent] ℹ️ No tools event or empty messages",
          );
        }

        // 处理 Agent 消息
        if (event?.agent) {
          const lastMsg = event.agent.messages[event.agent.messages.length - 1];

          console.log("[CommandManager._runAgent] Agent messages:", {
            totalCount: event.agent.messages.length,
            lastMsgType: lastMsg?._getType(),
            lastMsgHasToolCalls: lastMsg?.tool_calls?.length > 0,
            lastMsgHasContent: !!lastMsg?.content,
          });

          // 处理 Agent 回复（有 content 或 tool_calls 都需要处理）
          const hasContent =
            !!lastMsg?.content && lastMsg.content.trim() !== "";
          const hasToolCalls = lastMsg?.tool_calls?.length > 0;

          // 保存 Agent 回复（包括 content 和 tool_calls 元数据）
          await this._contextManager.appendMessage(
            sessionId,
            "agent",
            lastMsg.content || "",
            {
              toolCalls: lastMsg.tool_calls?.map((tc: any) => ({
                id: tc.id,
                name: tc.name,
                args: tc.args,
              })),
            },
          );

          // 显示到 UI：有 content 显示 content，只有 tool_calls 时显示工具调用信息
          if (hasContent) {
            console.log(
              "[CommandManager._runAgent] ===========================================",
            );
            console.log("[CommandManager._runAgent] 🤖 LLM 完整回复:");
            console.log("[CommandManager._runAgent]", lastMsg.content);
            console.log(
              "[CommandManager._runAgent] 工具调用数量:",
              lastMsg.tool_calls?.length || 0,
            );
            console.log(
              "[CommandManager._runAgent] ===========================================",
            );

            this._sideBar.postMessage({
              role: "🤖 Agent",
              content: lastMsg.content,
              type: "agent",
            });
          } else if (hasToolCalls) {
            // 没有 content 但有 tool_calls 时，显示工具调用信息
            const toolCallSummary = lastMsg.tool_calls
              .map((tc: any) => `🔧 ${tc.name}(${JSON.stringify(tc.args)})`)
              .join("\n");
            const displayContent = `正在调用工具:\n${toolCallSummary}`;

            console.log(
              "[CommandManager._runAgent] ===========================================",
            );
            console.log(
              "[CommandManager._runAgent] 🤖 LLM 仅返回工具调用 (无 content):",
            );
            console.log(
              "[CommandManager._runAgent] 工具调用数量:",
              lastMsg.tool_calls.length,
            );
            console.log(
              "[CommandManager._runAgent] ===========================================",
            );

            this._sideBar.postMessage({
              role: "🤖 Agent",
              content: displayContent,
              type: "agent",
            });
          }

          // 处理工具调用（当前消息有 tool_calls）
          if (lastMsg.tool_calls?.length > 0) {
            console.log(
              "[CommandManager._runAgent] ===========================================",
            );
            console.log(
              "[CommandManager._runAgent] 🔧 工具调用数量:",
              lastMsg.tool_calls.length,
            );
            lastMsg.tool_calls.forEach((tc: any, index: number) => {
              console.log(
                `[CommandManager._runAgent] -----------------------------------------`,
              );
              console.log(
                `[CommandManager._runAgent] 工具调用 #${index + 1}: ${tc.name}`,
              );
              console.log(
                `[CommandManager._runAgent] 参数:`,
                JSON.stringify(tc.args, null, 2),
              );
              console.log(
                `[CommandManager._runAgent] 危险级别:`,
                CONFIG.security.dangerousTools.includes(tc.name)
                  ? "DANGER"
                  : "SAFE",
              );
            });
            console.log(
              "[CommandManager._runAgent] ===========================================",
            );

            // 工具调用会自动执行，无需额外处理
            // 等待下一个 chunk 中的 event.tools 获取执行结果
            console.log(
              "[CommandManager._runAgent] ⏳ Waiting for tool execution results...",
            );
          }
        }
      }

      console.log("[CommandManager._runAgent] Main loop exited");
    } catch (err: any) {
      console.error("[CommandManager._runAgent] Error:", err);
      this._sideBar.postMessage({
        role: "❌ 异常",
        content: err.message,
        type: "system",
      });

      await this._contextManager.appendMessage(
        sessionId,
        "system",
        `异常：${err.message}`,
      );
    } finally {
      this._isRunning = false;
      this._shouldStop = false;
      this._sideBar.setRunning(false);
      this._activeAgent = null;
      console.log("[CommandManager._runAgent] Cleanup completed");
    }
  }

  /**
   * 工具执行批准回调
   */
  private async _requestToolApproval(
    request: ToolCallRequest,
  ): Promise<ApprovalResult> {
    const { name, args, tool } = request;

    // 如果是 SAFE 级别，自动批准
    if (tool.meta.dangerLevel === DangerLevel.SAFE) {
      return { approved: true };
    }

    console.log(
      `[CommandManager] Tool ${name} requires approval, danger level: ${tool.meta.dangerLevel}`,
    );

    // 显示危险级别图标
    const dangerIcons: Record<string, string> = {
      [DangerLevel.CAUTION]: "⚠️",
      [DangerLevel.DANGEROUS]: "🔶",
      [DangerLevel.CRITICAL]: "🚨",
    };
    const icon = dangerIcons[tool.meta.dangerLevel] || "❓";

    // 构建确认消息
    const message =
      `${icon} 工具执行请求\n\n` +
      `工具名称: ${name}\n` +
      `危险级别: ${tool.meta.dangerLevel}\n\n` +
      `参数:\n${JSON.stringify(args, null, 2)}`;

    // 1. 定义选项，将 detail 放在这里
    const items: vscode.QuickPickItem[] = [
      {
        label: "✓ 批准",
        description: "允许执行此工具",
        detail: message, // 这里的 message 会在选项下方以较小字体显示
      },
      {
        label: "✗ 拒绝",
        description: "阻止工具执行",
        detail: "取消本次操作",
      },
    ];

    // 2. 调用时去掉 options 里的 detail
    const choice = await vscode.window.showQuickPick<vscode.QuickPickItem>(
      items,
      {
        title: `工具执行确认: ${name}`,
        placeHolder: "请选择操作",
        ignoreFocusOut: true,
      },
    );

    // 3. 安全判断

    // // 显示快速选择面板
    // const choice: { label: string; description: string } | undefined =
    //   await vscode.window.showQuickPick(
    //     [
    //       { label: "✓ 批准", description: "允许执行此工具" },
    //       { label: "✗ 拒绝", description: "阻止工具执行" },
    //     ],
    //     {
    //       title: `工具执行确认: ${name}`,
    //       detail: message,
    //       placeHolder: "请选择操作",
    //       ignoreFocusOut: true,
    //     },
    //   );

    if (!choice) {
      return {
        approved: false,
        rejectionReason: "用户取消了操作",
      };
    }

    if (choice.label === "✓ 批准") {
      console.log(`[CommandManager] Tool ${name} approved by user`);
      return { approved: true };
    } else {
      console.log(`[CommandManager] Tool ${name} rejected by user`);
      return {
        approved: false,
        rejectionReason: "用户拒绝了工具执行",
      };
    }
  }

  /**
   * 格式化工具参数用于显示
   */
  private _formatToolArgs(args: Record<string, any>): string {
    const lines: string[] = [];

    for (const [key, value] of Object.entries(args)) {
      let valueStr: string;

      if (typeof value === "string") {
        // 限制字符串长度
        valueStr = value.length > 200 ? value.substring(0, 200) + "..." : value;
        // 多行字符串添加代码块格式
        if (valueStr.includes("\n")) {
          valueStr = "```\n" + valueStr + "\n" + "```";
        }
      } else if (typeof value === "object" && value !== null) {
        // 对象类型格式化为 JSON
        const jsonStr = JSON.stringify(value, null, 2);
        valueStr =
          jsonStr.length > 500 ? jsonStr.substring(0, 500) + "\n..." : jsonStr;
      } else if (Array.isArray(value)) {
        // 数组类型
        const arrayStr = JSON.stringify(value, null, 2);
        valueStr =
          arrayStr.length > 500
            ? arrayStr.substring(0, 500) + "\n..."
            : arrayStr;
      } else {
        // 其他类型
        valueStr = String(value);
      }

      lines.push(`- **${key}**: ${valueStr}`);
    }

    return lines.join("\n");
  }

  /**
   * 停止 Agent
   */
  public stop(): void {
    console.log("[CommandManager] Stop requested");
    this._shouldStop = true;
    this._isRunning = false;
  }

  /**
   * 清理资源
   */
  public dispose() {
    this.stop();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) x.dispose();
    }
  }
}

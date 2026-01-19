import * as vscode from "vscode";
import { ReactAgent } from "./agent/engine";
import { SideBarProvider } from "./view/sidebar";
import { disposeTerminal } from "./tools/terminalTool";
import { CONFIG } from "./config";

export function activate(context: vscode.ExtensionContext) {
  const sidebarProvider = new SideBarProvider(context.extensionUri);
  let activeAgent: ReactAgent | null = null;
  
  // 状态标志位
  let isRunning = false;
  let isPaused = false;

  // 锁：审批动作（高危工具拦截）
  let pendingAction:
    | ((value: {
        approved: boolean;
        feedback?: string;
        stop?: boolean;
      }) => void)
    | null = null;

  // 锁：暂停恢复（用户主动暂停）
  let pendingResume:
    | ((value: {
        message?: string;
        stop?: boolean;
    }) => void) 
    | null = null;

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SideBarProvider.viewType,
      sidebarProvider,
    ),
  );

  // -------------------------------------------------------------
  // 命令注册区域
  // -------------------------------------------------------------

  // 1. 审批：批准
  context.subscriptions.push(
    vscode.commands.registerCommand("error-agent.handleApproval", (data) => {
      if (pendingAction) {
        pendingAction({ approved: data.approved });
        pendingAction = null;
      }
    }),
  );

  // 2. 审批/干预：用户反馈
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "error-agent.handleUserFeedback",
      (val: string) => {
        // 在界面上回显用户的输入
        sidebarProvider.postMessage({ role: "👤 用户建议", content: val });

        // 情况 A: 正在等待审批 (Pending Approval)
        if (pendingAction) {
          // 用户在拒绝的同时给出了建议 -> 视为拒绝并附带反馈
          pendingAction({ approved: false, feedback: val });
          pendingAction = null;
          return;
        }

        // 情况 B: 正在暂停中 (Paused) -> 视为干预指令
        if (isPaused && pendingResume) {
          // 解锁暂停，并传入用户消息
          pendingResume({ message: val });
          pendingResume = null;
          // 状态恢复为运行
          isPaused = false;
          sidebarProvider.postMessage({ type: "setPaused", value: false });
          return;
        }

        // 情况 C: 运行时输入 (Running) -> 暂未实现实时注入，或者可以提示用户“请先暂停”
        if (isRunning && !isPaused) {
            vscode.window.showInformationMessage("请先点击暂停按钮，再输入干预建议。");
        }
      },
    ),
  );

  // 3. 停止任务
  context.subscriptions.push(
    vscode.commands.registerCommand("error-agent.stop", () => {
      isRunning = false;
      // 解锁所有可能的等待
      if (pendingAction) {
        pendingAction({ approved: false, stop: true });
        pendingAction = null;
      }
      if (pendingResume) {
        pendingResume({ stop: true });
        pendingResume = null;
      }
      
      sidebarProvider.postMessage({
        role: "🚫 系统",
        content: "任务已强制停止。",
      });
      sidebarProvider.postMessage({ type: "setRunning", value: false });
    }),
  );

  // 4. 暂停任务
  context.subscriptions.push(
    vscode.commands.registerCommand("error-agent.pause", () => {
        if (isRunning && !isPaused) {
            isPaused = true;
            sidebarProvider.postMessage({ type: "setPaused", value: true });
            sidebarProvider.postMessage({ 
                role: "⏸ 系统", 
                content: "任务已暂停。您可以输入建议来干预下一步操作，或者点击继续。" 
            });
        }
    })
  );

  // 5. 恢复任务 (无干预)
  context.subscriptions.push(
    vscode.commands.registerCommand("error-agent.resume", () => {
        if (isPaused && pendingResume) {
            isPaused = false;
            sidebarProvider.postMessage({ type: "setPaused", value: false });
            // 空消息解锁，仅继续执行
            pendingResume({});
            pendingResume = null;
        }
    })
  );

  // 6. 核心分析任务
  context.subscriptions.push(
    vscode.commands.registerCommand("error-agent.analyze", async () => {
      if (isRunning) return;

      const config = vscode.workspace.getConfiguration("errorAgent");
      const apiUrl = config.get<string>("apiUrl");
      const apiKey = config.get<string>("apiKey");
      const model = config.get<string>("model");
      const temperature = config.get<number>("temperature") ?? CONFIG.agent.defaultTemperature;

      if (!apiKey) {
        vscode.window.showErrorMessage("请先在设置中配置 errorAgent.apiKey");
        return;
      }

      // 为了实现“选中 -> 右键 -> 诊断”的一键体验，我们需要自动获取当前选中的文本。
      // 由于 VS Code API 暂未暴露 Terminal.selection，我们使用 hack 方案：
      // 1. 强制执行“复制选中内容”命令 (workbench.action.terminal.copySelection)
      // 2. 从系统剪贴板读取刚才复制的内容
      
      // 保存旧剪贴板内容（可选优化，避免覆盖用户剪贴板，但为了流畅性通常不需要）
      // await vscode.commands.executeCommand("workbench.action.terminal.copySelection");
      
      // 尝试直接读取。如果用户是通过右键菜单触发的，通常意味着他们已经选中了文本。
      // 我们先尝试复制当前选区。
      try {
          await vscode.commands.executeCommand("workbench.action.terminal.copySelection");
      } catch (e) {
          // 忽略错误，可能当前没有焦点在终端
          console.log("Copy selection failed:", e);
      }

      // 等待一小会儿确保剪贴板更新（虽然 executeCommand 通常是 await 的，但剪贴板 I/O 可能有延迟）
      // 在实际测试中，通常不需要显式 delay，但为了稳健性可以加一个微小的 sleep
      await new Promise(r => setTimeout(r, 100));

      const errorText = await vscode.env.clipboard.readText();

      if (!errorText || errorText.trim() === "") {
        vscode.window.showWarningMessage("无法获取报错信息。请先在终端中选中内容，然后右键选择“Agent: 诊断此报错”。");
        return;
      }
      
      const projDir = vscode.workspace.workspaceFolders?.[0].uri.fsPath || "";

      await vscode.commands.executeCommand("error-agent-sidebar.focus");
      sidebarProvider.postMessage({ type: "clear" });
      sidebarProvider.postMessage({ type: "setRunning", value: true });

      activeAgent = new ReactAgent({
        apiKey: apiKey,
        apiUrl: apiUrl || CONFIG.agent.defaultApiUrl,
        model: model || CONFIG.agent.defaultModel,
        temperature: temperature,
      });

      isRunning = true;
      isPaused = false;

      try {
        let stream = activeAgent.run({
          error: errorText,
          cmdHistory: "",
          projDir,
        });

        // --- 主事件循环 ---
        while (isRunning) {

          // [检查点 A]: 是否请求暂停？
          if (isPaused) {
             // 创建暂停锁
             const resumeAction = await new Promise<{ message?: string; stop?: boolean }>(
                 (resolve) => (pendingResume = resolve)
             );

             // 唤醒后处理
             if (resumeAction.stop) break;

             // 关键：如果用户在暂停期间输入了建议
             if (resumeAction.message) {
                 sidebarProvider.postMessage({
                     role: "🛠️ 干预",
                     content: `正在根据您的建议调整方向...`
                 });
                 // 调用 Agent.resume 获取新的生成器，替换当前的 stream
                 stream = activeAgent.resume(resumeAction.message);
                 // 跳过本次循环的剩余部分（即不拉取旧 stream 的下一个事件），直接开始消费新 stream
                 continue;
             }
          }

          // 拉取下一个事件
          const result = await stream.next();
          
          // [检查点 A-2]: 在异步等待期间用户可能点击了暂停
          // 如果此时暂停，我们需要拦截当前 event 的显示，优先处理用户的暂停/干预意图
          if (isPaused) {
             const resumeAction = await new Promise<{ message?: string; stop?: boolean }>(
                 (resolve) => (pendingResume = resolve)
             );

             if (resumeAction.stop) break;

             if (resumeAction.message) {
                 sidebarProvider.postMessage({
                     role: "🛠️ 干预",
                     content: `正在根据您的建议调整方向...`
                 });
                 // 用户干预了，丢弃当前的 result (即未显示的“僵尸”步骤)，直接用新指令重置 Agent
                 stream = activeAgent.resume(resumeAction.message);
                 continue;
             }
             // 如果用户只是点击“继续”而没有干预，则放行当前的 result，照常显示
          }

          if (result.done || !isRunning) break;

          const event = result.value;

          // 处理 Agent 思考事件
          if (event.agent) {
            const lastMsg = event.agent.messages[event.agent.messages.length - 1];
            if (lastMsg.content) {
              sidebarProvider.postMessage({
                role: "🤖 Agent",
                content: lastMsg.content,
              });
            }

            // 处理工具调用
            if (lastMsg.tool_calls?.length > 0) {
              const tc = lastMsg.tool_calls[0];
              
              // [检查点 B]: 是否为高危工具？
              if (CONFIG.security.dangerousTools.includes(tc.name)) {
                sidebarProvider.postMessage({
                  type: "toolRequest",
                  role: "🛡️ 审批请求",
                  toolName: tc.name,
                  args: JSON.stringify(tc.args, null, 2),
                });

                // 创建审批锁
                const action = await new Promise<any>(
                  (resolve) => (pendingAction = resolve),
                );
                
                if (action.stop) break;

                // 恢复流（带反馈或直接继续）
                stream = activeAgent.resume(
                  action.approved
                    ? undefined
                    : action.feedback || "用户拒绝了。",
                );
              } else {
                // 普通工具自动执行
                stream = activeAgent.resume();
              }
            }
          }

          // 处理工具执行结果事件
          if (event.tools) {
            const toolMsg = event.tools.messages[0];
            sidebarProvider.postMessage({
              role: "📦 工具结果",
              content: toolMsg.content,
              toolName: toolMsg.name || "Tool", // 传递工具名称
            });
          }
        }
      } catch (err: any) {
        sidebarProvider.postMessage({ role: "❌ 异常", content: err.message });
      } finally {
        isRunning = false;
        isPaused = false;
        // 任务结束，关闭 Error Agent 专用终端
        disposeTerminal();
        sidebarProvider.postMessage({ type: "setRunning", value: false });
      }
    }),
  );
}

export function deactivate() {
  disposeTerminal();
}
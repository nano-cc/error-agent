import * as vscode from "vscode";
import { SideBarProvider } from "./ui/SideBarProvider";
import { getStorageManager } from "./storage/StorageManager";
import { getMemoryManager } from "./memory/MemoryManager";
import { CommandManager } from "./commands/CommandManager";
import { logger } from "./utils/logger";
import { ToolRegistry } from "./tools/registry";

let commandManager: CommandManager | null = null;
let sideBarProvider: SideBarProvider | null = null;

// 终端会话清理
let activeTerminal: vscode.Terminal | null = null;

export async function activate(context: vscode.ExtensionContext) {
  logger.info("Extension activated");

  // 初始化工具注册表
  ToolRegistry.getInstance();

  // 初始化存储管理器
  const storageManager = getStorageManager();
  await storageManager.initialize(context);

  // 初始化记忆管理器
  const workspaceUri = vscode.workspace.workspaceFolders?.[0].uri;
  if (workspaceUri) {
    const memoryManager = getMemoryManager();
    await memoryManager.initialize();
  }

  // 创建侧边栏提供者，传入停止回调
  sideBarProvider = new SideBarProvider(
    context.extensionUri,
    storageManager,
    () => {
      // 停止回调：通知 CommandManager 停止
      commandManager?.stop();
    },
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SideBarProvider.viewType,
      sideBarProvider,
    ),
  );

  // 创建命令管理器
  commandManager = new CommandManager(context, sideBarProvider, storageManager);

  // 注册 disposal
  context.subscriptions.push({
    dispose: () => {
      commandManager?.stop();
      commandManager?.dispose();
      if (activeTerminal) {
        activeTerminal.dispose();
        activeTerminal = null;
      }
    },
  });
}

export function deactivate() {
  logger.info("Extension deactivated");
  commandManager?.stop();
  if (activeTerminal) {
    activeTerminal.dispose();
    activeTerminal = null;
  }
}

// SideBar Provider - 侧边栏聊天界面（重构版）

import * as vscode from 'vscode';
import { StorageManager } from '../storage/StorageManager';
import { SessionManager } from '../session/SessionManager';
import { ContextBuilder } from '../context/ContextBuilder';
import { Session, SessionSummary, Message } from '../types/session';

export type ViewState = 'home' | 'chat';

export class SideBarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'error-agent-sidebar';
  private _view?: vscode.WebviewView;
  
  // 状态管理
  private _currentView: ViewState = 'home';
  private _activeSessionId: string | null = null;
  private _isRunning: boolean = false;
  private _isPaused: boolean = false;
  
  // 回调函数
  private _pendingAction: ((value: {
    approved: boolean;
    feedback?: string;
    stop?: boolean;
  }) => void) | null = null;
  private _pendingResume: ((value: {
    message?: string;
    stop?: boolean;
  }) => void) | null = null;
  private _onStopCallback?: () => void;

  // 管理器
  private _sessionManager: SessionManager;
  private _contextBuilder: ContextBuilder;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _storageManager: StorageManager,
    onStopCallback?: () => void
  ) {
    this._sessionManager = new SessionManager(_storageManager);
    this._contextBuilder = new ContextBuilder(_storageManager);
    this._onStopCallback = onStopCallback;
  }

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // 监听 webview 消息
    webviewView.webview.onDidReceiveMessage(this._handleMessage.bind(this));

    // 初始化
    this._initialize();
  }

  /**
   * 初始化
   */
  private async _initialize() {
    setTimeout(async () => {
      // 加载初始状态
      await this._refreshHomeView();
    }, 300);
  }

  /**
   * 处理从 webview 接收的消息
   */
  private _handleMessage(data: any) {
    console.log('[SideBarProvider] Received message:', data);
    
    switch (data.type) {
      // 审批相关
      case 'onApprove':
        if (this._pendingAction) {
          this._pendingAction({ approved: true });
          this._pendingAction = null;
        }
        break;
      case 'onReject':
        if (this._pendingAction) {
          this._pendingAction({ approved: false });
          this._pendingAction = null;
        }
        break;
      
      // 消息发送
      case 'onSendMessage':
        this._onSendMessage(data.content, data.sessionId);
        break;
      
      // 运行控制
      case 'onPause':
        this._isPaused = true;
        this.postMessage({ type: 'setPaused', value: true });
        break;
      case 'onResume':
        this._isPaused = false;
        if (this._pendingResume) {
          this._pendingResume({});
          this._pendingResume = null;
        }
        this.postMessage({ type: 'setPaused', value: false });
        break;
      case 'onStop':
        this._isRunning = false;
        this._isPaused = false;
        if (this._pendingAction) {
          this._pendingAction({ approved: false, stop: true });
          this._pendingAction = null;
        }
        if (this._pendingResume) {
          this._pendingResume({ stop: true });
          this._pendingResume = null;
        }
        // 调用外部停止回调（通知 CommandManager）
        if (this._onStopCallback) {
          this._onStopCallback();
        }
        this.postMessage({ type: 'setRunning', value: false });
        this.postMessage({ role: '🚫 系统', content: '任务已强制停止。', type: 'system' });
        break;
      
      // 视图切换
      case 'navigateToChat':
        this._navigateToChat(data.sessionId);
        break;
      case 'navigateToHome':
        this._navigateToHome();
        break;
      
      // 会话操作
      case 'onNewSession':
        this._onNewSession();
        break;
      case 'onDeleteSession':
        this._onDeleteSession(data.sessionId);
        break;
      case 'onClearHistory':
        this._onClearHistory();
        break;
    }
  }

  /**
   * 发送消息到 webview
   */
  public postMessage(message: any): Thenable<boolean> | undefined {
    return this._view?.webview.postMessage(message);
  }

  /**
   * 刷新主页视图
   */
  private async _refreshHomeView() {
    const sessions = await this._sessionManager.listSessions(10);
    this.postMessage({ 
      type: 'renderHome',
      sessions,
    });
  }

  /**
   * 导航到聊天视图
   */
  private async _navigateToChat(sessionId: string) {
    this._activeSessionId = sessionId;
    this._sessionManager.setActiveSession(sessionId);
    this._currentView = 'chat';

    // 从数据库加载会话消息
    const messages = await this._contextBuilder.getChatMessages(sessionId);
    const session = await this._sessionManager.getSession(sessionId);

    this.postMessage({
      type: 'renderChat',
      sessionId,
      sessionTitle: session?.title || '新会话',
      messages,
    });
  }

  /**
   * 导航到主页
   */
  private _navigateToHome() {
    this._activeSessionId = null;
    this._sessionManager.clearActiveSession();
    this._currentView = 'home';
    this._refreshHomeView();
  }

  /**
   * 处理发送消息
   */
  private _onSendMessage(content: string, sessionId?: string) {
    console.log('[SideBarProvider] onSendMessage:', content, 'sessionId:', sessionId);
    
    // 通知 CommandManager 处理
    const targetSessionId = sessionId || this._activeSessionId;
    vscode.commands.executeCommand('error-agent.sendMessage', content, targetSessionId);
  }

  /**
   * 处理新建会话
   */
  private async _onNewSession() {
    const session = await this._sessionManager.createSession();
    this._activeSessionId = session.id;
    this._sessionManager.setActiveSession(session.id);
    this._currentView = 'chat';
    
    this.postMessage({
      type: 'renderChat',
      sessionId: session.id,
      sessionTitle: '新会话',
      messages: [],
    });
  }

  /**
   * 处理删除会话
   */
  private async _onDeleteSession(sessionId: string) {
    await this._sessionManager.deleteSession(sessionId);
    
    // 如果删除的是当前会话，返回主页
    if (this._activeSessionId === sessionId) {
      this._navigateToHome();
    } else {
      this._refreshHomeView();
    }
  }

  /**
   * 处理清空历史
   */
  private async _onClearHistory() {
    const sessions = await this._sessionManager.listSessions(100);
    for (const session of sessions) {
      await this._sessionManager.deleteSession(session.id);
    }
    this._navigateToHome();
  }

  /**
   * 设置运行状态
   */
  public setRunning(isRunning: boolean): void {
    this._isRunning = isRunning;
    this.postMessage({ type: 'setRunning', value: isRunning });
  }

  /**
   * 设置暂停状态
   */
  public setPaused(isPaused: boolean): void {
    this._isPaused = isPaused;
    this.postMessage({ type: 'setPaused', value: isPaused });
  }

  /**
   * 切换到聊天视图
   */
  public async navigateToChat(sessionId: string): Promise<void> {
    console.log('[SideBarProvider] Navigating to chat view, sessionId:', sessionId);
    await this._navigateToChat(sessionId);
  }

  /**
   * 获取当前会话 ID
   */
  public getCurrentSessionId(): string | null {
    return this._activeSessionId;
  }

  /**
   * 等待审批
   */
  public waitForAction(): Promise<{
    approved: boolean;
    feedback?: string;
    stop?: boolean;
  }> {
    return new Promise(resolve => {
      this._pendingAction = resolve;
    });
  }

  /**
   * 等待恢复
   */
  public waitForResume(): Promise<{
    message?: string;
    stop?: boolean;
  }> {
    return new Promise(resolve => {
      this._pendingResume = resolve;
    });
  }

  /**
   * 检查是否有待处理的恢复
   */
  public hasPendingResume(): boolean {
    return this._pendingResume !== null;
  }

  /**
   * 获取 HTML
   */
  private _getHtmlForWebview(webview: vscode.Webview) {
    const codiconsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css')
    );

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
        <link href="${codiconsUri}" rel="stylesheet" />
        <style>
          :root {
            --radius-sm: 4px;
            --radius-md: 8px;
            --radius-lg: 12px;
            --font-size-xs: 11px;
            --font-size-sm: 13px;
            --header-height: 44px;
            --input-height: 80px;
          }
          
          * { box-sizing: border-box; }
          
          body {
            font-family: var(--vscode-font-family);
            font-size: var(--font-size-sm);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            height: 100vh;
            overflow: hidden;
          }

          /* Header */
          #header {
            height: var(--header-height);
            display: flex;
            align-items: center;
            padding: 0 12px;
            border-bottom: 1px solid var(--vscode-widget-border);
            background: var(--vscode-sideBar-background);
            flex-shrink: 0;
          }
          
          #header .title {
            font-weight: 600;
            font-size: var(--font-size-sm);
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          
          #header .back-btn {
            background: transparent;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            padding: 4px;
            margin-right: 8px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
          }
          #header .back-btn:hover { background: var(--vscode-list-hoverBackground); }
          
          #header .action-btn {
            background: var(--vscode-button-secondaryBackground);
            border: 1px solid var(--vscode-widget-border);
            color: var(--vscode-foreground);
            padding: 4px 8px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            margin-left: 8px;
          }
          #header .action-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
          #header .action-btn.danger:hover { background: var(--vscode-errorForeground); color: white; }

          /* Main Content */
          #main {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
            padding: 16px;
          }

          /* Home View */
          .home-view {
            display: flex;
            flex-direction: column;
            height: 100%;
          }
          
          .home-header {
            text-align: center;
            padding: 20px 0;
          }
          
          .home-header .logo {
            font-size: 48px;
            margin-bottom: 8px;
          }
          
          .home-header .subtitle {
            color: var(--vscode-descriptionForeground);
            font-size: var(--font-size-sm);
          }
          
          .section-title {
            font-size: var(--font-size-xs);
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin: 16px 0 8px 0;
          }
          
          .session-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }
          
          .session-card {
            background: var(--vscode-list-hoverBackground);
            border: 1px solid var(--vscode-widget-border);
            border-radius: var(--radius-md);
            padding: 12px;
            cursor: pointer;
            transition: all 0.2s;
            position: relative;
          }
          
          .session-card:hover {
            border-color: var(--vscode-focusBorder);
            background: var(--vscode-list-focusBackground);
          }
          
          .session-card .session-title {
            font-weight: 500;
            font-size: var(--font-size-sm);
            margin-bottom: 4px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          
          .session-card .session-time {
            font-size: var(--font-size-xs);
            color: var(--vscode-descriptionForeground);
          }
          
          .session-card .delete-btn {
            position: absolute;
            top: 8px;
            right: 8px;
            background: transparent;
            border: none;
            color: var(--vscode-descriptionForeground);
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            opacity: 0;
            transition: opacity 0.2s;
          }
          
          .session-card:hover .delete-btn {
            opacity: 1;
          }
          
          .session-card .delete-btn:hover {
            background: var(--vscode-errorForeground);
            color: white;
          }
          
          .empty-state {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            padding: 32px 0;
            font-size: var(--font-size-sm);
          }

          /* Home Chat Section */
          .home-chat-section {
            margin-top: 20px;
            padding-top: 16px;
            border-top: 1px solid var(--vscode-widget-border);
          }

          .home-chat-box {
            position: relative;
            margin-top: 8px;
          }

          #home-chat-input {
            width: 100%;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: var(--radius-sm);
            padding: 8px 40px 8px 12px;
            font-family: inherit;
            font-size: inherit;
            resize: none;
            outline: none;
            box-sizing: border-box;
            min-height: 40px;
            max-height: 80px;
            display: block;
          }

          #home-chat-input:focus {
            border-color: var(--vscode-focusBorder);
          }

          .home-chat-box .send-btn {
            position: absolute;
            bottom: 6px;
            right: 6px;
          }

          /* Chat View */
          .chat-view {
            display: flex;
            flex-direction: column;
            height: 100%;
          }
          
          #chat-container {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding-bottom: 12px;
          }
          
          .message {
            display: flex;
            flex-direction: column;
            max-width: 100%;
            animation: fadeIn 0.3s ease;
          }
          
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(5px); }
            to { opacity: 1; transform: translateY(0); }
          }

          .message.user {
            align-items: flex-end;
          }
          
          .message.user .bubble {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            padding: 8px 12px;
            border-radius: 12px 12px 2px 12px;
            max-width: 85%;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            word-wrap: break-word;
          }

          .message.agent,
          .message.system {
            align-items: flex-start;
          }
          
          .message.system .bubble {
            font-size: var(--font-size-xs);
            color: var(--vscode-descriptionForeground);
            text-align: center;
            width: 100%;
            margin: 6px 0;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
          }

          .message.agent .avatar {
            font-size: 14px;
            margin-bottom: 3px;
            display: flex;
            align-items: center;
            gap: 5px;
            font-weight: 600;
            color: var(--vscode-editor-foreground);
          }
          
          .message.agent .bubble {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border);
            padding: 8px 12px;
            border-radius: 2px 12px 12px 12px;
            width: 100%;
            box-sizing: border-box;
            overflow-x: auto;
          }

          .markdown-body {
            width: 100%;
            overflow-wrap: break-word;
            font-size: var(--font-size-sm);
          }
          
          .markdown-body p { margin: 0 0 6px 0; }
          .markdown-body p:last-child { margin-bottom: 0; }
          .markdown-body pre {
            background: var(--vscode-textCodeBlock-background);
            padding: 6px;
            border-radius: var(--radius-sm);
            overflow-x: auto;
            border: 1px solid var(--vscode-editorGroup-border);
            max-width: 100%;
            white-space: pre;
          }
          .markdown-body code {
            font-family: var(--vscode-editor-font-family);
            font-size: var(--font-size-xs);
          }
          .markdown-body a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
          }
          .markdown-body a:hover { text-decoration: underline; }

          /* Tool Cards */
          details.tool-card {
            background: var(--vscode-list-hoverBackground);
            border: 1px solid var(--vscode-list-inactiveSelectionBackground);
            border-radius: var(--radius-sm);
            margin: 4px 0;
            overflow: hidden;
            max-width: 100%;
          }
          
          summary.tool-header {
            padding: 5px 8px;
            cursor: pointer;
            font-size: var(--font-size-xs);
            font-family: var(--vscode-editor-font-family);
            display: flex;
            align-items: center;
            gap: 6px;
            user-select: none;
            color: var(--vscode-textPreformat-foreground);
          }
          
          summary.tool-header:hover {
            background: var(--vscode-list-focusBackground);
          }
          
          summary.tool-header::marker { display: none; }
          summary.tool-header::before {
            content: '▶';
            display: inline-block;
            font-size: 7px;
            transition: transform 0.2s;
          }
          
          details[open] summary.tool-header::before {
            transform: rotate(90deg);
          }

          .tool-tag {
            display: inline-block;
            padding: 1px 4px;
            border-radius: 3px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            font-weight: bold;
            font-size: 9px;
            margin-right: 4px;
          }

          .tool-content {
            padding: 6px 8px;
            border-top: 1px solid var(--vscode-widget-border);
            font-family: var(--vscode-editor-font-family);
            font-size: var(--font-size-xs);
            white-space: pre-wrap;
            background: var(--vscode-editor-background);
            max-height: 200px;
            overflow-y: auto;
          }

          /* Approval Card */
          .approval-card {
            border: 1px solid var(--vscode-inputValidation-warningBorder);
            background: var(--vscode-inputValidation-warningBackground);
            border-radius: var(--radius-md);
            padding: 10px;
            margin: 6px 0;
            box-sizing: border-box;
            width: 100%;
          }
          
          .approval-card.done {
            opacity: 0.8;
            background: var(--vscode-editor-background);
            border-color: var(--vscode-widget-border);
          }
          
          .approval-card pre {
            white-space: pre-wrap;
            word-break: break-all;
            background: rgba(0,0,0,0.1);
            padding: 5px;
            border-radius: 4px;
            max-height: 100px;
            overflow-y: auto;
            font-size: 10px;
            margin: 6px 0;
          }

          .approval-title {
            font-weight: bold;
            margin-bottom: 6px;
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: var(--font-size-xs);
          }
          
          .approval-actions {
            display: flex;
            gap: 6px;
            margin-top: 8px;
          }

          button.btn-primary {
            flex: 1;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 5px 8px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
          }
          
          button.btn-primary:hover {
            background: var(--vscode-button-hoverBackground);
          }
          
          button.btn-danger {
            flex: 1;
            background: var(--vscode-errorForeground);
            color: white;
            border: none;
            padding: 5px 8px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
          }

          /* Input Section */
          #input-section {
            padding: 10px;
            border-top: 1px solid var(--vscode-widget-border);
            background: var(--vscode-sideBar-background);
            flex-shrink: 0;
          }
          
          .toolbar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 6px;
            font-size: var(--font-size-xs);
          }
          
          .control-btns {
            display: flex;
            gap: 6px;
          }
          
          .icon-btn {
            background: var(--vscode-button-secondaryBackground);
            border: 1px solid var(--vscode-widget-border);
            color: var(--vscode-foreground);
            padding: 4px 8px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 14px;
            line-height: 1;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          
          .icon-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
          }
          
          .icon-btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
          }
          
          .icon-btn#stop-btn:hover {
            background: var(--vscode-errorForeground);
            color: white;
          }
          
          .icon-btn#stop-btn:hover:disabled {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-foreground);
          }

          .status-badge {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 3px 8px;
            border-radius: 3px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            font-size: 10px;
          }
          
          .input-box-wrapper {
            position: relative;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: var(--radius-sm);
            padding: 2px;
          }
          
          textarea {
            width: 100%;
            border: none;
            background: transparent;
            color: var(--vscode-input-foreground);
            font-family: inherit;
            font-size: inherit;
            resize: none;
            outline: none;
            padding: 8px;
            box-sizing: border-box;
            min-height: 40px;
            max-height: 120px;
            display: block;
          }
          
          .send-btn {
            position: absolute;
            bottom: 6px;
            right: 6px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            width: 28px;
            height: 28px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
          }
          
          .send-btn:hover {
            background: var(--vscode-button-hoverBackground);
          }
          
          .send-btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
          }

          /* Scrollbar */
          ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
          }
          
          ::-webkit-scrollbar-thumb {
            background: var(--vscode-scrollbarSlider-background);
            border-radius: 8px;
          }
          
          ::-webkit-scrollbar-thumb:hover {
            background: var(--vscode-scrollbarSlider-hoverBackground);
          }
        </style>
      </head>
      <body>
        <div id="header">
          <!-- 动态内容，由 JS 渲染 -->
        </div>
        
        <div id="main">
          <!-- 动态内容，由 JS 渲染 -->
        </div>
        
        <div id="input-section" style="display:none">
          <div class="toolbar" id="status-bar">
            <div id="status-text" class="status-badge">⚪ 就绪</div>
            <div class="control-btns">
               <button id="pause-btn" class="icon-btn" title="暂停">⏸</button>
               <button id="resume-btn" class="icon-btn" style="display:none" title="继续">▶</button>
               <button id="stop-btn" class="icon-btn" title="停止">⏹</button>
            </div>
          </div>
          <div class="input-box-wrapper">
            <textarea id="user-input" rows="1" placeholder="输入消息... (Shift+Enter 换行)"></textarea>
            <button id="send-btn" class="send-btn" title="发送">➤</button>
          </div>
        </div>
        
        <script>
          const vscode = acquireVsCodeApi();
          const header = document.getElementById('header');
          const main = document.getElementById('main');
          const inputSection = document.getElementById('input-section');
          const statusBar = document.getElementById('status-bar');
          const statusText = document.getElementById('status-text');
          const pauseBtn = document.getElementById('pause-btn');
          const resumeBtn = document.getElementById('resume-btn');
          const stopBtn = document.getElementById('stop-btn');
          const userInput = document.getElementById('user-input');
          const sendBtn = document.getElementById('send-btn');

          let currentSessionId = null;
          let isRunning = false;

          marked.setOptions({
            highlight: function(code, lang) {
              const language = highlight.getLanguage(lang) ? lang : 'plaintext';
              return highlight.highlight(code, { language }).value;
            },
            langPrefix: 'hljs language-'
          });

          // 输入框自动高度
          userInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
          });

          // 发送消息
          function sendMessage() {
            const val = userInput.value.trim();
            if (val) {
              console.log('[Frontend] Sending message:', val);
              vscode.postMessage({ 
                type: 'onSendMessage', 
                content: val,
                sessionId: currentSessionId
              });
              userInput.value = '';
              userInput.style.height = 'auto';
            }
          }

          userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          });

          sendBtn.onclick = sendMessage;
          pauseBtn.onclick = () => vscode.postMessage({ type: 'onPause' });
          resumeBtn.onclick = () => vscode.postMessage({ type: 'onResume' });
          stopBtn.onclick = () => vscode.postMessage({ type: 'onStop' });

          // 审批处理
          window.handleApprove = (btn) => {
             const card = btn.closest('.approval-card');
             if(!card) return;
             card.classList.add('done');
             const actions = card.querySelector('.approval-actions');
             if(actions) actions.innerHTML = '<div style="color:var(--vscode-testing-iconPassed); font-weight:bold; font-size:10px">✅ 已允许执行</div>';
             vscode.postMessage({ type: 'onApprove' });
          };
          
          window.handleReject = (btn) => {
             const card = btn.closest('.approval-card');
             if(!card) return;
             card.classList.add('done');
             const actions = card.querySelector('.approval-actions');
             if(actions) actions.innerHTML = '<div style="color:var(--vscode-errorForeground); font-weight:bold; font-size:10px">🚫 已拒绝执行</div>';
             vscode.postMessage({ type: 'onReject' });
          };

          // 渲染主页
          function renderHome(sessions) {
            currentSessionId = null;

            header.innerHTML = \`
              <span class="title">🤖 Error Agent</span>
              <button class="action-btn danger" id="clear-history-btn" title="清空历史">🗑️</button>
            \`;

            document.getElementById('clear-history-btn').onclick = () => {
              vscode.postMessage({ type: 'onClearHistory' });
            };

            let sessionsHtml = '';
            if (sessions && sessions.length > 0) {
              sessionsHtml = \`
                <div class="section-title">最近会话</div>
                <div class="session-list">
                  \${sessions.map(s => \`
                    <div class="session-card" data-session-id="\${s.id}">
                      <button class="delete-btn" data-delete-id="\${s.id}" title="删除">🗑</button>
                      <div class="session-title">\${escapeHtml(s.title)}</div>
                      <div class="session-time">\${formatTime(s.updatedAt)}</div>
                    </div>
                  \`).join('')}
                </div>
              \`;
            } else {
              sessionsHtml = '<div class="empty-state">暂无历史会话</div>';
            }

            main.innerHTML = \`
              <div class="home-view">
                <div class="home-header">
                  <div class="logo">🤖</div>
                  <div class="subtitle">智能诊断终端报错，提供修复建议</div>
                </div>
                \${sessionsHtml}
                <div class="home-chat-section">
                  <div class="section-title">快速开始新对话</div>
                  <div class="home-chat-box">
                    <textarea id="home-chat-input" rows="2" placeholder="描述你的问题..."></textarea>
                    <button id="home-send-btn" class="send-btn" title="发送">➤</button>
                  </div>
                </div>
              </div>
            \`;

            // 绑定会话卡片事件
            document.querySelectorAll('.session-card').forEach(card => {
              card.addEventListener('click', (e) => {
                if (!e.target.classList.contains('delete-btn')) {
                  const sessionId = card.dataset.sessionId;
                  vscode.postMessage({ type: 'navigateToChat', sessionId });
                }
              });
            });

            document.querySelectorAll('.delete-btn').forEach(btn => {
              btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sessionId = btn.dataset.deleteId;
                vscode.postMessage({ type: 'onDeleteSession', sessionId });
              });
            });

            // 绑定主页聊天框事件
            const homeChatInput = document.getElementById('home-chat-input');
            const homeSendBtn = document.getElementById('home-send-btn');

            if (homeChatInput && homeSendBtn) {
              // 自动调整高度
              homeChatInput.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = Math.min(this.scrollHeight, 80) + 'px';
              });

              // Enter 发送，Shift+Enter 换行
              homeChatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendHomeChat();
                }
              });

              // 按钮点击发送
              homeSendBtn.onclick = sendHomeChat;

              function sendHomeChat() {
                const val = homeChatInput.value.trim();
                if (val) {
                  console.log('[Frontend] Home chat send:', val);
                  vscode.postMessage({
                    type: 'onSendMessage',
                    content: val,
                    sessionId: null // null 表示新会话
                  });
                  homeChatInput.value = '';
                  homeChatInput.style.height = 'auto';
                }
              }
            }

            // 隐藏输入区（使用 home view 内的聊天框）
            inputSection.style.display = 'none';
          }

          // 渲染聊天视图
          function renderChat(sessionId, sessionTitle, messages) {
            currentSessionId = sessionId;
            
            header.innerHTML = \`
              <button class="back-btn" id="back-btn" title="返回">←</button>
              <span class="title">\${escapeHtml(sessionTitle)}</span>
              <button class="action-btn danger" id="delete-session-btn" title="删除会话">🗑</button>
            \`;
            
            document.getElementById('back-btn').onclick = () => {
              vscode.postMessage({ type: 'navigateToHome' });
            };

            document.getElementById('delete-session-btn').onclick = () => {
              vscode.postMessage({ type: 'onDeleteSession', sessionId });
            };

            // 渲染消息列表
            let messagesHtml = '';
            if (messages && messages.length > 0) {
              messagesHtml = messages.map(msg => renderMessageToHtml(msg)).join('');
            } else {
              messagesHtml = '<div class="empty-state">开始对话吧...</div>';
            }

            main.innerHTML = \`
              <div class="chat-view">
                <div id="chat-container">\${messagesHtml}</div>
              </div>
            \`;

            // 显示输入区
            inputSection.style.display = 'block';

            // 滚动到底部
            scrollToBottom();
          }

          // 渲染单条消息
          function renderMessageToHtml(data) {
            if (data.role === 'user') {
              return \`<div class="message user"><div class="bubble">\${escapeHtml(data.content)}</div></div>\`;
            }
            else if (data.role === 'system') {
              return \`<div class="message system"><div class="bubble">\${escapeHtml(data.content)}</div></div>\`;
            }
            else if (data.role === 'agent') {
              return \`
                <div class="message agent">
                  <div class="avatar">🤖</div>
                  <div class="bubble markdown-body">\${marked.parse(data.content)}</div>
                </div>
              \`;
            }
            return '';
          }

          // 动态添加消息
          function appendMessage(data) {
            const chatContainer = document.getElementById('chat-container');
            if (!chatContainer) return;
            
            const msgDiv = document.createElement('div');
            
            if (data.role && data.role.includes('用户')) {
              msgDiv.className = 'message user';
              msgDiv.innerHTML = '<div class="bubble">' + escapeHtml(data.content) + '</div>';
            }
            else if (data.role && (data.role.includes('系统') || data.role.includes('干预'))) {
              msgDiv.className = 'message system';
              const icon = data.role.includes('干预') ? '🛠️' : '🔔';
              msgDiv.innerHTML = '<div class="bubble">' + icon + ' ' + data.content + '</div>';
            }
            else if (data.type === 'toolRequest' && data.role && data.role.includes('审批')) {
              msgDiv.className = 'message agent';
              msgDiv.innerHTML =
                '<div class="approval-card">' +
                  '<div class="approval-title">🛡️ 安全拦截：' + data.toolName + '</div>' +
                  '<div style="font-size: 10px; opacity: 0.8; margin-bottom:4px">Agent 试图执行高风险操作，请确认。</div>' +
                  '<pre>' + data.args + '</pre>' +
                  '<div class="approval-actions">' +
                    '<button class="btn-primary" onclick="handleApprove(this)">✅ 允许执行</button>' +
                    '<button class="btn-danger" onclick="handleReject(this)">🚫 拒绝</button>' +
                  '</div>' +
                '</div>';
            }
            else if (data.role === '📦 工具结果') {
              msgDiv.className = 'message agent';
              const toolName = data.toolName || 'Tool';
              msgDiv.innerHTML =
                '<details class="tool-card">' +
                  '<summary class="tool-header">' +
                     '<span class="tool-tag">' + toolName + '</span>' +
                     '<span>执行结果</span>' +
                  '</summary>' +
                  '<div class="tool-content">' + escapeHtml(data.content) + '</div>' +
                '</details>';
            }
            else if (data.role === '🤖 Agent') {
              msgDiv.className = 'message agent';
              msgDiv.innerHTML =
                '<div class="avatar">🤖</div>' +
                '<div class="bubble markdown-body">' + marked.parse(data.content) + '</div>';
            }
            else {
              msgDiv.className = 'message system';
              msgDiv.innerHTML = '<div class="bubble">' + data.content + '</div>';
            }

            chatContainer.appendChild(msgDiv);
            scrollToBottom();
          }

          // 状态更新
          function updateStatus(state) {
            if (state === 'running') {
              statusText.innerHTML = '🟢 运行中...';
              statusText.className = 'status-badge';
              pauseBtn.style.display = 'block';
              pauseBtn.disabled = false;
              resumeBtn.style.display = 'none';
              stopBtn.disabled = false;
              userInput.disabled = true;
              userInput.placeholder = "请先点击暂停再输入建议...";
            } else if (state === 'paused') {
              statusText.innerHTML = '⏸ 已暂停';
              statusText.className = 'status-badge paused';
              pauseBtn.style.display = 'none';
              resumeBtn.style.display = 'block';
              resumeBtn.disabled = false;
              stopBtn.disabled = false;
              userInput.disabled = false;
              userInput.placeholder = "输入建议来干预，或点击继续...";
              userInput.focus();
            } else if (state === 'stopped') {
              statusText.innerHTML = '⚪ 已结束';
              statusText.className = 'status-badge';
              pauseBtn.style.display = 'block';
              pauseBtn.disabled = true;
              resumeBtn.style.display = 'none';
              resumeBtn.disabled = true;
              stopBtn.disabled = true;
              userInput.disabled = false;
              userInput.placeholder = "输入消息...";
            }
          }

          function scrollToBottom() {
            const chatContainer = document.getElementById('chat-container');
            if (chatContainer) {
              chatContainer.scrollTop = chatContainer.scrollHeight;
            }
          }

          function escapeHtml(unsafe) {
            return unsafe
                 .replace(/&/g, "&amp;")
                 .replace(/</g, "&lt;")
                 .replace(/>/g, "&gt;")
                 .replace(/"/g, "&quot;")
                 .replace(/'/g, "&#039;");
          }

          function formatTime(timestamp) {
            const date = new Date(timestamp);
            const now = new Date();
            const diff = now.getTime() - date.getTime();
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            
            if (days === 0) {
              return '今天 ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
            } else if (days === 1) {
              return '昨天 ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
            } else {
              return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
            }
          }

          // 监听来自 extension 的消息
          window.addEventListener('message', event => {
            const data = event.data;
            console.log('[Frontend] Received:', data);
            
            if (data.type === 'renderHome') {
              renderHome(data.sessions);
              return;
            }
            
            if (data.type === 'renderChat') {
              renderChat(data.sessionId, data.sessionTitle, data.messages);
              return;
            }
            
            if (data.type === 'addMessage' || data.type === 'appendMessage') {
              appendMessage(data);
              return;
            }
            
            if (data.type === 'setRunning') {
              isRunning = data.value;
              if (isRunning) {
                updateStatus('running');
              } else {
                updateStatus('stopped');
              }
              return;
            }
            
            if (data.type === 'setPaused') {
              updateStatus(data.value ? 'paused' : 'running');
              return;
            }
            
            // 兼容旧格式
            if (data.role) {
              appendMessage(data);
            }
          });
        </script>
      </body>
      </html>`;
  }
}
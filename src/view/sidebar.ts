import * as vscode from "vscode";

export class SideBarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "error-agent-sidebar";
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((data) => {
      switch (data.type) {
        case "onApprove":
          vscode.commands.executeCommand("error-agent.handleApproval", {
            approved: true,
          });
          break;
        case "onReject":
          vscode.commands.executeCommand("error-agent.handleApproval", {
            approved: false,
          });
          break;
        case "onUserFeedback":
          vscode.commands.executeCommand(
            "error-agent.handleUserFeedback",
            data.value,
          );
          break;
        case "onPause":
          vscode.commands.executeCommand("error-agent.pause");
          break;
        case "onResume":
          vscode.commands.executeCommand("error-agent.resume");
          break;
        case "onStop":
          vscode.commands.executeCommand("error-agent.stop");
          break;
      }
    });
  }

  public postMessage(message: any) {
    this._view?.webview.postMessage(message);
  }

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
          :root { --radius-sm: 4px; --radius-md: 6px; --font-size-xs: 11px; --font-size-sm: 13px; }
          body { font-family: var(--vscode-font-family); font-size: var(--font-size-sm); color: var(--vscode-foreground); background-color: var(--vscode-sideBar-background); margin: 0; padding: 0; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
          #chat-container { flex: 1; min-height: 0; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; }
          .message { display: flex; flex-direction: column; max-width: 100%; animation: fadeIn 0.3s ease; }
          @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
          
          .message.user { align-items: flex-end; }
          .message.user .bubble { background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); padding: 8px 12px; border-radius: 12px 12px 2px 12px; max-width: 85%; box-shadow: 0 2px 4px rgba(0,0,0,0.1); word-wrap: break-word; }
          
          .message.agent, .message.system { align-items: flex-start; }
          .message.system .bubble { font-size: var(--font-size-xs); color: var(--vscode-descriptionForeground); text-align: center; width: 100%; margin: 8px 0; display: flex; align-items: center; justify-content: center; gap: 6px; }
          
          .message.agent .avatar { font-size: 16px; margin-bottom: 4px; display: flex; align-items: center; gap: 6px; font-weight: 600; color: var(--vscode-editor-foreground); }
          .message.agent .bubble { background-color: var(--vscode-editor-background); border: 1px solid var(--vscode-widget-border); padding: 10px 14px; border-radius: 2px 12px 12px 12px; width: 100%; box-sizing: border-box; overflow-x: auto; }
          
          .markdown-body { width: 100%; overflow-wrap: break-word; }
          .markdown-body p { margin: 0 0 8px 0; }
          .markdown-body p:last-child { margin-bottom: 0; }
          .markdown-body pre { background: var(--vscode-textCodeBlock-background); padding: 8px; border-radius: var(--radius-sm); overflow-x: auto; border: 1px solid var(--vscode-editorGroup-border); max-width: 100%; white-space: pre; }
          .markdown-body code { font-family: var(--vscode-editor-font-family); font-size: var(--font-size-xs); }
          .markdown-body a { color: var(--vscode-textLink-foreground); text-decoration: none; }
          .markdown-body a:hover { text-decoration: underline; }
          
          /* Tool Cards */
          details.tool-card { background: var(--vscode-list-hoverBackground); border: 1px solid var(--vscode-list-inactiveSelectionBackground); border-radius: var(--radius-sm); margin: 6px 0; overflow: hidden; max-width: 100%; }
          summary.tool-header { padding: 6px 10px; cursor: pointer; font-size: var(--font-size-xs); font-family: var(--vscode-editor-font-family); display: flex; align-items: center; gap: 8px; user-select: none; color: var(--vscode-textPreformat-foreground); }
          summary.tool-header:hover { background: var(--vscode-list-focusBackground); }
          summary.tool-header::marker { display: none; }
          summary.tool-header::before { content: '▶'; display: inline-block; font-size: 8px; transition: transform 0.2s; }
          details[open] summary.tool-header::before { transform: rotate(90deg); }
          
          .tool-tag {
             display: inline-block; padding: 2px 6px; border-radius: 4px;
             background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
             font-weight: bold; font-size: 10px; margin-right: 4px;
          }
          
          .tool-content { padding: 8px 10px; border-top: 1px solid var(--vscode-widget-border); font-family: var(--vscode-editor-font-family); font-size: var(--font-size-xs); white-space: pre-wrap; background: var(--vscode-editor-background); max-height: 300px; overflow-y: auto; }
          
          /* Approval Card */
          .approval-card { border: 1px solid var(--vscode-inputValidation-warningBorder); background: var(--vscode-inputValidation-warningBackground); border-radius: var(--radius-md); padding: 12px; margin: 8px 0; animation: pulse 2s infinite; box-sizing: border-box; width: 100%; }
          .approval-card.done { animation: none; opacity: 0.8; background: var(--vscode-editor-background); border-color: var(--vscode-widget-border); }
          .approval-card pre { 
             white-space: pre-wrap; 
             word-break: break-all; 
             background: rgba(0,0,0,0.1); 
             padding: 6px; 
             border-radius: 4px; 
             max-height: 120px; 
             overflow-y: auto; 
             font-size: 11px;
             margin: 8px 0;
          }
          
          .approval-title { font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
          .approval-actions { display: flex; gap: 8px; margin-top: 10px; }
          
          button.btn-primary { flex: 1; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px; border-radius: 2px; cursor: pointer; }
          button.btn-primary:hover { background: var(--vscode-button-hoverBackground); }
          button.btn-danger { flex: 1; background: var(--vscode-errorForeground); color: white; border: none; padding: 6px; border-radius: 2px; cursor: pointer; }
          
          /* Input & Status */
          #input-section { padding: 12px; border-top: 1px solid var(--vscode-widget-border); background: var(--vscode-sideBar-background); }
          .toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: var(--font-size-xs); }
          .control-btns { display: flex; gap: 8px; }
          .icon-btn { 
            background: var(--vscode-button-secondaryBackground); 
            border: 1px solid var(--vscode-widget-border); 
            color: var(--vscode-foreground); 
            padding: 6px 10px; 
            border-radius: 4px; 
            cursor: pointer; 
            font-size: 16px;
            line-height: 1;
            display: flex; align-items: center; justify-content: center;
          }
          .icon-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
          .icon-btn#stop-btn:hover { background: var(--vscode-errorForeground); color: white; }
          
          .status-badge { 
             display: flex; align-items: center; gap: 6px; 
             padding: 4px 10px; border-radius: 4px;
             background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
             height: 32px; box-sizing: border-box;
          }
          .input-box-wrapper { position: relative; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); border-radius: var(--radius-sm); padding: 2px; }
          textarea { width: 100%; border: none; background: transparent; color: var(--vscode-input-foreground); font-family: inherit; font-size: inherit; resize: none; outline: none; padding: 8px; box-sizing: border-box; min-height: 36px; max-height: 120px; display: block; }
          
          ::-webkit-scrollbar { width: 10px; height: 10px; }
          ::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background); border-radius: 10px; }
          ::-webkit-scrollbar-thumb:hover { background: var(--vscode-scrollbarSlider-hoverBackground); }
        </style>
      </head>
      <body>
        <div id="chat-container">
          <div class="message system"><div class="bubble">💡 选中终端报错文本，右键选择 "Agent: 诊断此报错" 开始。</div></div>
        </div>
        <div id="input-section">
          <div class="toolbar" id="status-bar" style="display:none">
            <div id="status-text" class="status-badge">🟢 运行中</div>
            <div class="control-btns">
               <button id="pause-btn" class="icon-btn" title="暂停">⏸</button>
               <button id="resume-btn" class="icon-btn" style="display:none" title="继续">▶</button>
               <button id="stop-btn" class="icon-btn" title="停止">⏹</button>
            </div>
          </div>
          <div class="input-box-wrapper">
            <textarea id="user-input" rows="1" placeholder="输入建议... (Shift+Enter 换行)"></textarea>
          </div>
        </div>
        <script>
          const vscode = acquireVsCodeApi();
          const container = document.getElementById('chat-container');
          const userInput = document.getElementById('user-input');
          const statusBar = document.getElementById('status-bar');
          const statusText = document.getElementById('status-text');
          const pauseBtn = document.getElementById('pause-btn');
          const resumeBtn = document.getElementById('resume-btn');
          const stopBtn = document.getElementById('stop-btn');

          marked.setOptions({
            highlight: function(code, lang) {
              const language = highlight.getLanguage(lang) ? lang : 'plaintext';
              return highlight.highlight(code, { language }).value;
            },
            langPrefix: 'hljs language-'
          });

          userInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
          });

          userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              const val = userInput.value.trim();
              if (val) {
                vscode.postMessage({ type: 'onUserFeedback', value: val });
                userInput.value = '';
                userInput.style.height = 'auto';
              }
            }
          });

          pauseBtn.onclick = () => vscode.postMessage({ type: 'onPause' });
          resumeBtn.onclick = () => vscode.postMessage({ type: 'onResume' });
          stopBtn.onclick = () => vscode.postMessage({ type: 'onStop' });
          
          // 使用事件委托处理动态生成的审批按钮，避免 ID 冲突
          window.handleApprove = (btn) => {
             const card = btn.closest('.approval-card');
             if(!card) return;
             card.classList.add('done');
             const actions = card.querySelector('.approval-actions');
             if(actions) actions.innerHTML = '<div style="color:var(--vscode-testing-iconPassed); font-weight:bold; font-size:11px">✅ 已允许执行</div>';
             vscode.postMessage({ type: 'onApprove' });
          };
          window.handleReject = (btn) => {
             const card = btn.closest('.approval-card');
             if(!card) return;
             card.classList.add('done');
             const actions = card.querySelector('.approval-actions');
             if(actions) actions.innerHTML = '<div style="color:var(--vscode-errorForeground); font-weight:bold; font-size:11px">🚫 已拒绝执行</div>';
             vscode.postMessage({ type: 'onReject' });
          };

          window.addEventListener('message', event => {
            const data = event.data;
            if (data.type === 'clear') { container.innerHTML = ''; return; }
            if (data.type === 'setRunning') {
                const isRunning = data.value;
                statusBar.style.display = isRunning ? 'flex' : 'none';
                if (isRunning) {
                   updateStatus('running');
                } else {
                   userInput.disabled = false;
                   userInput.placeholder = "输入建议...";
                }
                return;
            }
            if (data.type === 'setPaused') {
                updateStatus(data.value ? 'paused' : 'running');
                return;
            }

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
            else if (data.type === 'toolRequest') {
                msgDiv.className = 'message agent';
                if (data.role.includes('审批')) {
                   // 移除 ID="approval-group" 以支持多个卡片
                   msgDiv.innerHTML = 
                     '<div class="approval-card">' +
                       '<div class="approval-title">🛡️ 安全拦截: ' + data.toolName + '</div>' +
                       '<div style="font-size: 11px; opacity: 0.8; margin-bottom:4px">Agent 试图执行高风险操作，请确认。</div>' +
                       '<pre>' + data.args + '</pre>' +
                       '<div class="approval-actions">' +
                         '<button class="btn-primary" onclick="handleApprove(this)">✅ 允许执行</button>' +
                         '<button class="btn-danger" onclick="handleReject(this)">🚫 拒绝</button>' +
                       '</div>' +
                     '</div>';
                }
            }
            else if (data.role === '📦 工具结果') {
                msgDiv.className = 'message agent';
                // 添加 Tool Badge
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

            container.appendChild(msgDiv);
            scrollToBottom();
          });

          function updateStatus(state) {
              if (state === 'running') {
                  statusText.innerHTML = '🟢 运行中...';
                  statusText.className = 'status-badge';
                  pauseBtn.style.display = 'block';
                  resumeBtn.style.display = 'none';
                  userInput.disabled = true;
                  userInput.placeholder = "请先点击暂停再输入建议...";
              } else if (state === 'paused') {
                  statusText.innerHTML = '⏸ 已暂停';
                  statusText.className = 'status-badge paused';
                  pauseBtn.style.display = 'none';
                  resumeBtn.style.display = 'block';
                  userInput.disabled = false;
                  userInput.placeholder = "输入建议来干预，或点击继续...";
                  userInput.focus();
              }
          }
          function scrollToBottom() { container.scrollTop = container.scrollHeight; }
          function escapeHtml(unsafe) {
              return unsafe
                   .replace(/&/g, "&amp;")
                   .replace(/</g, "&lt;")
                   .replace(/>/g, "&gt;")
                   .replace(/"/g, "&quot;")
                   .replace(/'/g, "&#039;");
          }
        </script>
      </body>
      </html>`;
  }
}
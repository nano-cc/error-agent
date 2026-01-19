# Error Agent

VS Code 智能终端错误诊断助手。选中终端中的报错信息，右键一键调用 AI Agent 进行深度分析，提供修改建议，并可自动执行修复。

## 核心功能

*   **🕵️ 智能诊断**: 选中 Terminal 报错文本，右键选择 `Agent: 诊断此报错`，AI 将自动分析原因。
*   **🛠️ 自动修复**: Agent 可以读取文件、定位错误代码、甚至直接修改代码（需审批）。
*   **🛡️ 安全可控**: 敏感操作（如执行 Shell 命令、修改文件）会有醒目的审批卡片，用户拥有最终决定权。
*   **🧠 上下文感知**: 自动识别项目结构、依赖关系，提供基于当前上下文的精准建议。
*   **💬 交互式干预**: 在诊断过程中，您可以随时暂停并输入建议，指导 Agent 的下一步行动。

## 使用方法

1.  在 VS Code 终端中遇到报错。
2.  用鼠标选中报错信息。
3.  点击右键，选择 **"Agent: 诊断此报错"**。
4.  在左侧打开的面板中查看诊断过程和建议。

## 配置项

您可以在 VS Code 设置中搜索 `errorAgent` 进行配置：

*   `errorAgent.apiUrl`: LLM API 地址 (默认兼容 OpenAI 格式)。
*   `errorAgent.apiKey`: 您的 API Key。
*   `errorAgent.model`: 使用的模型名称 (如 `deepseek-v3`, `gpt-4o`)。
*   `errorAgent.temperature`: 模型采样温度。

## 安装

下载 `.vsix` 文件后，通过 VS Code 扩展面板的 "Install from VSIX..." 进行安装。

## License

MIT
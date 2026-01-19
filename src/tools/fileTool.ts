import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * 辅助函数：将 Agent 提供的路径转换为工作区绝对路径
 */
function getAbsPath(relPath: string): string {
  if (path.isAbsolute(relPath)) return relPath;
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  return workspaceRoot ? path.join(workspaceRoot, relPath) : relPath;
}

// --- 1. 查看目录内容 (list_dir) ---
export const listDir = tool(
  async ({ dirPath, pattern }) => {
    const fullPath = getAbsPath(dirPath);
    if (!fs.existsSync(fullPath)) return `错误: 路径不存在 ${dirPath}`;

    try {
      const rawItems = fs.readdirSync(fullPath);
      let items = rawItems.map((item) => {
        const isDir = fs.statSync(path.join(fullPath, item)).isDirectory();
        return `${isDir ? "📁" : "📄"} ${item}`;
      });

      if (pattern) {
        const regex = new RegExp(pattern, "i");
        items = items.filter((item) => regex.test(item));
      }

      items.sort();
      const total = items.length;
      const MAX_ITEMS = 50;
      const displayed = items.slice(0, MAX_ITEMS);

      let res = `目录 '${dirPath}' 内容 (共 ${total} 项):\n${displayed.join("\n")}`;
      if (total > MAX_ITEMS)
        res += `\n... (还有 ${total - MAX_ITEMS} 项未列出)`;
      return res;
    } catch (e: any) {
      return `读取失败: ${e.message}`;
    }
  },
  {
    name: "list_dir",
    description: "查看目录内容，支持正则过滤和图标区分。会自动处理工作区路径。",
    schema: z.object({
      dirPath: z.string().describe("要查看的目录相对或绝对路径"),
      pattern: z
        .string()
        .optional()
        .describe("可选的正则过滤模式（如 '.ts$'）"),
    }),
  },
);

// --- 2. 递归查找文件 (find_file) ---
export const findFile = tool(
  async ({ pattern }) => {
    const relativePattern = pattern.includes("/") ? pattern : `**/${pattern}`;
    try {
      // 使用 VSCode 优化的 API 查找文件
      const uris = await vscode.workspace.findFiles(
        relativePattern,
        "**/node_modules/**",
        20,
      );
      if (uris.length === 0) return `未找到匹配 '${pattern}' 的文件。`;

      const results = uris.map((u) => {
        const rel = vscode.workspace.asRelativePath(u);
        const isDir = fs.statSync(u.fsPath).isDirectory();
        return `${isDir ? "📁" : "📄"} ${rel}`;
      });

      return `搜索结果 (最多显示 20 条):\n${results.join("\n")}`;
    } catch (e: any) {
      return `查找出错: ${e.message}`;
    }
  },
  {
    name: "find_file",
    description: "在工作区递归查找文件，支持通配符模式。",
    schema: z.object({
      pattern: z.string().describe("搜索模式，例如 'config.json' 或 '*.ts'"),
    }),
  },
);

// --- 3. 分页读取文件 (read_file) ---
export const readFile = tool(
  async ({ filePath, startLine = 1, lineLimit = 500 }) => {
    const fullPath = getAbsPath(filePath);
    try {
      // 优先从 VSCode 编辑器读取（处理未保存的内容）
      const doc = vscode.workspace.textDocuments.find(
        (d) => d.fileName === fullPath,
      );
      const content = doc ? doc.getText() : fs.readFileSync(fullPath, "utf-8");

      const lines = content.split(/\r?\n/);
      const total = lines.length;
      const startIdx = Math.max(0, startLine - 1);
      const endIdx = Math.min(total, startIdx + lineLimit);

      const output = lines
        .slice(startIdx, endIdx)
        .map((l, i) => `${(startIdx + i + 1).toString().padStart(4)} | ${l}`);

      let header = `--- 文件: ${filePath} (第 ${startLine}-${endIdx} 行，共 ${total} 行) ---\n`;
      let footer =
        endIdx < total
          ? `\n... 还有 ${total - endIdx} 行未显示。`
          : "\n--- 读取结束 ---";
      return header + output.join("\n") + footer;
    } catch (e: any) {
      return `读取失败: ${e.message}`;
    }
  },
  {
    name: "read_file",
    description: "读取文件内容并显示行号。支持分页防止 Token 溢出。",
    schema: z.object({
      filePath: z.string().describe("文件相对或绝对路径"),
      startLine: z.number().optional().default(1).describe("起始行号(1开始)"),
      lineLimit: z.number().optional().default(500).describe("读取的最大行数"),
    }),
  },
);

// --- 4. 精准修改代码 (edit_file_lines) ---
export const editFileLines = tool(
  async ({ filePath, startLine, endLine, newContent }) => {
    const fullPath = getAbsPath(filePath);
    const uri = vscode.Uri.file(fullPath);

    try {
      const edit = new vscode.WorkspaceEdit();

      if (!fs.existsSync(fullPath)) {
        // 如果文件不存在则创建
        edit.createFile(uri, { ignoreIfExists: true });
        edit.insert(uri, new vscode.Position(0, 0), newContent);
      } else {
        const doc = await vscode.workspace.openTextDocument(uri);
        // VSCode Position 是 0-based
        const startPos = new vscode.Position(Math.max(0, startLine - 1), 0);
        const endPos = new vscode.Position(Math.min(doc.lineCount, endLine), 0);
        const range = new vscode.Range(startPos, endPos);

        const formattedContent = newContent.endsWith("\n")
          ? newContent
          : newContent + "\n";
        edit.replace(uri, range, formattedContent);
      }

      const success = await vscode.workspace.applyEdit(edit);
      return success
        ? `已修改文件: ${filePath} (第 ${startLine}-${endLine} 行)`
        : "修改应用失败。";
    } catch (e: any) {
      return `修改过程中出错: ${e.message}`;
    }
  },
  {
    name: "edit_file_lines",
    description: "精准修改文件指定行。支持自动创建文件和行号容错。",
    schema: z.object({
      filePath: z.string().describe("文件相对或绝对路径"),
      startLine: z.number().describe("修改开始行号(1开始)"),
      endLine: z.number().describe("修改结束行号(含)"),
      newContent: z.string().describe("准备替换进去的新代码内容"),
    }),
  },
);

// --- 5. 文件内关键字搜索 (search_in_file) ---
export const searchInFile = tool(
  async ({ filePath, keyword, contextLines = 2 }) => {
    const fullPath = getAbsPath(filePath);
    try {
      const doc = vscode.workspace.textDocuments.find(
        (d) => d.fileName === fullPath,
      );
      const content = doc ? doc.getText() : fs.readFileSync(fullPath, "utf-8");

      const lines = content.split(/\r?\n/);
      const regex = new RegExp(keyword, "gi");
      const matches: string[] = [];

      lines.forEach((line, i) => {
        if (regex.test(line)) {
          const start = Math.max(0, i - contextLines);
          const end = Math.min(lines.length, i + contextLines + 1);
          const chunk = lines.slice(start, end).map((l, idx) => {
            const currLineNum = start + idx + 1;
            const isMatch = currLineNum === i + 1;
            return `${currLineNum.toString().padStart(4)} | ${isMatch ? ">>> " : "    "}${l}`;
          });
          matches.push(chunk.join("\n"));
        }
      });

      if (matches.length === 0)
        return `在文件 '${filePath}' 中未找到关键字 '${keyword}'。`;

      const header = `--- 在 '${filePath}' 中搜索 '${keyword}' 的结果 (前 10 条) ---\n`;
      return header + matches.slice(0, 10).join("\n\n---\n\n");
    } catch (e: any) {
      return `搜索失败: ${e.message}`;
    }
  },
  {
    name: "search_in_file",
    description: "在指定文件中搜索关键字，返回包含行号的匹配项及其上下文。",
    schema: z.object({
      filePath: z.string().describe("文件相对或绝对路径"),
      keyword: z.string().describe("要查找的关键字或正则表达式"),
      contextLines: z
        .number()
        .optional()
        .default(2)
        .describe("匹配行前后显示的上下文行数"),
    }),
  },
);

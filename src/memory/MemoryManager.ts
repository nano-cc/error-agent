// 记忆管理器 - 基于 Markdown 文件的记忆存储和检索

import * as vscode from "vscode";
import type {
  MemoryItem,
  CreateMemoryItemInput,
  UpdateMemoryItemInput,
  SearchFilter,
  SearchResult,
  CategoryInfo,
  RenameCategoryOptions,
} from "./types";

const MEMORY_DIR_NAME = "memory";
const MARKDOWN_EXT = ".md";
const PREVIEW_LENGTH = 100;

/**
 * 解析 Markdown 文件内容为记忆项数组
 * 格式：
 * # 标题1
 * 内容1
 *
 * # 标题2
 * 内容2
 */
function parseMarkdownContent(
  content: string,
): Array<{ title: string; content: string }> {
  const items: Array<{ title: string; content: string }> = [];
  const lines = content.split("\n");

  let currentTitle = "";
  let currentContent: string[] = [];

  for (const line of lines) {
    // 检测一级标题 (# 标题)
    if (line.startsWith("# ")) {
      // 保存前一个记忆项
      if (currentTitle) {
        items.push({
          title: currentTitle.trim(),
          content: currentContent.join("\n").trim(),
        });
      }
      currentTitle = line.substring(2);
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  // 保存最后一个记忆项
  if (currentTitle) {
    items.push({
      title: currentTitle.trim(),
      content: currentContent.join("\n").trim(),
    });
  }

  return items;
}

/**
 * 将记忆项数组转换为 Markdown 内容
 */
function serializeToMarkdown(
  items: Array<{ title: string; content: string }>,
): string {
  return items
    .map((item) => {
      const content = item.content.trim();
      return `# ${item.title.trim()}\n\n${content}\n\n`;
    })
    .join("");
}

/**
 * 记忆管理器类
 */
export class MemoryManager {
  private memoryDirUri: vscode.Uri;
  private initPromise: Promise<void> | null = null;

  constructor(workspaceUri: vscode.Uri) {
    // 记忆目录：.vscode/error_agent/memory
    const errorAgentDir = vscode.Uri.joinPath(
      workspaceUri,
      ".vscode",
      "error_agent",
    );
    this.memoryDirUri = vscode.Uri.joinPath(errorAgentDir, MEMORY_DIR_NAME);
  }

  /**
   * 初始化记忆管理器
   */
  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        await vscode.workspace.fs.createDirectory(this.memoryDirUri);
      } catch (error: any) {
        // 目录可能已存在，忽略错误
        if (error instanceof Error && error.name === "FileSystemError") {
          if (
            error.message.includes("FileExists") ||
            error.message.includes("File already exists")
          ) {
            return;
          }
        }
        throw error;
      }
    })();

    return this.initPromise;
  }

  /**
   * 获取分类文件 URI
   */
  private getCategoryFileUri(category: string): vscode.Uri {
    const fileName = `${category}${MARKDOWN_EXT}`;
    return vscode.Uri.joinPath(this.memoryDirUri, fileName);
  }

  /**
   * 读取分类文件内容
   * 如果文件不存在，返回空字符串
   */
  private async readCategoryFile(category: string): Promise<string> {
    // 先检查文件是否存在
    if (!(await this.categoryExists(category))) {
      return "";
    }

    // 文件存在，读取内容
    const fileUri = this.getCategoryFileUri(category);
    const data = await vscode.workspace.fs.readFile(fileUri);
    return Buffer.from(data).toString("utf-8");
  }

  /**
   * 写入分类文件内容
   */
  private async writeCategoryFile(
    category: string,
    content: string,
  ): Promise<void> {
    const fileUri = this.getCategoryFileUri(category);
    const buffer = Buffer.from(content, "utf-8");
    // writeFile 会自动创建不存在的文件，或覆盖已存在的文件
    await vscode.workspace.fs.writeFile(fileUri, buffer);
  }

  /**
   * 检查分类是否存在
   */
  private async categoryExists(category: string): Promise<boolean> {
    const fileUri = this.getCategoryFileUri(category);
    try {
      await vscode.workspace.fs.stat(fileUri);
      return true;
    } catch (error: any) {
      // 检查是否为权限错误等系统性错误
      if (error instanceof Error) {
        const message = error.message?.toLowerCase() || "";
        // 权限错误或无法访问目录的错误需要抛出
        if (
          message.includes("permission") ||
          message.includes("access denied") ||
          message.includes("eacces")
        ) {
          throw error;
        }
      }
      // 其他所有错误（包括文件不存在、EntryNotFound 等）统一返回 false
      return false;
    }
  }

  // ==================== 分类操作 ====================

  /**
   * 创建分类
   */
  async createCategory(category: string): Promise<void> {
    if (await this.categoryExists(category)) {
      throw new Error(`Category "${category}" already exists`);
    }
    await this.writeCategoryFile(category, "");
  }

  /**
   * 删除分类
   */
  async deleteCategory(category: string): Promise<void> {
    const fileUri = this.getCategoryFileUri(category);
    try {
      await vscode.workspace.fs.delete(fileUri);
    } catch (error: any) {
      if (error instanceof Error && error.name === "FileSystemError") {
        if (
          error.message.includes("FileNotFound") ||
          error.message.includes("EntryNotFound") ||
          error.message.includes("No such file or directory")
        ) {
          throw new Error(`Category "${category}" not found`);
        }
      }
      throw error;
    }
  }

  /**
   * 重命名分类
   */
  async renameCategory(options: RenameCategoryOptions): Promise<void> {
    const { oldCategory, newCategory } = options;

    // 检查旧分类是否存在
    if (!(await this.categoryExists(oldCategory))) {
      throw new Error(`Category "${oldCategory}" not found`);
    }

    // 检查新分类是否已存在
    if (await this.categoryExists(newCategory)) {
      throw new Error(`Category "${newCategory}" already exists`);
    }

    // 读取旧分类内容
    const content = await this.readCategoryFile(oldCategory);

    // 删除旧分类
    await this.deleteCategory(oldCategory);

    // 写入新分类
    await this.writeCategoryFile(newCategory, content);
  }

  /**
   * 列出所有分类
   */
  async listCategories(): Promise<string[]> {
    try {
      const entries = await vscode.workspace.fs.readDirectory(
        this.memoryDirUri,
      );
      return entries
        .filter(
          ([name, type]) =>
            type === vscode.FileType.File && name.endsWith(MARKDOWN_EXT),
        )
        .map(([name]) => name.substring(0, name.length - MARKDOWN_EXT.length));
    } catch (error: any) {
      if (error instanceof Error && error.name === "FileSystemError") {
        if (
          error.message.includes("FileNotFound") ||
          error.message.includes("EntryNotFound") ||
          error.message.includes("No such file or directory")
        ) {
          return [];
        }
      }
      throw error;
    }
  }

  /**
   * 获取分类信息（包括记忆项数量）
   */
  async getCategoryInfo(category: string): Promise<CategoryInfo | null> {
    if (!(await this.categoryExists(category))) {
      return null;
    }

    const content = await this.readCategoryFile(category);
    const items = parseMarkdownContent(content);

    return {
      name: category,
      count: items.length,
    };
  }

  /**
   * 获取所有分类信息
   */
  async getAllCategoriesInfo(): Promise<CategoryInfo[]> {
    const categories = await this.listCategories();
    const infos: CategoryInfo[] = [];

    for (const category of categories) {
      const info = await this.getCategoryInfo(category);
      if (info) {
        infos.push(info);
      }
    }

    return infos;
  }

  // ==================== 记忆项操作 ====================

  /**
   * 创建记忆项
   */
  async createMemoryItem(input: CreateMemoryItemInput): Promise<MemoryItem> {
    const { category, title, content } = input;

    // 读取分类文件（如果不存在会自动创建）
    const markdownContent = await this.readCategoryFile(category);
    console.log(
      "[Tool.create_memory_item] 读取记忆分类文件长度：",
      markdownContent.length,
    );
    const items = parseMarkdownContent(markdownContent);

    // 检查标题是否已存在
    if (items.some((item) => item.title === title)) {
      throw new Error(
        `Memory item "${title}" already exists in category "${category}, please update the content of the memory item!"`,
      );
    }

    // 添加新记忆项
    items.push({ title, content });

    // 写入文件
    await this.writeCategoryFile(category, serializeToMarkdown(items));
    console.log("[Tool.create_memory_item] 写入 ", category, " 成功");

    return { category, title, content };
  }

  /**
   * 获取记忆项
   */
  async getMemoryItem(
    category: string,
    title: string,
  ): Promise<MemoryItem | null> {
    if (!(await this.categoryExists(category))) {
      return null;
    }

    const markdownContent = await this.readCategoryFile(category);
    const items = parseMarkdownContent(markdownContent);
    const item = items.find((i) => i.title === title);

    if (!item) {
      return null;
    }

    return { category, title: item.title, content: item.content };
  }

  /**
   * 更新记忆项
   */
  async updateMemoryItem(
    category: string,
    title: string,
    input: UpdateMemoryItemInput,
  ): Promise<MemoryItem> {
    if (!(await this.categoryExists(category))) {
      throw new Error(`Category "${category}" not found`);
    }

    const markdownContent = await this.readCategoryFile(category);
    const items = parseMarkdownContent(markdownContent);
    const index = items.findIndex((i) => i.title === title);

    if (index === -1) {
      throw new Error(
        `Memory item "${title}" not found in category "${category}"`,
      );
    }

    // 更新内容
    items[index].content = input.content;

    // 写入文件
    await this.writeCategoryFile(category, serializeToMarkdown(items));

    return { category, title, content: input.content };
  }

  /**
   * 删除记忆项
   */
  async deleteMemoryItem(category: string, title: string): Promise<void> {
    if (!(await this.categoryExists(category))) {
      throw new Error(`Category "${category}" not found`);
    }

    const markdownContent = await this.readCategoryFile(category);
    const items = parseMarkdownContent(markdownContent);
    const index = items.findIndex((i) => i.title === title);

    if (index === -1) {
      throw new Error(
        `Memory item "${title}" not found in category "${category}"`,
      );
    }

    // 删除记忆项
    items.splice(index, 1);

    // 写入文件
    await this.writeCategoryFile(category, serializeToMarkdown(items));
  }

  /**
   * 列出分类中的所有记忆项
   */
  async listMemoryItems(category: string): Promise<MemoryItem[]> {
    if (!(await this.categoryExists(category))) {
      return [];
    }

    const markdownContent = await this.readCategoryFile(category);
    const items = parseMarkdownContent(markdownContent);

    return items.map((item) => ({
      category,
      title: item.title,
      content: item.content,
    }));
  }

  /**
   * 获取所有记忆项
   */
  async getAllMemoryItems(): Promise<MemoryItem[]> {
    const categories = await this.listCategories();
    const results: MemoryItem[] = [];

    for (const category of categories) {
      const items = await this.listMemoryItems(category);
      results.push(...items);
    }

    return results;
  }

  // ==================== 搜索操作 ====================

  /**
   * 搜索记忆项
   */
  async searchMemoryItems(filter: SearchFilter): Promise<SearchResult[]> {
    const { category, query } = filter;

    // 如果指定了分类，只在分类中搜索
    if (category) {
      return this.searchInCategory(category, query || "");
    }

    // 搜索所有分类
    const categories = await this.listCategories();
    const results: SearchResult[] = [];

    for (const cat of categories) {
      const items = await this.searchInCategory(cat, query || "");
      results.push(...items);
    }

    return results;
  }

  /**
   * 在指定分类中搜索记忆项
   */
  private async searchInCategory(
    category: string,
    query: string,
  ): Promise<SearchResult[]> {
    if (!(await this.categoryExists(category))) {
      return [];
    }

    const markdownContent = await this.readCategoryFile(category);
    const items = parseMarkdownContent(markdownContent);

    const results: SearchResult[] = [];

    for (const item of items) {
      // 检查标题是否匹配
      const titleMatch =
        query === "" || item.title.toLowerCase().includes(query.toLowerCase());

      // 检查内容是否匹配
      const contentMatch =
        query === "" ||
        item.content.toLowerCase().includes(query.toLowerCase());

      if (titleMatch || contentMatch) {
        const preview =
          item.content.length > PREVIEW_LENGTH
            ? item.content.substring(0, PREVIEW_LENGTH) + "..."
            : item.content;

        results.push({
          category,
          title: item.title,
          preview,
        });
      }
    }

    return results;
  }
}

// 单例实例
let memoryManagerInstance: MemoryManager | null = null;

/**
 * 获取 MemoryManager 单例
 */
export function getMemoryManager(): MemoryManager {
  if (!memoryManagerInstance) {
    // 默认使用当前工作区
    const workspaceUri = vscode.workspace.workspaceFolders?.[0].uri;
    if (!workspaceUri) {
      throw new Error("No workspace folder found");
    }
    memoryManagerInstance = new MemoryManager(workspaceUri);
  }
  return memoryManagerInstance;
}

/**
 * 重置 MemoryManager 实例（用于测试）
 */
export function resetMemoryManager(): void {
  memoryManagerInstance = null;
}

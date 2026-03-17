import { BaseTool } from "./base-tool";
import { StructuredTool } from "@langchain/core/tools";

// Import all tool classes
import { TodoWriteTool, TodoClearTool } from "./todo";

import {
  LSPHoverTool,
  LSPDefinitionTool,
  LSPReferencesTool,
  LSPDocumentSymbolsTool,
  LSPWorkspaceSymbolsTool,
  LSPDiagnosticsTool,
  LSPImplementationTool,
} from "./lsp";

import {
  SearchMemoryItemsTool,
  LoadMemoryItemTool,
  UpdateMemoryItemTool,
  ListMemoryItemsTool,
  CreateMemoryItemTool,
  DeleteMemoryItemTool,
  MemoryFinishTool,
  MemorySaveTool,
  MemoryRetrieveTool,
} from "./memory";

import {
  ListDirTool,
  FindFileTool,
  ReadFileTool,
  EditFileLinesTool,
} from "./file";

import { SearchInFileTool } from "./search";

import { TerminalExecuteTool } from "./terminal";

import { WebSearchTool } from "./network";

import { ExploreFinishTool, ExploreTool } from "./explore";

export class ToolRegistry {
  private static instance: ToolRegistry | null = null;
  private tools: Map<string, BaseTool<any>> = new Map();

  private constructor() {
    this.registerBuiltinTools();
  }

  /**
   * 获取单例实例
   */
  static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  /**
   * 注册所有内置工具
   */
  private registerBuiltinTools(): void {
    // Todo tools
    this.register(new TodoWriteTool());
    this.register(new TodoClearTool());

    // LSP tools
    this.register(new LSPHoverTool());
    this.register(new LSPDefinitionTool());
    this.register(new LSPReferencesTool());
    this.register(new LSPDocumentSymbolsTool());
    this.register(new LSPWorkspaceSymbolsTool());
    this.register(new LSPDiagnosticsTool());
    this.register(new LSPImplementationTool());

    // Memory tools
    this.register(new SearchMemoryItemsTool());
    this.register(new LoadMemoryItemTool());
    this.register(new UpdateMemoryItemTool());
    this.register(new ListMemoryItemsTool());
    this.register(new CreateMemoryItemTool());
    this.register(new DeleteMemoryItemTool());
    this.register(new MemoryFinishTool()); // MemoryAgent 内部完成工具
    this.register(new MemorySaveTool()); // 主 agent 调用保存工具
    this.register(new MemoryRetrieveTool()); // 主 agent 调用检索工具

    // File tools
    this.register(new ListDirTool());
    this.register(new FindFileTool());
    this.register(new ReadFileTool());
    this.register(new EditFileLinesTool());

    // Search tools
    this.register(new SearchInFileTool());

    // Terminal tools
    this.register(new TerminalExecuteTool());

    // Network tools
    this.register(new WebSearchTool());

    // Explore tools
    this.register(new ExploreFinishTool()); // ExploreAgent 内部完成工具
    this.register(new ExploreTool()); // 主 agent 调用探索工具
  }

  /**
   * 注册单个工具
   */
  register(tool: BaseTool<any>): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * 根据名称获取工具
   */
  get(name: string): BaseTool<any> | undefined {
    return this.tools.get(name);
  }

  /**
   * 获取所有工具
   */
  getAll(): Map<string, BaseTool<any>> {
    return this.tools;
  }

  /**
   * 获取非记忆管理类的所有其他工具数组
   */
  getToolList(): BaseTool<any>[] {
    // 定义需要排除的记忆工具 Key 集合
    const memoryKeys = new Set([
      "search_memory_items",
      "load_memory_item",
      "update_memory_item",
      "list_memory_items",
      "create_memory_item",
      "delete_memory_item",
      "memory_finish",
      "explore_finish",
    ]);

    // 将所有工具转为数组，并过滤掉在 memoryKeys 中的项
    // 注意：这里假设 this.tools 是一个 Map<string, BaseTool<any>>
    return Array.from(this.tools.entries())
      .filter(([key]) => !memoryKeys.has(key))
      .map(([_, tool]) => tool);
  }

  getMemoryToolList(): BaseTool<any>[] {
    const memoryTools: BaseTool<any>[] = [];
    const searchMemoryItems = this.tools.get("search_memory_items");
    const loadMemoryItem = this.tools.get("load_memory_item");
    const updateMemoryItem = this.tools.get("update_memory_item");
    const listMemoryItems = this.tools.get("list_memory_items");
    const createMemoryItem = this.tools.get("create_memory_item");
    const deleteMemoryItem = this.tools.get("delete_memory_item");

    if (searchMemoryItems) {
      memoryTools.push(searchMemoryItems);
    }
    if (loadMemoryItem) {
      memoryTools.push(loadMemoryItem);
    }
    if (updateMemoryItem) {
      memoryTools.push(updateMemoryItem);
    }
    if (listMemoryItems) {
      memoryTools.push(listMemoryItems);
    }
    if (createMemoryItem) {
      memoryTools.push(createMemoryItem);
    }
    if (deleteMemoryItem) {
      memoryTools.push(deleteMemoryItem);
    }

    return memoryTools;
  }

  /**
   * 获取所有工具名称
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * 检查工具是否存在
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 注销工具
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * 清空所有工具
   */
  clear(): void {
    this.tools.clear();
  }

  /**
   * 获取工具数量
   */
  count(): number {
    return this.tools.size;
  }

  /**
   * 将工具转换为 LangChain 格式
   */
  toLangChainTools(): StructuredTool[] {
    return Array.from(this.tools.values());
  }
}

/**
 * 获取工具注册表单例
 */
export function getToolRegistry(): ToolRegistry {
  return ToolRegistry.getInstance();
}

/**
 * 根据名称获取工具
 */
export function getTool(name: string): BaseTool<any> | undefined {
  return getToolRegistry().get(name);
}

/**
 * 获取所有工具
 */
export function getAllTools(): BaseTool<any>[] {
  return getToolRegistry().getToolList();
}

export default ToolRegistry;

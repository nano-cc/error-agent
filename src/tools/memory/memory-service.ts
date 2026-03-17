// Memory Service - 基于 MemoryManager 的记忆服务封装

import { getMemoryManager } from "../../memory/MemoryManager";

/**
 * 记忆服务类
 * 提供与工具兼容的接口
 */
export class MemoryService {
  /**
   * 搜索记忆项
   */
  async searchItems(filter?: { category?: string; tags?: string[]; query?: string }): Promise<Array<{ definition: any; hasData: boolean }>> {
    const manager = getMemoryManager();

    try {
      const results = await manager.searchMemoryItems(filter || {});
      return results.map((result) => ({
        definition: {
          id: `${result.category}:${result.title}`,
          name: result.title,
          description: result.preview,
          category: result.category,
          tags: [],
        },
        hasData: true,
      }));
    } catch (error) {
      console.error("[MemoryService.searchItems] Error:", error);
      return [];
    }
  }

  /**
   * 加载记忆项
   */
  async loadItem(id: string): Promise<{ definition: any; instance: any } | null> {
    const manager = getMemoryManager();

    try {
      // ID格式为 category:title
      const [category, ...titleParts] = id.split(":");
      const title = titleParts.join(":");

      const item = await manager.getMemoryItem(category, title);
      if (!item) {
        return null;
      }

      return {
        definition: {
          id: `${item.category}:${item.title}`,
          name: item.title,
          description: item.content,
          category: item.category,
          tags: [],
        },
        instance: {
          content: item.content,
        },
      };
    } catch (error) {
      console.error("[MemoryService.loadItem] Error:", error);
      return null;
    }
  }

  /**
   * 更新记忆项
   */
  async updateItem(id: string, content: any, merge: boolean = true): Promise<{ action: "created" | "updated"; id: string }> {
    const manager = getMemoryManager();

    try {
      // ID格式为 category:title
      const [category, ...titleParts] = id.split(":");
      const title = titleParts.join(":");

      await manager.updateMemoryItem(category, title, { content });
      return { action: "updated", id };
    } catch (error) {
      console.error("[MemoryService.updateItem] Error:", error);
      throw error;
    }
  }

  /**
   * 列出记忆项
   */
  async listItems(filter?: { category?: string; tags?: string[] }): Promise<any[]> {
    const manager = getMemoryManager();

    try {
      const items = filter?.category
        ? await manager.listMemoryItems(filter.category)
        : await manager.getAllMemoryItems();

      return items.map((item) => ({
        id: `${item.category}:${item.title}`,
        name: item.title,
        description: item.content.substring(0, 100) + (item.content.length > 100 ? "..." : ""),
        category: item.category,
        tags: [],
      }));
    } catch (error) {
      console.error("[MemoryService.listItems] Error:", error);
      return [];
    }
  }

  /**
   * 检查定义是否存在
   */
  async hasDefinition(id: string): Promise<boolean> {
    const manager = getMemoryManager();

    try {
      // ID格式为 category:title
      const [category, ...titleParts] = id.split(":");
      const title = titleParts.join(":");

      const item = await manager.getMemoryItem(category, title);
      return item !== null;
    } catch (error) {
      console.error("[MemoryService.hasDefinition] Error:", error);
      return false;
    }
  }

  /**
   * 创建记忆项
   */
  async createItem(category: string, title: string, content: string): Promise<any> {
    const manager = getMemoryManager();
    return await manager.createMemoryItem({ category, title, content });
  }

  /**
   * 通过分类和标题获取记忆项
   */
  async getItemByCategoryAndTitle(category: string, title: string): Promise<any> {
    const manager = getMemoryManager();
    return await manager.getMemoryItem(category, title);
  }

  /**
   * 通过分类和标题更新记忆项
   */
  async updateItemByCategoryAndTitle(category: string, title: string, content: string): Promise<any> {
    const manager = getMemoryManager();
    return await manager.updateMemoryItem(category, title, { content });
  }

  /**
   * 删除记忆项
   */
  async deleteItem(category: string, title: string): Promise<void> {
    const manager = getMemoryManager();
    await manager.deleteMemoryItem(category, title);
  }
}

let memoryServiceInstance: MemoryService | null = null;

export function getMemoryService(): MemoryService {
  if (!memoryServiceInstance) {
    memoryServiceInstance = new MemoryService();
  }
  return memoryServiceInstance;
}

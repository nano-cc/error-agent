// 记忆系统类型定义

/**
 * 记忆项接口
 */
export interface MemoryItem {
  /** 分类名称 */
  category: string;
  /** 标题 */
  title: string;
  /** 内容 */
  content: string;
}

/**
 * 创建记忆项的输入
 */
export interface CreateMemoryItemInput {
  /** 分类名称 */
  category: string;
  /** 标题 */
  title: string;
  /** 内容 */
  content: string;
}

/**
 * 更新记忆项的输入
 */
export interface UpdateMemoryItemInput {
  /** 新内容 */
  content: string;
}

/**
 * 搜索结果项
 */
export interface SearchResult {
  /** 分类名称 */
  category: string;
  /** 标题 */
  title: string;
  /** 内容预览 */
  preview: string;
}

/**
 * 搜索过滤器
 */
export interface SearchFilter {
  /** 分类过滤 */
  category?: string;
  /** 关键词 */
  query?: string;
}

/**
 * 记忆分类分类信息
 */
export interface CategoryInfo {
  /** 分类名称 */
  name: string;
  /** 记忆项数量 */
  count: number;
}

/**
 * 重命名分类的选项
 */
export interface RenameCategoryOptions {
  /** 旧分类名 */
  oldCategory: string;
  /** 新分类名 */
  newCategory: string;
}

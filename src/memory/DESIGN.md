# 记忆系统设计文档

## 概述

记忆系统基于 Markdown 文件实现，每个记忆项包含分类、标题和内容。

## 存储结构

### 文件位置
```
项目根目录/.vscode/error_agent/memory/
```

### 文件命名规则
- 每个分类对应一个 Markdown 文件
- 文件名：`分类名.md`
- 例如：`project.md`, `bugs.md`, `features.md`

### Markdown 文件格式
```markdown
# 标题1
内容1

# 标题2
内容2
```

## 核心类型

### MemoryItem
```typescript
interface MemoryItem {
  category: string;        // 分类名称
  title: string;           // 标题
  content: string;         // 内容
}
```

### SearchFilter
```typescript
interface SearchFilter {
  category?: string;       // 分类过滤
  query?: string;          // 关键词搜索
}
```

### SearchResult
```typescript
interface SearchResult {
  category: string;        // 分类名称
  title: string;           // 标题
  preview: string;         // 内容预览（前100字符）
}
```

### CategoryInfo
```typescript
interface CategoryInfo {
  name: string;            // 分类名称
  count: number;           // 记忆项数量
}
```

## MemoryManager 接口

### 初始化
```typescript
async initialize(): Promise<void>
```
初始化记忆管理器，创建必要的目录。

### 分类操作

#### 创建分类
```typescript
async createCategory(category: string): Promise<void>
```
创建一个新的分类（对应的 Markdown 文件）。

#### 删除分类
```typescript
async deleteCategory(category: string): Promise<void>
```
删除一个分类及其所有记忆项。

#### 重命名分类
```typescript
async renameCategory(options: RenameCategoryOptions): Promise<void>
```
重命名分类。

#### 列出分类
```typescript
async listCategories(): Promise<string[]>
```
返回所有分类名称列表。

#### 获取分类信息
```typescript
async getCategoryInfo(category: string): Promise<CategoryInfo | null>
async getAllCategoriesInfo(): Promise<CategoryInfo[]>
```
获取分类信息（包含记忆项数量）。

### 记忆项操作

#### 创建记忆项
```typescript
async createMemoryItem(input: CreateMemoryItemInput): Promise<MemoryItem>
```
在指定分类中创建新的记忆项。

#### 获取记忆项
```typescript
async getMemoryItem(category: string, title: string): Promise<MemoryItem | null>
```
获取单个记忆项（通过分类和和标题）。

#### 更新记忆项
```typescript
async updateMemoryItem(category: string, title: string, input: UpdateMemoryItemInput): Promise<MemoryItem>
```
更新记忆项的内容。

#### 删除记忆项
```typescript
async deleteMemoryItem(category: string, title: string): Promise<void>
```
删除指定记忆项。

#### 列出记忆项
```typescript
async listMemoryItems(category: string): Promise<MemoryItem[]>
async getAllMemoryItems(): Promise<MemoryItem[]>
```
列出记忆项。

### 搜索操作

#### 搜索记忆项
```typescript
async searchMemoryItems(filter: SearchFilter): Promise<SearchResult[]>
```
根据过滤条件搜索记忆项，支持：
- 分类过滤
- 关键词搜索（匹配标题或内容）

## MemoryService 工具适配器

`MemoryService` 提供与现有工具兼容的接口，内部使用 `MemoryManager`。

### 方法
```typescript
searchItems(filter?: any): Promise<Array<{ definition: any; hasData: boolean }>>
loadItem(id: string): Promise<{ definition: any; instance: any } | null>
updateItem(id: string, content: any, merge: boolean): Promise<UpdateResult>
listItems(filter?: any): Promise<any[]>
hasDefinition(id: string): Promise<boolean>
createItem(category: string, title: string, content: string): Promise<any>
getItemByCategoryAndTitle(category: string, title: string): Promise<any>
updateItemByCategoryAndTitle(category: string, title: string, content: string): Promise<any>
deleteItem(category: string, title: string): Promise<void>
```

**注意**：ID 格式为 `category:title`，用于兼容现有工具接口。

## 可用工具

### 1. create_memory_item
创建一个新的记忆项。

**参数：**
- `category`: 分类名称
- `title`: 标题
- `content`: 内容

### 2. search_memory_items
搜索记忆项。

**参数：**
- `category`: 分类过滤（可选）
- `tags`: 标签过滤（可选）
- `query`: 关键词（可选）

### 3. load_memory_item
加载指定记忆项。

**参数：**
- `id`: 记忆项ID（格式：`分类:标题`）

### 4. update_memory_item
更新记忆项。

**参数：**
- `id`: 记忆项ID（格式：`分类:标题`）
- `content`: 新内容
- `merge`: 是否合并（可选，默认true）

### 5. list_memory_items
列出记忆项。

**参数：**
- `category`: 分类过滤（可选）
- `tags`: 标签过滤（可选）

### 6. delete_memory_item
删除记忆项。

**参数：**
- `category`: 分类名称
- `title`: 标题

## 使用示例

### 创建记忆项
```
使用 create_memory_item 工具
- category: "project"
- title: "项目架构"
- content: "项目采用分层架构..."
```

### 搜索记忆项
```
使用 search_memory_items 工具
- query: "架构"
```

### 更新记忆项
```
使用 update_memory_item 工具
- id: "project:项目架构"
- content: "更新后的内容..."
```

### 删除记忆项
```
使用 delete_memory_item 工具
- category: "project"
- title: "项目架构"
```

## 初始化

在扩展激活时初始化：
```typescript
const memoryManager = getMemoryManager();
await memoryManager.initialize();
```

## 注意事项

1. **唯一性标识**：使用 `category:title` 组合作为唯一标识
2. **标题唯一性**：同一分类中标题必须唯一
3. **分类自动创建**：创建记忆项时如果分类不存在会自动创建
4. **内容预览**：搜索结果返回前100字符的内容预览

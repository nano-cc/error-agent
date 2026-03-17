import { z } from "zod";
import { BaseTool } from "../base-tool";
import {
  DangerLevel,
  ToolCategory,
  ToolExecutionContext,
  ToolExecutionResult,
} from "../types";
import { toolContextStorage } from "../../storage/context";

// 定义单个 Todo 的结构
export const TodoItemSchema = z.object({
  task: z.string().min(1, "任务描述不能为空"),
  status: z
    .enum(["pending", "in_progress", "completed", "failed"])
    .default("pending"),
});

// 定义工具的输入 Schema
export const TodoWriteSchema = z.object({
  todos: z
    .array(TodoItemSchema)
    .describe("待办事项数组。每个对象必须包含 task 和 status"),
});

export class TodoWriteTool extends BaseTool<typeof TodoWriteSchema> {
  constructor() {
    super({
      name: "todo_write",
      description: "创建或更新待办事项列表，会覆盖现有列表。",
      schema: TodoWriteSchema,
      meta: {
        category: ToolCategory.MEMORY,
        dangerLevel: DangerLevel.SAFE,
        isPrivileged: false,
      },
    });
  }

  /**
   * 实现逻辑
   * 注意：LangChain 标准的 _call 默认参数是 (input, runManager)
   * 如果你需要 context，可以在调用时通过 bind 绑定或从全局 context 获取
   */
  async _call(
    args: z.infer<typeof TodoWriteSchema>,
  ): Promise<ToolExecutionResult> {
    const { todos } = args;
    const startTime = Date.now();
    const timestamp = startTime;

    console.log("[TODOWRITE] Received params:", args, "messages");
    try {
      // 获取存储管理器
      const { getStorageManager } = require("../../storage/StorageManager");
      const storageManager = getStorageManager();
      const context = toolContextStorage.getStore();
      const sessionId = context?.sessionId;

      // 执行覆盖写入
      const resultTodos = await storageManager.overwriteTodos(sessionId, todos);

      console.log("[TODOWRITE] 数据库更新完成");
      const duration = Date.now() - startTime;

      // 返回给模型看的结果：包含回显数据
      return {
        success: true,
        data: {
          // 回显处理后的 todos，确保模型能看到 ID、任务内容和状态
          todos: resultTodos.map((t: any) => ({
            task: t.task,
            status: t.status,
          })),
        },
        metadata: {
          duration,
          timestamp,
          toolName: "todo_write",
        },
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;

      console.log("[TODOWRITE] 错误：", error);
      // 错误处理也建议结构化，方便模型理解失败原因
      return {
        success: false,
        error: error.message || "Failed to write todos",
        metadata: {
          duration,
          timestamp,
          toolName: "todo_write",
        },
      };
    }
  }
}

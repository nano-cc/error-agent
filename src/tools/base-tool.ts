import { StructuredTool, Tool, ToolParams } from "@langchain/core/tools";
import { z } from "zod";
import {
  DangerLevel,
  ToolCategory,
  ToolExecutionContext,
  ToolExecutionResult,
} from "./types";

// 定义你想要的元数据结构
interface ToolMeta {
  category: ToolCategory;
  isPrivileged: boolean;
  dangerLevel: DangerLevel;
}

export abstract class BaseTool<
  T extends z.ZodObject<any>,
> extends StructuredTool {
  name: string;
  description: string;
  schema: T;
  // 自定义属性
  meta: ToolMeta;

  constructor(
    fields: ToolParams & {
      name: string;
      description: string;
      schema: T;
      meta: ToolMeta;
    },
  ) {
    super(fields);
    this.name = fields.name;
    this.description = fields.description;
    this.schema = fields.schema;
    this.meta = fields.meta;
  }

  // 留空实现：由具体工具去写逻辑
  abstract _call(
    input: z.infer<T>,
    runManager?: any,
  ): Promise<ToolExecutionResult>;
}

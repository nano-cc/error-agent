// Storage Manager - SQLite 数据库操作封装

import * as vscode from "vscode";
import initSqlJs, { Database } from "sql.js";
import { v4 as uuidv4 } from "uuid";
import type {
  Session,
  SessionMetadata,
  Message,
  MessageInput,
  Todo,
  TodoInput,
  MessageRole,
} from "../types/session";
import { CREATE_TABLES_SQL, PRAGMA_SQL } from "./schema";
import { logger } from "../utils/logger";

export class StorageManager {
  private db: Database | null = null;
  private dbPath: string | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * 初始化数据库
   */
  async initialize(context: vscode.ExtensionContext): Promise<void> {
    if (this.db) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      // 配置 sql.js 的 wasm 路径
      const SQL = await initSqlJs({
        locateFile: (file: string) => {
          if (file === "sql-wasm.wasm") {
            const wasmPath = vscode.Uri.joinPath(
              context.extensionUri,
              "dist",
              "sql-wasm.wasm",
            );
            return wasmPath.fsPath;
          }
          return `https://sql.js.org/dist/${file}`;
        },
      });

      // 使用工作区的 .vscode/error_agent 目录存储数据库
      const workspaceUri = vscode.workspace.workspaceFolders?.[0].uri;
      if (!workspaceUri) {
        throw new Error("No workspace folder found");
      }

      const errorAgentDir = vscode.Uri.joinPath(workspaceUri, ".vscode", "error_agent");
      console.log(
        "[StorageManager] sqlite path:",
        errorAgentDir.fsPath,
      );
      await vscode.workspace.fs.createDirectory(errorAgentDir);

      this.dbPath = vscode.Uri.joinPath(errorAgentDir, "error-agent.db").fsPath;

      // 尝试加载现有数据库或创建新数据库
      try {
        const fileExists = await this.fileExists(this.dbPath);
        if (fileExists) {
          const fileData = await vscode.workspace.fs.readFile(
            vscode.Uri.file(this.dbPath),
          );
          this.db = new SQL.Database(fileData);
        } else {
          this.db = new SQL.Database();
        }

        // 执行 PRAGMA 设置
        this.db.run(PRAGMA_SQL);

        // 创建表
        this.db.run(CREATE_TABLES_SQL);

        await this.save();
      } catch (error) {
        logger.error("Failed to initialize database:", error);
        // 如果加载失败，创建新数据库
        this.db = new SQL.Database();
        this.db.run(PRAGMA_SQL);
        this.db.run(CREATE_TABLES_SQL);
        await this.save();
      }
    })();

    return this.initPromise;
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(path));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 保存数据库到磁盘
   */
  private async save(): Promise<void> {
    if (!this.db || !this.dbPath) {
      return;
    }

    const data = this.db.export();
    const buffer = Buffer.from(data);
    await vscode.workspace.fs.writeFile(vscode.Uri.file(this.dbPath), buffer);
  }

  /**
   * 获取数据库实例
   */
  private getDb(): Database {
    if (!this.db) {
      throw new Error("Database not initialized. Call initialize() first.");
    }
    return this.db;
  }

  // ==================== Session 操作 ====================

  /**
   * 创建新会话
   */
  async createSession(metadata?: SessionMetadata): Promise<Session> {
    const db = this.getDb();
    const now = Date.now();
    const id = uuidv4();
    const title = "新会话";

    db.run(
      `INSERT INTO sessions (id, title, created_at, updated_at, metadata) 
       VALUES (?, ?, ?, ?, ?)`,
      [id, title, now, now, metadata ? JSON.stringify(metadata) : null],
    );

    await this.save();

    return {
      id,
      title,
      createdAt: now,
      updatedAt: now,
      metadata: metadata || {},
    };
  }

  /**
   * 获取会话
   */
  async getSession(id: string): Promise<Session | null> {
    const db = this.getDb();
    const result = db.exec(
      "SELECT id, title, created_at, updated_at, metadata FROM sessions WHERE id = ?",
      [id],
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    const row = result[0].values[0];
    return {
      id: row[0] as string,
      title: row[1] as string,
      createdAt: row[2] as number,
      updatedAt: row[3] as number,
      metadata: row[4] ? JSON.parse(row[4] as string) : {},
    };
  }

  /**
   * 获取所有会话列表
   */
  async listSessions(): Promise<Session[]> {
    const db = this.getDb();
    const result = db.exec(
      "SELECT id, title, created_at, updated_at, metadata FROM sessions ORDER BY updated_at DESC",
    );

    if (result.length === 0) {
      return [];
    }

    return result[0].values.map((row) => ({
      id: row[0] as string,
      title: row[1] as string,
      createdAt: row[2] as number,
      updatedAt: row[3] as number,
      metadata: row[4] ? JSON.parse(row[4] as string) : {},
    }));
  }

  /**
   * 删除会话
   */
  async deleteSession(id: string): Promise<void> {
    const db = this.getDb();
    db.run("DELETE FROM sessions WHERE id = ?", [id]);
    await this.save();
  }

  /**
   * 更新会话标题
   */
  async updateSessionTitle(id: string, title: string): Promise<void> {
    const db = this.getDb();
    db.run("UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?", [
      title,
      Date.now(),
      id,
    ]);
    await this.save();
  }

  /**
   * 更新会话更新时间
   */
  async touchSession(id: string): Promise<void> {
    const db = this.getDb();
    db.run("UPDATE sessions SET updated_at = ? WHERE id = ?", [Date.now(), id]);
    await this.save();
  }

  // ==================== Message 操作 ====================

  /**
   * 添加消息
   */
  async addMessage(
    sessionId: string,
    messageInput: MessageInput,
  ): Promise<Message> {
    const db = this.getDb();
    const id = uuidv4();
    const now = Date.now();

    db.run(
      `INSERT INTO messages (id, session_id, role, content, tool_calls, tool_result, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        sessionId,
        messageInput.role,
        messageInput.content,
        messageInput.toolCalls ? JSON.stringify(messageInput.toolCalls) : null,
        messageInput.toolResult
          ? JSON.stringify(messageInput.toolResult)
          : null,
        now,
      ],
    );

    // 更新会话时间
    await this.touchSession(sessionId);
    await this.save();

    return {
      id,
      sessionId,
      role: messageInput.role,
      content: messageInput.content,
      createdAt: now,
      toolCalls: messageInput.toolCalls,
      toolResult: messageInput.toolResult,
    };
  }

  /**
   * 获取会话消息
   */
  async getMessages(sessionId: string, limit?: number): Promise<Message[]> {
    const db = this.getDb();
    const query = limit
      ? "SELECT id, session_id, role, content, tool_calls, tool_result, created_at FROM messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ?"
      : "SELECT id, session_id, role, content, tool_calls, tool_result, created_at FROM messages WHERE session_id = ? ORDER BY created_at ASC";

    const params = limit ? [sessionId, limit] : [sessionId];
    const result = db.exec(query, params);

    if (result.length === 0) {
      return [];
    }

    return result[0].values.map((row) => ({
      id: row[0] as string,
      sessionId: row[1] as string,
      role: row[2] as MessageRole,
      content: row[3] as string,
      toolCalls: row[4] ? JSON.parse(row[4] as string) : undefined,
      toolResult: row[5] ? JSON.parse(row[5] as string) : undefined,
      createdAt: row[6] as number,
    }));
  }

  /**
   * 删除会话的所有消息
   */
  async deleteMessages(sessionId: string): Promise<void> {
    const db = this.getDb();
    db.run("DELETE FROM messages WHERE session_id = ?", [sessionId]);
    await this.save();
  }

  // ==================== Todo 操作 ====================

  /**
   * 删除会话的所有 Todo
   */
  async deleteTodos(sessionId: string): Promise<void> {
    const db = this.getDb();
    db.run("DELETE FROM session_todos WHERE session_id = ?", [sessionId]);
    await this.save();
  }

  /**
   * 覆盖写入 Todo
   */
  async overwriteTodos(sessionId: string, todos: TodoInput[]): Promise<Todo[]> {
    const db = this.getDb();

    logger.info("[StorageManager.overwriteTodos] SessionId:", sessionId);
    logger.info(
      "[StorageManager.overwriteTodos] Todos input:",
      JSON.stringify(todos, null, 2),
    );

    try {
      // 先检查表结构
      const tableInfo = db.exec("PRAGMA table_info(session_todos)");
      logger.info(
        "[StorageManager.overwriteTodos] Table structure:",
        tableInfo,
      );

      // 1. 删除该 session 的所有现有 todo
      logger.info("[StorageManager.overwriteTodos] Deleting existing todos...");
      db.run("DELETE FROM session_todos WHERE session_id = ?", [sessionId]);

      // 2. 按 order_index 插入新 todo
      const now = Date.now();
      for (let i = 0; i < todos.length; i++) {
        const todo = todos[i];
        const id = uuidv4();
        const status = todo.status || "pending";

        logger.info(
          `[StorageManager.overwriteTodos] Inserting todo ${i + 1}/${todos.length}:`,
          {
            id,
            task: todo.task,
            status,
            orderIndex: i,
          },
        );

        db.run(
          `INSERT INTO session_todos (id, session_id, task, status, order_index)
           VALUES (?, ?, ?, ?, ?)`,
          [id, sessionId, todo.task, status, i],
        );
      }

      logger.info("[StorageManager.overwriteTodos] Saving database...");
      await this.save();

      logger.info("[StorageManager.overwriteTodos] Fetching result todos...");

      // 3. 返回完整的 todo 列表
      const result = await this.getTodos(sessionId);
      logger.info(
        "[StorageManager.overwriteTodos] Successfully wrote todos:",
        result.length,
      );
      return result;
    } catch (error: any) {
      logger.error("[StorageManager.overwriteTodos] ERROR:", error);
      logger.error("[StorageManager.overwriteTodos] Error stack:", error.stack);

      // 尝试获取更多信息
      try {
        const tables = db.exec(
          'SELECT name FROM sqlite_master WHERE type="table"',
        );
        logger.info(
          "[StorageManager.overwriteTodos] Available tables:",
          tables,
        );
      } catch (e) {
        logger.error(
          "[StorageManager.overwriteTables] Failed to get tables:",
          e,
        );
      }

      throw error;
    }
  }

  /**
   * 获取会话的 TODO 列表
   */
  async getTodos(sessionId: string): Promise<Todo[]> {
    const db = this.getDb();
    const result = db.exec(
      "SELECT id, session_id, task, status, order_index FROM session_todos WHERE session_id = ? ORDER BY order_index ASC",
      [sessionId],
    );

    if (result.length === 0) {
      return [];
    }

    return result[0].values.map((row) => ({
      id: row[0] as string,
      sessionId: row[1] as string,
      task: row[2] as string,
      status: row[3] as string,
      orderIndex: row[4] as number,
      createdAt: Date.now(), // orderIndex 已经提供了排序信息
    }));
  }
}

// 单例实例
let storageManagerInstance: StorageManager | null = null;

/**
 * 获取 StorageManager 单例
 */
export function getStorageManager(): StorageManager {
  if (!storageManagerInstance) {
    storageManagerInstance = new StorageManager();
  }
  return storageManagerInstance;
}

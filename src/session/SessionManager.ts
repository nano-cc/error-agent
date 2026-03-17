// Session Manager - 会话管理模块

import { StorageManager } from '../storage/StorageManager';
import { Session, SessionSummary, SessionMetadata } from '../types/session';

/**
 * 从消息内容生成会话标题（简化版：截取前 30 个字符）
 */
function generateTitleFromMessage(content: string): string {
  const trimmed = content.trim().replace(/\n/g, ' ');
  if (trimmed.length <= 30) {
    return trimmed;
  }
  return trimmed.substring(0, 30) + '...';
}

/**
 * Session Manager 类
 */
export class SessionManager {
  private activeSessionId: string | null = null;

  constructor(private storageManager: StorageManager) {}

  /**
   * 创建新会话
   */
  async createSession(metadata?: SessionMetadata): Promise<Session> {
    const session = await this.storageManager.createSession(metadata);
    return session;
  }

  /**
   * 获取会话详情
   */
  async getSession(sessionId: string): Promise<Session | null> {
    return this.storageManager.getSession(sessionId);
  }

  /**
   * 获取会话列表（最近 10 个）
   */
  async listSessions(limit: number = 10): Promise<SessionSummary[]> {
    const sessions = await this.storageManager.listSessions();
    return sessions.slice(0, limit).map(s => ({
      id: s.id,
      title: s.title,
      updatedAt: s.updatedAt,
    }));
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<void> {
    // 如果删除的是当前活跃会话，清除活跃状态
    if (this.activeSessionId === sessionId) {
      this.activeSessionId = null;
    }
    await this.storageManager.deleteSession(sessionId);
  }

  /**
   * 获取活跃会话 ID
   */
  getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  /**
   * 设置活跃会话
   */
  setActiveSession(sessionId: string): void {
    this.activeSessionId = sessionId;
  }

  /**
   * 清除活跃会话
   */
  clearActiveSession(): void {
    this.activeSessionId = null;
  }

  /**
   * 更新会话标题
   */
  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    await this.storageManager.updateSessionTitle(sessionId, title);
  }

  /**
   * 自动生成会话标题（基于第一条消息）
   */
  async autoGenerateTitle(sessionId: string, firstMessage: string): Promise<void> {
    const title = generateTitleFromMessage(firstMessage);
    await this.storageManager.updateSessionTitle(sessionId, title);
  }

  /**
   * 获取或创建活跃会话
   * 如果没有活跃会话，创建一个新会话
   */
  async getOrCreateActiveSession(): Promise<Session> {
    if (this.activeSessionId) {
      const session = await this.getSession(this.activeSessionId);
      if (session) {
        return session;
      }
    }

    // 创建新会话
    const session = await this.createSession();
    this.activeSessionId = session.id;
    return session;
  }
}

/**
 * Video Access Audit Service
 * 
 * Records immutable audit trails for compliance and security forensics on every
 * video session creation, playback review, snapshot fetch, and evidence export.
 */

import type { VideoAccessAudit } from "../domain/media-session.types.js";

export class VideoAccessAuditService {
  private auditLogs: VideoAccessAudit[] = [];

  async logAccess(record: Omit<VideoAccessAudit, "id">): Promise<VideoAccessAudit> {
    const log: VideoAccessAudit = {
      ...record,
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };
    this.auditLogs.push(log);
    return log;
  }

  async closeLiveSessionAudit(auditId: string): Promise<void> {
    const log = this.auditLogs.find((l) => l.id === auditId);
    if (log && !log.endedAt) {
      log.endedAt = new Date();
      log.durationSeconds = Math.max(1, Math.round((log.endedAt.getTime() - log.startedAt.getTime()) / 1000));
    }
  }

  async getLogs(filter?: { cameraId?: string; branchId?: string; userId?: string }): Promise<VideoAccessAudit[]> {
    return this.auditLogs.filter((l) => {
      if (filter?.cameraId && l.cameraId !== filter.cameraId) return false;
      if (filter?.branchId && l.branchId !== filter.branchId) return false;
      if (filter?.userId && l.userId !== filter.userId) return false;
      return true;
    });
  }

  clear() {
    this.auditLogs = [];
  }
}

export const videoAccessAuditService = new VideoAccessAuditService();

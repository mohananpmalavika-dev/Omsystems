/**
 * Synchronized Multi-Camera Playback & Investigation Service
 * Coordinates synchronized timeline seeking, frame alignment, and multi-angle playback.
 */

import { randomUUID } from 'node:crypto';

export interface SynchronizedCameraTrack {
  cameraId: string;
  cameraName: string;
  recorderId?: string;
  channel?: number;
  streamUrl?: string;
  hasCoverage: boolean;
  activeSegmentStart?: string;
  activeSegmentEnd?: string;
  currentOffsetMs: number;
}

export interface SynchronizedPlaybackSession {
  sessionId: string;
  tenantId: string;
  branchId: string;
  title: string;
  startTime: string;
  endTime: string;
  currentTime: string;
  playbackSpeed: number; // 0.5x, 1x, 2x, 4x, 8x, 16x
  state: 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'STOPPED';
  tracks: SynchronizedCameraTrack[];
  bookmarks: Array<{
    bookmarkId: string;
    timestamp: string;
    label: string;
    createdByUser: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSyncSessionInput {
  tenantId: string;
  branchId: string;
  title: string;
  cameraIds: string[];
  startTime: string;
  endTime: string;
}

export class SynchronizedPlaybackService {
  private sessions = new Map<string, SynchronizedPlaybackSession>();

  /**
   * Create a synchronized multi-camera playback session.
   */
  async createSession(input: CreateSyncSessionInput): Promise<SynchronizedPlaybackSession> {
    const sessionId = `sync-sess-${randomUUID().substring(0, 8)}`;
    const now = new Date().toISOString();

    const tracks: SynchronizedCameraTrack[] = input.cameraIds.map((cId, idx) => ({
      cameraId: cId,
      cameraName: `Camera ${cId}`,
      channel: idx + 1,
      hasCoverage: true,
      activeSegmentStart: input.startTime,
      activeSegmentEnd: input.endTime,
      currentOffsetMs: 0,
    }));

    const session: SynchronizedPlaybackSession = {
      sessionId,
      tenantId: input.tenantId,
      branchId: input.branchId,
      title: input.title,
      startTime: input.startTime,
      endTime: input.endTime,
      currentTime: input.startTime,
      playbackSpeed: 1.0,
      state: 'PAUSED',
      tracks,
      bookmarks: [],
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Seek/Scrub timeline cursor across all cameras synchronously.
   */
  async seek(sessionId: string, targetTimestamp: string): Promise<SynchronizedPlaybackSession> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Playback session ${sessionId} not found`);

    const targetMs = new Date(targetTimestamp).getTime();
    const startMs = new Date(session.startTime).getTime();
    const endMs = new Date(session.endTime).getTime();

    if (targetMs < startMs || targetMs > endMs) {
      throw new Error(`Target timestamp ${targetTimestamp} outside session bounds`);
    }

    session.currentTime = targetTimestamp;
    session.tracks = session.tracks.map((t) => ({
      ...t,
      currentOffsetMs: targetMs - startMs,
    }));
    session.updatedAt = new Date().toISOString();

    return session;
  }

  /**
   * Set playback speed and state.
   */
  async setPlaybackState(
    sessionId: string,
    state: 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'STOPPED',
    speed: number = 1.0
  ): Promise<SynchronizedPlaybackSession> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Playback session ${sessionId} not found`);

    session.state = state;
    session.playbackSpeed = speed;
    session.updatedAt = new Date().toISOString();

    return session;
  }

  /**
   * Add a synchronized bookmark on the timeline.
   */
  async addBookmark(
    sessionId: string,
    timestamp: string,
    label: string,
    createdByUser: string
  ): Promise<SynchronizedPlaybackSession> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Playback session ${sessionId} not found`);

    session.bookmarks.push({
      bookmarkId: `bm-${randomUUID().substring(0, 6)}`,
      timestamp,
      label,
      createdByUser,
    });
    session.updatedAt = new Date().toISOString();

    return session;
  }

  /**
   * Get session details.
   */
  async getSession(sessionId: string): Promise<SynchronizedPlaybackSession | null> {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * List active sessions for branch.
   */
  async listSessions(branchId?: string): Promise<SynchronizedPlaybackSession[]> {
    const all = Array.from(this.sessions.values());
    if (branchId) return all.filter((s) => s.branchId === branchId);
    return all;
  }
}

export const synchronizedPlaybackService = new SynchronizedPlaybackService();

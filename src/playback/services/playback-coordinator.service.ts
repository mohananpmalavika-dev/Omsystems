/**
 * Playback Coordinator Service
 * Manages Playback Sessions, Master Playback Clock, Multi-Camera Synchronization,
 * Frame Stepping, Reverse Playback, and Variable Speeds (0.25x to 64x).
 */

import { randomUUID } from 'node:crypto';
import {
  PlaybackSession,
  PlaybackCameraTrack,
  PlaybackSpeed,
  PlaybackDirection,
  PlaybackMode,
  PlaybackBookmark,
} from '../domain/playback.types.js';
import { SegmentResolverService } from './segment-resolver.service.js';
import { UnifiedTimelineService } from './unified-timeline.service.js';

export interface CreatePlaybackSessionInput {
  tenantId?: string;
  userId?: string;
  cameraIds: string[];
  startTime: string;
  mode?: PlaybackMode;
  speed?: PlaybackSpeed;
}

export class PlaybackCoordinatorService {
  private sessions = new Map<string, PlaybackSession>();
  public readonly segmentResolver = new SegmentResolverService();
  public readonly timelineService = new UnifiedTimelineService();

  /**
   * Create an authoritative playback session across 1 or more cameras.
   */
  createSession(input: CreatePlaybackSessionInput): PlaybackSession {
    if (!input.cameraIds.length || !Number.isFinite(Date.parse(input.startTime))) throw new Error('invalid_playback_session');
    const sessionId = `pb-sess-${randomUUID()}`;
    const now = new Date();
    for (const [id, session] of this.sessions) if (Date.parse(session.expiresAt) <= now.getTime()) this.sessions.delete(id);
    const mode = input.mode || (input.cameraIds.length > 1 ? 'SYNCHRONIZED' : 'SINGLE');

    const cameras: PlaybackCameraTrack[] = input.cameraIds.map((cId, idx) => ({
      cameraId: cId,
      cameraName: `Camera ${cId}`,
      channel: idx + 1,
      requestedTime: input.startTime,
      actualTime: undefined,
      streamUrl: this.segmentResolver.segmentCount(cId) > 0 ? `/api/v1/playback/stream/${sessionId}/${cId}` : undefined,
      driftMs: 0,
      status: this.segmentResolver.segmentCount(cId) > 0 ? 'BUFFERING' : 'NO_RECORDING',
    }));

    const session: PlaybackSession = {
      id: sessionId,
      tenantId: input.tenantId || '',
      userId: input.userId || '',
      cameras,
      mode,
      currentTime: input.startTime,
      speed: input.speed || 1.0,
      direction: 'FORWARD',
      state: 'PAUSED',
      masterCameraId: cameras[0]?.cameraId,
      resolvedSegmentsCount: input.cameraIds.reduce((total, id) => total + this.segmentResolver.segmentCount(id), 0),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 3600_000).toISOString(),
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string): PlaybackSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session && Date.parse(session.expiresAt) <= Date.now()) { this.sessions.delete(sessionId); return undefined; }
    return session;
  }

  /**
   * Play / Resume playback.
   */
  play(sessionId: string): PlaybackSession {
    const session = this.getSession(sessionId);
    if (!session) throw new Error(`Playback session ${sessionId} not found`);
    session.state = 'PLAYING';
    return session;
  }

  /**
   * Pause playback.
   */
  pause(sessionId: string): PlaybackSession {
    const session = this.getSession(sessionId);
    if (!session) throw new Error(`Playback session ${sessionId} not found`);
    session.state = 'PAUSED';
    return session;
  }

  /**
   * Seek / Go-to-Time across all synchronized cameras with keyframe resolution.
   */
  seek(sessionId: string, targetTimestamp: string): PlaybackSession {
    const session = this.getSession(sessionId);
    if (!session) throw new Error(`Playback session ${sessionId} not found`);

    const targetDate = new Date(targetTimestamp);
    if (!Number.isFinite(targetDate.getTime())) throw new Error('invalid_playback_timestamp');
    const tracks = session.cameras.map(cam => {
      try {
        const seekRes = this.segmentResolver.resolveSeek(cam.cameraId, targetDate);
        return { ...cam, requestedTime: targetDate.toISOString(), actualTime: new Date(seekRes.targetTimestampMs).toISOString(),
          streamUrl: `/api/v1/playback/stream/${session.id}/${cam.cameraId}`, driftMs: 0, status: 'READY' as const };
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (!message.startsWith('recording_segment_not_found:') && message !== 'recording_keyframe_unavailable') throw error;
        return { ...cam, requestedTime: targetDate.toISOString(), actualTime: undefined, streamUrl: undefined,
          status: message === 'recording_keyframe_unavailable' ? 'ERROR' as const : 'NO_RECORDING' as const };
      }
    });
    session.currentTime = targetDate.toISOString();
    session.cameras = tracks;
    session.state = 'PAUSED';
    return session;
  }

  /**
   * Set playback speed (0.25x to 64x).
   */
  setSpeed(sessionId: string, speed: PlaybackSpeed): PlaybackSession {
    const session = this.getSession(sessionId);
    if (!session) throw new Error(`Playback session ${sessionId} not found`);
    session.speed = speed;
    return session;
  }

  /**
   * Set playback direction (FORWARD / REVERSE).
   */
  setDirection(sessionId: string, direction: PlaybackDirection): PlaybackSession {
    const session = this.getSession(sessionId);
    if (!session) throw new Error(`Playback session ${sessionId} not found`);
    session.direction = direction;
    return session;
  }

  /**
   * Step single frame forward (+40ms for 25 FPS).
   */
  stepFrameForward(sessionId: string): PlaybackSession {
    const session = this.getSession(sessionId);
    if (!session) throw new Error(`Playback session ${sessionId} not found`);

    const nextTime = new Date(Date.parse(session.currentTime) + 40).toISOString();
    return this.seek(sessionId, nextTime);
  }

  /**
   * Step single frame backward (-40ms decoded from prior keyframe).
   */
  stepFrameBackward(sessionId: string): PlaybackSession {
    const session = this.getSession(sessionId);
    if (!session) throw new Error(`Playback session ${sessionId} not found`);

    const prevTime = new Date(Math.max(0, Date.parse(session.currentTime) - 40)).toISOString();
    return this.seek(sessionId, prevTime);
  }

  /**
   * Jump to Next / Previous Timeline Event (Motion, Person, Vehicle, Door, Alert).
   */
  jumpToEvent(sessionId: string, direction: 'NEXT' | 'PREVIOUS', types?: string[]): PlaybackSession {
    const session = this.getSession(sessionId);
    if (!session) throw new Error(`Playback session ${sessionId} not found`);

    const masterCam = session.masterCameraId || session.cameras[0]?.cameraId || 'CAM-14';
    const targetEvent = this.timelineService.findAdjacentEvent(masterCam, session.currentTime, direction, types);

    if (targetEvent) {
      return this.seek(sessionId, targetEvent.startTime);
    }

    return session;
  }

  /**
   * Add / Save Bookmark at current playback timestamp.
   */
  addBookmark(sessionId: string, title: string, description?: string): PlaybackBookmark {
    const session = this.getSession(sessionId);
    if (!session) throw new Error(`Playback session ${sessionId} not found`);

    const bookmark: PlaybackBookmark = {
      id: `bm-${randomUUID().slice(0, 8)}`,
      tenantId: session.tenantId,
      cameraId: session.masterCameraId || session.cameras[0]?.cameraId || 'CAM-14',
      timestamp: session.currentTime,
      title,
      description,
      createdBy: session.userId,
      createdAt: new Date().toISOString(),
    };

    this.timelineService.addBookmark(bookmark);
    return bookmark;
  }

  /**
   * Master Clock Synchronization tick across cameras.
   */
  syncTick(sessionId: string, elapsedMs: number = 1000, measuredDrifts?: Record<string, number>): { masterTime: string; cameraDrifts: Record<string, number> } {
    const session = this.getSession(sessionId);
    if (!session) throw new Error(`Playback session ${sessionId} not found`);

    const multiplier = session.direction === 'FORWARD' ? session.speed : -session.speed;
    const curMs = new Date(session.currentTime).getTime();
    const updatedMs = curMs + elapsedMs * multiplier;
    session.currentTime = new Date(updatedMs).toISOString();

    const cameraDrifts: Record<string, number> = {};

    for (const cam of session.cameras) {
      const drift = measuredDrifts?.[cam.cameraId] ?? 0;
      cam.driftMs = drift;
      cam.actualTime = new Date(updatedMs + drift).toISOString();
      cameraDrifts[cam.cameraId] = drift;
    }

    return {
      masterTime: session.currentTime,
      cameraDrifts,
    };
  }
}

export const playbackCoordinator = new PlaybackCoordinatorService();

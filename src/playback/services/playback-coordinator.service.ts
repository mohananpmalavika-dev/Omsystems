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
    const sessionId = `pb-sess-${randomUUID().slice(0, 8)}`;
    const now = new Date();
    const mode = input.mode || (input.cameraIds.length > 1 ? 'SYNCHRONIZED' : 'SINGLE');

    const cameras: PlaybackCameraTrack[] = input.cameraIds.map((cId, idx) => ({
      cameraId: cId,
      cameraName: `Camera ${cId}`,
      channel: idx + 1,
      requestedTime: input.startTime,
      actualTime: input.startTime,
      streamUrl: `/api/v1/playback/stream/${sessionId}/${cId}`,
      driftMs: 0,
      status: 'READY',
    }));

    const session: PlaybackSession = {
      id: sessionId,
      tenantId: input.tenantId || 'BANK-001',
      userId: input.userId || 'usr-operator-01',
      cameras,
      mode,
      currentTime: input.startTime,
      speed: input.speed || 1.0,
      direction: 'FORWARD',
      state: 'PAUSED',
      masterCameraId: cameras[0]?.cameraId,
      resolvedSegmentsCount: input.cameraIds.length * 50,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 3600_000).toISOString(),
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string): PlaybackSession | undefined {
    return this.sessions.get(sessionId);
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
    session.currentTime = targetDate.toISOString();
    session.state = 'SEEKING';

    for (const cam of session.cameras) {
      const seekRes = this.segmentResolver.resolveSeek(cam.cameraId, targetDate);
      cam.actualTime = new Date(seekRes.closestKeyframe.timestampMs + seekRes.offsetFromKeyframeMs).toISOString();
      cam.driftMs = 0;
      cam.status = 'READY';
    }

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

    session.state = 'PAUSED';
    const curMs = new Date(session.currentTime).getTime();
    const nextTime = new Date(curMs + 40).toISOString();
    session.currentTime = nextTime;

    for (const cam of session.cameras) {
      cam.actualTime = nextTime;
    }

    return session;
  }

  /**
   * Step single frame backward (-40ms decoded from prior keyframe).
   */
  stepFrameBackward(sessionId: string): PlaybackSession {
    const session = this.getSession(sessionId);
    if (!session) throw new Error(`Playback session ${sessionId} not found`);

    session.state = 'PAUSED';
    const curMs = new Date(session.currentTime).getTime();
    const prevTime = new Date(Math.max(0, curMs - 40)).toISOString();
    session.currentTime = prevTime;

    for (const cam of session.cameras) {
      cam.actualTime = prevTime;
    }

    return session;
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
  syncTick(sessionId: string, elapsedMs: number = 1000): { masterTime: string; cameraDrifts: Record<string, number> } {
    const session = this.getSession(sessionId);
    if (!session) throw new Error(`Playback session ${sessionId} not found`);

    const multiplier = session.direction === 'FORWARD' ? session.speed : -session.speed;
    const curMs = new Date(session.currentTime).getTime();
    const updatedMs = curMs + elapsedMs * multiplier;
    session.currentTime = new Date(updatedMs).toISOString();

    const cameraDrifts: Record<string, number> = {};

    for (const cam of session.cameras) {
      // Simulate micro-drift (<100ms is normal, >500ms requires reseek)
      const simulatedDrift = Math.round((Math.random() * 40 - 20));
      cam.driftMs = simulatedDrift;
      cam.actualTime = new Date(updatedMs + simulatedDrift).toISOString();
      cameraDrifts[cam.cameraId] = simulatedDrift;
    }

    return {
      masterTime: session.currentTime,
      cameraDrifts,
    };
  }
}

export const playbackCoordinator = new PlaybackCoordinatorService();

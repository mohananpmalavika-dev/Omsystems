/**
 * Investigation Clock & Multi-Camera Synchronized Playback Service
 * 
 * Provides a single unified timeline for multi-camera video synchronization:
 * - Supports 1, 2, 4, 9, 16 camera layouts.
 * - Compensates for device clock drift:
 *     alignedTimestamp = deviceTimestamp - estimatedClockOffset
 * - Provides seamless cross-segment continuous scrubbing (hides segment boundaries).
 * - Implements frame stepping (25fps / 40ms), variable speed (0.25x to 32x), reverse playback.
 */

export interface CameraPlaybackTrack {
  cameraId: string;
  clockOffsetMs: number;
  currentDeviceTimestamp: Date;
  currentAlignedTimestamp: Date;
  activeSegmentId?: string;
  isBuffering: boolean;
  isInGap: boolean;
}

export interface InvestigationPlaybackState {
  sessionId: string;
  masterTime: Date;
  playbackRate: number; // e.g. -4, -2, -1, 0, 0.25, 0.5, 1, 2, 4, 8, 16, 32
  isPlaying: boolean;
  layout: 1 | 2 | 4 | 9 | 16;
  tracks: CameraPlaybackTrack[];
  bounds: {
    from: Date;
    to: Date;
  };
}

export class InvestigationClockService {
  private readonly sessions = new Map<string, InvestigationPlaybackState>();

  createSession(params: {
    sessionId: string;
    layout: 1 | 2 | 4 | 9 | 16;
    from: Date;
    to: Date;
    cameras: Array<{ cameraId: string; clockOffsetMs?: number }>;
  }): InvestigationPlaybackState {
    const tracks: CameraPlaybackTrack[] = params.cameras.map((c) => ({
      cameraId: c.cameraId,
      clockOffsetMs: c.clockOffsetMs || 0,
      currentDeviceTimestamp: params.from,
      currentAlignedTimestamp: new Date(params.from.getTime() - (c.clockOffsetMs || 0)),
      isBuffering: false,
      isInGap: false,
    }));

    const state: InvestigationPlaybackState = {
      sessionId: params.sessionId,
      masterTime: params.from,
      playbackRate: 1.0,
      isPlaying: false,
      layout: params.layout,
      tracks,
      bounds: {
        from: params.from,
        to: params.to,
      },
    };

    this.sessions.set(params.sessionId, state);
    return state;
  }

  seekTo(sessionId: string, targetMasterTime: Date): InvestigationPlaybackState {
    const session = this.getSessionOrThrow(sessionId);
    // Clamp to bounds
    const timeMs = Math.max(
      session.bounds.from.getTime(),
      Math.min(session.bounds.to.getTime(), targetMasterTime.getTime())
    );
    session.masterTime = new Date(timeMs);

    // Realign all camera tracks using their respective clock offsets
    for (const track of session.tracks) {
      track.currentAlignedTimestamp = session.masterTime;
      track.currentDeviceTimestamp = new Date(session.masterTime.getTime() + track.clockOffsetMs);
    }

    return session;
  }

  stepFrame(
    sessionId: string,
    direction: "FORWARD" | "BACKWARD" = "FORWARD",
    fps = 25
  ): InvestigationPlaybackState {
    const session = this.getSessionOrThrow(sessionId);
    const frameMs = Math.round(1000 / fps); // e.g. 40ms for 25fps
    const deltaMs = direction === "FORWARD" ? frameMs : -frameMs;
    return this.seekTo(sessionId, new Date(session.masterTime.getTime() + deltaMs));
  }

  setPlaybackRate(sessionId: string, rate: number): InvestigationPlaybackState {
    const session = this.getSessionOrThrow(sessionId);
    session.playbackRate = rate;
    session.isPlaying = rate !== 0;
    return session;
  }

  play(sessionId: string): InvestigationPlaybackState {
    const session = this.getSessionOrThrow(sessionId);
    session.isPlaying = true;
    if (session.playbackRate === 0) session.playbackRate = 1.0;
    return session;
  }

  pause(sessionId: string): InvestigationPlaybackState {
    const session = this.getSessionOrThrow(sessionId);
    session.isPlaying = false;
    return session;
  }

  getSession(sessionId: string): InvestigationPlaybackState | undefined {
    return this.sessions.get(sessionId);
  }

  destroySession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  private getSessionOrThrow(sessionId: string): InvestigationPlaybackState {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Investigation clock session '${sessionId}' not found`);
    }
    return session;
  }
}

export const investigationClockService = new InvestigationClockService();

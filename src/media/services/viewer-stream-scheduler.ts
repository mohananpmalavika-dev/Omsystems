import type {
  ViewerCameraPriority,
  ViewerTelemetry,
} from "../domain/distributed-lease.types.js";

export interface ScheduledViewerCamera {
  cameraId: string;
  streamProfile: "main" | "sub" | "preview";
  playbackMode: "live_video" | "low_fps_preview" | "deferred_snapshot";
  priorityClass: "CRITICAL_ALERT" | "USER_SELECTED" | "VISIBLE_ACTIVE" | "BACKGROUND_DEFERRED";
  score: number;
  tileIndex: number;
  isPaused: boolean;
}

export interface ViewerGridState {
  sessionId: string;
  gridRows: number;
  gridCols: number;
  visibleCameraIds: string[];
  focusedCameraId?: string;
  activeAlarmCameraIds: string[];
}

export class ViewerStreamScheduler {
  // Ephemeral, browser-specific local state (never needs Redis)
  private readonly cameraPriorities = new Map<string, ViewerCameraPriority>();
  private readonly decoderSlots = new Map<string, number>();

  /**
   * Optimize visible cameras for a single viewer session / browser window based on
   * client hardware telemetry and grid geometry.
   */
  calculateViewerSchedule(
    cameras: { id: string; name?: string; isOnline?: boolean }[],
    grid: ViewerGridState,
    telemetry?: ViewerTelemetry,
  ): Map<string, ScheduledViewerCamera> {
    const maxDecoders = telemetry?.maxDecoders || 16;
    const isHardwareDecode = telemetry?.hardwareDecode ?? true;
    const activeAlarms = new Set(grid.activeAlarmCameraIds || []);
    const visibleSet = new Set(grid.visibleCameraIds || []);
    const totalTiles = grid.gridRows * grid.gridCols || 16;

    // 1. Score and classify all cameras for this viewer
    const scored = cameras.map((camera, index) => {
      let score = 0;
      let priorityClass: ViewerCameraPriority["priorityClass"] = "BACKGROUND_DEFERRED";
      let desiredProfile: ViewerCameraPriority["desiredProfile"] = "sub";

      const isAlert = activeAlarms.has(camera.id);
      const isSelected = grid.focusedCameraId === camera.id;
      const isVisible = visibleSet.has(camera.id) || index < totalTiles;

      if (isAlert) {
        score = 1000;
        priorityClass = "CRITICAL_ALERT";
        desiredProfile = "main";
      } else if (isSelected) {
        score = 500;
        priorityClass = "USER_SELECTED";
        desiredProfile = totalTiles <= 4 ? "main" : "sub";
      } else if (isVisible) {
        score = 100 - index;
        priorityClass = "VISIBLE_ACTIVE";
        desiredProfile = totalTiles <= 4 ? "main" : "sub";
      } else {
        score = 10;
        priorityClass = "BACKGROUND_DEFERRED";
        desiredProfile = "preview";
      }

      return {
        cameraId: camera.id,
        score,
        priorityClass,
        desiredProfile,
        tileIndex: index,
        isOnline: camera.isOnline !== false,
      };
    });

    // Sort by priority score descending
    scored.sort((a, b) => b.score - a.score);

    // 2. Allocate browser hardware decoder slots
    const result = new Map<string, ScheduledViewerCamera>();
    let usedDecoderSlots = 0;

    for (const item of scored) {
      if (!item.isOnline) {
        result.set(item.cameraId, {
          cameraId: item.cameraId,
          streamProfile: "preview",
          playbackMode: "deferred_snapshot",
          priorityClass: item.priorityClass,
          score: item.score,
          tileIndex: item.tileIndex,
          isPaused: true,
        });
        continue;
      }

      // Check if decoder budget permits live stream
      const canPlayLive = usedDecoderSlots < maxDecoders;
      if (canPlayLive) {
        usedDecoderSlots++;
        result.set(item.cameraId, {
          cameraId: item.cameraId,
          streamProfile: item.desiredProfile,
          playbackMode: "live_video",
          priorityClass: item.priorityClass,
          score: item.score,
          tileIndex: item.tileIndex,
          isPaused: false,
        });
      } else {
        // Fallback to low FPS snapshot / deferred mode to save client CPU/GPU
        result.set(item.cameraId, {
          cameraId: item.cameraId,
          streamProfile: "preview",
          playbackMode: "low_fps_preview",
          priorityClass: item.priorityClass,
          score: item.score,
          tileIndex: item.tileIndex,
          isPaused: false,
        });
      }
    }

    return result;
  }
}

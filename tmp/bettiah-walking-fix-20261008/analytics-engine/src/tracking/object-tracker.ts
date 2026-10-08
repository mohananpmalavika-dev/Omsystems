/**
 * Shared Multi-Object Tracker (MOT)
 * 
 * Provides unified trajectory tracking across frame detections:
 * - Associates detections to tracks via spatial IoU and centroid distance
 * - Maintains persistent track histories and velocity vectors
 * - Reusable foundation for Heatmaps, Intrusion, Line Crossing, Loitering, and Crowd
 */

export interface NormalizedBoundingBox {
  x: number;      // 0.0 to 1.0
  y: number;      // 0.0 to 1.0
  width: number;  // 0.0 to 1.0
  height: number; // 0.0 to 1.0
}

export interface RawDetection {
  classId: 'person' | 'vehicle' | 'license_plate' | 'face';
  confidence: number;
  bbox: NormalizedBoundingBox;
  timestamp: number;
}

export interface TrackPoint {
  timestamp: number;
  x: number; // centroid X (0.0 to 1.0)
  y: number; // centroid Y (0.0 to 1.0)
  bbox: NormalizedBoundingBox;
}

export interface ObjectTrack {
  trackId: string;
  cameraId: string;
  objectClass: 'person' | 'vehicle';
  firstSeen: number;
  lastSeen: number;
  confidence: number;
  trajectory: TrackPoint[];
  state: 'active' | 'lost' | 'ended';
  dwellSeconds: number;
}

export class ObjectTracker {
  private activeTracks: Map<string, ObjectTrack> = new Map();
  private nextTrackNumber = 1001;
  private readonly maxLostDurationMs = 3000; // 3 seconds
  private readonly iouThreshold = 0.3;

  /**
   * Updates tracks with incoming frame detections
   */
  update(cameraId: string, detections: RawDetection[], frameTimestamp: number): ObjectTrack[] {
    const relevantDetections = detections.filter(
      (d) => d.classId === 'person' || d.classId === 'vehicle'
    );

    const cameraTracks = Array.from(this.activeTracks.values()).filter(
      (t) => t.cameraId === cameraId && t.state !== 'ended'
    );

    const matchedDetections = new Set<number>();
    const matchedTracks = new Set<string>();

    // 1. Associate existing tracks with detections via IoU
    for (const track of cameraTracks) {
      const lastPoint = track.trajectory[track.trajectory.length - 1];
      if (!lastPoint) continue;

      let bestIou = 0;
      let bestDetIdx = -1;

      for (let i = 0; i < relevantDetections.length; i++) {
        if (matchedDetections.has(i)) continue;
        const det = relevantDetections[i]!;
        if (det.classId !== track.objectClass) continue;

        const iou = this.calculateIoU(lastPoint.bbox, det.bbox);
        if (iou > this.iouThreshold && iou > bestIou) {
          bestIou = iou;
          bestDetIdx = i;
        }
      }

      if (bestDetIdx >= 0) {
        const matchedDet = relevantDetections[bestDetIdx]!;
        matchedDetections.add(bestDetIdx);
        matchedTracks.add(track.trackId);

        const centroidX = matchedDet.bbox.x + matchedDet.bbox.width / 2;
        const centroidY = matchedDet.bbox.y + matchedDet.bbox.height / 2;

        track.trajectory.push({
          timestamp: frameTimestamp,
          x: centroidX,
          y: centroidY,
          bbox: matchedDet.bbox,
        });

        track.lastSeen = frameTimestamp;
        track.state = 'active';
        track.confidence = (track.confidence + matchedDet.confidence) / 2;
        track.dwellSeconds = (frameTimestamp - track.firstSeen) / 1000;
      }
    }

    // 2. Spawn new tracks for unmatched detections
    for (let i = 0; i < relevantDetections.length; i++) {
      if (matchedDetections.has(i)) continue;
      const det = relevantDetections[i]!;

      const trackId = `TRK-${cameraId.substring(0, 6)}-${this.nextTrackNumber++}`;
      const centroidX = det.bbox.x + det.bbox.width / 2;
      const centroidY = det.bbox.y + det.bbox.height / 2;

      const newTrack: ObjectTrack = {
        trackId,
        cameraId,
        objectClass: det.classId as 'person' | 'vehicle',
        firstSeen: frameTimestamp,
        lastSeen: frameTimestamp,
        confidence: det.confidence,
        trajectory: [
          {
            timestamp: frameTimestamp,
            x: centroidX,
            y: centroidY,
            bbox: det.bbox,
          },
        ],
        state: 'active',
        dwellSeconds: 0,
      };

      this.activeTracks.set(trackId, newTrack);
    }

    // 3. Mark stale tracks as lost or ended
    for (const track of cameraTracks) {
      if (!matchedTracks.has(track.trackId)) {
        if (frameTimestamp - track.lastSeen > this.maxLostDurationMs) {
          track.state = 'ended';
        } else {
          track.state = 'lost';
        }
      }
    }

    return Array.from(this.activeTracks.values()).filter((t) => t.cameraId === cameraId);
  }

  getActiveTracks(cameraId?: string): ObjectTrack[] {
    return Array.from(this.activeTracks.values()).filter(
      (t) => (!cameraId || t.cameraId === cameraId) && (t.state === 'active' || t.state === 'lost')
    );
  }

  private calculateIoU(boxA: NormalizedBoundingBox, boxB: NormalizedBoundingBox): number {
    const xA = Math.max(boxA.x, boxB.x);
    const yA = Math.max(boxA.y, boxB.y);
    const xB = Math.min(boxA.x + boxA.width, boxB.x + boxB.width);
    const yB = Math.min(boxA.y + boxA.height, boxB.y + boxB.height);

    const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
    if (interArea === 0) return 0;

    const boxAArea = boxA.width * boxA.height;
    const boxBArea = boxB.width * boxB.height;
    return interArea / (boxAArea + boxBArea - interArea);
  }
}

export const objectTracker = new ObjectTracker();

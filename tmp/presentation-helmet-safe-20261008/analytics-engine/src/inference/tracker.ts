import type { InferenceObject } from "../detectors/base-detector.js";

export interface TrackerOptions {
  maxLost?: number; // how many update cycles to allow a track to be lost
  iouThreshold?: number; // IoU threshold for matching
}

interface InternalTrack {
  trackId: string;
  bbox: { x: number; y: number; width: number; height: number };
  lastSeen: Date;
  firstSeen: Date;
  hits: number;
  lost: number;
  objectType: string;
  positions: Array<{ x: number; y: number; timestamp: Date; boundingBox: { x: number; y: number; width: number; height: number }; confidence: number }>;
}

export class Tracker {
  private tracks = new Map<string, InternalTrack>();
  private nextId = 1;
  private readonly maxLost: number;
  private readonly iouThreshold: number;

  constructor(opts: TrackerOptions = {}) {
    this.maxLost = opts.maxLost ?? 3;
    this.iouThreshold = opts.iouThreshold ?? 0.3;
  }

  /**
   * Update tracker with current detections and return detections annotated with trackId
   */
  update(detections: InferenceObject[], timestamp: Date, objectType: string = "generic"): InferenceObject[] {
    // Build list of unmatched tracks and detections
    const availableTrackIds = Array.from(this.tracks.keys());
    const unmatchedDetections: number[] = detections.map((_, i) => i);

    // Compute IoU matrix between existing tracks of matching objectType and new detections
    type Pair = { trackId: string; detIndex: number; iou: number };
    const pairs: Pair[] = [];

    for (const trackId of availableTrackIds) {
      const track = this.tracks.get(trackId)!;
      if (track.objectType !== objectType) continue;
      // Skip tracks that are stale beyond maxLost? We'll still allow matching; lost count handled later
      for (let i = 0; i < detections.length; i++) {
        const det = detections[i];
        const iou = this.calculateIoU(track.bbox, det.boundingBox);
        if (iou >= this.iouThreshold) {
          pairs.push({ trackId, detIndex: i, iou });
        }
      }
    }

    // Greedy matching: sort pairs by descending IoU and match first-come
    pairs.sort((a, b) => b.iou - a.iou);
    const assignedTracks = new Set<string>();
    const assignedDetections = new Set<number>();

    for (const p of pairs) {
      if (assignedTracks.has(p.trackId) || assignedDetections.has(p.detIndex)) continue;
      // assign
      assignedTracks.add(p.trackId);
      assignedDetections.add(p.detIndex);
      // remove from unmatchedDetections
      const idx = unmatchedDetections.indexOf(p.detIndex);
      if (idx !== -1) unmatchedDetections.splice(idx, 1);

      const track = this.tracks.get(p.trackId)!;
      const det = detections[p.detIndex];
      // update track
      track.lastSeen = timestamp;
      track.hits += 1;
      track.lost = 0;
      track.bbox = det.boundingBox;
      track.positions.push({
        x: det.boundingBox.x + det.boundingBox.width / 2,
        y: det.boundingBox.y + det.boundingBox.height / 2,
        timestamp,
        boundingBox: det.boundingBox,
        confidence: det.confidence
      });
      // annotate detection
      (det as any).trackId = track.trackId;
    }

    // Create new tracks for unmatched detections
    for (const di of unmatchedDetections) {
      const det = detections[di];
      const trackId = `${objectType}_${this.nextId++}`;
      const newTrack: InternalTrack = {
        trackId,
        bbox: det.boundingBox,
        lastSeen: timestamp,
        firstSeen: timestamp,
        hits: 1,
        lost: 0,
        objectType,
        positions: [{
          x: det.boundingBox.x + det.boundingBox.width / 2,
          y: det.boundingBox.y + det.boundingBox.height / 2,
          timestamp,
          boundingBox: det.boundingBox,
          confidence: det.confidence
        }]
      };
      this.tracks.set(trackId, newTrack);
      (det as any).trackId = trackId;
    }

    // Increment lost counter for unmatched tracks and remove stale ones
    const toRemove: string[] = [];
    for (const [trackId, track] of this.tracks.entries()) {
      // If this track was assigned in this update, continue
      if (assignedTracks.has(trackId)) continue;
      // Only consider tracks for this objectType
      if (track.objectType !== objectType) continue;
      track.lost += 1;
      if (track.lost > this.maxLost) {
        toRemove.push(trackId);
      }
    }

    for (const tid of toRemove) {
      this.tracks.delete(tid);
    }

    // Return detections (with trackId assigned) in same order
    return detections.map(d => d);
  }

  getActiveTracks(objectType?: string) {
    const arr = Array.from(this.tracks.values());
    if (objectType) return arr.filter(t => t.objectType === objectType);
    return arr;
  }

  private calculateIoU(
    box1: { x: number; y: number; width: number; height: number },
    box2: { x: number; y: number; width: number; height: number }
  ) {
    const x1 = Math.max(box1.x, box2.x);
    const y1 = Math.max(box1.y, box2.y);
    const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
    const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);

    if (x2 < x1 || y2 < y1) return 0;

    const intersection = (x2 - x1) * (y2 - y1);
    const area1 = box1.width * box1.height;
    const area2 = box2.width * box2.height;
    const union = area1 + area2 - intersection;

    return union > 0 ? intersection / union : 0;
  }
}

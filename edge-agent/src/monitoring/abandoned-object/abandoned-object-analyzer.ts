/**
 * Edge-Agent Abandoned & Unattended Object Statistical Frame Analyzer
 * 
 * High-throughput, low-latency edge-side static foreground blob tracking for decoded video streams.
 */

export interface EdgeTrackedBlob {
  id: string;
  bbox: { x: number; y: number; width: number; height: number };
  centroid: { x: number; y: number };
  stationarySince: Date;
  consecutiveFrames: number;
  dwellTimeSeconds: number;
  isStationary: boolean;
  alerted: boolean;
  classification: 'backpack' | 'suitcase' | 'box' | 'parcel' | 'handbag' | 'generic_blob';
}

export interface EdgeAbandonedResult {
  hasUnattendedObjects: boolean;
  activeBlobsCount: number;
  alerts: Array<{
    blobId: string;
    classification: string;
    severity: 'P1' | 'P2' | 'P3' | 'P4';
    confidence: number;
    bbox: { x: number; y: number; width: number; height: number };
    dwellTimeSeconds: number;
  }>;
}

export class EdgeAbandonedObjectAnalyzer {
  private cameraBlobs = new Map<string, Map<string, EdgeTrackedBlob>>();
  private backgroundModels = new Map<string, Uint8Array>();

  constructor(
    private readonly stationaryLimitPx = 15.0,
    private readonly unattendedThresholdSec = 45,
    private readonly abandonedThresholdSec = 120,
    private readonly debounceFrames = 3
  ) {}

  public analyze(
    cameraId: string,
    frame: Uint8Array,
    width: number,
    height: number,
    channels = 3,
    timestamp = new Date()
  ): EdgeAbandonedResult {
    const pixels = width * height;
    const luma = new Uint8Array(pixels);

    for (let i = 0; i < pixels; i++) {
      const idx = i * channels;
      const r = frame[idx] ?? 0;
      const g = frame[idx + 1] ?? 0;
      const b = frame[idx + 2] ?? 0;
      luma[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }

    let bg = this.backgroundModels.get(cameraId);
    if (!bg || bg.length !== pixels) {
      this.backgroundModels.set(cameraId, new Uint8Array(luma));
      return {
        hasUnattendedObjects: false,
        activeBlobsCount: 0,
        alerts: [],
      };
    }

    // Grid block difference (8x8 blocks)
    const gridSize = 8;
    const cols = Math.floor(width / gridSize);
    const rows = Math.floor(height / gridSize);
    const activeBlocks: Array<{ gx: number; gy: number }> = [];

    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        let diffs = 0;
        const startX = gx * gridSize;
        const startY = gy * gridSize;

        for (let y = startY; y < startY + gridSize && y < height; y++) {
          for (let x = startX; x < startX + gridSize && x < width; x++) {
            const idx = y * width + x;
            if (Math.abs((luma[idx] ?? 0) - (bg[idx] ?? 0)) > 26) {
              diffs++;
            }
          }
        }

        if (diffs >= (gridSize * gridSize) * 0.28) {
          activeBlocks.push({ gx, gy });
        }
      }
    }

    // Slow background adaptation
    for (let i = 0; i < pixels; i++) {
      if (Math.abs((luma[i] ?? 0) - (bg[i] ?? 0)) <= 26) {
        bg[i] = Math.round((bg[i] ?? 0) * 0.95 + (luma[i] ?? 0) * 0.05);
      }
    }

    let blobsMap = this.cameraBlobs.get(cameraId);
    if (!blobsMap) {
      blobsMap = new Map();
      this.cameraBlobs.set(cameraId, blobsMap);
    }

    const alerts: EdgeAbandonedResult['alerts'] = [];

    if (activeBlocks.length > 0) {
      let minGx = activeBlocks[0]!.gx;
      let maxGx = activeBlocks[0]!.gx;
      let minGy = activeBlocks[0]!.gy;
      let maxGy = activeBlocks[0]!.gy;

      for (const b of activeBlocks) {
        minGx = Math.min(minGx, b.gx);
        maxGx = Math.max(maxGx, b.gx);
        minGy = Math.min(minGy, b.gy);
        maxGy = Math.max(maxGy, b.gy);
      }

      const bbox = {
        x: minGx * gridSize,
        y: minGy * gridSize,
        width: (maxGx - minGx + 1) * gridSize,
        height: (maxGy - minGy + 1) * gridSize,
      };

      const centroid = {
        x: bbox.x + bbox.width / 2,
        y: bbox.y + bbox.height / 2,
      };

      let matched: EdgeTrackedBlob | null = null;
      for (const b of blobsMap.values()) {
        const dx = centroid.x - b.centroid.x;
        const dy = centroid.y - b.centroid.y;
        if (Math.sqrt(dx * dx + dy * dy) <= this.stationaryLimitPx) {
          matched = b;
          break;
        }
      }

      if (matched) {
        matched.consecutiveFrames++;
        matched.dwellTimeSeconds = Math.round((timestamp.getTime() - matched.stationarySince.getTime()) / 1000);
        matched.bbox = bbox;

        if (
          matched.consecutiveFrames >= this.debounceFrames &&
          matched.dwellTimeSeconds >= this.unattendedThresholdSec &&
          !matched.alerted
        ) {
          matched.alerted = true;
          const isAbandoned = matched.dwellTimeSeconds >= this.abandonedThresholdSec;
          alerts.push({
            blobId: matched.id,
            classification: matched.classification,
            severity: isAbandoned ? 'P1' : 'P2',
            confidence: Math.min(0.95, 0.78 + (matched.dwellTimeSeconds / 200) * 0.17),
            bbox: matched.bbox,
            dwellTimeSeconds: matched.dwellTimeSeconds,
          });
        }
      } else {
        const id = `edge-blob-${timestamp.getTime()}`;
        const ar = bbox.width / Math.max(1, bbox.height);
        const classification = ar > 1.25 ? 'suitcase' : 'backpack';

        blobsMap.set(id, {
          id,
          bbox,
          centroid,
          stationarySince: timestamp,
          consecutiveFrames: 1,
          dwellTimeSeconds: 0,
          isStationary: true,
          alerted: false,
          classification,
        });
      }
    }

    return {
      hasUnattendedObjects: alerts.length > 0,
      activeBlobsCount: blobsMap.size,
      alerts,
    };
  }

  public reset(cameraId?: string): void {
    if (cameraId) {
      this.cameraBlobs.delete(cameraId);
      this.backgroundModels.delete(cameraId);
    } else {
      this.cameraBlobs.clear();
      this.backgroundModels.clear();
    }
  }
}

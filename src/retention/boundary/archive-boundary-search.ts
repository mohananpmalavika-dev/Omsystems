/**
 * Archive Boundary Binary Search Engine
 * 
 * Performs logarithmic probing over archive history to locate the exact earliest
 * recording boundary without downloading massive index files.
 */

export interface ArchiveProbeTarget {
  searchRecordings(
    channelId: string,
    from: Date,
    to: Date
  ): Promise<Array<{ startTime: Date; endTime: Date; sizeBytes?: number }>>;
}

export interface ArchiveBoundaryResult {
  oldestRecordingAt?: Date | undefined;
  newestRecordingAt?: Date | undefined;
  probesExecuted: number;
  searchSpanDays: number;
  durationMs: number;
}

export class ArchiveBoundarySearcher {
  /**
   * Probe if a recording slice exists in the window [probeTime - windowHours/2, probeTime + windowHours/2]
   */
  private async hasRecordingAround(
    target: ArchiveProbeTarget,
    channelId: string,
    probeTime: Date,
    windowHours = 2
  ): Promise<{ exists: boolean; segments: Array<{ startTime: Date; endTime: Date }> }> {
    const halfWindowMs = (windowHours / 2) * 60 * 60 * 1000;
    const from = new Date(probeTime.getTime() - halfWindowMs);
    const to = new Date(probeTime.getTime() + halfWindowMs);

    try {
      const segments = await target.searchRecordings(channelId, from, to);
      return {
        exists: segments.length > 0,
        segments,
      };
    } catch {
      return { exists: false, segments: [] };
    }
  }

  /**
   * Finds the oldest recording date using binary search over days [0, maxSearchDays]
   */
  async findRetentionBoundary(
    target: ArchiveProbeTarget,
    channelId: string,
    now: Date = new Date(),
    maxSearchDays = 365,
    probeWindowHours = 2
  ): Promise<ArchiveBoundaryResult> {
    const started = Date.now();
    let low = 0;
    let high = maxSearchDays;
    let oldestFound: Date | undefined;
    let newestFound: Date | undefined;
    let probesCount = 0;

    // Check newest archive first
    const newestCheck = await this.hasRecordingAround(target, channelId, now, probeWindowHours);
    probesCount++;
    if (newestCheck.exists && newestCheck.segments.length > 0) {
      newestFound = newestCheck.segments[newestCheck.segments.length - 1]?.endTime;
    } else {
      newestFound = now;
    }

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const probeTime = new Date(now.getTime() - mid * 86_400_000);

      probesCount++;
      const result = await this.hasRecordingAround(target, channelId, probeTime, probeWindowHours);

      if (result.exists && result.segments.length > 0) {
        // Found recording at 'mid' days ago -> Record boundary and search for older recordings
        const earliestSegmentInWindow = result.segments[0]?.startTime;
        oldestFound = earliestSegmentInWindow;
        low = mid + 1;
      } else {
        // No recording at 'mid' days ago -> Search closer to current time
        high = mid - 1;
      }
    }

    return {
      oldestRecordingAt: oldestFound,
      newestRecordingAt: newestFound,
      probesExecuted: probesCount,
      searchSpanDays: maxSearchDays,
      durationMs: Date.now() - started,
    };
  }
}

export const archiveBoundarySearcher = new ArchiveBoundarySearcher();

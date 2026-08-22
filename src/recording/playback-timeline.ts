import type { RecordingSegment } from "../domain/models.js";

export interface RecordingGap {
  from: string;
  to: string;
  durationSeconds: number;
}

export function buildPlaybackTimeline(
  segments: RecordingSegment[],
  from: string,
  to: string,
  gapToleranceSeconds = 2,
) {
  const startBoundary = Date.parse(from);
  const endBoundary = Date.parse(to);
  const toleranceMs = gapToleranceSeconds * 1_000;
  const intervals = segments
    .filter((segment) => segment.status === "ready")
    .map((segment) => ({
      start: Math.max(startBoundary, Date.parse(segment.startedAt)),
      end: Math.min(endBoundary, Date.parse(segment.endedAt)),
    }))
    .filter((interval) => interval.end > interval.start)
    .sort((left, right) => left.start - right.start);

  const gaps: RecordingGap[] = [];
  let cursor = startBoundary;
  let recordedMs = 0;
  for (const interval of intervals) {
    if (interval.start > cursor + toleranceMs) {
      gaps.push(gap(cursor, interval.start));
    }
    const uncoveredStart = Math.max(cursor, interval.start);
    if (interval.end > uncoveredStart) recordedMs += interval.end - uncoveredStart;
    cursor = Math.max(cursor, interval.end);
  }
  if (cursor < endBoundary - toleranceMs) gaps.push(gap(cursor, endBoundary));

  const requestedMs = endBoundary - startBoundary;
  return {
    segments,
    gaps,
    recordedSeconds: Math.round(recordedMs / 1_000),
    requestedSeconds: Math.round(requestedMs / 1_000),
    coveragePercent: requestedMs > 0
      ? Number(Math.min(100, recordedMs / requestedMs * 100).toFixed(2))
      : 0,
  };
}

function gap(from: number, to: number): RecordingGap {
  return {
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    durationSeconds: Math.round((to - from) / 1_000),
  };
}

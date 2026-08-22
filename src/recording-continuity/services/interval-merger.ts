/**
 * Interval Union Merger
 * Merges adjacent and overlapping recording ranges using interval union
 * with a tolerance window to prevent false micro-gaps from container boundaries.
 */

export interface TimeInterval {
  start: number; // epoch ms
  end: number; // epoch ms
}

export class IntervalMerger {
  /**
   * Performs an interval union over time ranges.
   * @param intervals List of start and end times in epoch ms
   * @param toleranceMs Allowed container boundary padding (default 500ms)
   */
  static merge(intervals: TimeInterval[], toleranceMs: number = 500): TimeInterval[] {
    if (intervals.length === 0) return [];

    const sorted = [...intervals].sort((a, b) => a.start - b.start);
    const merged: TimeInterval[] = [];

    for (const current of sorted) {
      if (current.end <= current.start) continue;

      const previous = merged[merged.length - 1];

      if (!previous || current.start > previous.end + toleranceMs) {
        merged.push({ start: current.start, end: current.end });
      } else {
        previous.end = Math.max(previous.end, current.end);
      }
    }

    return merged;
  }

  /**
   * Subtracts exclusion intervals from expected intervals.
   */
  static subtract(
    expected: TimeInterval[],
    exclusions: TimeInterval[]
  ): TimeInterval[] {
    let result = [...expected];

    for (const excl of exclusions) {
      const nextResult: TimeInterval[] = [];
      for (const exp of result) {
        // No overlap
        if (excl.end <= exp.start || excl.start >= exp.end) {
          nextResult.push(exp);
          continue;
        }

        // Exclusion cuts from start
        if (excl.start <= exp.start && excl.end < exp.end) {
          nextResult.push({ start: excl.end, end: exp.end });
          continue;
        }

        // Exclusion cuts from end
        if (excl.start > exp.start && excl.end >= exp.end) {
          nextResult.push({ start: exp.start, end: excl.start });
          continue;
        }

        // Exclusion splits interval into two
        if (excl.start > exp.start && excl.end < exp.end) {
          nextResult.push({ start: exp.start, end: excl.start });
          nextResult.push({ start: excl.end, end: exp.end });
          continue;
        }
      }
      result = nextResult;
    }

    return result.filter((r) => r.end > r.start);
  }

  /**
   * Total duration in seconds across intervals.
   */
  static totalSeconds(intervals: TimeInterval[]): number {
    const totalMs = intervals.reduce((acc, curr) => acc + (curr.end - curr.start), 0);
    return parseFloat((totalMs / 1000).toFixed(3));
  }
}

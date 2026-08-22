/**
 * Analytics Statistics Service
 * Business logic for analytics statistics with authorization-aware filtering
 */

import type {
  AnalyticsStatisticsRequest,
  AnalyticsStatisticsResponse,
  AnalyticsBucket,
  SeverityLevel,
} from "../models/analytics-statistics.js";
import type { AnalyticsStatisticsRepository } from "../repositories/analytics-statistics.repository.js";

const MAX_RANGE_DAYS = 90;
const DEFAULT_RANGE_HOURS = 24;

/**
 * Validation error
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class AnalyticsStatisticsService {
  constructor(
    private readonly repository: AnalyticsStatisticsRepository
  ) {}

  /**
   * Get analytics statistics with authorization and validation
   */
  async getStatistics(
    input: AnalyticsStatisticsRequest
  ): Promise<AnalyticsStatisticsResponse> {
    // Normalize time range
    const range = this.normalizeTimeRange(input.from, input.to);

    // Choose appropriate bucket size
    const bucket = input.bucket ?? this.chooseBucket(range.from, range.to);

    // Validate range
    this.validateRange(range.from, range.to);

    // Build filters with tenant isolation (mandatory)
    const filters = {
      tenantId: input.tenantId,
      from: range.from,
      to: range.to,
      branchId: input.branchId,
      cameraId: input.cameraId,
      detectorTypes: input.detectorTypes,
      severities: input.severities,
    };

    // Execute queries in parallel
    const [summary, byType, bySeverity, timeline, topCameras, topBranches] = await Promise.all([
      this.repository.getSummary(filters),
      this.repository.getByType(filters),
      this.repository.getBySeverity(filters),
      input.includeTimeline !== false
        ? this.repository.getTimeline(filters, bucket)
        : Promise.resolve([]),
      input.includeCameraBreakdown
        ? this.repository.getTopCameras(filters, 10)
        : Promise.resolve(undefined),
      input.includeBranchBreakdown
        ? this.repository.getTopBranches(filters, 10)
        : Promise.resolve(undefined),
    ]);

    return {
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        bucket,
      },
      totalDetections: summary.totalDetections,
      averageConfidence: summary.averageConfidence,
      alerts: summary.alerts,
      byType,
      bySeverity,
      timeline,
      topCameras,
      topBranches,
      meta: {
        generatedAt: new Date().toISOString(),
        source: "raw",
        cached: false,
      },
    };
  }

  /**
   * Normalize and default time range
   */
  private normalizeTimeRange(from?: Date, to?: Date): { from: Date; to: Date } {
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - DEFAULT_RANGE_HOURS * 60 * 60 * 1000);

    return {
      to: to ?? now,
      from: from ?? defaultFrom,
    };
  }

  /**
   * Validate time range
   */
  private validateRange(from: Date, to: Date): void {
    if (from >= to) {
      throw new ValidationError("`from` must be before `to`");
    }

    const rangeMs = to.getTime() - from.getTime();
    const maxRangeMs = MAX_RANGE_DAYS * 24 * 60 * 60 * 1000;

    if (rangeMs > maxRangeMs) {
      throw new ValidationError(
        `Requested analytics range exceeds maximum of ${MAX_RANGE_DAYS} days`
      );
    }
  }

  /**
   * Choose appropriate time bucket based on range
   */
  private chooseBucket(from: Date, to: Date): AnalyticsBucket {
    const durationMs = to.getTime() - from.getTime();
    const hours = durationMs / (1000 * 60 * 60);

    if (hours <= 2) {
      return "minute";
    }

    if (hours <= 72) {
      return "hour";
    }

    if (hours <= 24 * 90) {
      return "day";
    }

    return "week";
  }

  /**
   * Parse and validate detector types
   */
  static parseDetectorTypes(input: string | string[] | undefined): string[] | undefined {
    if (!input) return undefined;

    const types = Array.isArray(input) ? input : [input];

    // Validate against known detection types
    const validTypes = new Set([
      "motion",
      "person",
      "vehicle",
      "object",
      "line-crossing",
      "intrusion",
      "loitering",
      "crowd-density",
      "camera-tampering",
      "video-loss",
      "fire-smoke",
      "face",
      "anpr",
      "helmet",
      "fall",
      "tailgating",
      "queue",
    ]);

    const invalid = types.filter((t) => !validTypes.has(t));
    if (invalid.length > 0) {
      throw new ValidationError(`Invalid detector types: ${invalid.join(", ")}`);
    }

    return types;
  }

  /**
   * Parse and validate severities
   */
  static parseSeverities(input: string | string[] | undefined): SeverityLevel[] | undefined {
    if (!input) return undefined;

    const severities = Array.isArray(input) ? input : [input];

    const validSeverities = new Set<string>(["P1", "P2", "P3", "P4", "P5"]);

    const invalid = severities.filter((s) => !validSeverities.has(s));
    if (invalid.length > 0) {
      throw new ValidationError(`Invalid severities: ${invalid.join(", ")}`);
    }

    return severities as SeverityLevel[];
  }
}

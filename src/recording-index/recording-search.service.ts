import type { RecordingIndexRepository } from "./recording-index.repository.js";
import type { RecordingGapService } from "./recording-gap.service.js";
import type { RecordingKeyframeService } from "./recording-keyframe.service.js";
import type {
  RecordingSearchRequest,
  RecordingSearchResult,
  CameraRecordingResult,
  RecordingSegmentResult,
} from "./recording-index.types.js";

export class RecordingSearchService {
  constructor(
    private readonly repository: RecordingIndexRepository,
    private readonly gapService: RecordingGapService,
    private readonly keyframeService: RecordingKeyframeService,
  ) {}

  /**
   * Orchestrates high-performance recording searches across one or multiple cameras.
   */
  async search(request: RecordingSearchRequest): Promise<RecordingSearchResult> {
    if (request.cameraIds.length === 0) {
      return {
        from: request.from,
        to: request.to,
        cameras: [],
      };
    }

    // 1. Fetch all overlapping segments across requested cameras in one optimized SQL query
    const segments = await this.repository.findOverlappingSegments(request);

    // 2. Group segments by camera ID
    const segmentsByCamera = new Map<string, RecordingSegmentResult[]>();
    for (const camId of request.cameraIds) {
      segmentsByCamera.set(camId, []);
    }

    for (const segment of segments) {
      const list = segmentsByCamera.get(segment.cameraId);
      if (list) {
        list.push(segment);
      } else {
        segmentsByCamera.set(segment.cameraId, [segment]);
      }
    }

    // 3. For each camera, calculate coverage, gaps, and fetch keyframes if requested
    const cameras: CameraRecordingResult[] = [];

    for (const [cameraId, camSegments] of segmentsByCamera.entries()) {
      // If keyframes explicitly requested, fetch them for segments that don't have them in manifest
      if (request.includeKeyframes) {
        for (const seg of camSegments) {
          if (!seg.keyframes || seg.keyframes.length === 0) {
            seg.keyframes = await this.keyframeService.listKeyframesForSegment(seg.segmentId);
          }
        }
      }

      // Calculate gaps and coverage
      const gapAnalysis = this.gapService.calculateGaps(
        request.from,
        request.to,
        camSegments,
      );

      cameras.push({
        cameraId,
        segments: camSegments,
        gaps: request.includeGaps !== false ? gapAnalysis.gaps : [],
        coverageMs: gapAnalysis.coverageMs,
        requestedMs: gapAnalysis.requestedMs,
        coveragePercent: gapAnalysis.coveragePercent,
      });
    }

    return {
      from: request.from,
      to: request.to,
      cameras,
    };
  }
}

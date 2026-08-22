import type { ControlPlaneStore } from "../control-plane-store.js";
import type { RecordingSegment } from "../domain/models.js";

export interface RetentionBatchRequirement {
  cameraId: string;
  policyRetentionDays: number;
  maxRecordingGapSeconds: number;
}

export interface RetentionBatchInput {
  configuredDays: number;
  segments: RecordingSegment[];
}

/**
 * Loads recording jobs and the bounded segment window for an entire accessible
 * fleet. Callers must supply only camera IDs already authorized for the user.
 */
export async function loadBatchedRetentionInputs(
  store: ControlPlaneStore,
  requirements: RetentionBatchRequirement[],
  now = Date.now(),
): Promise<Map<string, RetentionBatchInput>> {
  const uniqueRequirements = [...new Map(requirements.map((item) => [item.cameraId, item])).values()];
  if (uniqueRequirements.length === 0) return new Map();

  const cameraIds = uniqueRequirements.map((item) => item.cameraId);
  const jobs = await store.listRecordingJobs(cameraIds);
  const jobByCamera = new Map(jobs.map((job) => [job.cameraId, job]));
  const configuredByCamera = new Map(uniqueRequirements.map((item) => [
    item.cameraId,
    Math.max(jobByCamera.get(item.cameraId)?.retentionDays ?? 0, item.policyRetentionDays),
  ]));
  const maxRetentionDays = Math.max(...configuredByCamera.values());
  const maxGapSeconds = Math.max(...uniqueRequirements.map((item) => item.maxRecordingGapSeconds));
  // One extra permitted gap keeps a segment crossing the retention boundary in scope.
  const from = new Date(now - maxRetentionDays * 86_400_000 - maxGapSeconds * 1_000).toISOString();
  const to = new Date(now).toISOString();
  const segments = await store.listRecordingSegmentsForCameras(cameraIds, from, to);
  const segmentsByCamera = new Map<string, RecordingSegment[]>(cameraIds.map((cameraId) => [cameraId, []]));
  for (const segment of segments) segmentsByCamera.get(segment.cameraId)?.push(segment);

  return new Map(cameraIds.map((cameraId) => [cameraId, {
    configuredDays: configuredByCamera.get(cameraId) ?? 0,
    segments: segmentsByCamera.get(cameraId) ?? [],
  }]));
}

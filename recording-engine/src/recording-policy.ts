export type PrimaryRecordingStorage = "sentinel-local" | "recorder-local";

/** Recorder-local jobs are metadata/control jobs; they must never start an FFmpeg timeline worker. */
export function permitsSentinelTimelineWorker(policy: {
  enabled?: boolean;
  primaryRecordingStorage?: PrimaryRecordingStorage;
}) {
  return policy.enabled === true && policy.primaryRecordingStorage === "sentinel-local";
}

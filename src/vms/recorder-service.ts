import type { ControlPlaneStore } from "../control-plane-store.js";
import type { Camera, RecordingJob, RecordingSegment } from "../domain/models.js";
import type { OperationalTelemetryEnvelope } from "../operational-health/types.js";
import type {
  RecorderProvider,
  RecorderProviderResolver,
  VmsCameraRecordingView,
  VmsCapabilityDescriptor,
  VmsCapabilityMatrix,
  VmsCapabilityResult,
  VmsRecordingSearchResult,
  VmsRecordingSegment,
  VmsRecordingStatus,
  VmsRecordingTimeline,
  VmsTimelineInterval,
} from "./contracts.js";

const ARCHIVE_FRESH_MS = 2 * 60 * 60 * 1_000;
const STATUS_FRESH_MS = 5 * 60 * 1_000;

export class RecorderService {
  constructor(
    private readonly store: ControlPlaneStore,
    private readonly resolveProvider?: RecorderProviderResolver,
  ) {}

  async getCameraRecordingView(input: {
    tenantId: string;
    camera: Camera;
    from: string;
    to: string;
  }): Promise<VmsCameraRecordingView> {
    const provider = await this.resolveProvider?.(input.camera);
    const job = await this.store.getRecordingJob(input.camera.id);
    if (!isRecorderBacked(input.camera)) return this.platformRecordingView(input, job);

    const telemetry = await this.store.listLatestOperationalTelemetry(
      input.tenantId,
      [input.camera.branchId],
    );
    const recordingStatus = provider
      ? await safelyObserve(() => provider.getRecordingStatus(nativeChannelId(input.camera)), "Recorder recording-status provider failed.")
      : statusFromTelemetry(input.camera, telemetry);
    const recordingSearch = provider
      ? await safelyObserve(() => provider.searchRecordings({
          cameraId: input.camera.id,
          recorderId: input.camera.recorderId,
          nativeChannelId: nativeChannelId(input.camera),
          from: input.from,
          to: input.to,
          limit: 5_000,
        }), "Recorder archive-search provider failed.")
      : searchFromTelemetry(input.camera, telemetry);

    return {
      cameraId: input.camera.id,
      recorderId: input.camera.recorderId ?? null,
      source: "RECORDER",
      capabilities: await recorderCapabilities(input.camera, telemetry, provider),
      recordingStatus,
      recordingSearch,
      timeline: timelineFromSearch(recordingSearch, input.from, input.to),
    };
  }

  private async platformRecordingView(
    input: { tenantId: string; camera: Camera; from: string; to: string },
    job: RecordingJob | undefined,
  ): Promise<VmsCameraRecordingView> {
    const localSegments = await this.store.listRecordingSegments(input.camera.id, input.from, input.to);
    const observedAt = new Date().toISOString();
    const recordingSearch = available<VmsRecordingSearchResult>({
      segments: localSegments.map(platformSegment),
      coverageComplete: true,
    }, "PLATFORM_INDEX", observedAt);
    const recordingStatus = available<VmsRecordingStatus>({
      configured: job?.enabled ?? false,
      active: job ? job.status === "recording" : false,
      latestSegmentAt: latestSegmentTime(localSegments),
      mode: recordingMode(job),
      evidence: [{ type: "PLATFORM_JOB", observedAt: job?.updatedAt ?? observedAt }],
    }, "PLATFORM_INDEX", job?.updatedAt ?? observedAt);
    return {
      cameraId: input.camera.id,
      recorderId: null,
      source: "PLATFORM",
      capabilities: platformCapabilities(input.camera),
      recordingStatus,
      recordingSearch,
      timeline: timelineFromSearch(recordingSearch, input.from, input.to),
    };
  }
}

function statusFromTelemetry(camera: Camera, telemetry: OperationalTelemetryEnvelope[]): VmsCapabilityResult<VmsRecordingStatus> {
  const channel = telemetry.find((item) =>
    item.deviceType === "recorder-channel" && item.metrics.recorderId === camera.recorderId &&
    Number(item.metrics.sourceChannel) === camera.recorderChannel
  );
  if (!channel) return unavailable("DEPENDENCY_UNAVAILABLE", "No channel-scoped recording observation has been received from the edge recorder probe.", true);
  const state = stringMetric(channel, "status");
  if (channel.quality === "unavailable" || state === "unknown") {
    return unavailable("DEPENDENCY_UNAVAILABLE", reasonMessage(channel, "The recorder could not verify the channel recording state."), true, channel.observedAt);
  }
  if (state !== "recording" && state !== "stopped") {
    return unavailable("MALFORMED_RESPONSE", "The edge recorder probe returned an unrecognized recording state.", true, channel.observedAt);
  }
  const latest = nullableStringMetric(channel, "lastRecordedAt");
  return available({
    configured: null, active: state === "recording", latestSegmentAt: latest, mode: "UNKNOWN",
    evidence: [{ type: latest ? "ARCHIVE_SEGMENT" : "DEVICE_STATUS", observedAt: channel.observedAt }],
  }, "CACHE", channel.observedAt, freshness(channel.observedAt, STATUS_FRESH_MS));
}

function searchFromTelemetry(camera: Camera, telemetry: OperationalTelemetryEnvelope[]): VmsCapabilityResult<VmsRecordingSearchResult> {
  const archive = telemetry.find((item) =>
    item.deviceType === "archive" && item.metrics.recorderId === camera.recorderId &&
    item.metrics.cameraId === camera.id && Number(item.metrics.sourceChannel) === camera.recorderChannel
  );
  if (!archive) return unavailable("DEPENDENCY_UNAVAILABLE", "No native recorder archive search has been reported for this camera.", true);
  if (archive.quality === "unavailable" || stringMetric(archive, "archiveStatus") === "unavailable") {
    return unavailable("DEPENDENCY_UNAVAILABLE", reasonMessage(archive, "The native recorder archive search is currently unavailable."), true, archive.observedAt);
  }
  return available({
    segments: [], coverageComplete: false,
    summary: {
      oldestContinuousAt: nullableStringMetric(archive, "oldestContinuousAt"),
      newestPlayableAt: nullableStringMetric(archive, "newestPlayableAt"),
      gapCount: numberMetric(archive, "gapCount") ?? 0,
      largestGapSeconds: numberMetric(archive, "largestGapSeconds") ?? 0,
      playbackVerified: nullableBooleanMetric(archive, "playbackVerified"),
      reasonCodes: archive.reasonCodes,
    },
  }, "CACHE", archive.observedAt, freshness(archive.observedAt, ARCHIVE_FRESH_MS), 0.9);
}

function timelineFromSearch(
  result: VmsCapabilityResult<VmsRecordingSearchResult>, from: string, to: string,
): VmsCapabilityResult<VmsRecordingTimeline> {
  if (result.state !== "AVAILABLE") return result;
  const intervals = result.value.segments.length > 0 || result.value.coverageComplete
    ? exactTimeline(result.value.segments, from, to, result.value.coverageComplete)
    : summaryTimeline(result.value, from, to);
  return available({ from, to, intervals, coverageComplete: result.value.coverageComplete },
    result.source, result.observedAt, result.freshness, result.confidence);
}

function exactTimeline(segments: VmsRecordingSegment[], from: string, to: string, coverageComplete: boolean): VmsTimelineInterval[] {
  const startBoundary = Date.parse(from);
  const endBoundary = Date.parse(to);
  const ordered = segments.map((segment) => ({
    segment, start: Math.max(startBoundary, Date.parse(segment.startTime)),
    end: Math.min(endBoundary, Date.parse(segment.endTime)),
  })).filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
    .sort((left, right) => left.start - right.start);
  const intervals: VmsTimelineInterval[] = [];
  let cursor = startBoundary;
  for (const item of ordered) {
    if (item.start > cursor) intervals.push({
      start: new Date(cursor).toISOString(), end: new Date(item.start).toISOString(),
      state: coverageComplete ? "MISSING" : "UNKNOWN",
      reason: coverageComplete ? "No recording returned by the authoritative search." : "Search coverage is incomplete.",
    });
    intervals.push({
      start: new Date(item.start).toISOString(), end: new Date(item.end).toISOString(),
      state: "RECORDED", segmentId: item.segment.id,
    });
    cursor = Math.max(cursor, item.end);
  }
  if (cursor < endBoundary) intervals.push({
    start: new Date(cursor).toISOString(), end: new Date(endBoundary).toISOString(),
    state: coverageComplete ? "MISSING" : "UNKNOWN",
    reason: coverageComplete ? "No recording returned by the authoritative search." : "Search coverage is incomplete.",
  });
  return intervals;
}

function summaryTimeline(search: VmsRecordingSearchResult, from: string, to: string): VmsTimelineInterval[] {
  const startBoundary = Date.parse(from);
  const endBoundary = Date.parse(to);
  const oldest = Date.parse(search.summary?.oldestContinuousAt ?? "");
  const newest = Date.parse(search.summary?.newestPlayableAt ?? "");
  if (!Number.isFinite(oldest) || !Number.isFinite(newest) || newest <= oldest) return [{
    start: from, end: to, state: "UNKNOWN",
    reason: "The recorder reported archive state without exact segment intervals.",
  }];
  const recordedStart = Math.max(startBoundary, oldest);
  const recordedEnd = Math.min(endBoundary, newest);
  if (recordedEnd <= recordedStart) return [{
    start: from, end: to, state: "UNKNOWN",
    reason: "The requested range is outside the recorder's verified continuous window.",
  }];
  const intervals: VmsTimelineInterval[] = [];
  if (startBoundary < recordedStart) intervals.push({
    start: from, end: new Date(recordedStart).toISOString(), state: "UNKNOWN",
    reason: "Exact recorder intervals were not synchronized for this range.",
  });
  intervals.push({
    start: new Date(recordedStart).toISOString(), end: new Date(recordedEnd).toISOString(), state: "RECORDED",
    reason: search.summary?.gapCount
      ? "Latest continuous recorder window; older gaps were reported separately."
      : "Continuous archive window verified by the edge recorder search.",
  });
  if (recordedEnd < endBoundary) intervals.push({
    start: new Date(recordedEnd).toISOString(), end: to, state: "UNKNOWN",
    reason: "This range is newer than the last archive observation.",
  });
  return intervals;
}

async function recorderCapabilities(
  camera: Camera, telemetry: OperationalTelemetryEnvelope[], provider: RecorderProvider | undefined,
): Promise<VmsCapabilityMatrix> {
  if (provider) {
    const observed = await safelyObserve(() => provider.capabilities(), "Recorder capability negotiation failed.");
    if (observed.state === "AVAILABLE") return observed.value;
  }
  const channelObserved = telemetry.some((item) => item.deviceType === "recorder-channel" && item.metrics.recorderId === camera.recorderId);
  const archive = telemetry.find((item) => item.deviceType === "archive" && item.metrics.recorderId === camera.recorderId && item.metrics.cameraId === camera.id);
  const recorderObserved = telemetry.some((item) => item.deviceType === "recorder" && item.deviceId === camera.recorderId);
  const storageObserved = telemetry.some((item) => item.deviceType === "disk" && item.metrics.recorderId === camera.recorderId);
  const playbackVerified = archive ? nullableBooleanMetric(archive, "playbackVerified") === true : false;
  return {
    discovery: supported("Recorder and channel identity discovered at the edge."),
    deviceInfo: descriptor(recorderObserved, "No recorder device observation received."),
    channels: supported("Canonical camera-to-recorder channel mapping is configured."),
    liveStream: descriptor(camera.profiles.length > 0, "No stream profile is registered for this channel."),
    streamVerification: partial("Live decoding is verified independently by the edge stream probe."),
    recordingStatus: descriptor(channelObserved, "No recent channel recording observation received."),
    recordingSearch: archive ? partial("Retention evidence is cached; exact segments require an on-demand provider search.") : unsupported("No native archive search evidence received."),
    timeline: archive ? partial("The latest verified continuous recorder interval is available.") : unsupported("No authoritative recorder timeline is available."),
    playback: playbackVerified ? partial("Recorder replay was decoded at the edge; browser delivery remains on demand.") : unsupported("Historical playback has not been verified for this channel."),
    export: partial("Incident evidence export is supported; continuous recorder media is not mirrored centrally."),
    storage: descriptor(storageObserved, "No normalized recorder disk observation received."),
    clock: unsupported("Recorder clock evidence has not been reported by the edge adapter."),
    events: camera.capabilities.events ? supported() : unsupported("Camera/recorder events are not advertised."),
    ptz: camera.capabilities.ptz ? supported() : unsupported("PTZ is not advertised for this channel."),
    health: descriptor(recorderObserved, "No recorder health observation received."),
    firmware: descriptor(recorderObserved, "No recorder firmware observation received."),
  };
}

function platformCapabilities(camera: Camera): VmsCapabilityMatrix {
  return {
    discovery: supported(), deviceInfo: supported(), channels: supported(), liveStream: supported(),
    streamVerification: partial("Verification is performed by the media gateway."),
    recordingStatus: supported(), recordingSearch: supported(), timeline: supported(), playback: supported(),
    export: supported(), storage: supported(),
    clock: unsupported("Standalone camera clock is not part of the recording index."),
    events: camera.capabilities.events ? supported() : unsupported("Events are not advertised."),
    ptz: camera.capabilities.ptz ? supported() : unsupported("PTZ is not advertised."),
    health: supported(),
    firmware: camera.firmwareVersion ? supported() : partial("Firmware version has not been observed."),
  };
}

function descriptor(observed: boolean, reason: string): VmsCapabilityDescriptor { return observed ? supported() : unsupported(reason); }
function supported(reason?: string): VmsCapabilityDescriptor { return { support: "SUPPORTED", ...(reason ? { reason } : {}) }; }
function partial(reason: string): VmsCapabilityDescriptor { return { support: "PARTIAL", reason }; }
function unsupported(reason: string): VmsCapabilityDescriptor { return { support: "UNSUPPORTED", reason }; }

function platformSegment(segment: RecordingSegment): VmsRecordingSegment {
  return {
    id: segment.id, cameraId: segment.cameraId, startTime: segment.startedAt, endTime: segment.endedAt,
    durationMs: Math.max(0, Date.parse(segment.endedAt) - Date.parse(segment.startedAt)), type: "UNKNOWN",
    playbackAvailable: segment.status === "ready", source: "PLATFORM", platformSegmentId: segment.id,
  };
}

function latestSegmentTime(segments: RecordingSegment[]) {
  return segments.reduce<string | null>((latest, segment) =>
    !latest || Date.parse(segment.endedAt) > Date.parse(latest) ? segment.endedAt : latest, null);
}
function recordingMode(job: RecordingJob | undefined): VmsRecordingStatus["mode"] {
  if (!job) return "UNKNOWN";
  if (job.mode === "continuous") return "CONTINUOUS";
  if (job.mode === "motion") return "MOTION";
  if (job.mode === "event") return "EVENT";
  if (job.mode === "scheduled") return "SCHEDULED";
  return "UNKNOWN";
}
function nativeChannelId(camera: Camera) { return String(camera.recorderChannel ?? camera.channel); }
function isRecorderBacked(camera: Camera) { return Boolean(camera.recorderId) || camera.sourceType === "analog-dvr-channel" || camera.sourceType === "nvr-channel"; }

function available<T>(value: T, source: "DEVICE" | "CACHE" | "PLATFORM_INDEX", observedAt: string,
  valueFreshness: "FRESH" | "STALE" = "FRESH", confidence = 1): VmsCapabilityResult<T> {
  return { state: "AVAILABLE", value, source, observedAt, confidence, freshness: valueFreshness };
}
function unavailable<T>(reason: Extract<VmsCapabilityResult<T>, { state: "UNAVAILABLE" }>["reason"],
  message: string, retryable: boolean, observedAt = new Date().toISOString()): VmsCapabilityResult<T> {
  return { state: "UNAVAILABLE", reason, message, observedAt, retryable };
}
async function safelyObserve<T>(call: () => Promise<VmsCapabilityResult<T>>, message: string): Promise<VmsCapabilityResult<T>> {
  try { return await call(); }
  catch { return unavailable("UNKNOWN", message, true); }
}
function freshness(observedAt: string, freshMs: number): "FRESH" | "STALE" { return Date.now() - Date.parse(observedAt) <= freshMs ? "FRESH" : "STALE"; }
function stringMetric(envelope: OperationalTelemetryEnvelope, name: string) { const value = envelope.metrics[name]; return typeof value === "string" ? value : undefined; }
function nullableStringMetric(envelope: OperationalTelemetryEnvelope, name: string) { const value = envelope.metrics[name]; return typeof value === "string" ? value : null; }
function numberMetric(envelope: OperationalTelemetryEnvelope, name: string) { const value = envelope.metrics[name]; return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function nullableBooleanMetric(envelope: OperationalTelemetryEnvelope, name: string) { const value = envelope.metrics[name]; return typeof value === "boolean" ? value : null; }
function reasonMessage(envelope: OperationalTelemetryEnvelope, fallback: string) { return envelope.reasonCodes.length ? `${fallback} (${envelope.reasonCodes.join(", ")})` : fallback; }

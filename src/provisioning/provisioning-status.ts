import type { ControlPlaneStore } from "../control-plane-store.js";
import type {
  DiscoveredCamera,
  EdgeAgent,
  EdgeScanJob,
  RecordingJob,
  RecordingStorageNode,
  User,
} from "../domain/models.js";
import type { OperationalTelemetryEnvelope } from "../operational-health/types.js";

export type ProvisioningStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "warning"
  | "blocked"
  | "failed"
  | "skipped";

export interface ProvisioningStepView {
  id: string;
  label: string;
  status: ProvisioningStepStatus;
  completedUnits: number;
  totalUnits: number;
  evidence: string;
  errorCode?: string;
  action?: "install-agent" | "provide-credentials" | "retry";
  canSkip: boolean;
  skippedAt?: string;
}

export interface ProvisioningIssue {
  code: string;
  severity: "warning" | "blocker";
  resourceId: string;
  message: string;
  recommendedAction: string;
}

export interface ProvisioningRunView {
  id: string;
  branchId: string;
  edgeAgentId?: string;
  status:
    | "not_started"
    | "queued"
    | "running"
    | "waiting_for_input"
    | "awaiting_evidence"
    | "blocked"
    | "failed"
    | "active";
  currentStage: string;
  completedUnits: number;
  totalUnits: number;
  progressPercent: number;
  readyForActivation: boolean;
  credentialsSkipped: boolean;
  canSkipCredentialResolution: boolean;
  startedAt?: string;
  completedAt?: string;
  steps: ProvisioningStepView[];
  issues: ProvisioningIssue[];
  summary: {
    agents: number;
    agentsOnline: number;
    discoveredDevices: number;
    recorders: number;
    importedChannels: number;
    verifiedStreams: number;
    credentialsRequired: number;
    duplicateDevices: number;
    timeSynchronized: number;
    timeDrifted: number;
    storageHealthy: number;
    recordingsVerified: number;
    analyticsCompatible: number;
    analyticsAssigned: number;
  };
}

export async function buildProvisioningRunView(
  store: ControlPlaneStore,
  branchId: string,
  user: User,
  job?: EdgeScanJob,
): Promise<ProvisioningRunView> {
  const branch = await store.getNode(branchId);
  if (!branch || branch.type !== "branch") throw new Error("branch_not_found");

  const [agents, pendingDiscoveries, latestTelemetry, storageNodes] = await Promise.all([
    store.listEdgeAgentsByBranch(branchId),
    store.listDiscoveredCameras(branchId),
    store.listLatestOperationalTelemetry(branch.tenantId, [branchId]),
    store.listRecordingStorageNodes(branch.tenantId),
  ]);
  const runStartedAt = job ? Date.parse(job.startedAt ?? job.requestedAt) : Number.NaN;
  const runDiscoveries = job
    ? pendingDiscoveries.filter((discovery) =>
      discovery.edgeAgentId === job.edgeAgentId &&
      (!Number.isFinite(runStartedAt) || Date.parse(discovery.discoveredAt) >= runStartedAt)
    )
    : pendingDiscoveries;
  const cameras = await store.listCamerasByBranch(
    user,
    branchId,
    "device:configure",
  );
  const scopedRunCameras = job
    ? cameras.filter((camera) =>
      camera.edgeAgentId === job.edgeAgentId &&
      (!Number.isFinite(runStartedAt) || Date.parse(camera.firstSeenAt ?? "") >= runStartedAt)
    )
    : cameras;
  // When credentials are deliberately deferred, the currently online branch
  // cameras are the evidence that allowed the operator to continue. Include
  // them in subsequent stages instead of showing RTSP as perpetually pending.
  const runCameras = job?.credentialsSkippedAt
    ? [...new Map([...scopedRunCameras, ...cameras.filter((camera) => camera.status === "online")]
      .map((camera) => [camera.id, camera])).values()]
    : scopedRunCameras;
  const now = new Date().toISOString();
  const recentWindowStart = new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString();
  const [recordingJobs, analyticsRules, recentSegments] = await Promise.all([
    store.listRecordingJobs(runCameras.map((camera) => camera.id)),
    store.listAnalyticsRulesByCameraIds(runCameras.map((camera) => camera.id)),
    Promise.all(runCameras.map(async (camera) => ({
      cameraId: camera.id,
      segments: await store.listRecordingSegments(camera.id, recentWindowStart, now),
    }))),
  ]);

  return projectProvisioningRun({
    branchId,
    job,
    agents,
    pendingDiscoveries: runDiscoveries,
    importedCameraIds: runCameras.map((camera) => camera.id),
    connectedCameraCount: cameras.filter((camera) => camera.status === "online").length,
    recordingJobs,
    storageNodes,
    analyticsCameraIds: [...new Set(analyticsRules.filter((rule) => rule.enabled).map((rule) => rule.cameraId))],
    recentPlatformRecordingCameraIds: recentSegments
      .filter((item) => item.segments.some((segment) => segment.status === "ready"))
      .map((item) => item.cameraId),
    telemetry: latestTelemetry,
  });
}

export function projectProvisioningRun(input: {
  branchId: string;
  job?: EdgeScanJob;
  agents: EdgeAgent[];
  pendingDiscoveries: DiscoveredCamera[];
  importedCameraIds: string[];
  /** Existing approved cameras that are currently reporting a usable stream. */
  connectedCameraCount?: number;
  recordingJobs: RecordingJob[];
  storageNodes: RecordingStorageNode[];
  analyticsCameraIds: string[];
  recentPlatformRecordingCameraIds: string[];
  telemetry: OperationalTelemetryEnvelope[];
}): ProvisioningRunView {
  const onlineAgents = input.agents.filter((agent) => agent.status === "online");
  const connectedCameraCount = input.connectedCameraCount ?? 0;
  const credentialsRequired = Math.max(
    input.job?.credentialsRequiredCount ?? 0,
    input.pendingDiscoveries.filter((device) => device.credentialsRequired === true).length,
  );
  const pendingVerification = Math.max(
    input.job?.pendingVerificationCount ?? 0,
    input.pendingDiscoveries.filter((device) => !device.credentialsRequired && !device.streamVerified).length,
  );
  const verifiedStreams = Math.max(
    input.job?.verifiedCount ?? 0,
    input.job?.provisionedCount ?? 0,
    input.pendingDiscoveries.filter((device) => device.streamVerified === true).length,
    connectedCameraCount,
  );
  const credentialsSkipped = Boolean(
    input.job?.credentialsSkippedAt ?? input.job?.skippedStages?.["credential-resolution"],
  );
  const skippedStages: Record<string, string> = {
    ...(input.job?.skippedStages ?? {}),
    ...(credentialsSkipped && !input.job?.skippedStages?.["credential-resolution"]
      ? { "credential-resolution": input.job?.credentialsSkippedAt ?? input.job?.completedAt ?? input.job?.requestedAt ?? "" }
      : {}),
  };
  const canSkipCredentialResolution = credentialsRequired > 0 && !credentialsSkipped && verifiedStreams > 0;
  const recorderTelemetry = input.telemetry.filter((item) => item.deviceType === "recorder");
  const diskTelemetry = input.telemetry.filter((item) => item.deviceType === "disk");
  const archiveTelemetry = input.telemetry.filter((item) => item.deviceType === "archive");
  const recorderCount = Math.max(input.job?.recorderCount ?? 0, recorderTelemetry.length);
  const healthyRecorderStorage = diskTelemetry.filter((item) =>
    item.metrics.operationalStatus === "healthy" && item.metrics.writeVerification === "verified"
  ).length;
  const healthyPlatformStorage = input.storageNodes.filter((node) =>
    node.status === "healthy" && node.lastWriteProbe?.status === "passed"
  ).length;
  const storageHealthy = healthyRecorderStorage + healthyPlatformStorage;
  const recordingsVerified = archiveTelemetry.filter((item) =>
    item.metrics.archiveStatus === "available" && item.metrics.playbackVerified === true
  ).length + new Set(input.recentPlatformRecordingCameraIds).size;
  const duplicateDevices = Math.max(
    input.job?.duplicateCount ?? 0,
    input.pendingDiscoveries.filter((device) => device.duplicateStatus === "duplicate").length,
  );
  const timeSynchronized = Math.max(
    input.job?.timeSynchronizedCount ?? 0,
    input.pendingDiscoveries.filter((device) => device.timeSynchronization === "synchronized").length,
  );
  const timeDrifted = Math.max(
    input.job?.timeDriftCount ?? 0,
    input.pendingDiscoveries.filter((device) => device.timeSynchronization === "drifted").length,
  );
  const analyticsCompatible = Math.max(
    input.job?.analyticsCompatibleCount ?? 0,
    input.pendingDiscoveries.filter(isAnalyticsCompatible).length,
  );
  const importedChannels = input.job
    ? Math.max(input.job.provisionedCount, input.importedCameraIds.length)
    : input.importedCameraIds.length;
  const analyticsAssigned = Math.min(input.analyticsCameraIds.length, importedChannels);
  const discoveredDevices = input.job
    ? Math.max(input.job.resultCount, input.pendingDiscoveries.length + importedChannels)
    : input.pendingDiscoveries.length + importedChannels;
  const recordingsConfigured = input.recordingJobs.filter((recording) => recording.enabled).length;
  const networkTelemetry = input.telemetry.filter((item) => item.deviceType === "network");
  const networkVerified = networkTelemetry.some((item) => item.metrics.connectivity === true || item.metrics.status === "online");
  const healthActive = input.telemetry.some((item) => item.deviceType === "edge-agent");
  const scanCompleted = input.job?.status === "completed";
  const failed = input.job?.status === "failed";
  const mandatoryRecordingFailure = recorderTelemetry.some((item) =>
    ["stopped", "error"].includes(String(item.metrics.recordingStatus ?? ""))
  );
  const storageFailure = diskTelemetry.some((item) =>
    ["critical", "failed"].includes(String(item.metrics.operationalStatus ?? item.metrics.smartStatus ?? "")) ||
    item.metrics.writeVerification === "failed"
  );
  const storageEvidenceMissing = scanCompleted && importedChannels > 0 && storageHealthy === 0;
  const recordingEvidenceMissing = scanCompleted && importedChannels > 0 && recordingsVerified < importedChannels;
  const noDevicesDiscovered = scanCompleted && discoveredDevices === 0;
  const noVerifiedStreams = scanCompleted && discoveredDevices > 0 && importedChannels === 0 && credentialsRequired === 0;
  const issues = provisioningIssues({
    job: input.job,
    onlineAgents,
    pendingDiscoveries: input.pendingDiscoveries,
    mandatoryRecordingFailure,
    storageFailure,
    storageEvidenceMissing,
    recordingEvidenceMissing,
    noDevicesDiscovered,
    noVerifiedStreams,
    timeDrifted,
    credentialsSkipped,
  });

  const computedSteps: ProvisioningStepView[] = [
    step("branch-registration", "Branch registration", "completed", 1, 1, "Branch inventory record exists"),
    step(
      "edge-enrollment", "Edge agent enrollment",
      onlineAgents.length > 0 ? "completed" : input.agents.length > 0 ? "blocked" : "pending",
      onlineAgents.length > 0 ? 1 : 0, 1,
      onlineAgents.length > 0 ? `${onlineAgents.length} edge agent(s) online with branch-scoped identity` : "An online edge agent is required for private-network discovery",
      onlineAgents.length > 0 ? undefined : "EDGE_AGENT_OFFLINE",
      onlineAgents.length > 0 ? undefined : "install-agent",
    ),
    step(
      "network-inventory", "Network inventory",
      networkVerified ? "completed" : input.job?.status === "running" ? "running" : scanCompleted ? "warning" : "pending",
      networkVerified ? Math.max(1, networkTelemetry.length) : 0, Math.max(1, networkTelemetry.length),
      networkVerified ? `${networkTelemetry.length} current network observation(s)` : "Awaiting current branch network telemetry",
    ),
    step(
      "device-discovery", "ONVIF, subnet and recorder discovery",
      failed ? "failed" : discoveredDevices > 0 ? "completed" : input.job?.status === "running" ? "running" : "pending",
      discoveredDevices, Math.max(1, discoveredDevices),
      `${discoveredDevices} physical device/channel observation(s) reconciled`,
      failed ? "DEVICE_DISCOVERY_FAILED" : undefined,
      failed ? "retry" : undefined,
    ),
    step(
      "credential-resolution", "Credential resolution",
      credentialsSkipped ? "skipped" : credentialsRequired > 0 ? "blocked" : discoveredDevices > 0 ? "completed" : "pending",
      credentialsSkipped ? Math.max(1, discoveredDevices) : Math.max(0, discoveredDevices - credentialsRequired), Math.max(1, discoveredDevices),
      credentialsSkipped
        ? `${credentialsRequired} device(s) deferred; their credentials can be supplied in a later scan`
        : credentialsRequired > 0 ? `${credentialsRequired} device(s) require an authorized credential` : "Known branch and device credential profiles resolved",
      credentialsSkipped ? undefined : credentialsRequired > 0 ? "DEVICE_CREDENTIAL_REQUIRED" : undefined,
      credentialsSkipped ? undefined : credentialsRequired > 0 ? "provide-credentials" : undefined,
    ),
    step(
      "stream-verification", "RTSP stream verification",
      verifiedStreams > 0 && pendingVerification === 0 ? "completed" : pendingVerification > 0 ? "warning" : "pending",
      verifiedStreams, Math.max(1, verifiedStreams + pendingVerification),
      `${verifiedStreams} stream(s) decoded; ${pendingVerification} still unverified`,
    ),
    step(
      "channel-import", "Recorder enumeration and channel import",
      importedChannels > 0 ? "completed" : discoveredDevices > 0 ? "warning" : "pending",
      importedChannels, Math.max(1, discoveredDevices),
      `${recorderCount} recorder(s); ${importedChannels} canonical channel(s) imported`,
    ),
    step(
      "time-verification", "Time and NTP verification",
      timeDrifted > 0 ? "warning" : timeSynchronized > 0 ? "completed" : scanCompleted ? "warning" : "pending",
      timeSynchronized, Math.max(1, timeSynchronized + timeDrifted),
      timeDrifted > 0 ? `${timeDrifted} device(s) reported clock drift` : timeSynchronized > 0 ? `${timeSynchronized} device(s) synchronized` : "No fresh device clock evidence available",
      timeDrifted > 0 ? "TIME_DRIFT_EXCEEDED" : undefined,
    ),
    step(
      "storage-verification", "Storage verification",
      storageFailure || storageEvidenceMissing ? "blocked" : storageHealthy > 0 ? "completed" : "pending",
      storageHealthy, Math.max(1, diskTelemetry.length + input.storageNodes.length),
      storageFailure ? "Recorder storage has a blocking health or write failure" : storageHealthy > 0 ? `${storageHealthy} writable storage target(s) verified` : "Fresh storage write evidence is required",
      storageFailure ? "STORAGE_DEGRADED" : storageEvidenceMissing ? "STORAGE_EVIDENCE_REQUIRED" : undefined,
    ),
    step(
      "recording-verification", "Recording verification",
      mandatoryRecordingFailure || recordingEvidenceMissing ? "blocked" : recordingsVerified > 0 ? "completed" : recordingsConfigured > 0 ? "warning" : "pending",
      recordingsVerified, Math.max(1, importedChannels),
      mandatoryRecordingFailure ? "Recorder reports stopped recording" : recordingsVerified > 0 ? `${recordingsVerified} recent recording(s) passed playback verification` : `${recordingsConfigured} recording policy assignment(s); live archive evidence pending`,
      mandatoryRecordingFailure ? "NO_RECENT_RECORDING" : recordingEvidenceMissing ? "RECORDING_EVIDENCE_REQUIRED" : undefined,
    ),
    step(
      "analytics", "Analytics compatibility and rules",
      analyticsAssigned >= importedChannels && importedChannels > 0 ? "completed" : importedChannels > 0 ? "warning" : "pending",
      analyticsAssigned, Math.max(1, importedChannels),
      `${analyticsCompatible} compatible stream(s); ${analyticsAssigned} camera(s) have enabled AI rules`,
    ),
    step(
      "digital-twin", "Digital Twin population",
      importedChannels > 0 ? "completed" : "pending",
      importedChannels > 0 ? 1 : 0, 1,
      importedChannels > 0 ? "Canonical branch, edge, recorder, and camera identities are available to the twin" : "Awaiting canonical imported devices",
    ),
    step(
      "health-baseline", "Baseline health snapshot",
      healthActive ? "completed" : scanCompleted ? "warning" : "pending",
      healthActive ? 1 : 0, 1,
      healthActive ? "Fresh attributable edge telemetry captured" : "Awaiting first post-provisioning health heartbeat",
    ),
  ];

  const blockers = issues.filter((issue) => issue.severity === "blocker");
  const recordingConfigured = recordingsConfigured >= importedChannels && importedChannels > 0;
  const recordingEvidenceReady = recordingsVerified >= importedChannels;
  const evidenceReady = scanCompleted && onlineAgents.length > 0 && importedChannels > 0 &&
    verifiedStreams > 0 && recordingConfigured && storageHealthy > 0 && recordingEvidenceReady;
  const readyForActivation = evidenceReady && blockers.length === 0;
  computedSteps.push(step(
    "activation", "Activation policy",
    failed ? "failed" : readyForActivation ? "completed" : blockers.length > 0 ? "blocked" : "pending",
    readyForActivation ? 1 : 0, 1,
    readyForActivation ? "Mandatory physical-infrastructure evidence is present" : blockers[0]?.message ?? "Waiting for mandatory evidence",
    blockers[0]?.code,
  ));

  const steps = computedSteps.map((item) => applyStageSkip(
    item,
    skippedStages[item.id],
    Boolean(input.job && input.job.scope !== "device"),
    canSkipCredentialResolution,
  ));
  const completedUnits = steps.reduce((total, item) => total + Math.min(item.completedUnits, item.totalUnits), 0);
  const totalUnits = steps.reduce((total, item) => total + item.totalUnits, 0);
  const status = failed ? "failed"
    : credentialsRequired > 0 && !credentialsSkipped ? "waiting_for_input"
      : blockers.length > 0 ? "blocked"
        : readyForActivation ? "active"
          : input.job?.status === "queued" ? "queued"
            : input.job?.status === "running" ? "running"
              : input.job ? "awaiting_evidence" : "not_started";
  const currentStage = steps.find((item) => !["completed", "skipped"].includes(item.status))?.label
    ?? (readyForActivation ? "Active" : "Operator review required");

  return {
    id: input.job?.id ?? `branch:${input.branchId}`,
    branchId: input.branchId,
    ...(input.job?.edgeAgentId ? { edgeAgentId: input.job.edgeAgentId } : {}),
    status,
    currentStage,
    completedUnits,
    totalUnits,
    progressPercent: totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 1_000) / 10 : 0,
    readyForActivation,
    credentialsSkipped,
    canSkipCredentialResolution,
    ...(input.job?.requestedAt ? { startedAt: input.job.requestedAt } : {}),
    ...(input.job?.completedAt ? { completedAt: input.job.completedAt } : {}),
    steps,
    issues,
    summary: {
      agents: input.agents.length,
      agentsOnline: onlineAgents.length,
      discoveredDevices,
      recorders: recorderCount,
      importedChannels,
      verifiedStreams,
      credentialsRequired,
      duplicateDevices,
      timeSynchronized,
      timeDrifted,
      storageHealthy,
      recordingsVerified,
      analyticsCompatible,
      analyticsAssigned,
    },
  };
}

function provisioningIssues(input: {
  job?: EdgeScanJob;
  onlineAgents: EdgeAgent[];
  pendingDiscoveries: DiscoveredCamera[];
  mandatoryRecordingFailure: boolean;
  storageFailure: boolean;
  storageEvidenceMissing: boolean;
  recordingEvidenceMissing: boolean;
  noDevicesDiscovered: boolean;
  noVerifiedStreams: boolean;
  timeDrifted: number;
  credentialsSkipped: boolean;
}) {
  const issues: ProvisioningIssue[] = [];
  if (input.onlineAgents.length === 0) issues.push({
    code: "EDGE_AGENT_OFFLINE", severity: "blocker", resourceId: input.job?.edgeAgentId ?? "branch",
    message: "No enrolled edge agent is currently online.",
    recommendedAction: "Install or reconnect the Branch Gateway, then retry provisioning.",
  });
  if (input.noDevicesDiscovered) issues.push({
    code: "NO_DEVICES_DISCOVERED", severity: "blocker", resourceId: "branch",
    message: "The completed branch scan returned no device observations.",
    recommendedAction: "Check allowed subnets, VLAN reachability, multicast routing, and scanner permissions, then retry.",
  });
  else if (input.noVerifiedStreams) issues.push({
    code: "NO_VERIFIED_STREAMS", severity: "blocker", resourceId: "branch",
    message: "Devices were discovered, but no canonical video stream passed verification.",
    recommendedAction: "Resolve reachability, codec, identity, or RTSP failures before activation.",
  });
  for (const device of input.pendingDiscoveries) {
    if (device.credentialsRequired) issues.push({
      code: input.credentialsSkipped ? "DEVICE_CREDENTIAL_DEFERRED" : "DEVICE_CREDENTIAL_REQUIRED",
      severity: input.credentialsSkipped ? "warning" : "blocker", resourceId: device.id,
      message: input.credentialsSkipped
        ? `${device.displayName ?? device.model} was deferred because its credentials are unavailable.`
        : `${device.displayName ?? device.model} requires credentials.`,
      recommendedAction: input.credentialsSkipped
        ? "Provide the authorized device login in a later scan to add this device."
        : "Provide the authorized device login once; only the affected device will be rescanned.",
    });
    else if (!device.streamVerified) issues.push({
      code: "RTSP_NO_VIDEO", severity: "warning", resourceId: device.id,
      message: `${device.displayName ?? device.model} has no verified video stream.`,
      recommendedAction: "Check reachability, RTSP settings, codec support, and device health.",
    });
    if (device.duplicateStatus === "duplicate") issues.push({
      code: "DUPLICATE_DEVICE", severity: "warning", resourceId: device.id,
      message: `${device.displayName ?? device.model} matches an existing canonical device.`,
      recommendedAction: "Review the identity match before changing the existing association.",
    });
  }
  if (input.timeDrifted > 0) issues.push({
    code: "TIME_DRIFT_EXCEEDED", severity: "warning", resourceId: "branch",
    message: `${input.timeDrifted} device(s) reported clock drift.`,
    recommendedAction: "Point the devices at the trusted NTP source and verify their clocks again.",
  });
  if (input.storageFailure) issues.push({
    code: "STORAGE_DEGRADED", severity: "blocker", resourceId: "branch",
    message: "Recorder storage health or write verification failed.",
    recommendedAction: "Repair the disk/RAID/write path before activation.",
  });
  else if (input.storageEvidenceMissing) issues.push({
    code: "STORAGE_EVIDENCE_REQUIRED", severity: "blocker", resourceId: "branch",
    message: "No storage target has supplied a fresh successful write probe.",
    recommendedAction: "Verify the recorder or platform storage write path, then retry the affected checks.",
  });
  if (input.mandatoryRecordingFailure) issues.push({
    code: "NO_RECENT_RECORDING", severity: "blocker", resourceId: "branch",
    message: "At least one recorder reports stopped recording.",
    recommendedAction: "Restore recording and provide fresh archive/playback evidence.",
  });
  else if (input.recordingEvidenceMissing) issues.push({
    code: "RECORDING_EVIDENCE_REQUIRED", severity: "blocker", resourceId: "branch",
    message: "Recorder channels have not supplied recent playable archive evidence.",
    recommendedAction: "Run the recorder archive probe and verify a decoded playback frame.",
  });
  if (input.job?.error) issues.push({
    code: "DEVICE_DISCOVERY_FAILED", severity: "blocker", resourceId: input.job.id,
    message: input.job.error,
    recommendedAction: "Inspect the edge-agent error, correct it, and retry the durable run.",
  });
  return issues;
}

function isAnalyticsCompatible(device: DiscoveredCamera) {
  const profiles = device.profiles ?? [];
  return device.streamVerified === true && profiles.some((profile) =>
    profile.codec === "H264" || profile.codec === "H265" || profile.codec === "MJPEG"
  );
}

function step(
  id: string,
  label: string,
  status: ProvisioningStepStatus,
  completedUnits: number,
  totalUnits: number,
  evidence: string,
  errorCode?: string,
  action?: ProvisioningStepView["action"],
): ProvisioningStepView {
  return {
    id, label, status, completedUnits, totalUnits, evidence,
    canSkip: false,
    ...(errorCode ? { errorCode } : {}),
    ...(action ? { action } : {}),
  };
}

function applyStageSkip(
  stage: ProvisioningStepView,
  skippedAt: string | undefined,
  hasBranchRun: boolean,
  canSkipCredentialResolution: boolean,
): ProvisioningStepView {
  if (skippedAt !== undefined) {
    return {
      ...stage,
      status: "skipped",
      completedUnits: stage.totalUnits,
      evidence: "Skipped by an operator for this provisioning run.",
      canSkip: false,
      skippedAt,
      errorCode: undefined,
      action: undefined,
    };
  }
  return {
    ...stage,
    canSkip: hasBranchRun && stage.status !== "completed" && (
      stage.id !== "credential-resolution" || canSkipCredentialResolution
    ),
  };
}

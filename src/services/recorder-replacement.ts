import type { RecorderReplacementMapping } from "../control-plane-store.js";
import type { Camera, DiscoveredCamera } from "../domain/models.js";

export interface RecorderReplacementPlan {
  branchId: string;
  oldRecorderSerialNumber: string;
  newRecorderSerialNumber: string;
  status: "ready" | "blocked";
  mappings: Array<RecorderReplacementMapping & {
    cameraName: string;
    replacementDisplayName: string;
  }>;
  missingChannels: number[];
  extraChannels: number[];
  issues: string[];
  preserved: string[];
}

export function buildRecorderReplacementPlan(input: {
  branchId: string;
  oldRecorderSerialNumber: string;
  newRecorderSerialNumber: string;
  cameras: Camera[];
  discoveries: DiscoveredCamera[];
}): RecorderReplacementPlan {
  const oldSerial = normalizeSerial(input.oldRecorderSerialNumber);
  const newSerial = normalizeSerial(input.newRecorderSerialNumber);
  const oldCameras = input.cameras
    .filter((camera) => normalizeSerial(camera.recorderSerialNumber) === oldSerial && camera.recorderChannel)
    .sort((left, right) => left.recorderChannel! - right.recorderChannel!);
  const replacementChannels = input.discoveries
    .filter((discovery) =>
      discovery.status === "pending" &&
      normalizeSerial(discovery.recorderSerialNumber) === newSerial &&
      discovery.recorderChannel &&
      (discovery.sourceType === "analog-dvr-channel" || discovery.sourceType === "nvr-channel"),
    );
  const byChannel = new Map<number, DiscoveredCamera[]>();
  for (const discovery of replacementChannels) {
    const channel = discovery.recorderChannel!;
    const values = byChannel.get(channel) ?? [];
    values.push(discovery);
    byChannel.set(channel, values);
  }

  const issues: string[] = [];
  if (!oldSerial || !newSerial || oldSerial === newSerial) issues.push("old_and_new_recorder_serials_must_be_different");
  if (!oldCameras.length) issues.push("no_existing_channels_for_old_recorder");
  if (!replacementChannels.length) issues.push("no_pending_channels_for_new_recorder");
  for (const [channel, discoveries] of byChannel) {
    if (discoveries.length > 1) issues.push(`duplicate_new_recorder_channel:${channel}`);
  }

  const mappings: RecorderReplacementPlan["mappings"] = [];
  const missingChannels: number[] = [];
  for (const camera of oldCameras) {
    const channel = camera.recorderChannel!;
    const candidates = byChannel.get(channel) ?? [];
    const discovery = candidates.length === 1 ? candidates[0] : undefined;
    if (!discovery) {
      missingChannels.push(channel);
      continue;
    }
    if (discovery.credentialsRequired) issues.push(`credentials_required_for_channel:${channel}`);
    if (!discovery.streamVerified) issues.push(`stream_not_verified_for_channel:${channel}`);
    mappings.push({
      cameraId: camera.id,
      discoveryId: discovery.id,
      sourceChannel: channel,
      cameraName: camera.name,
      replacementDisplayName: discovery.displayName ?? `Channel ${channel}`,
    });
  }
  if (missingChannels.length) issues.push(`missing_replacement_channels:${missingChannels.join(",")}`);
  const oldChannelSet = new Set(oldCameras.map((camera) => camera.recorderChannel!));
  const extraChannels = [...byChannel.keys()].filter((channel) => !oldChannelSet.has(channel)).sort((a, b) => a - b);

  return {
    branchId: input.branchId,
    oldRecorderSerialNumber: oldSerial,
    newRecorderSerialNumber: newSerial,
    status: issues.length ? "blocked" : "ready",
    mappings,
    missingChannels,
    extraChannels,
    issues,
    preserved: ["camera IDs", "camera names", "permissions", "recording history", "recording policy", "analytics rules", "alert rules", "reports"],
  };
}

function normalizeSerial(value: string | undefined) {
  return value?.trim().toUpperCase() ?? "";
}


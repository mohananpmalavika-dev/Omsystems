import { attachCredentials, OnvifClient, type OnvifCredentials, type OnvifDeviceDetails } from "../devices/onvif-client.js";
import { probeRtsp, type RtspProbeResult } from "../streaming/rtsp-probe.js";

export type CameraRecoveryStep = "rtsp_reconnect" | "onvif_ping" | "stream_refresh" | "soft_reboot";
export type CameraRecoveryStepStatus = "succeeded" | "failed" | "skipped";

export interface CameraRecoveryStepResult {
  step: CameraRecoveryStep;
  status: CameraRecoveryStepStatus;
  message: string;
  durationMs: number;
}

export interface CameraRecoveryResult {
  cameraId: string;
  recovered: boolean;
  status: "recovered" | "manual_intervention_required";
  startedAt: string;
  completedAt: string;
  steps: CameraRecoveryStepResult[];
  reasonCodes: string[];
}

export interface CameraRecoveryTarget {
  cameraId: string;
  rtspUrl: string;
  onvifDeviceServiceUrls?: string[];
  allowOnvif?: boolean;
}

type OnvifRecoveryClient = Pick<OnvifClient, "ping" | "inspect" | "getStreamUri" | "reboot">;

export interface CameraRecoveryDependencies {
  probeRtsp?: (uri: string, ffprobePath: string, timeoutMs: number) => Promise<RtspProbeResult>;
  createOnvifClient?: (url: string, credentials: OnvifCredentials, timeoutMs: number) => OnvifRecoveryClient;
  wait?: (milliseconds: number) => Promise<void>;
  rebootWaitMs?: number;
}

export async function recoverCamera(
  target: CameraRecoveryTarget,
  options: { ffprobePath: string; timeoutMs: number },
  dependencies: CameraRecoveryDependencies = {},
): Promise<CameraRecoveryResult> {
  const startedAt = new Date().toISOString();
  const steps: CameraRecoveryStepResult[] = [];
  const reasonCodes = ["camera_recovery_started"];
  const probe = dependencies.probeRtsp ?? probeRtsp;
  const createOnvifClient = dependencies.createOnvifClient ??
    ((url, credentials, timeoutMs) => new OnvifClient(url, credentials, timeoutMs));
  const wait = dependencies.wait ?? delay;

  const firstProbe = await runProbe(target.rtspUrl, options, probe);
  steps.push(stepResult(
    "rtsp_reconnect",
    firstProbe.reachable ? "succeeded" : "failed",
    firstProbe.reachable
      ? "A new RTSP connection was established from the branch edge agent."
      : `RTSP reconnect failed: ${firstProbe.error ?? "camera stream is unreachable"}`,
    firstProbe.durationMs,
  ));
  if (firstProbe.reachable) {
    reasonCodes.push("rtsp_reconnect_succeeded");
    return complete(target.cameraId, true, startedAt, steps, reasonCodes);
  }
  reasonCodes.push("rtsp_reconnect_failed");

  if (target.allowOnvif === false) {
    steps.push(stepResult(
      "onvif_ping",
      "skipped",
      "ONVIF recovery is not applied to a recorder channel; only its locally verified RTSP stream is retried.",
      0,
    ));
    reasonCodes.push("onvif_recovery_not_applicable");
    return complete(target.cameraId, false, startedAt, steps, reasonCodes);
  }

  const credentials = credentialsFromRtspUrl(target.rtspUrl);
  if (!credentials) {
    steps.push(stepResult(
      "onvif_ping",
      "skipped",
      "ONVIF recovery was skipped because the local RTSP secret does not contain camera credentials.",
      0,
    ));
    reasonCodes.push("onvif_credentials_unavailable");
    return complete(target.cameraId, false, startedAt, steps, reasonCodes);
  }

  let responsiveClient: OnvifRecoveryClient | undefined;
  for (const endpoint of onvifDeviceServiceCandidates(target.rtspUrl, target.onvifDeviceServiceUrls)) {
    const client = createOnvifClient(endpoint, credentials, options.timeoutMs);
    const pingStartedAt = Date.now();
    try {
      await client.ping();
      responsiveClient = client;
      steps.push(stepResult("onvif_ping", "succeeded", `Authenticated ONVIF ping succeeded at ${redactEndpoint(endpoint)}.`, Date.now() - pingStartedAt));
      reasonCodes.push("onvif_ping_succeeded");

      const refreshStartedAt = Date.now();
      try {
        const device = await client.inspect();
        const refreshedUri = await refreshedStreamUri(client, device, credentials);
        if (!refreshedUri) {
          steps.push(stepResult("stream_refresh", "skipped", "The ONVIF device exposed no media profile to refresh.", Date.now() - refreshStartedAt));
          reasonCodes.push("onvif_stream_refresh_unavailable");
          continue;
        }
        const refreshedProbe = await runProbe(refreshedUri, options, probe);
        steps.push(stepResult(
          "stream_refresh",
          refreshedProbe.reachable ? "succeeded" : "failed",
          refreshedProbe.reachable
            ? "The edge agent obtained a fresh ONVIF stream URI and verified video over RTSP."
            : `A fresh ONVIF stream URI was obtained but RTSP remained unavailable: ${refreshedProbe.error ?? "camera stream is unreachable"}`,
          Date.now() - refreshStartedAt,
        ));
        if (refreshedProbe.reachable) {
          reasonCodes.push("onvif_stream_refresh_succeeded");
          return complete(target.cameraId, true, startedAt, steps, reasonCodes);
        }
        reasonCodes.push("onvif_stream_refresh_failed");
      } catch (error) {
        steps.push(stepResult("stream_refresh", "failed", `ONVIF stream refresh failed: ${messageOf(error)}`, Date.now() - refreshStartedAt));
        reasonCodes.push("onvif_stream_refresh_failed");
      }
      break;
    } catch (error) {
      steps.push(stepResult("onvif_ping", "failed", `ONVIF ping failed at ${redactEndpoint(endpoint)}: ${messageOf(error)}`, Date.now() - pingStartedAt));
    }
  }

  if (!responsiveClient) {
    reasonCodes.push("onvif_ping_failed");
    return complete(target.cameraId, false, startedAt, steps, reasonCodes);
  }

  const rebootStartedAt = Date.now();
  try {
    const response = await responsiveClient.reboot();
    await wait(dependencies.rebootWaitMs ?? 45_000);
    const postRebootProbe = await runProbe(target.rtspUrl, options, probe);
    steps.push(stepResult(
      "soft_reboot",
      postRebootProbe.reachable ? "succeeded" : "failed",
      postRebootProbe.reachable
        ? `ONVIF SystemReboot completed and the edge agent verified the RTSP stream: ${response}`
        : `ONVIF SystemReboot was accepted but RTSP did not recover: ${postRebootProbe.error ?? "camera stream is unreachable"}`,
      Date.now() - rebootStartedAt,
    ));
    reasonCodes.push(postRebootProbe.reachable ? "onvif_soft_reboot_succeeded" : "onvif_soft_reboot_failed");
    return complete(target.cameraId, postRebootProbe.reachable, startedAt, steps, reasonCodes);
  } catch (error) {
    steps.push(stepResult("soft_reboot", "failed", `ONVIF SystemReboot failed: ${messageOf(error)}`, Date.now() - rebootStartedAt));
    reasonCodes.push("onvif_soft_reboot_failed");
    return complete(target.cameraId, false, startedAt, steps, reasonCodes);
  }
}

export function onvifDeviceServiceCandidates(rtspUrl: string, configuredUrls: string[] = []) {
  const candidates = configuredUrls.filter(isHttpUrl);
  try {
    const stream = new URL(rtspUrl);
    const host = stream.hostname.includes(":") ? `[${stream.hostname}]` : stream.hostname;
    candidates.push(`http://${host}/onvif/device_service`, `https://${host}/onvif/device_service`);
  } catch {
    // The RTSP probe reports malformed local secrets with the recovery result.
  }
  return [...new Set(candidates)];
}

async function refreshedStreamUri(
  client: OnvifRecoveryClient,
  device: OnvifDeviceDetails,
  credentials: OnvifCredentials,
) {
  const profile = device.profiles[0];
  if (!profile) return undefined;
  return attachCredentials(await client.getStreamUri(device.mediaServiceUrl, profile.token), credentials);
}

async function runProbe(
  uri: string,
  options: { ffprobePath: string; timeoutMs: number },
  probe: (uri: string, ffprobePath: string, timeoutMs: number) => Promise<RtspProbeResult>,
) {
  const startedAt = Date.now();
  try {
    return { ...(await probe(uri, options.ffprobePath, options.timeoutMs)), durationMs: Date.now() - startedAt };
  } catch (error) {
    return {
      reachable: false,
      codec: null,
      width: null,
      height: null,
      error: messageOf(error),
      durationMs: Date.now() - startedAt,
    };
  }
}

function credentialsFromRtspUrl(uri: string): OnvifCredentials | undefined {
  try {
    const parsed = new URL(uri);
    if (!parsed.username) return undefined;
    return { username: decode(parsed.username), password: decode(parsed.password) };
  } catch {
    return undefined;
  }
}

function complete(
  cameraId: string,
  recovered: boolean,
  startedAt: string,
  steps: CameraRecoveryStepResult[],
  reasonCodes: string[],
): CameraRecoveryResult {
  return {
    cameraId,
    recovered,
    status: recovered ? "recovered" : "manual_intervention_required",
    startedAt,
    completedAt: new Date().toISOString(),
    steps,
    reasonCodes: [...new Set([...reasonCodes, recovered ? "camera_recovered" : "camera_manual_intervention_required"])],
  };
}

function stepResult(step: CameraRecoveryStep, status: CameraRecoveryStepStatus, message: string, durationMs: number): CameraRecoveryStepResult {
  return { step, status, message, durationMs };
}

function redactEndpoint(value: string) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return "configured ONVIF endpoint";
  }
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function decode(value: string) {
  try { return decodeURIComponent(value); }
  catch { return value; }
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

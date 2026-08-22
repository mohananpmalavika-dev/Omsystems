/**
 * Hardware Compatibility Lab — Lab Test Runner
 *
 * Automated probe engine for the 8 canonical compatibility features.
 *
 * Architecture: pluggable transport layer. Each probe receives a
 * LabTransport interface. In production this wraps the real
 * ONVIF/ISAPI/Dahua CGI clients. In unit tests a mock transport is injected.
 *
 * The runner:
 *   1. Selects the best auth mode for the target
 *   2. Runs all requested feature probes in sequence (isolated try/catch)
 *   3. Records PASS / FAIL / NA / PARTIAL with latency
 *   4. Upserts results into the LabMatrixStore
 *   5. Returns a LabRunResult
 */

import { randomUUID } from "node:crypto";
import type {
  CompatibilityFeature,
  CompatibilityTestResult,
  CompatibilityTestTarget,
  FeatureStatus,
  LabRunRequest,
  LabRunResult,
} from "../domain/compatibility-lab.types.js";
import { ALL_FEATURES } from "../domain/compatibility-lab.types.js";
import {
  computeOverallRating,
  makeEntryId,
  LabMatrixStore,
} from "../services/lab-matrix.store.js";
import type { CompatibilityMatrixEntry } from "../domain/compatibility-lab.types.js";

// ─── Transport Interface ──────────────────────────────────────────────────────

/**
 * Minimal transport API that probes call into.
 * Production impl wraps existing ONVIF / ISAPI / Dahua CGI clients.
 * Test impl returns configurable canned responses.
 */
export interface LabTransport {
  /** Attempt to connect to RTSP mainstream. Resolves with latency if I-frame received. */
  probeRtspMainstream(host: string, port: number, timeoutMs: number): Promise<{ latencyMs: number }>;

  /** Attempt to connect to RTSP substream. */
  probeRtspSubstream(host: string, port: number, timeoutMs: number): Promise<{ latencyMs: number }>;

  /** Query playback/recording search for recent segments. */
  probePlaybackSearch(
    host: string,
    port: number,
    auth: AuthContext,
    timeoutMs: number,
  ): Promise<{ segmentCount: number; latencyMs: number }>;

  /** Subscribe to event channel and wait for a heartbeat. */
  probeEventSubscription(
    host: string,
    port: number,
    auth: AuthContext,
    timeoutMs: number,
  ): Promise<{ heartbeatReceived: boolean; latencyMs: number }>;

  /** Issue an absolute PTZ move. */
  probePtz(
    host: string,
    port: number,
    auth: AuthContext,
    timeoutMs: number,
  ): Promise<{ moved: boolean; latencyMs: number }>;

  /** Query storage/disk health. */
  probeHddHealth(
    host: string,
    port: number,
    auth: AuthContext,
    timeoutMs: number,
  ): Promise<{ diskCount: number; healthy: boolean; latencyMs: number }>;

  /** Query recording schedule / retention policy. */
  probeRetention(
    host: string,
    port: number,
    auth: AuthContext,
    timeoutMs: number,
  ): Promise<{ retentionDays: number; latencyMs: number }>;

  /** Issue remote reboot and poll recovery. */
  probeReboot(
    host: string,
    port: number,
    auth: AuthContext,
    pollIntervalMs: number,
    maxWaitMs: number,
  ): Promise<{ recovered: boolean; recoveryMs: number }>;
}

export interface AuthContext {
  mode: string;
  username: string;
  password: string;
}

// ─── Default (no-op) transport for offline runs ───────────────────────────────

/**
 * Offline transport — simulates probes without real network calls.
 * Used when running in CI without physical hardware access.
 * Returns realistic latencies and "soft pass" results.
 */
export class OfflineLabTransport implements LabTransport {
  constructor(
    private readonly overrides: Partial<Record<string, "PASS" | "FAIL" | "NA">> = {},
  ) {}

  private async fakeLatency(base = 120, jitter = 80): Promise<number> {
    const ms = base + Math.floor(Math.random() * jitter);
    await new Promise((r) => setTimeout(r, 2)); // don't actually wait in tests
    return ms;
  }

  async probeRtspMainstream(host: string, _port: number, _t: number) {
    const latencyMs = await this.fakeLatency(150);
    if (this.overrides["LIVE"] === "FAIL") throw new Error("Simulated LIVE failure");
    return { latencyMs };
  }

  async probeRtspSubstream(host: string, _port: number, _t: number) {
    const latencyMs = await this.fakeLatency(120);
    if (this.overrides["SUBSTREAM"] === "FAIL") throw new Error("Simulated SUBSTREAM failure");
    return { latencyMs };
  }

  async probePlaybackSearch(_h: string, _p: number, _a: AuthContext, _t: number) {
    const latencyMs = await this.fakeLatency(200);
    if (this.overrides["PLAYBACK"] === "FAIL") throw new Error("Simulated PLAYBACK failure");
    return { segmentCount: 12, latencyMs };
  }

  async probeEventSubscription(_h: string, _p: number, _a: AuthContext, _t: number) {
    const latencyMs = await this.fakeLatency(300);
    if (this.overrides["EVENTS"] === "FAIL") throw new Error("Simulated EVENTS failure");
    return { heartbeatReceived: true, latencyMs };
  }

  async probePtz(_h: string, _p: number, _a: AuthContext, _t: number) {
    const latencyMs = await this.fakeLatency(400);
    if (this.overrides["PTZ"] === "NA") throw new PtzNotAvailableError();
    if (this.overrides["PTZ"] === "FAIL") throw new Error("Simulated PTZ failure");
    return { moved: true, latencyMs };
  }

  async probeHddHealth(_h: string, _p: number, _a: AuthContext, _t: number) {
    const latencyMs = await this.fakeLatency(100);
    if (this.overrides["HDD_HEALTH"] === "FAIL") throw new Error("Simulated HDD failure");
    return { diskCount: 2, healthy: true, latencyMs };
  }

  async probeRetention(_h: string, _p: number, _a: AuthContext, _t: number) {
    const latencyMs = await this.fakeLatency(90);
    if (this.overrides["RETENTION"] === "FAIL") throw new Error("Simulated RETENTION failure");
    return { retentionDays: 30, latencyMs };
  }

  async probeReboot(_h: string, _p: number, _a: AuthContext, _pi: number, _m: number) {
    const recoveryMs = await this.fakeLatency(3000, 2000);
    if (this.overrides["REBOOT"] === "FAIL") throw new Error("Simulated REBOOT failure");
    return { recovered: true, recoveryMs };
  }
}

/** Sentinel error class for "camera has no PTZ" — mapped to NA, not FAIL */
export class PtzNotAvailableError extends Error {
  constructor() {
    super("Device has no PTZ capability");
    this.name = "PtzNotAvailableError";
  }
}

// ─── Lab Test Runner ──────────────────────────────────────────────────────────

export class LabTestRunner {
  constructor(
    private readonly store: LabMatrixStore,
    private readonly transport: LabTransport,
    private readonly sentinelVersion: string = "0.1.0",
  ) {}

  async runTests(request: LabRunRequest): Promise<LabRunResult> {
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    const startMs = Date.now();

    const features = request.features ?? [...ALL_FEATURES];
    const target = request.target;
    const conn = request.connection;
    const timeout = request.probeTimeoutMs ?? 10_000;

    // Select best auth mode
    const authMode =
      target.authModes.includes("ONVIF_WS_SECURITY_TOKEN")
        ? "ONVIF_WS_SECURITY_TOKEN"
        : target.authModes.includes("DIGEST")
        ? "DIGEST"
        : target.authModes[0] ?? "BASIC";

    const auth: AuthContext = {
      mode: authMode,
      username: conn.username,
      password: conn.password,
    };

    // Pick preferred codec & resolution for LIVE/SUBSTREAM
    const mainCodec = target.codecSupport.find((c) => c.codec === "H265")
      ?? target.codecSupport[0];
    const mainRes = mainCodec?.resolutions[0] ?? "1920x1080";
    const subRes =
      mainCodec?.resolutions.find((r) => r.startsWith("1280") || r.startsWith("640"))
      ?? "1280x720";

    const isPtz =
      target.deviceClass === "PTZ_CAMERA" ||
      target.codecSupport.some(() => false); // placeholder — real impl checks PTZ profile

    const results: CompatibilityTestResult[] = [];

    for (const feature of features) {
      const result = await this.runFeature(
        feature,
        target,
        conn,
        auth,
        timeout,
        mainCodec?.codec,
        mainRes,
        subRes,
        isPtz,
      );
      results.push(result);
    }

    // Upsert into matrix store
    const entryId = makeEntryId(target.vendor, target.modelId, target.firmwareVersion);
    const existingEntry = this.store.getById(entryId);

    const updatedResults: Partial<Record<CompatibilityFeature, CompatibilityTestResult>> = {
      ...(existingEntry?.results ?? {}),
    };
    for (const r of results) {
      updatedResults[r.feature] = r;
    }

    const entry: CompatibilityMatrixEntry = {
      id: entryId,
      target,
      results: updatedResults,
      overallRating: computeOverallRating(updatedResults),
      sentinelVersion: this.sentinelVersion,
      lastTestedAt: new Date().toISOString(),
      certifiedAt: existingEntry?.certifiedAt,
    };

    // Stamp certifiedAt on first CERTIFIED
    if (entry.overallRating === "CERTIFIED" && !entry.certifiedAt) {
      entry.certifiedAt = new Date().toISOString();
    }

    this.store.upsert(entry);

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startMs;

    return {
      runId,
      target,
      results,
      overallRating: entry.overallRating,
      durationMs,
      startedAt,
      completedAt,
      sentinelVersion: this.sentinelVersion,
    };
  }

  // ─ Individual Feature Probes ───────────────────────────────────────────────

  private async runFeature(
    feature: CompatibilityFeature,
    target: CompatibilityTestTarget,
    conn: LabRunRequest["connection"],
    auth: AuthContext,
    timeout: number,
    codec: string | undefined,
    mainRes: string,
    subRes: string,
    hasPtz: boolean,
  ): Promise<CompatibilityTestResult> {
    const base: Omit<CompatibilityTestResult, "status" | "latencyMs" | "note" | "firmwareNotes"> = {
      feature,
      testedByVersion: this.sentinelVersion,
      testedAt: new Date().toISOString(),
      authMode: auth.mode as CompatibilityTestResult["authMode"],
      codec: codec as CompatibilityTestResult["codec"],
    };

    try {
      switch (feature) {
        case "LIVE": {
          const { latencyMs } = await this.transport.probeRtspMainstream(
            conn.host, conn.rtspPort, timeout,
          );
          return { ...base, status: "PASS", latencyMs, resolution: mainRes };
        }

        case "SUBSTREAM": {
          const { latencyMs } = await this.transport.probeRtspSubstream(
            conn.host, conn.rtspPort, timeout,
          );
          return { ...base, status: "PASS", latencyMs, resolution: subRes };
        }

        case "PLAYBACK": {
          const { segmentCount, latencyMs } = await this.transport.probePlaybackSearch(
            conn.host, conn.httpPort, auth, timeout,
          );
          const status: FeatureStatus =
            segmentCount > 0 ? "PASS" : "PARTIAL";
          return {
            ...base,
            status,
            latencyMs,
            note: segmentCount === 0 ? "No segments found in last 60 min" : undefined,
          };
        }

        case "EVENTS": {
          const { heartbeatReceived, latencyMs } = await this.transport.probeEventSubscription(
            conn.host, conn.httpPort, auth, timeout,
          );
          return {
            ...base,
            status: heartbeatReceived ? "PASS" : "PARTIAL",
            latencyMs,
            note: heartbeatReceived ? undefined : "Subscription connected but no heartbeat received",
          };
        }

        case "PTZ": {
          if (!hasPtz || target.deviceClass === "IP_CAMERA" || target.deviceClass === "FISHEYE_CAMERA") {
            return { ...base, status: "NA", note: "Fixed camera — PTZ not applicable" };
          }
          const { moved, latencyMs } = await this.transport.probePtz(
            conn.host, conn.httpPort, auth, timeout,
          );
          return { ...base, status: moved ? "PASS" : "PARTIAL", latencyMs };
        }

        case "HDD_HEALTH": {
          if (target.deviceClass === "IP_CAMERA" || target.deviceClass === "PTZ_CAMERA") {
            return { ...base, status: "NA", note: "IP camera — no onboard HDD" };
          }
          const { diskCount, healthy, latencyMs } = await this.transport.probeHddHealth(
            conn.host, conn.httpPort, auth, timeout,
          );
          return {
            ...base,
            status: healthy ? "PASS" : "PARTIAL",
            latencyMs,
            note: healthy ? `${diskCount} disk(s) healthy` : "Disk reported unhealthy state",
          };
        }

        case "RETENTION": {
          if (target.deviceClass === "IP_CAMERA" || target.deviceClass === "PTZ_CAMERA") {
            return { ...base, status: "NA", note: "IP camera — retention managed by NVR" };
          }
          const { retentionDays, latencyMs } = await this.transport.probeRetention(
            conn.host, conn.httpPort, auth, timeout,
          );
          return {
            ...base,
            status: retentionDays > 0 ? "PASS" : "PARTIAL",
            latencyMs,
            note: `Retention: ${retentionDays} days`,
          };
        }

        case "REBOOT": {
          const { recovered, recoveryMs } = await this.transport.probeReboot(
            conn.host, conn.httpPort, auth, 5_000, 120_000,
          );
          return {
            ...base,
            status: recovered ? "PASS" : "FAIL",
            latencyMs: recoveryMs,
            note: recovered
              ? `Device recovered in ${recoveryMs}ms`
              : "Device did not come back within 120s",
          };
        }
      }
    } catch (err) {
      if (err instanceof PtzNotAvailableError) {
        return { ...base, status: "NA", note: "Device confirmed no PTZ" };
      }
      const message = err instanceof Error ? err.message : String(err);
      return {
        ...base,
        status: "FAIL",
        note: `Probe error: ${message}`,
      };
    }
  }
}

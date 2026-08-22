/**
 * Test Suite: LabTestRunner
 *
 * Covers:
 *  - Full 8-feature lab run with offline transport (all PASS)
 *  - Single-feature subset run
 *  - FAIL propagation (transport throws) → result.status = FAIL
 *  - PTZ N/A for IP_CAMERA
 *  - HDD_HEALTH N/A for IP_CAMERA
 *  - RETENTION N/A for IP_CAMERA
 *  - PtzNotAvailableError → NA
 *  - Auth mode selection (prefer ONVIF_WS_SECURITY_TOKEN > DIGEST > first)
 *  - Results written into matrix store
 *  - Codec selection (prefer H265 if available)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { LabMatrixStore, _resetLabMatrixStore } from "../../src/compatibility-lab/services/lab-matrix.store.js";
import {
  LabTestRunner,
  OfflineLabTransport,
  PtzNotAvailableError,
} from "../../src/compatibility-lab/services/lab-test-runner.service.js";
import type {
  CompatibilityTestTarget,
  LabRunRequest,
} from "../../src/compatibility-lab/domain/compatibility-lab.types.js";
import type { LabTransport, AuthContext } from "../../src/compatibility-lab/services/lab-test-runner.service.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNvrTarget(overrides: Partial<CompatibilityTestTarget> = {}): CompatibilityTestTarget {
  return {
    vendor: "CP_PLUS",
    modelId: "CP-UNR-4K4322-V2",
    firmwareVersion: "4.1.0 build 250115",
    generation: "Gen2",
    deviceClass: "NVR",
    authModes: ["DIGEST", "ONVIF_WS_SECURITY_TOKEN"],
    codecSupport: [
      { codec: "H265", resolutions: ["3840x2160", "1920x1080"], smartCodec: true },
      { codec: "H264", resolutions: ["1920x1080"] },
    ],
    ...overrides,
  };
}

function makeCameraTarget(): CompatibilityTestTarget {
  return {
    vendor: "CP_PLUS",
    modelId: "CP-USC-TC91L1-MD",
    firmwareVersion: "3.2.1 build 241001",
    generation: "Gen2",
    deviceClass: "IP_CAMERA",
    authModes: ["DIGEST"],
    codecSupport: [
      { codec: "H264", resolutions: ["1920x1080"] },
      { codec: "H265", resolutions: ["1920x1080"] },
    ],
  };
}

function makePtzTarget(): CompatibilityTestTarget {
  return {
    vendor: "AXIS",
    modelId: "Q6135-LE",
    firmwareVersion: "11.6.94",
    generation: "AXIS OS 11",
    deviceClass: "PTZ_CAMERA",
    authModes: ["DIGEST"],
    codecSupport: [{ codec: "H264", resolutions: ["1920x1080"] }],
  };
}

function makeConnection(): LabRunRequest["connection"] {
  return {
    host: "192.168.1.100",
    httpPort: 80,
    rtspPort: 554,
    username: "admin",
    password: "Admin123!",
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("LabTestRunner", () => {
  let store: LabMatrixStore;
  let transport: OfflineLabTransport;
  let runner: LabTestRunner;

  beforeEach(() => {
    _resetLabMatrixStore();
    store = new LabMatrixStore("0.1.0");
    transport = new OfflineLabTransport();
    runner = new LabTestRunner(store, transport, "0.1.0");
  });

  // ── Full run ─────────────────────────────────────────────────────────────

  it("runs all 8 features for an NVR and stores results", async () => {
    const result = await runner.runTests({
      target: makeNvrTarget(),
      connection: makeConnection(),
      sentinelVersion: "0.1.0",
    });

    expect(result.results).toHaveLength(8);
    expect(result.results.every((r) => r.status !== "NOT_TESTED")).toBe(true);

    // All should pass with offline transport (no overrides)
    const failed = result.results.filter((r) => r.status === "FAIL");
    expect(failed).toHaveLength(0);
  });

  it("stores results into the matrix store after running", async () => {
    await runner.runTests({
      target: makeNvrTarget(),
      connection: makeConnection(),
      sentinelVersion: "0.1.0",
    });

    const stored = store.get("CP_PLUS", "CP-UNR-4K4322-V2", "4.1.0 build 250115");
    expect(stored).toBeDefined();
    expect(stored!.results.LIVE?.status).toBe("PASS");
  });




  it("runs only requested features", async () => {
    const result = await runner.runTests({
      target: makeNvrTarget(),
      features: ["LIVE", "SUBSTREAM"],
      connection: makeConnection(),
      sentinelVersion: "0.1.0",
    });

    expect(result.results).toHaveLength(2);
    const features = result.results.map((r) => r.feature);
    expect(features).toContain("LIVE");
    expect(features).toContain("SUBSTREAM");
  });

  // ── Transport failures ───────────────────────────────────────────────────

  it("records FAIL status when transport throws for LIVE", async () => {
    const failTransport: LabTransport = {
      ...transport,
      probeRtspMainstream: vi.fn().mockRejectedValue(new Error("Connection refused")),
    };
    const failRunner = new LabTestRunner(store, failTransport, "0.1.0");

    const result = await failRunner.runTests({
      target: makeNvrTarget(),
      features: ["LIVE"],
      connection: makeConnection(),
      sentinelVersion: "0.1.0",
    });

    const liveResult = result.results.find((r) => r.feature === "LIVE");
    expect(liveResult?.status).toBe("FAIL");
    expect(liveResult?.note).toContain("Connection refused");
  });

  it("isolates feature failures (one FAIL does not abort other probes)", async () => {
    const partialFailTransport: LabTransport = {
      probeRtspMainstream: vi.fn().mockResolvedValue({ latencyMs: 120 }),
      probeRtspSubstream: vi.fn().mockResolvedValue({ latencyMs: 110 }),
      probePlaybackSearch: vi.fn().mockRejectedValue(new Error("Playback API not found")),
      probeEventSubscription: vi.fn().mockResolvedValue({ heartbeatReceived: true, latencyMs: 200 }),
      probePtz: vi.fn().mockResolvedValue({ moved: true, latencyMs: 300 }),
      probeHddHealth: vi.fn().mockResolvedValue({ diskCount: 1, healthy: true, latencyMs: 90 }),
      probeRetention: vi.fn().mockResolvedValue({ retentionDays: 30, latencyMs: 85 }),
      probeReboot: vi.fn().mockResolvedValue({ recovered: true, recoveryMs: 5000 }),
    };
    const failRunner = new LabTestRunner(store, partialFailTransport, "0.1.0");

    const result = await failRunner.runTests({
      target: makeNvrTarget(),
      features: ["LIVE", "SUBSTREAM", "PLAYBACK", "EVENTS"],
      connection: makeConnection(),
      sentinelVersion: "0.1.0",
    });

    expect(result.results).toHaveLength(4);
    expect(result.results.find((r) => r.feature === "LIVE")?.status).toBe("PASS");
    expect(result.results.find((r) => r.feature === "PLAYBACK")?.status).toBe("FAIL");
    expect(result.results.find((r) => r.feature === "EVENTS")?.status).toBe("PASS");
  });

  // ── N/A logic ────────────────────────────────────────────────────────────

  it("marks PTZ as NA for IP_CAMERA", async () => {
    const result = await runner.runTests({
      target: makeCameraTarget(),
      features: ["PTZ"],
      connection: makeConnection(),
      sentinelVersion: "0.1.0",
    });

    expect(result.results[0]?.status).toBe("NA");
    expect(result.results[0]?.note).toContain("Fixed camera");
  });

  it("marks HDD_HEALTH as NA for IP_CAMERA", async () => {
    const result = await runner.runTests({
      target: makeCameraTarget(),
      features: ["HDD_HEALTH"],
      connection: makeConnection(),
      sentinelVersion: "0.1.0",
    });

    expect(result.results[0]?.status).toBe("NA");
  });

  it("marks RETENTION as NA for IP_CAMERA", async () => {
    const result = await runner.runTests({
      target: makeCameraTarget(),
      features: ["RETENTION"],
      connection: makeConnection(),
      sentinelVersion: "0.1.0",
    });

    expect(result.results[0]?.status).toBe("NA");
  });

  it("maps PtzNotAvailableError to NA", async () => {
    const ptzErrorTransport: LabTransport = {
      ...transport,
      probePtz: vi.fn().mockRejectedValue(new PtzNotAvailableError()),
    };
    const ptzRunner = new LabTestRunner(store, ptzErrorTransport, "0.1.0");

    const result = await ptzRunner.runTests({
      target: makePtzTarget(), // PTZ camera but device responds with not available
      features: ["PTZ"],
      connection: makeConnection(),
      sentinelVersion: "0.1.0",
    });

    expect(result.results[0]?.status).toBe("NA");
    expect(result.results[0]?.note).toContain("no PTZ");
  });

  // ── Auth mode selection ───────────────────────────────────────────────────

  it("prefers ONVIF_WS_SECURITY_TOKEN over DIGEST", async () => {
    const authCapture: string[] = [];
    const capturingTransport: LabTransport = {
      ...transport,
      probePlaybackSearch: vi.fn().mockImplementation(
        async (_h: string, _p: number, auth: AuthContext) => {
          authCapture.push(auth.mode);
          return { segmentCount: 5, latencyMs: 100 };
        },
      ),
    };
    const capturingRunner = new LabTestRunner(store, capturingTransport, "0.1.0");

    await capturingRunner.runTests({
      target: makeNvrTarget({ authModes: ["DIGEST", "ONVIF_WS_SECURITY_TOKEN"] }),
      features: ["PLAYBACK"],
      connection: makeConnection(),
      sentinelVersion: "0.1.0",
    });

    expect(authCapture[0]).toBe("ONVIF_WS_SECURITY_TOKEN");
  });

  // ── Codec selection ───────────────────────────────────────────────────────

  it("records preferred codec in LIVE result", async () => {
    const result = await runner.runTests({
      target: makeNvrTarget(), // has H265 as first codec
      features: ["LIVE"],
      connection: makeConnection(),
      sentinelVersion: "0.1.0",
    });

    expect(result.results[0]?.codec).toBe("H265");
  });

  // ── Overall rating ────────────────────────────────────────────────────────

  it("produces CERTIFIED rating when all 8 features pass or NA", async () => {
    const result = await runner.runTests({
      target: makeNvrTarget(),
      connection: makeConnection(),
      sentinelVersion: "0.1.0",
    });

    // NVR — all 8 features should be PASS (offline transport)
    expect(result.overallRating).toBe("CERTIFIED");
  });

  // ── Incremental results ───────────────────────────────────────────────────

  it("preserves previous feature results when running a subset", async () => {
    await runner.runTests({
      target: makeNvrTarget(),
      features: ["LIVE", "SUBSTREAM"],
      connection: makeConnection(),
      sentinelVersion: "0.1.0",
    });

    await runner.runTests({
      target: makeNvrTarget(),
      features: ["PLAYBACK", "EVENTS"],
      connection: makeConnection(),
      sentinelVersion: "0.1.0",
    });

    const stored = store.get("CP_PLUS", "CP-UNR-4K4322-V2", "4.1.0 build 250115");
    expect(stored?.results.LIVE?.status).toBe("PASS");
    expect(stored?.results.SUBSTREAM?.status).toBe("PASS");
    expect(stored?.results.PLAYBACK?.status).toBe("PASS");
    expect(stored?.results.EVENTS?.status).toBe("PASS");
  });
});

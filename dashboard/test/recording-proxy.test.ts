import { afterEach, describe, expect, it, vi } from "vitest";
import { getRecording, updateRecording } from "../lib/backend";

const originalDemoMode = process.env.DASHBOARD_DEMO_MODE;
const originalControlUrl = process.env.CONTROL_PLANE_INTERNAL_URL;
const originalDevUser = process.env.DASHBOARD_DEV_USER_ID;

afterEach(() => {
  vi.unstubAllGlobals();
  restore("DASHBOARD_DEMO_MODE", originalDemoMode);
  restore("CONTROL_PLANE_INTERNAL_URL", originalControlUrl);
  restore("DASHBOARD_DEV_USER_ID", originalDevUser);
});

describe("recording dashboard proxy", () => {
  it("forwards the employee session instead of the global development identity", async () => {
    process.env.DASHBOARD_DEMO_MODE = "false";
    process.env.CONTROL_PLANE_INTERNAL_URL = "http://control.internal:8080";
    process.env.DASHBOARD_DEV_USER_ID = "user-global-admin";
    const upstream = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => Response.json(recording()));
    vi.stubGlobal("fetch", upstream);

    await getRecording("camera-1", "employee-session");

    const [, init] = upstream.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer employee-session");
    expect(headers.has("x-user-id")).toBe(false);
  });

  it("preserves the complete storage policy when recording is toggled", async () => {
    process.env.DASHBOARD_DEMO_MODE = "false";
    const upstream = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => Response.json(recording()));
    vi.stubGlobal("fetch", upstream);
    const policy = recording();

    await updateRecording("camera-1", { ...policy, enabled: false }, "session");

    const [, init] = upstream.mock.calls[0]!;
    const submitted = JSON.parse(String(init?.body));
    expect(submitted.hotRetentionDays).toBe(30);
    expect(submitted.warmRetentionDays).toBe(60);
    expect(submitted.coldRetentionDays).toBe(90);
    expect(submitted.evidenceProtection).toBe(true);
  });
});

function recording() {
  return {
    cameraId: "camera-1", mode: "continuous" as const, enabled: true,
    status: "recording" as const, retentionDays: 180, postRollSeconds: 30,
    segmentDurationSeconds: 60, hotRetentionDays: 30, warmRetentionDays: 60,
    coldRetentionDays: 90, critical: true, backupRequired: true,
    automaticDeletionEnabled: true, evidenceProtection: true,
    recordMainStream: true,
  };
}

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

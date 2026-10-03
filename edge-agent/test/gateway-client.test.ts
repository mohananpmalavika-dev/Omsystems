import { afterEach, describe, expect, it, vi } from "vitest";
import { GatewayClient } from "../src/registration/gateway-client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GatewayClient", () => {
  it("sends the requested branch on shared-agent bootstrap and device credential requests", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ credentials: [], vpnScanNetworks: [], stored: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new GatewayClient("https://control.example", undefined);
    await client.getDiscoveryBootstrap("shared", "branch-a");
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://control.example/v1/edge-agents/shared/discovery-bootstrap?branchId=branch-a");
    await client.syncDeviceCredentials("shared", [{ host: "10.20.1.10", username: "operator", password: "secret" }], true, "branch-a");
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({ branchId: "branch-a", overwrite: true });
  });
  it('keeps the runtime version on subsequent authenticated requests, including live sessions', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json({}));
    vi.stubGlobal('fetch', fetchMock);
    const client = new GatewayClient('https://control.example.com', undefined);
    await client.heartbeat('agent', '0.1.43');
    await client.consumeLiveSession('agent', 'a'.repeat(64));
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('x-edge-agent-version')).toBe('0.1.43');
  });
  it("preserves a dashboard proxy path when building API requests", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => Response.json({
      agentId: "agent-1",
      branchId: "branch-1",
      agentName: "Branch scanner",
      credential: "credential",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new GatewayClient(
      "https://dashboard.example.com/api/control",
      undefined,
    );
    await client.activate(
      `sgact_${"a".repeat(48)}`,
      "11111111-1111-4111-8111-111111111111",
      "1.0.0",
      "public-key",
    );

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://dashboard.example.com/api/control/v1/edge-enrollment/activate",
    );
  });

  it("surfaces an analytics frame rejected for missing AI configuration", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      accepted: false,
      reason: "analytics_engine_not_configured",
    }, { status: 202 })));
    const client = new GatewayClient("https://dashboard.example.com/api/control", undefined);
    await expect(client.submitAnalyticsFrame("agent-1", {
      cameraId: "camera-1",
      capturedAt: "2026-10-01T10:00:00.000Z",
      width: 640,
      height: 360,
      imageBase64: "frame",
    })).rejects.toThrow("analytics_engine_not_configured");
  });
});

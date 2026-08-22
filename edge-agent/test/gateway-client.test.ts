import { afterEach, describe, expect, it, vi } from "vitest";
import { GatewayClient } from "../src/registration/gateway-client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GatewayClient", () => {
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
});

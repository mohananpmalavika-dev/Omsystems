import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import type { CameraDiscoveryInput } from "../src/control-plane-store.js";
import { DeviceIdentityRepository } from "../src/database/device-identity-repository.js";

describe("Postgres device identity reconciliation", () => {
  it("enriches an existing IP-only identity when a later scan learns hardware claims", async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement.includes("SELECT branch.tenant_id::text")) {
        return { rows: [{ tenant_id: "00000000-0000-4000-8000-000000000001" }] };
      }
      if (statement.includes("FROM unnest")) return { rows: [] };
      if (statement.includes("current_ip_address = $3::inet")) {
        return { rows: [{ id: "00000000-0000-4000-8000-000000000099", camera_id: null }] };
      }
      if (statement.includes("INSERT INTO device_identities")) {
        throw new Error("a second device identity must not be created");
      }
      return { rows: [] };
    });
    const client = { query } as unknown as PoolClient;
    const repository = new DeviceIdentityRepository({} as never);
    const input: CameraDiscoveryInput = {
      edgeAgentId: "00000000-0000-4000-8000-000000000010",
      discoveryMethod: "edge-agent-reported-inventory",
      vendor: "cp-plus",
      manufacturer: "CP PLUS",
      model: "CPPLUS DVR - Web View",
      ipAddress: "192.168.29.171",
      macAddress: "00:11:22:33:44:55",
      hardwareId: "sha256:camera-fingerprint",
      onvifPort: 80,
      rtspPort: 554,
      profiles: [{ name: "unverified", codec: "unknown", width: 1, height: 1 }],
      capabilities: { ptz: false, audio: false, events: false },
    };

    await expect(repository.resolveDiscovery(
      client,
      "00000000-0000-4000-8000-000000000104",
      input,
    )).resolves.toEqual({
      deviceIdentityId: "00000000-0000-4000-8000-000000000099",
    });

    expect(query.mock.calls.some(([statement]) =>
      String(statement).includes("current_ip_address = $3::inet"),
    )).toBe(true);
  });
});

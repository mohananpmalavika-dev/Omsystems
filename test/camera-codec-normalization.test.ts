import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";

describe("camera discovery codec normalization", () => {
  let app: FastifyInstance;
  let store: MemoryStore;

  beforeEach(async () => {
    store = new MemoryStore();
    app = await buildApp({ store });
  });

  afterEach(async () => {
    await app.close();
  });

  it("accepts ffprobe's HEVC codec name as H265", async () => {
    const agent = await store.registerEdgeAgent("branch-blr-001", "Codec test edge", "0.1.2");
    const response = await app.inject({
      method: "POST",
      url: "/v1/branches/branch-blr-001/cameras/discovered",
      headers: { "x-user-id": "user-global-admin" },
      payload: {
        edgeAgentId: agent.id,
        discoveryMethod: "nvr-dvr-channel-discovery",
        vendor: "cp-plus",
        model: "CP PLUS DVR channel",
        ipAddress: "192.168.29.171",
        onvifPort: 80,
        rtspPort: 554,
        profiles: [{ name: "sub", codec: "hevc", width: 640, height: 360 }],
        capabilities: { ptz: false, audio: false, events: false },
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().profiles).toEqual([
      expect.objectContaining({ codec: "H265" }),
    ]);
  });
});

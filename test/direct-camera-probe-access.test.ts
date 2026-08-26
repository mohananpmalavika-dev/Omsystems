import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createServer, type Socket } from "node:net";
import { buildApp } from "../src/app.js";
import { probeNetworkCamera } from "../src/routes/camera-discovery.routes.js";
import { MemoryStore } from "../src/store.js";

describe("direct camera probe access", () => {
  let app: FastifyInstance;
  let store: MemoryStore;

  beforeEach(async () => {
    store = new MemoryStore();
    app = await buildApp({ store });
  });

  afterEach(async () => {
    await app.close();
  });

  it("requires device configuration permission for the selected branch", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/cameras/probe-direct",
      headers: { "x-user-id": "user-south-operator" },
      payload: {
        branchId: "branch-blr-001",
        ipAddress: "192.168.29.171",
        rtspPort: 554,
        username: "operator",
        password: "not-transmitted",
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it("rejects public and link-local targets before opening a probe socket", async () => {
    for (const ipAddress of ["8.8.8.8", "127.0.0.1", "169.254.169.254"]) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/cameras/probe-direct",
        headers: { "x-user-id": "user-global-admin" },
        payload: {
          branchId: "branch-blr-001",
          ipAddress,
          rtspPort: 554,
          username: "operator",
          password: "not-transmitted",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe("direct_probe_requires_private_or_vpn_address");
    }
  });

  it("requires branch configuration permission when discovery evidence is submitted", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/branches/branch-blr-001/cameras/discovered",
      headers: { "x-user-id": "user-south-operator" },
      payload: { edgeAgentId: "not-authorized" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("blocks approval until the branch gateway verifies a stream", async () => {
    const agent = await store.registerEdgeAgent("branch-blr-001", "Approval gate scanner", "1.0.0");
    const submitted = await app.inject({
      method: "POST",
      url: "/v1/branches/branch-blr-001/cameras/discovered",
      headers: { "x-user-id": "user-global-admin" },
      payload: {
        edgeAgentId: agent.id,
        discoveryMethod: "manual-ip-registration",
        vendor: "other",
        model: "Pending RTSP camera",
        ipAddress: "192.168.20.25",
        onvifPort: 80,
        rtspPort: 554,
        credentialsRequired: false,
        streamVerified: false,
        rtspValidated: false,
        duplicateStatus: "unique",
        compatibilityStatus: "compatible",
        profiles: [],
        capabilities: { ptz: false, audio: false, events: false },
      },
    });
    expect(submitted.statusCode).toBe(202);

    const approval = await app.inject({
      method: "POST",
      url: `/v1/branches/branch-blr-001/cameras/discovered/${submitted.json().id}/approve`,
      headers: { "x-user-id": "user-global-admin" },
      payload: { name: "Pending RTSP camera" },
    });
    expect(approval.statusCode).toBe(409);
    expect(approval.json().error).toBe("camera_stream_must_be_verified_before_approval");
  });
});

describe("direct RTSP credential verification", () => {
  async function withRtspServer(
    respond: (request: string, socket: Socket) => void,
    run: (port: number) => Promise<void>,
  ) {
    const sockets = new Set<Socket>();
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      let requestBuffer = "";
      socket.on("data", (chunk) => {
        requestBuffer += chunk.toString();
        let requestEnd = requestBuffer.indexOf("\r\n\r\n");
        while (requestEnd >= 0) {
          const request = requestBuffer.slice(0, requestEnd + 4);
          requestBuffer = requestBuffer.slice(requestEnd + 4);
          respond(request, socket);
          requestEnd = requestBuffer.indexOf("\r\n\r\n");
        }
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test_rtsp_server_port_unavailable");
    try {
      await run(address.port);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  it("uses DESCRIBE and does not treat an unauthenticated OPTIONS response as a verified stream", async () => {
    const methods: string[] = [];
    await withRtspServer((request, socket) => {
      methods.push(request.split(" ")[0] ?? "");
      const sequence = request.match(/CSeq:\s*(\d+)/i)?.[1] ?? "1";
      socket.write(`RTSP/1.0 401 Unauthorized\r\nCSeq: ${sequence}\r\nWWW-Authenticate: Basic realm="Camera"\r\nContent-Length: 0\r\n\r\n`);
    }, async (port) => {
      const result = await probeNetworkCamera("127.0.0.1", port, "operator", "wrong-password");
      expect(methods).toEqual(["DESCRIBE", "DESCRIBE"]);
      expect(result).toMatchObject({ online: true, authenticated: false, authRequired: true, authType: "Basic" });
      expect(result.error).toContain("Invalid camera username or password");
    });
  });

  it("supports a device-provided Digest realm and keeps credentials out of returned URLs", async () => {
    let authenticatedRequest = "";
    await withRtspServer((request, socket) => {
      const sequence = request.match(/CSeq:\s*(\d+)/i)?.[1] ?? "1";
      if (!/Authorization:\s*Digest/i.test(request)) {
        socket.write(`RTSP/1.0 401 Unauthorized\r\nCSeq: ${sequence}\r\nWWW-Authenticate: Digest realm="Branch Camera", nonce="abc123", qop="auth"\r\nContent-Length: 0\r\n\r\n`);
        return;
      }
      authenticatedRequest = request;
      socket.write(`RTSP/1.0 200 OK\r\nCSeq: ${sequence}\r\nServer: Generic RTSP\r\nContent-Length: 0\r\n\r\n`);
    }, async (port) => {
      const result = await probeNetworkCamera("127.0.0.1", port, "operator", "camera-password");
      expect(authenticatedRequest).toContain('realm="Branch Camera"');
      expect(authenticatedRequest).toContain("qop=auth");
      expect(result).toMatchObject({ online: true, authenticated: true, authRequired: true, authType: "Digest" });
      expect(result.streamUrl).toBe(`rtsp://127.0.0.1:${port}/stream1`);
      expect(result.streamUrl).not.toContain("operator");
      expect(result.streamUrl).not.toContain("camera-password");
    });
  });
});

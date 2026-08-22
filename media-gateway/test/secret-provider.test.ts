import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { EnvironmentSecretProvider, HttpStreamSecretProvider } from "../src/secret-provider.js";

describe("EnvironmentSecretProvider", () => {
  it.each([
    "rtsp://camera.example.test/live",
    "rtsps://camera.example.test/live",
    "http://hls-source:8555/index.m3u8",
    "https://media.example.test/index.m3u8",
  ])("accepts supported media source %s", async (source) => {
    const provider = new EnvironmentSecretProvider(JSON.stringify({ camera: source }));

    await expect(provider.resolve("camera")).resolves.toBe(source);
  });

  it("rejects non-media URL protocols", () => {
    expect(
      () => new EnvironmentSecretProvider(JSON.stringify({ camera: "file:///tmp/live" })),
    ).toThrow("RTSP, RTSPS, HTTP, or HTTPS");
  });
});

describe("HttpStreamSecretProvider", () => {
  it("resolves an opaque branch reference without exposing it to the cloud store", async () => {
    const key = "branch-media-key-that-is-at-least-32-bytes";
    const server = createServer((request, response) => {
      expect(request.headers["x-edge-media-key"]).toBe(key);
      expect(new URL(request.url!, "http://localhost").searchParams.get("ref"))
        .toBe("edge://agent-1/discovery-1");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ sourceUri: "rtsp://camera.local/live" }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server unavailable");
    try {
      const provider = new HttpStreamSecretProvider(
        `http://127.0.0.1:${address.port}`,
        key,
      );
      await expect(provider.resolve("edge://agent-1/discovery-1"))
        .resolves.toBe("rtsp://camera.local/live");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => error ? reject(error) : resolve())
      );
    }
  });
});

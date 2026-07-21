import { describe, expect, it } from "vitest";
import { EnvironmentSecretProvider } from "../src/secret-provider.js";

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

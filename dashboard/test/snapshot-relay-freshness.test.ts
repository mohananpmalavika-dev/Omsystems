import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../app/api/media/snapshot-relay/route";
const mocks = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("node:fs", () => ({ promises: { open: mocks.open } }));
vi.mock("../lib/backend", () => ({ checkCameraAccess: async () => ({ allowed: true }) }));
const frames = (globalThis as any).__realCctvFrames as Map<string, { buffer: Buffer; updatedAt: number }>;
afterEach(() => { frames.clear(); mocks.open.mockReset(); vi.unstubAllEnvs(); });
function request() {
  vi.stubEnv("CONTROL_PLANE_INTERNAL_URL", ""); vi.stubEnv("CONTROL_PLANE_URL", "");
  return new NextRequest("https://dashboard.example/api/media/snapshot-relay?cameraId=cam", { headers: { authorization: "Bearer session" } });
}
describe("snapshot freshness", () => {
  it("returns a fresh memory frame with its capture timestamp", async () => {
    const updatedAt = Date.now() - 1000; frames.set("cam", { buffer: Buffer.from("frame"), updatedAt });
    const result = await GET(request());
    expect(result.status).toBe(200); expect(result.headers.get("X-Frame-Updated")).toBe(String(updatedAt));
  });
  it("rejects stale memory and disk frames and closes the file", async () => {
    const updatedAt = Date.now() - 60_000; frames.set("cam", { buffer: Buffer.from("old"), updatedAt });
    const close = vi.fn(async () => {}); const readFile = vi.fn(async () => Buffer.from("old"));
    mocks.open.mockResolvedValue({ stat: async () => ({ mtimeMs: updatedAt }), readFile, close });
    const result = await GET(request());
    expect(result.status).toBe(204); expect(result.headers.get("X-Frame-Stale")).toBe("true");
    expect(readFile).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledOnce();
  });
  it("uses the disk file timestamp instead of request time", async () => {
    const updatedAt = Date.now() - 1500;
    mocks.open.mockResolvedValue({ stat: async () => ({ mtimeMs: updatedAt }), readFile: async () => Buffer.from("frame"), close: async () => {} });
    const result = await GET(request());
    expect(result.status).toBe(200); expect(result.headers.get("X-Frame-Updated")).toBe(String(updatedAt));
  });
});

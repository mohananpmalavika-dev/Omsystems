import { afterEach, describe, expect, it, vi } from "vitest";
import { cameraInventoryApi } from "../lib/api-client";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("installer browser download", () => {
  it("reports streamed progress and keeps the complete ZIP available for the browser handoff", async () => {
    const click = vi.fn();
    const link = { click, remove: vi.fn(), style: {}, href: "", download: "" };
    vi.stubGlobal("document", { createElement: () => link, body: { appendChild: vi.fn() } });
    const timer = vi.fn();
    vi.stubGlobal("window", { setTimeout: timer });
    vi.stubGlobal("sessionStorage", { getItem: () => null });
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:installer");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const payload = new Uint8Array([80, 75, 3, 4, 5, 6]);
    vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
      expect(options.credentials).toBe("include");
      expect(JSON.parse(options.body).format).toBe("zip");
      return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(payload.slice(0, 4));
        controller.enqueue(payload.slice(4));
        controller.close();
      } }), { headers: { "content-type": "application/zip", "content-length": "6" } });
    }));
    const progress = vi.fn();
    await cameraInventoryApi.downloadInstallerFromActivation("branch", {
      activationId: "activation", activationCode: "code", agentName: "Scanner",
    }, progress);
    expect(progress.mock.calls).toEqual([[0, 6], [4, 6], [6, 6]]);
    expect(new Uint8Array(await createUrl.mock.calls[0][0].arrayBuffer())).toEqual(payload);
    expect(link.download).toBe("edge-agent-setup.zip");
    expect(click).toHaveBeenCalledOnce();
    expect(revoke).not.toHaveBeenCalled();
    expect(timer).toHaveBeenCalledWith(expect.any(Function), 60_000);
    timer.mock.calls[0][0]();
    expect(revoke).toHaveBeenCalledWith("blob:installer");
  });

  it("surfaces server package errors instead of saving them as ZIP files", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(
      { message: "The Windows Edge Agent executable is unavailable." }, { status: 503 },
    )));
    await expect(cameraInventoryApi.downloadInstallerFromActivation("branch", {
      activationId: "activation", activationCode: "code", agentName: "Scanner",
    })).rejects.toThrow("executable is unavailable");
  });
});

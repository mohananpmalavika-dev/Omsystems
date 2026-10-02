import { afterEach, describe, expect, it, vi } from "vitest";
import { PaddlePlateRecognizer } from "../src/vehicle/anpr/paddle-ocr-adapter.js";
afterEach(() => vi.unstubAllGlobals());
describe("OCR pixel preprocessing", () => {
  it("preserves grayscale pixels without reading adjacent channels", async () => {
    const fetch = vi.fn(async () => Response.json({ results: [] })); vi.stubGlobal("fetch", fetch);
    await new PaddlePlateRecognizer().recognize({ width: 3, height: 1, channels: 1, data: Uint8Array.of(255, 128, 0) });
    expect([...fetch.mock.calls[0]![1].body]).toEqual([255, 128, 0]);
  });
  it("converts RGB and RGBA consistently and rejects incomplete images", async () => {
    const fetch = vi.fn(async () => Response.json({ results: [] })); vi.stubGlobal("fetch", fetch);
    const recognizer = new PaddlePlateRecognizer();
    await recognizer.recognize({ width: 1, height: 1, channels: 3, data: Uint8Array.of(255, 255, 255) });
    await recognizer.recognize({ width: 1, height: 1, channels: 4, data: Uint8Array.of(255, 255, 255, 0) });
    expect([...fetch.mock.calls[0]![1].body]).toEqual([255]);
    expect([...fetch.mock.calls[1]![1].body]).toEqual([255]);
    await recognizer.recognize({ width: 1, height: 1, channels: 3, data: Uint8Array.of(255) });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

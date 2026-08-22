import { describe, expect, it, vi } from "vitest";
import {
  identifyVendorFamily,
  probeVendorStream,
  vendorRtspCandidates,
} from "../src/devices/vendor-stream-adapter.js";

describe("vendor RTSP fallback adapter", () => {
  it("recognizes common Indian camera and recorder brands", () => {
    expect(identifyVendorFamily("Hikvision DS-2CD")).toBe("hikvision");
    expect(identifyVendorFamily("CP PLUS XVR")).toBe("cp-plus");
    expect(identifyVendorFamily("Secureye DVR")).toBe("cp-plus");
    expect(identifyVendorFamily("Prama NVR")).toBe("hikvision");
    expect(identifyVendorFamily("Tiandy camera")).toBe("tvt");
  });

  it("generates credentialed vendor paths for a recorder channel", () => {
    const candidates = vendorRtspCandidates({
      host: "192.168.1.20",
      vendor: "dahua",
      credentials: { username: "admin", password: "secret" },
      channel: 3,
    });

    expect(candidates[0]?.uri).toContain("admin:secret@192.168.1.20");
    expect(candidates[0]?.uri).toContain("channel=3");
    expect(candidates.map((candidate) => candidate.role)).toEqual(["main", "sub"]);
  });

  it("continues until a vendor path returns decodable video", async () => {
    const probe = vi.fn()
      .mockResolvedValueOnce({ reachable: false, codec: null, width: null, height: null, error: "404" })
      .mockResolvedValueOnce({ reachable: true, codec: "h264", width: 1280, height: 720 });

    const result = await probeVendorStream({
      host: "192.168.1.21",
      vendor: "hikvision",
      credentials: { username: "operator", password: "secret" },
      probe,
    });

    expect(probe).toHaveBeenCalledTimes(2);
    expect(result.candidate).toMatchObject({ vendor: "hikvision", role: "sub", channel: 1 });
    expect(result.probe?.reachable).toBe(true);
  });
});

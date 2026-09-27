import { describe, expect, it } from "vitest";
import {
  identifyVendorFamily,
  vendorRtspCandidates,
  type VendorStreamFamily,
} from "../src/devices/vendor-stream-adapter.js";
import { cameraDetailsForRtspPath } from "../src/discovery/rtsp-network-scan.js";
import { looksLikeRouterOrGateway } from "../src/discovery/recorder-http-fingerprint.js";

describe("Production Camera Brand & RTSP Adapter", () => {
  it("accurately identifies all requested camera brands from hints", () => {
    expect(identifyVendorFamily("Hikvision DS-2CD2143G0-I")).toBe("hikvision");
    expect(identifyVendorFamily("PRAMA India Camera")).toBe("hikvision");
    expect(identifyVendorFamily("Dahua DH-IPC-HFW1230S")).toBe("dahua");
    expect(identifyVendorFamily("Amcrest ProHD 1080P")).toBe("amcrest");
    expect(identifyVendorFamily("CP PLUS CP-UNC-T41ZL4-VMS")).toBe("cp-plus");
    expect(identifyVendorFamily("Axis P3245-V Network Camera")).toBe("axis");
    expect(identifyVendorFamily("Uniview UNV IPC2124LR3-PF40M-D")).toBe("uniview");
    expect(identifyVendorFamily("Reolink RLC-810A 4K")).toBe("reolink");
    expect(identifyVendorFamily("Foscam FI9900P Outdoor")).toBe("foscam");
    expect(identifyVendorFamily("Vivotek IB9368-HT Fixed Bullet")).toBe("vivotek");
    expect(identifyVendorFamily("TP-Link Tapo C200 Pan/Tilt")).toBe("tp-link");
    expect(identifyVendorFamily("TP-Link Kasa Spot Cam")).toBe("tp-link");
    expect(identifyVendorFamily("D-Link DCS-8300LH")).toBe("d-link");
    expect(identifyVendorFamily("Ubiquiti UniFi Protect G4 Bullet")).toBe("ubiquiti");
    expect(identifyVendorFamily("Hanwha Techwin Wisenet XNO-6080R")).toBe("hanwha");
    expect(identifyVendorFamily("Bosch Flexidome IP 5000i")).toBe("bosch");
    expect(identifyVendorFamily("TVT Network Camera")).toBe("tvt");
    expect(identifyVendorFamily("Unknown Standard IPC")).toBe("generic");
  });

  it("generates correct RTSP candidates with credentials for Reolink, Foscam, Vivotek, TP-Link, Dahua, Hikvision", () => {
    const creds = { username: "admin", password: "password123" };

    // Reolink
    const reolink = vendorRtspCandidates({
      host: "192.168.1.100",
      vendor: "reolink",
      credentials: creds,
      channel: 1,
    });
    expect(reolink.some((c) => c.uri.includes("/h264Preview_01_main"))).toBe(true);
    expect(reolink.some((c) => c.uri.includes("admin:password123@192.168.1.100"))).toBe(true);

    // Foscam
    const foscam = vendorRtspCandidates({
      host: "192.168.1.101",
      vendor: "foscam",
      credentials: creds,
      channel: 1,
    });
    expect(foscam.some((c) => c.uri.includes("/videoMain"))).toBe(true);

    // Vivotek
    const vivotek = vendorRtspCandidates({
      host: "192.168.1.102",
      vendor: "vivotek",
      credentials: creds,
      channel: 1,
    });
    expect(vivotek.some((c) => c.uri.includes("/live.sdp"))).toBe(true);

    // TP-Link
    const tplink = vendorRtspCandidates({
      host: "192.168.1.103",
      vendor: "tp-link",
      credentials: creds,
      channel: 1,
    });
    expect(tplink.some((c) => c.uri.includes("/stream1"))).toBe(true);

    // Hikvision
    const hikvision = vendorRtspCandidates({
      host: "192.168.1.104",
      vendor: "hikvision",
      credentials: creds,
      channel: 1,
    });
    expect(hikvision.some((c) => c.uri.includes("/Streaming/Channels/101"))).toBe(true);

    // Dahua
    const dahua = vendorRtspCandidates({
      host: "192.168.1.105",
      vendor: "dahua",
      credentials: creds,
      channel: 1,
    });
    expect(dahua.some((c) => c.uri.includes("/cam/realmonitor?channel=1&subtype=0"))).toBe(true);
  });

  it("extracts camera manufacturer and model from RTSP url patterns", () => {
    expect(cameraDetailsForRtspPath("/Streaming/Channels/101")).toEqual({
      vendor: "hikvision",
      manufacturer: "Hikvision",
      model: "IP Camera",
    });
    expect(cameraDetailsForRtspPath("/cam/realmonitor?channel=1&subtype=0")).toEqual({
      vendor: "other",
      manufacturer: "Dahua",
      model: "IP Camera",
    });
    expect(cameraDetailsForRtspPath("/axis-media/media.amp?camera=1")).toEqual({
      vendor: "other",
      manufacturer: "Axis",
      model: "Network Camera",
    });
    expect(cameraDetailsForRtspPath("/h264Preview_01_main")).toEqual({
      vendor: "other",
      manufacturer: "Reolink",
      model: "IP Camera",
    });
    expect(cameraDetailsForRtspPath("/videoMain")).toEqual({
      vendor: "other",
      manufacturer: "Foscam",
      model: "IP Camera",
    });
    expect(cameraDetailsForRtspPath("/stream1")).toEqual({
      vendor: "other",
      manufacturer: "TP-Link",
      model: "Tapo / Kasa Camera",
    });
    expect(cameraDetailsForRtspPath("/s0")).toEqual({
      vendor: "other",
      manufacturer: "Ubiquiti",
      model: "UniFi Protect Camera",
    });
  });

  it("distinguishes actual routers from IP cameras during gateway protection checks", () => {
    // Cameras must NOT be blocked as routers
    expect(looksLikeRouterOrGateway("TP-Link Tapo C200 IP Camera")).toBe(false);
    expect(looksLikeRouterOrGateway("D-Link Wireless Network Camera DCS-932L")).toBe(false);
    expect(looksLikeRouterOrGateway("Reolink Bullet Security Camera")).toBe(false);
    expect(looksLikeRouterOrGateway("Hikvision Dome Camera Web Interface")).toBe(false);

    // Actual routers MUST be blocked from camera scan
    expect(looksLikeRouterOrGateway("TP-Link Wireless Router Archer AX50")).toBe(true);
    expect(looksLikeRouterOrGateway("Tenda WiFi Router Management Login")).toBe(true);
    expect(looksLikeRouterOrGateway("D-Link Broadband Router Gateway Login")).toBe(true);
    expect(looksLikeRouterOrGateway("OpenWrt Administrative Console")).toBe(true);
  });
});

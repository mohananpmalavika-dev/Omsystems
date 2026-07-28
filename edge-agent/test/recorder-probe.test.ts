import { afterEach, describe, expect, it, vi } from "vitest";
import { looksLikeRecorder, probeRecorder } from "../src/monitoring/recorder-probe.js";

describe("vendor recorder probes", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("identifies recorder identities during ONVIF discovery without classifying ordinary cameras", () => {
    expect(looksLikeRecorder({ manufacturer: "CP PLUS", model: "8 Channel XVR" })).toBe(true);
    expect(looksLikeRecorder({ manufacturer: "Hikvision", model: "DS-2CD2143G2" })).toBe(false);
  });

  it("extracts Hikvision identity, channels and storage through ISAPI", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("<DeviceInfo><model>DS-7608</model><serialNumber>ABC1</serialNumber><firmwareVersion>V5</firmwareVersion><upTime>3600</upTime></DeviceInfo>"))
      .mockResolvedValueOnce(new Response("<hdd><id>1</id><name>HDD1</name><capacity>1000</capacity><freeSpace>500</freeSpace><status>ok</status></hdd>"))
      .mockResolvedValueOnce(new Response("<VideoInputChannel><videoInputEnabled>true</videoInputEnabled></VideoInputChannel><VideoInputChannel><videoInputEnabled>true</videoInputEnabled></VideoInputChannel>"));
    vi.stubGlobal("fetch", fetcher);
    const probe = await probeRecorder({ id: "hik", name: "Main NVR", deviceType: "nvr", vendor: "hikvision", host: "192.0.2.1", port: 80 }, 1000);
    expect(probe.metrics).toMatchObject({ reachable: true, status: "online", model: "DS-7608", serialNumber: "ABC1", totalCameras: 2, connectedCameras: 2 });
    expect(probe.hddStatus).toHaveLength(1);
  });

  it("uses the configurable CP PLUS OEM API paths conservatively", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("deviceType=CP-UVR\nserialNumber=CP1\nsoftwareVersion=4.0"))
      .mockResolvedValueOnce(new Response("Storage[0].Name=Disk1\nStorage[0].State=Normal"))
      .mockResolvedValueOnce(new Response("ChannelTitle[0].Name=Camera 1"));
    vi.stubGlobal("fetch", fetcher);
    const probe = await probeRecorder({ id: "cp", name: "CP DVR", deviceType: "dvr", vendor: "cp-plus", host: "192.0.2.2", port: 80, systemPath: "/documented/system", storagePath: "/documented/storage" }, 1000);
    expect(probe.metrics).toMatchObject({ reachable: true, protocol: "cp-plus-oem-api", model: "CP-UVR", totalCameras: 1 });
    expect(fetcher.mock.calls[0]?.[0]).toContain("/documented/system");
  });
});

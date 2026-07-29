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
      .mockResolvedValueOnce(new Response("<VideoInputChannel><videoInputEnabled>true</videoInputEnabled></VideoInputChannel><VideoInputChannel><videoInputEnabled>true</videoInputEnabled></VideoInputChannel>"))
      .mockResolvedValueOnce(new Response("<CMSearchResult><matchList><searchMatchItem><trackID>101</trackID></searchMatchItem></matchList></CMSearchResult>"));
    vi.stubGlobal("fetch", fetcher);
    const probe = await probeRecorder({ id: "hik", name: "Main NVR", deviceType: "nvr", vendor: "hikvision", host: "192.0.2.1", port: 80 }, 1000);
    expect(probe.metrics).toMatchObject({ reachable: true, status: "online", model: "DS-7608", modelSource: "vendor-system", serialNumber: "ABC1", totalCameras: 2, connectedCameras: 2, recordingStatus: "recording", recordingChannels: 1, recordingStatusSource: "recent-media-search" });
    expect(fetcher.mock.calls[3]?.[0]).toContain("/ISAPI/ContentMgmt/search");
    expect(fetcher.mock.calls[3]?.[1]?.body).toContain("CMSearchDescription");
    expect(probe.hddStatus).toHaveLength(1);
  });

  it("uses the configurable CP PLUS OEM API paths conservatively", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("deviceType=CP-UVR\nserialNumber=CP1\nsoftwareVersion=4.0"))
      .mockResolvedValueOnce(new Response("Storage[0].Name=Disk1\nStorage[0].State=Normal"))
      .mockResolvedValueOnce(new Response("ChannelTitle[0].Name=Camera 1"))
      .mockResolvedValueOnce(new Response("object=0"))
      .mockResolvedValueOnce(new Response("OK"))
      .mockResolvedValueOnce(new Response("found=1\nitems[0].Channel=0"))
      .mockResolvedValueOnce(new Response("OK"));
    vi.stubGlobal("fetch", fetcher);
    const probe = await probeRecorder({ id: "cp", name: "CP DVR", deviceType: "dvr", vendor: "cp-plus", host: "192.0.2.2", port: 80, systemPath: "/documented/system", storagePath: "/documented/storage" }, 1000);
    expect(probe.metrics).toMatchObject({ reachable: true, protocol: "cp-plus-oem-api", model: "CP-UVR", modelSource: "vendor-system", totalCameras: 1, recordingStatus: "recording", recordingChannels: 1, recordingStatusSource: "recent-media-search" });
    expect(fetcher.mock.calls[0]?.[0]).toContain("/documented/system");
    expect(fetcher.mock.calls[5]?.[0]).toContain("action=findNextFile");
  });

  it("uses a recent ONVIF Search summary as activity evidence", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("<GetDeviceInformationResponse><Model>Generic NVR</Model><SerialNumber>ONVIF1</SerialNumber><FirmwareVersion>1.0</FirmwareVersion></GetDeviceInformationResponse>"))
      .mockResolvedValueOnce(new Response("<GetCapabilitiesResponse><Capabilities><Search><XAddr>http://192.0.2.3:80/onvif/search_service</XAddr></Search></Capabilities></GetCapabilitiesResponse>"))
      .mockResolvedValueOnce(new Response(`<GetRecordingSummaryResponse><Summary><NumberRecordings>1</NumberRecordings><DataUntil>${new Date().toISOString()}</DataUntil></Summary></GetRecordingSummaryResponse>`));
    vi.stubGlobal("fetch", fetcher);

    const probe = await probeRecorder({ id: "onvif", name: "Generic NVR", deviceType: "nvr", vendor: "onvif", host: "192.0.2.3", port: 80 }, 1000);

    expect(probe.metrics).toMatchObject({ reachable: true, recordingStatus: "recording", recordingChannels: null, recordingStatusSource: "recording-summary" });
    expect(fetcher.mock.calls[1]?.[1]?.body).toContain("GetCapabilities");
    expect(fetcher.mock.calls[2]?.[1]?.body).toContain("GetRecordingSummary");
  });
});

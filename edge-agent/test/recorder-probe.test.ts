import { afterEach, describe, expect, it, vi } from "vitest";
import { looksLikeRecorder, probeRecorder } from "../src/monitoring/recorder-probe.js";

describe("vendor recorder probes", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("identifies recorder identities during ONVIF discovery without classifying ordinary cameras", () => {
    expect(looksLikeRecorder({ manufacturer: "CP PLUS", model: "8 Channel XVR" })).toBe(true);
    expect(looksLikeRecorder({ manufacturer: "Hikvision", model: "DS-2CD2143G2" })).toBe(false);
  });

  it("extracts Hikvision identity, channels and storage through ISAPI", async () => {
    const recordedAt = new Date().toISOString();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("<DeviceInfo><model>DS-7608</model><serialNumber>ABC1</serialNumber><firmwareVersion>V5</firmwareVersion><upTime>3600</upTime></DeviceInfo>"))
      .mockResolvedValueOnce(new Response("<Storage><raidStatus>degraded</raidStatus><raidLevel>RAID5</raidLevel><hdd><id>1</id><name>HDD1</name><serialNumber>DISK-1</serialNumber><capacity>4000GB</capacity><freeSpace>1200GB</freeSpace><status>ok</status><smartStatus>healthy</smartStatus><writeStatus>verified</writeStatus></hdd></Storage>"))
      .mockResolvedValueOnce(new Response("<VideoInputChannel><videoInputEnabled>true</videoInputEnabled></VideoInputChannel><VideoInputChannel><videoInputEnabled>true</videoInputEnabled></VideoInputChannel>"))
      .mockResolvedValueOnce(new Response("<InputProxyChannelStatus><id>1</id><online>true</online></InputProxyChannelStatus><InputProxyChannelStatus><id>2</id><online>true</online></InputProxyChannelStatus>"))
      .mockResolvedValueOnce(new Response(`<CMSearchResult><matchList><searchMatchItem><trackID>101</trackID><endTime>${recordedAt}</endTime></searchMatchItem></matchList></CMSearchResult>`));
    vi.stubGlobal("fetch", fetcher);
    const probe = await probeRecorder({ id: "hik", name: "Main NVR", deviceType: "nvr", vendor: "hikvision", host: "192.0.2.1", port: 80 }, 1000);
    expect(probe.metrics).toMatchObject({ reachable: true, status: "online", model: "DS-7608", modelSource: "vendor-system", serialNumber: "ABC1", totalCameras: 2, connectedCameras: 2, recordingStatus: "partial", recordingChannels: 1, recordingStatusSource: "recent-media-search", lastRecordedAt: recordedAt });
    expect(probe.channelHealth).toEqual([
      expect.objectContaining({ sourceChannel: 1, status: "recording", connected: true, lastRecordedAt: recordedAt }),
      expect.objectContaining({ sourceChannel: 2, status: "stopped", connected: true }),
    ]);
    expect(fetcher.mock.calls[4]?.[0]).toContain("/ISAPI/ContentMgmt/search");
    expect(fetcher.mock.calls[4]?.[1]?.body).toContain("<trackID>101</trackID><trackID>201</trackID>");
    expect(probe.hddStatus).toEqual([expect.objectContaining({
      diskNo: "1", serialNumber: "DISK-1", capacity: "4000GB", freeSpace: "1200GB",
      smartStatus: "healthy", raidStatus: "degraded", raidLevel: "RAID5", writeVerification: "verified",
    })]);
  });

  it("uses the configurable CP PLUS OEM API paths conservatively", async () => {
    const recordedAt = "2026-07-30 12:00:00";
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("deviceType=CP-UVR\nserialNumber=CP1\nsoftwareVersion=4.0"))
      .mockResolvedValueOnce(new Response("RAID.State=Optimal\nRAID.Level=RAID1\nStorage[0].Name=Disk1\nStorage[0].State=Normal\nStorage[0].Capacity=4TB\nStorage[0].FreeSpace=1TB"))
      .mockResolvedValueOnce(new Response("ChannelTitle[0].Name=Camera 1"))
      .mockResolvedValueOnce(new Response("result="))
      .mockResolvedValueOnce(new Response("object=0"))
      .mockResolvedValueOnce(new Response("OK"))
      .mockResolvedValueOnce(new Response(`found=1\nitems[0].Channel=0\nitems[0].EndTime=${recordedAt}`))
      .mockResolvedValueOnce(new Response("found=0"))
      .mockResolvedValueOnce(new Response("OK"));
    vi.stubGlobal("fetch", fetcher);
    const probe = await probeRecorder({ id: "cp", name: "CP DVR", deviceType: "dvr", vendor: "cp-plus", host: "192.0.2.2", port: 80, systemPath: "/documented/system", storagePath: "/documented/storage" }, 1000);
    expect(probe.metrics).toMatchObject({ reachable: true, protocol: "cp-plus-oem-api", model: "CP-UVR", modelSource: "vendor-system", totalCameras: 1, connectedCameras: 1, recordingStatus: "recording", recordingChannels: 1, recordingStatusSource: "recent-media-search", lastRecordedAt: new Date(recordedAt.replace(" ", "T")).toISOString() });
    expect(fetcher.mock.calls[0]?.[0]).toContain("/documented/system");
    expect(fetcher.mock.calls[6]?.[0]).toContain("action=findNextFile");
    expect(probe.hddStatus[0]).toMatchObject({ raidStatus: "Optimal", raidLevel: "RAID1" });
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

  it("scans a mapped Hikvision channel's full archive separately from recent recording activity", async () => {
    const now = Date.now();
    const oldest = new Date(now - 35 * 86_400_000).toISOString();
    const newest = new Date(now).toISOString();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("<DeviceInfo><model>DS-7608</model></DeviceInfo>"))
      .mockResolvedValueOnce(new Response("<hdd><id>1</id><status>ok</status></hdd>"))
      .mockResolvedValueOnce(new Response("<VideoInputChannel><id>1</id><videoInputEnabled>true</videoInputEnabled></VideoInputChannel>"))
      .mockResolvedValueOnce(new Response("<InputProxyChannelStatus><id>1</id><online>true</online></InputProxyChannelStatus>"))
      .mockResolvedValueOnce(new Response(`<CMSearchResult><matchList><searchMatchItem><trackID>101</trackID><endTime>${newest}</endTime></searchMatchItem></matchList></CMSearchResult>`))
      .mockResolvedValueOnce(new Response(`<CMSearchResult><numOfMatches>1</numOfMatches><matchList><searchMatchItem><trackID>101</trackID><timeSpan><startTime>${oldest}</startTime><endTime>${newest}</endTime></timeSpan></searchMatchItem></matchList></CMSearchResult>`));
    vi.stubGlobal("fetch", fetcher);

    const probe = await probeRecorder({
      id: "hik", name: "Main NVR", deviceType: "nvr", vendor: "hikvision", host: "192.0.2.1", port: 80,
      archiveRetention: { lookbackDays: 90, maxResults: 5_000, continuityGapSeconds: 30, channels: [{ cameraId: "cam-001", channel: 1 }] },
    }, 1000, { includeArchive: true });

    expect(probe.archiveEvidence).toHaveLength(1);
    expect(probe.archiveEvidence[0]).toMatchObject({
      cameraId: "cam-001", sourceChannel: 1, status: "available", coverageComplete: true,
      oldestContinuousAt: oldest, newestPlayableAt: newest, retentionLowerBound: false,
    });
    expect(fetcher.mock.calls[5]?.[0]).toContain("/ISAPI/ContentMgmt/search");
    expect(fetcher.mock.calls[5]?.[1]?.body).toContain("<trackID>101</trackID>");
  });

  it("detects gaps inside a complete recorder archive", async () => {
    const now = Date.now();
    const firstStart = new Date(now - 60_000).toISOString();
    const firstEnd = new Date(now - 50_000).toISOString();
    const secondStart = new Date(now - 10_000).toISOString();
    const secondEnd = new Date(now).toISOString();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("<DeviceInfo><model>DS-7608</model></DeviceInfo>"))
      .mockResolvedValueOnce(new Response("<hdd><id>1</id><status>ok</status></hdd>"))
      .mockResolvedValueOnce(new Response("<VideoInputChannel><id>1</id></VideoInputChannel>"))
      .mockResolvedValueOnce(new Response("<InputProxyChannelStatus><id>1</id><online>true</online></InputProxyChannelStatus>"))
      .mockResolvedValueOnce(new Response(`<CMSearchResult><searchMatchItem><trackID>101</trackID><endTime>${secondEnd}</endTime></searchMatchItem></CMSearchResult>`))
      .mockResolvedValueOnce(new Response(`<CMSearchResult><numOfMatches>2</numOfMatches><searchMatchItem><trackID>101</trackID><startTime>${firstStart}</startTime><endTime>${firstEnd}</endTime></searchMatchItem><searchMatchItem><trackID>101</trackID><startTime>${secondStart}</startTime><endTime>${secondEnd}</endTime></searchMatchItem></CMSearchResult>`));
    vi.stubGlobal("fetch", fetcher);

    const probe = await probeRecorder({
      id: "hik", name: "Main NVR", deviceType: "nvr", vendor: "hikvision", host: "192.0.2.1", port: 80,
      archiveRetention: { lookbackDays: 1, maxResults: 5_000, continuityGapSeconds: 30, channels: [{ cameraId: "cam-001", channel: 1 }] },
    }, 1000, { includeArchive: true });

    expect(probe.archiveEvidence[0]).toMatchObject({ gapCount: 1, largestGapSeconds: 40 });
    expect(probe.archiveEvidence[0]?.reasonCodes).toContain("recorder_archive_gaps_detected");
  });
});

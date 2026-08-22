import { describe, it, expect, vi } from "vitest";
import { SoapClient } from "../../src/onvif/soap/soap-client.js";
import { DeviceService } from "../../src/onvif/services/device-service.js";
import { MediaService } from "../../src/onvif/services/media-service.js";
import { PtzService } from "../../src/onvif/services/ptz-service.js";
import { ImagingService } from "../../src/onvif/services/imaging-service.js";
import { EventsService } from "../../src/onvif/services/events-service.js";
import { OnvifCameraClient } from "../../src/onvif/onvif-camera-client.js";

describe("ONVIF Core WSDL Services Suite", () => {
  it("executes Device Management queries (DeviceInfo, SystemDateAndTime, Capabilities)", async () => {
    const mockSoap = new SoapClient();
    vi.spyOn(mockSoap, "request").mockImplementation(async (opts) => {
      if (opts.action?.includes("GetDeviceInformation")) {
        return `
<tds:GetDeviceInformationResponse xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <tds:Manufacturer>Hikvision</tds:Manufacturer>
  <tds:Model>DS-2CD2143G0-I</tds:Model>
  <tds:FirmwareVersion>V5.6.5_200316</tds:FirmwareVersion>
  <tds:SerialNumber>DS-2CD2143G0-I20200316AAWR123456789</tds:SerialNumber>
  <tds:HardwareId>88</tds:HardwareId>
</tds:GetDeviceInformationResponse>`;
      }

      if (opts.action?.includes("GetSystemDateAndTime")) {
        return `
<tds:GetSystemDateAndTimeResponse xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <tds:SystemDateAndTime>
    <tt:DateTimeType>Manual</tt:DateTimeType>
    <tt:DaylightSavings>false</tt:DaylightSavings>
    <tt:TimeZone><tt:TZ>GMT+0</tt:TZ></tt:TimeZone>
    <tt:UTCDateTime>
      <tt:Time><tt:Hour>14</tt:Hour><tt:Minute>30</tt:Minute><tt:Second>0</tt:Second></tt:Time>
      <tt:Date><tt:Year>2026</tt:Year><tt:Month>8</tt:Month><tt:Day>17</tt:Day></tt:Date>
    </tt:UTCDateTime>
  </tds:SystemDateAndTime>
</tds:GetSystemDateAndTimeResponse>`;
      }

      if (opts.action?.includes("GetCapabilities")) {
        return `
<tds:GetCapabilitiesResponse xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <tds:Capabilities>
    <tt:Media><tt:XAddr>http://192.168.1.64/onvif/media_service</tt:XAddr></tt:Media>
    <tt:PTZ><tt:XAddr>http://192.168.1.64/onvif/ptz_service</tt:XAddr></tt:PTZ>
    <tt:Imaging><tt:XAddr>http://192.168.1.64/onvif/imaging_service</tt:XAddr></tt:Imaging>
    <tt:Events><tt:XAddr>http://192.168.1.64/onvif/events_service</tt:XAddr></tt:Events>
  </tds:Capabilities>
</tds:GetCapabilitiesResponse>`;
      }

      return "<ok />";
    });

    const deviceService = new DeviceService("http://192.168.1.64/onvif/device_service", { username: "admin", password: "123" }, mockSoap);

    // 1. Device Info
    const info = await deviceService.getDeviceInformation();
    expect(info.manufacturer).toBe("Hikvision");
    expect(info.model).toBe("DS-2CD2143G0-I");
    expect(info.serialNumber).toBe("DS-2CD2143G0-I20200316AAWR123456789");

    // 2. System Date & Time
    const dt = await deviceService.getSystemDateAndTime();
    expect(dt.dateTimeType).toBe("Manual");
    expect(dt.utcDateTime.getUTCFullYear()).toBe(2026);
    expect(dt.utcDateTime.getUTCHours()).toBe(14);
    expect(dt.utcDateTime.getUTCMinutes()).toBe(30);

    // 3. Capabilities
    const caps = await deviceService.getCapabilities();
    expect(caps.mediaServiceUrl).toBe("http://192.168.1.64/onvif/media_service");
    expect(caps.ptzServiceUrl).toBe("http://192.168.1.64/onvif/ptz_service");
    expect(caps.imagingServiceUrl).toBe("http://192.168.1.64/onvif/imaging_service");
    expect(caps.eventsServiceUrl).toBe("http://192.168.1.64/onvif/events_service");
  });

  it("handles Media profiles and authenticated RTSP / Snapshot URIs", async () => {
    const mockSoap = new SoapClient();
    vi.spyOn(mockSoap, "request").mockImplementation(async (opts) => {
      if (opts.action?.includes("GetProfiles")) {
        return `
<trt:GetProfilesResponse xmlns:trt="http://www.onvif.org/ver10/media/wsdl">
  <trt:Profiles token="Profile_Main" fixed="true">
    <tt:Name>MainStream</tt:Name>
    <tt:VideoEncoderConfiguration token="VEC_Main">
      <tt:Name>H264_Main</tt:Name>
      <tt:Encoding>H264</tt:Encoding>
      <tt:Resolution><tt:Width>2560</tt:Width><tt:Height>1440</tt:Height></tt:Resolution>
      <tt:Quality>4</tt:Quality>
      <tt:RateControl>
        <tt:FrameRateLimit>25</tt:FrameRateLimit>
        <tt:BitrateLimit>6144</tt:BitrateLimit>
      </tt:RateControl>
      <tt:H264><tt:GovLength>50</tt:GovLength><tt:H264Profile>High</tt:H264Profile></tt:H264>
    </tt:VideoEncoderConfiguration>
  </trt:Profiles>
</trt:GetProfilesResponse>`;
      }

      if (opts.action?.includes("GetStreamUri")) {
        return `
<trt:GetStreamUriResponse xmlns:trt="http://www.onvif.org/ver10/media/wsdl">
  <trt:MediaUri>
    <tt:Uri>rtsp://192.168.1.64:554/Streaming/Channels/101</tt:Uri>
  </trt:MediaUri>
</trt:GetStreamUriResponse>`;
      }

      if (opts.action?.includes("GetSnapshotUri")) {
        return `
<trt:GetSnapshotUriResponse xmlns:trt="http://www.onvif.org/ver10/media/wsdl">
  <trt:MediaUri>
    <tt:Uri>http://192.168.1.64/onvif-http/snapshot?channel=1</tt:Uri>
  </trt:MediaUri>
</trt:GetSnapshotUriResponse>`;
      }

      return "<ok />";
    });

    const mediaService = new MediaService(
      "http://192.168.1.64/onvif/media_service",
      { username: "admin", password: "secretPassword" },
      false,
      mockSoap,
    );

    // 1. GetProfiles
    const profiles = await mediaService.getProfiles();
    expect(profiles.length).toBe(1);
    expect(profiles[0].token).toBe("Profile_Main");
    expect(profiles[0].videoEncoderConfiguration?.encoding).toBe("H264");
    expect(profiles[0].videoEncoderConfiguration?.resolution.width).toBe(2560);
    expect(profiles[0].videoEncoderConfiguration?.resolution.height).toBe(1440);
    expect(profiles[0].videoEncoderConfiguration?.bitrateLimitKbps).toBe(6144);

    // 2. GetStreamUri (asserts credential injection)
    const stream = await mediaService.getStreamUri("Profile_Main");
    expect(stream.uri).toContain("rtsp://admin:secretPassword@192.168.1.64:554/Streaming/Channels/101");

    // 3. GetSnapshotUri
    const snapshotUri = await mediaService.getSnapshotUri("Profile_Main");
    expect(snapshotUri).toBe("http://192.168.1.64/onvif-http/snapshot?channel=1");
  });

  it("handles PTZ motion control, presets, and status", async () => {
    const mockSoap = new SoapClient();
    const sentActions: string[] = [];

    vi.spyOn(mockSoap, "request").mockImplementation(async (opts) => {
      sentActions.push(opts.action || "");

      if (opts.action?.includes("GetStatus")) {
        return `
<tptz:GetStatusResponse xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
  <tptz:PTZStatus>
    <tt:Position>
      <tt:PanTilt x="0.25" y="-0.10" />
      <tt:Zoom x="0.5" />
    </tt:Position>
    <tt:MoveStatus>
      <tt:PanTilt>MOVING</tt:PanTilt>
      <tt:Zoom>IDLE</tt:Zoom>
    </tt:MoveStatus>
  </tptz:PTZStatus>
</tptz:GetStatusResponse>`;
      }

      if (opts.action?.includes("GetPresets")) {
        return `
<tptz:GetPresetsResponse xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
  <tptz:Preset token="preset_vault_door"><tt:Name>Vault Door</tt:Name></tptz:Preset>
  <tptz:Preset token="preset_teller_desk"><tt:Name>Teller Desk</tt:Name></tptz:Preset>
</tptz:GetPresetsResponse>`;
      }

      return "<ok />";
    });

    const ptzService = new PtzService("http://192.168.1.64/onvif/ptz_service", undefined, mockSoap);

    // 1. Continuous Move
    await ptzService.continuousMove("Profile_Main", { x: 0.5, y: -0.2, z: 0.0 }, 5);
    expect(sentActions).toContain("http://www.onvif.org/ver20/ptz/wsdl/ContinuousMove");

    // 2. Stop
    await ptzService.stop("Profile_Main", true, true);
    expect(sentActions).toContain("http://www.onvif.org/ver20/ptz/wsdl/Stop");

    // 3. Status
    const status = await ptzService.getStatus("Profile_Main");
    expect(status.position.panTilt?.x).toBe(0.25);
    expect(status.position.panTilt?.y).toBe(-0.10);
    expect(status.position.zoom?.x).toBe(0.5);
    expect(status.moveStatus.panTilt).toBe("MOVING");
    expect(status.moveStatus.zoom).toBe("IDLE");

    // 4. Presets
    const presets = await ptzService.getPresets("Profile_Main");
    expect(presets.length).toBe(2);
    expect(presets[0].name).toBe("Vault Door");
    expect(presets[1].name).toBe("Teller Desk");
  });

  it("handles Imaging settings and optical controls", async () => {
    const mockSoap = new SoapClient();
    vi.spyOn(mockSoap, "request").mockImplementation(async (opts) => {
      if (opts.action?.includes("GetImagingSettings")) {
        return `
<timg:GetImagingSettingsResponse xmlns:timg="http://www.onvif.org/ver20/imaging/wsdl">
  <timg:ImagingSettings>
    <tt:Brightness>60.0</tt:Brightness>
    <tt:Contrast>55.0</tt:Contrast>
    <tt:ColorSaturation>50.0</tt:ColorSaturation>
    <tt:Sharpness>70.0</tt:Sharpness>
    <tt:IrCutFilter>AUTO</tt:IrCutFilter>
    <tt:WideDynamicRange><tt:Mode>ON</tt:Mode><tt:Level>80</tt:Level></tt:WideDynamicRange>
  </timg:ImagingSettings>
</timg:GetImagingSettingsResponse>`;
      }
      return "<ok />";
    });

    const imaging = new ImagingService("http://192.168.1.64/onvif/imaging_service", undefined, mockSoap);
    const settings = await imaging.getImagingSettings("VideoSource0");

    expect(settings.brightness).toBe(60.0);
    expect(settings.contrast).toBe(55.0);
    expect(settings.irCutFilter).toBe("AUTO");
    expect(settings.wideDynamicRange?.mode).toBe("ON");
    expect(settings.wideDynamicRange?.level).toBe(80);
  });

  it("handles Events PullPoint subscription and parsed notification messages", async () => {
    const mockSoap = new SoapClient();
    vi.spyOn(mockSoap, "request").mockImplementation(async (opts) => {
      if (opts.action?.includes("CreatePullPointSubscription")) {
        return `
<tev:CreatePullPointSubscriptionResponse xmlns:tev="http://www.onvif.org/ver10/events/wsdl">
  <tev:SubscriptionReference>
    <wsa:Address>http://192.168.1.64/onvif/pullpoint_sub1</wsa:Address>
  </tev:SubscriptionReference>
  <tev:CurrentTime>2026-08-17T17:00:00Z</tev:CurrentTime>
  <tev:TerminationTime>2026-08-17T17:10:00Z</tev:TerminationTime>
</tev:CreatePullPointSubscriptionResponse>`;
      }

      if (opts.action?.includes("PullMessages")) {
        return `
<tev:PullMessagesResponse xmlns:tev="http://www.onvif.org/ver10/events/wsdl">
  <tev:CurrentTime>2026-08-17T17:00:05Z</tev:CurrentTime>
  <tev:TerminationTime>2026-08-17T17:10:00Z</tev:TerminationTime>
  <wsnt:NotificationMessage xmlns:wsnt="http://docs.oasis-open.org/wsn/b-2">
    <wsnt:Topic>tns1:RuleEngine/CellMotionDetector/Motion</wsnt:Topic>
    <wsnt:Message UtcTime="2026-08-17T17:00:04Z" PropertyOperation="Changed">
      <tt:Source><tt:SimpleItem Name="VideoSourceConfigurationToken" Value="VideoSource0" /></tt:Source>
      <tt:Data><tt:SimpleItem Name="IsMotion" Value="true" /></tt:Data>
    </wsnt:Message>
  </wsnt:NotificationMessage>
</tev:PullMessagesResponse>`;
      }

      return "<ok />";
    });

    const events = new EventsService("http://192.168.1.64/onvif/events_service", undefined, mockSoap);

    // 1. Create PullPoint
    const sub = await events.createPullPointSubscription();
    expect(sub.subscriptionAddress).toBe("http://192.168.1.64/onvif/pullpoint_sub1");

    // 2. Pull Messages
    const result = await events.pullMessages(sub.subscriptionAddress, 10, 5000);
    expect(result.messages.length).toBe(1);
    expect(result.messages[0].topic).toBe("tns1:RuleEngine/CellMotionDetector/Motion");
    expect(result.messages[0].sourceName).toBe("VideoSourceConfigurationToken");
    expect(result.messages[0].sourceValue).toBe("VideoSource0");
    expect(result.messages[0].dataName).toBe("IsMotion");
    expect(result.messages[0].dataValue).toBe(true);
  });
});

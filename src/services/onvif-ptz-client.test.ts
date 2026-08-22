/**
 * ONVIF PTZ Client Tests
 * Comprehensive test suite for PTZ operations
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OnvifPtzClient } from "./onvif-ptz-client.js";

describe("OnvifPtzClient", () => {
  let fetchMock: any;

  beforeEach(() => {
    fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any, init: any) => {
      const body = String(init?.body ?? "");
      if (body.includes("GetDeviceInformation")) {
        return xmlResponse(deviceInfoXml());
      }
      if (body.includes("GetCapabilities")) {
        return xmlResponse(capabilitiesWithPtzXml());
      }
      if (body.includes("GetProfiles")) {
        return xmlResponse(profilesXml());
      }
      if (body.includes("GetSystemDateAndTime")) {
        return xmlResponse(systemDateAndTimeXml());
      }
      if (body.includes("GetConfigurations")) {
        return xmlResponse(ptzConfigurationsXml());
      }
      if (body.includes("AbsoluteMove")) {
        return xmlResponse(absoluteMoveResponseXml());
      }
      if (body.includes("ContinuousMove")) {
        return xmlResponse(continuousMoveResponseXml());
      }
      if (body.includes("Stop")) {
        return xmlResponse(stopResponseXml());
      }
      if (body.includes("GetPresets")) {
        return xmlResponse(getPresetsResponseXml());
      }
      if (body.includes("GotoPreset")) {
        return xmlResponse(gotoPresetResponseXml());
      }
      if (body.includes("SetPreset")) {
        return xmlResponse(setPresetResponseXml("preset1"));
      }
      if (body.includes("RemovePreset")) {
        return xmlResponse(removePresetResponseXml());
      }
      if (body.includes("GetStatus")) {
        return xmlResponse(getStatusResponseXml());
      }
      if (body.includes("GotoHomePosition")) {
        return xmlResponse(gotoHomeResponseXml());
      }
      return xmlResponse(`<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body/></s:Envelope>`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ========== Authentication Tests ==========

  describe("Authentication", () => {
    it("should authenticate with username and password", async () => {
      fetchMock
        .mockResolvedValueOnce(xmlResponse(deviceInfoXml()))
        .mockResolvedValueOnce(xmlResponse(capabilitiesWithPtzXml()))
        .mockResolvedValueOnce(xmlResponse(profilesXml()));

      const client = new OnvifPtzClient(
        "http://camera.local/onvif/device_service",
        { username: "admin", password: "admin123" },
      );

      const result = await client.initialize();
      expect(result.ptzSupported).toBe(true);

      // Verify WS-Security headers were used
      const authBody = String(fetchMock.mock.calls[0]?.[1]?.body);
      expect(authBody).toContain("UsernameToken");
      expect(authBody).toContain("PasswordDigest");
    });

    it("should handle empty password for passwordless cameras", async () => {
      fetchMock
        .mockResolvedValueOnce(xmlResponse(deviceInfoXml()))
        .mockResolvedValueOnce(xmlResponse(capabilitiesWithPtzXml()))
        .mockResolvedValueOnce(xmlResponse(profilesXml()));

      const client = new OnvifPtzClient(
        "http://camera.local/onvif/device_service",
        { username: "admin", password: "" },
      );

      await client.initialize();

      // Verify no WS-Security for empty password
      const authBody = String(fetchMock.mock.calls[0]?.[1]?.body);
      expect(authBody).not.toContain("UsernameToken");
    });

    it("should handle HTTP 401 with Digest authentication", async () => {
      fetchMock
        .mockResolvedValueOnce(
          new Response("", {
            status: 401,
            headers: {
              "www-authenticate": 'Digest realm="camera", nonce="abc123", qop="auth"',
            },
          }),
        )
        .mockResolvedValueOnce(xmlResponse(deviceInfoXml()))
        .mockResolvedValueOnce(xmlResponse(capabilitiesWithPtzXml()))
        .mockResolvedValueOnce(xmlResponse(profilesXml()));

      const client = new OnvifPtzClient(
        "http://camera.local/onvif/device_service",
        { username: "operator", password: "secret" },
      );

      await client.initialize();

      const digestAuth = fetchMock.mock.calls[1]?.[1]?.headers;
      expect(digestAuth).toHaveProperty("authorization");
    });
  });

  // ========== Capability Discovery Tests ==========

  describe("Capabilities", () => {
    it("should detect PTZ support and initialize", async () => {
      fetchMock
        .mockResolvedValueOnce(xmlResponse(deviceInfoXml()))
        .mockResolvedValueOnce(xmlResponse(capabilitiesWithPtzXml()))
        .mockResolvedValueOnce(xmlResponse(profilesXml()));

      const client = new OnvifPtzClient(
        "http://camera.local/onvif/device_service",
        { username: "admin", password: "admin123" },
      );

      const result = await client.initialize();
      expect(result.ptzSupported).toBe(true);
      expect(result.profileToken).toBe("main");
    });

    it("should detect when PTZ is not supported", async () => {
      fetchMock
        .mockResolvedValueOnce(xmlResponse(deviceInfoXml()))
        .mockResolvedValueOnce(xmlResponse(capabilitiesNoPtzXml()))
        .mockResolvedValueOnce(xmlResponse(profilesXml()));

      const client = new OnvifPtzClient(
        "http://camera.local/onvif/device_service",
        { username: "admin", password: "admin123" },
      );

      const result = await client.initialize();
      expect(result.ptzSupported).toBe(false);
    });

    it("should get detailed PTZ capabilities", async () => {
      fetchMock
        .mockResolvedValueOnce(xmlResponse(deviceInfoXml()))
        .mockResolvedValueOnce(xmlResponse(capabilitiesWithPtzXml()))
        .mockResolvedValueOnce(xmlResponse(profilesXml()))
        .mockResolvedValueOnce(xmlResponse(ptzConfigurationsXml()));

      const client = new OnvifPtzClient(
        "http://camera.local/onvif/device_service",
        { username: "admin", password: "admin123" },
      );

      await client.initialize();
      const capabilities = await client.getCapabilities();

      expect(capabilities.pan).toBe(true);
      expect(capabilities.tilt).toBe(true);
      expect(capabilities.zoom).toBe(true);
      expect(capabilities.absoluteMove).toBe(true);
      expect(capabilities.continuousMove).toBe(true);
      expect(capabilities.presets.supported).toBe(true);
    });
  });

  // ========== Movement Tests ==========

  describe("Absolute Move", () => {
    it("should execute absolute move command successfully", async () => {
      fetchMock
        .mockResolvedValueOnce(xmlResponse(deviceInfoXml()))
        .mockResolvedValueOnce(xmlResponse(capabilitiesWithPtzXml()))
        .mockResolvedValueOnce(xmlResponse(profilesXml()))
        .mockResolvedValueOnce(xmlResponse(absoluteMoveResponseXml()));

      const client = new OnvifPtzClient(
        "http://camera.local/onvif/device_service",
        { username: "admin", password: "admin123" },
      );

      await client.initialize();
      const result = await client.moveAbsolute(0.5, 0.3, 0.8, 0.5);

      expect(result.status).toBe("succeeded");
      expect(result.message).toContain("Absolute move");

      const moveCall = fetchMock.mock.calls[3];
      const moveBody = String(moveCall?.[1]?.body);
      expect(moveBody).toContain("AbsoluteMove");
      expect(moveBody).toContain('x="0.5"');
      expect(moveBody).toContain('y="0.3"');
    });

    it("should handle absolute move timeout", async () => {
      fetchMock
        .mockResolvedValueOnce(xmlResponse(deviceInfoXml()))
        .mockResolvedValueOnce(xmlResponse(capabilitiesWithPtzXml()))
        .mockResolvedValueOnce(xmlResponse(profilesXml()))
        .mockRejectedValueOnce(new Error("Request timeout"));

      const client = new OnvifPtzClient(
        "http://camera.local/onvif/device_service",
        { username: "admin", password: "admin123" },
        2000,
      );

      await client.initialize();
      const result = await client.moveAbsolute(0.5, 0.3, 0.8);

      expect(result.status).toBe("timed_out");
      expect(result.message).toContain("timed out");
    });

    it("should handle unsupported absolute move", async () => {
      fetchMock
        .mockResolvedValueOnce(xmlResponse(deviceInfoXml()))
        .mockResolvedValueOnce(xmlResponse(capabilitiesWithPtzXml()))
        .mockResolvedValueOnce(xmlResponse(profilesXml()))
        .mockResolvedValueOnce(
          xmlResponse(soapFaultXml("ActionNotSupported", "Absolute move not supported")),
        );

      const client = new OnvifPtzClient(
        "http://camera.local/onvif/device_service",
        { username: "admin", password: "admin123" },
      );

      await client.initialize();
      const result = await client.moveAbsolute(0.5, 0.3, 0.8);

      expect(result.status).toBe("unsupported");
      expect(result.message).toContain("not supported");
    });
  });

  describe("Continuous Move", () => {
    it("should execute continuous move command successfully", async () => {
      fetchMock
        .mockResolvedValueOnce(xmlResponse(deviceInfoXml()))
        .mockResolvedValueOnce(xmlResponse(capabilitiesWithPtzXml()))
        .mockResolvedValueOnce(xmlResponse(profilesXml()))
        .mockResolvedValueOnce(xmlResponse(continuousMoveResponseXml()));

      const client = new OnvifPtzClient(
        "http://camera.local/onvif/device_service",
        { username: "admin", password: "admin123" },
      );

      await client.initialize();
      const result = await client.moveContinuous(0.5, 0, 0);

      expect(result.status).toBe("succeeded");
      expect(result.message).toContain("Continuous move");

      const moveBody = String(fetchMock.mock.calls[3]?.[1]?.body);
      expect(moveBody).toContain("ContinuousMove");
      expect(moveBody).toContain("Velocity");
    });

    it("should handle continuous move with all axes", async () => {
      fetchMock
        .mockResolvedValueOnce(xmlResponse(deviceInfoXml()))
        .mockResolvedValueOnce(xmlResponse(capabilitiesWithPtzXml()))
        .mockResolvedValueOnce(xmlResponse(profilesXml()))
        .mockResolvedValueOnce(xmlResponse(continuousMoveResponseXml()));

      const client = new OnvifPtzClient(
        "http://camera.local/onvif/device_service",
        { username: "admin", password: "admin123" },
      );

      await client.initialize();
      const result = await client.moveContinuous(0.3, -0.2, 0.5);

      expect(result.status).toBe("succeeded");

      const moveBody = String(fetchMock.mock.calls[3]?.[1]?.body);
      expect(moveBody).toContain('x="0.3"');
      expect(moveBody).toContain('y="-0.2"');
      expect(moveBody).toContain('x="0.5"'); // zoom
    });
  });

  describe("Stop", () => {
    it("should execute stop command successfully", async () => {
      fetchMock
        .mockResolvedValueOnce(xmlResponse(deviceInfoXml()))
        .mockResolvedValueOnce(xmlResponse(capabilitiesWithPtzXml()))
        .mockResolvedValueOnce(xmlResponse(profilesXml()))
        .mockResolvedValueOnce(xmlResponse(stopResponseXml()));

      const client = new OnvifPtzClient(
        "http://camera.local/onvif/device_service",
        { username: "admin", password: "admin123" },
      );

      await client.initialize();
      const result = await client.stop();

      expect(result.status).toBe("succeeded");
      expect(result.message).toContain("Stop");

      const stopBody = String(fetchMock.mock.calls[3]?.[1]?.body);
      expect(stopBody).toContain("Stop");
      expect(stopBody).toContain("<tptz:PanTilt>true</tptz:PanTilt>");
      expect(stopBody).toContain("<tptz:Zoom>true</tptz:Zoom>");
    });
  });

  // ========== Preset Tests ==========

  describe("Presets", () => {
    it("should list available presets", async () => {
      fetchMock
        .mockResolvedValueOnce(xmlResponse(deviceInfoXml()))
        .mockResolvedValueOnce(xmlResponse(capabilitiesWithPtzXml()))
        .mockResolvedValueOnce(xmlResponse(profilesXml()))
        .mockResolvedValueOnce(xmlResponse(getPresetsResponseXml()));

      const client = new OnvifPtzClient(
        "http://camera.local/onvif/device_service",
        { username: "admin", password: "admin123" },
      );

      await client.initialize();
      const presets = await client.listPresets();

      expect(presets).toHaveLength(2);
      expect(presets[0]?.name).toBe("Home");
      expect(presets[0]?.token).toBe("preset1");
      expect(presets[1]?.name).toBe("Entrance");
      expect(presets[1]?.token).toBe("preset2");
    });

    it("should go to preset successfully", async () => {
      fetchMock
        .mockResolvedValueOnce(xmlResponse(deviceInfoXml()))
        .mockResolvedValueOnce(xmlResponse(capabilitiesWithPtzXml()))
        .mockResolvedValueOnce(xmlResponse(profilesXml()))
        .mockResolvedValueOnce(xmlResponse(gotoPresetResponseXml()));

      const client = new OnvifPtzClient(
        "http://camera.local/onvif/device_service",
        { username: "admin", password: "admin123" },
      );

      await client.initialize();
      const result = await client.gotoPreset("preset1", 0.8);

      expect(result.status).toBe("succeeded");
      expect(result.message).toContain("preset1");

      const presetBody = String(fetchMock.mock.calls[3]?.[1]?.body);
      expect(presetBody).toContain("GotoPreset");
      expect(presetBody).toContain("preset1");
      expect(presetBody).toContain('x="0.8"'); // speed
    });

    it("should set preset successfully", async () => {
      fetchMock
        .mockResolvedValueOnce(xmlResponse(deviceInfoXml()))
        .mockResolvedValueOnce(xmlResponse(capabilitiesWithPtzXml()))
        .mockResolvedValueOnce(xmlResponse(profilesXml()))
        .mockResolvedValueOnce(xmlResponse(setPresetResponseXml("preset3")));

      const client = new OnvifPtzClient(
        "http://camera.local/onvif/device_service",
        { username: "admin", password: "admin123" },
      );

      await client.initialize();
      const result = await client.setPreset("NewPreset");

      expect(result.status).toBe("succeeded");
      expect(result.presetToken).toBe("preset3");

      const presetBody = String(fetchMock.mock.calls[3]?.[1]?.body);
      expect(presetBody).toContain("SetPreset");
      expect(presetBody).toContain("NewPreset");
    });

    it("should remove preset successfully", async () => {
      fetchMock
        .mockResolvedValueOnce(xmlResponse(deviceInfoXml()))
        .mockResolvedValueOnce(xmlResponse(capabilitiesWithPtzXml()))
        .mockResolvedValueOnce(xmlResponse(profilesXml()))
        .mockResolvedValueOnce(xmlResponse(removePresetResponseXml()));

      const client = new OnvifPtzClient(
        "http://camera.local/onvif/device_service",
        { username: "admin", password: "admin123" },
      );

      await client.initialize();
      const result = await client.removePreset("preset2");

      expect(result.status).toBe("succeeded");
      expect(result.message).toContain("removed");
    });
  });

  // ========== Position Tests ==========

  describe("Position", () => {
    it("should get current PTZ position", async () => {
      fetchMock
        .mockResolvedValueOnce(xmlResponse(deviceInfoXml()))
        .mockResolvedValueOnce(xmlResponse(capabilitiesWithPtzXml()))
        .mockResolvedValueOnce(xmlResponse(profilesXml()))
        .mockResolvedValueOnce(xmlResponse(getStatusResponseXml()));

      const client = new OnvifPtzClient(
        "http://camera.local/onvif/device_service",
        { username: "admin", password: "admin123" },
      );

      await client.initialize();
      const position = await client.getPosition();

      expect(position).not.toBeNull();
      expect(position?.pan).toBe(0.5);
      expect(position?.tilt).toBe(0.3);
      expect(position?.zoom).toBe(0.7);
    });
  });

  // ========== Home Position Tests ==========

  describe("Home Position", () => {
    it("should go to home position successfully", async () => {
      fetchMock
        .mockResolvedValueOnce(xmlResponse(deviceInfoXml()))
        .mockResolvedValueOnce(xmlResponse(capabilitiesWithPtzXml()))
        .mockResolvedValueOnce(xmlResponse(profilesXml()))
        .mockResolvedValueOnce(xmlResponse(gotoHomeResponseXml()));

      const client = new OnvifPtzClient(
        "http://camera.local/onvif/device_service",
        { username: "admin", password: "admin123" },
      );

      await client.initialize();
      const result = await client.gotoHome(0.5);

      expect(result.status).toBe("succeeded");
      expect(result.message).toContain("home");

      const homeBody = String(fetchMock.mock.calls[3]?.[1]?.body);
      expect(homeBody).toContain("GotoHomePosition");
    });
  });

  // ========== Vendor-Specific Tests ==========

  describe("Vendor-Specific Behavior", () => {
    it("should handle vendor-specific errors gracefully", async () => {
      fetchMock
        .mockResolvedValueOnce(xmlResponse(deviceInfoXml()))
        .mockResolvedValueOnce(xmlResponse(capabilitiesWithPtzXml()))
        .mockResolvedValueOnce(xmlResponse(profilesXml()))
        .mockResolvedValueOnce(
          xmlResponse(
            soapFaultXml("VendorSpecific", "Proprietary PTZ protocol required"),
          ),
        );

      const client = new OnvifPtzClient(
        "http://camera.local/onvif/device_service",
        { username: "admin", password: "admin123" },
      );

      await client.initialize();
      const result = await client.moveAbsolute(0.5, 0.3, 0.8);

      expect(result.status).toBe("failed");
      expect(result.vendorSpecific).toBe(true);
    });
  });

  // ========== Malformed Response Tests ==========

  describe("Malformed Responses", () => {
    it("should handle malformed XML gracefully", async () => {
      fetchMock
        .mockResolvedValueOnce(xmlResponse(deviceInfoXml()))
        .mockResolvedValueOnce(xmlResponse(capabilitiesWithPtzXml()))
        .mockResolvedValueOnce(xmlResponse(profilesXml()))
        .mockResolvedValueOnce(
          new Response("<invalid>xml", {
            status: 200,
            headers: { "content-type": "application/soap+xml" },
          }),
        );

      const client = new OnvifPtzClient(
        "http://camera.local/onvif/device_service",
        { username: "admin", password: "admin123" },
      );

      await client.initialize();
      const result = await client.moveAbsolute(0.5, 0.3, 0.8);

      expect(result.status).toBe("failed");
    });

    it("should handle empty responses", async () => {
      fetchMock
        .mockResolvedValueOnce(xmlResponse(deviceInfoXml()))
        .mockResolvedValueOnce(xmlResponse(capabilitiesWithPtzXml()))
        .mockResolvedValueOnce(xmlResponse(profilesXml()))
        .mockResolvedValueOnce(
          new Response("", {
            status: 200,
            headers: { "content-type": "application/soap+xml" },
          }),
        );

      const client = new OnvifPtzClient(
        "http://camera.local/onvif/device_service",
        { username: "admin", password: "admin123" },
      );

      await client.initialize();
      const result = await client.stop();

      expect(result.status).toBe("failed");
    });
  });
});

// ========== Test Helper Functions ==========

function xmlResponse(body: string) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/soap+xml" },
  });
}

function systemDateAndTimeXml() {
  return `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
    xmlns:tds="http://www.onvif.org/ver10/device/wsdl"
    xmlns:tt="http://www.onvif.org/ver10/schema">
    <s:Body><tds:GetSystemDateAndTimeResponse>
      <tds:SystemDateAndTime>
        <tt:DateTimeType>Manual</tt:DateTimeType>
        <tt:DaylightSavings>false</tt:DaylightSavings>
        <tt:UTCDateTime>
          <tt:Time><tt:Hour>12</tt:Hour><tt:Minute>0</tt:Minute><tt:Second>0</tt:Second></tt:Time>
          <tt:Date><tt:Year>2026</tt:Year><tt:Month>8</tt:Month><tt:Day>1</tt:Day></tt:Date>
        </tt:UTCDateTime>
      </tds:SystemDateAndTime>
    </tds:GetSystemDateAndTimeResponse></s:Body>
  </s:Envelope>`;
}

function deviceInfoXml() {
  return `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
    xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
    <s:Body><tds:GetDeviceInformationResponse>
      <tds:Manufacturer>Test</tds:Manufacturer>
      <tds:Model>PTZ Camera</tds:Model>
      <tds:FirmwareVersion>1.0</tds:FirmwareVersion>
      <tds:SerialNumber>123456</tds:SerialNumber>
    </tds:GetDeviceInformationResponse></s:Body>
  </s:Envelope>`;
}

function capabilitiesWithPtzXml() {
  return `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
    xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
    <s:Body><tds:GetCapabilitiesResponse><tds:Capabilities>
      <tt:Media XAddr="http://camera.local/onvif/media" xmlns:tt="http://www.onvif.org/ver10/schema"/>
      <tt:PTZ XAddr="http://camera.local/onvif/ptz" xmlns:tt="http://www.onvif.org/ver10/schema"/>
    </tds:Capabilities></tds:GetCapabilitiesResponse></s:Body>
  </s:Envelope>`;
}

function capabilitiesNoPtzXml() {
  return `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
    xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
    <s:Body><tds:GetCapabilitiesResponse><tds:Capabilities>
      <tt:Media XAddr="http://camera.local/onvif/media" xmlns:tt="http://www.onvif.org/ver10/schema"/>
    </tds:Capabilities></tds:GetCapabilitiesResponse></s:Body>
  </s:Envelope>`;
}

function profilesXml() {
  return `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
    xmlns:trt="http://www.onvif.org/ver10/media/wsdl"
    xmlns:tt="http://www.onvif.org/ver10/schema">
    <s:Body><trt:GetProfilesResponse><trt:Profiles token="main">
      <tt:Name>Main</tt:Name>
    </trt:Profiles></trt:GetProfilesResponse></s:Body>
  </s:Envelope>`;
}

function ptzConfigurationsXml() {
  return `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
    xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"
    xmlns:tt="http://www.onvif.org/ver10/schema">
    <s:Body><tptz:GetConfigurationsResponse>
      <tptz:PTZConfiguration>
        <tt:PanTiltLimits>
          <tt:Range><tt:XRange><tt:Min>-1</tt:Min><tt:Max>1</tt:Max></tt:XRange></tt:Range>
        </tt:PanTiltLimits>
        <tt:ZoomLimits><tt:Range><tt:XRange><tt:Min>0</tt:Min><tt:Max>1</tt:Max></tt:XRange></tt:Range></tt:ZoomLimits>
        <tt:DefaultAbsolutePantTiltPositionSpace>http://www.onvif.org/ver10/tptz/PanTiltSpaces/PositionGenericSpace</tt:DefaultAbsolutePantTiltPositionSpace>
        <tt:DefaultContinuousPanTiltVelocitySpace>http://www.onvif.org/ver10/tptz/PanTiltSpaces/VelocityGenericSpace</tt:DefaultContinuousPanTiltVelocitySpace>
      </tptz:PTZConfiguration>
    </tptz:GetConfigurationsResponse></s:Body>
  </s:Envelope>`;
}

function absoluteMoveResponseXml() {
  return `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
    <s:Body><tptz:AbsoluteMoveResponse xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"/></s:Body>
  </s:Envelope>`;
}

function continuousMoveResponseXml() {
  return `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
    <s:Body><tptz:ContinuousMoveResponse xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"/></s:Body>
  </s:Envelope>`;
}

function stopResponseXml() {
  return `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
    <s:Body><tptz:StopResponse xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"/></s:Body>
  </s:Envelope>`;
}

function getPresetsResponseXml() {
  return `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
    xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"
    xmlns:tt="http://www.onvif.org/ver10/schema">
    <s:Body><tptz:GetPresetsResponse>
      <tptz:Preset token="preset1">
        <tt:Name>Home</tt:Name>
        <tt:Position>
          <tt:PanTilt x="0" y="0"/><tt:Zoom x="0"/>
        </tt:Position>
      </tptz:Preset>
      <tptz:Preset token="preset2">
        <tt:Name>Entrance</tt:Name>
        <tt:Position>
          <tt:PanTilt x="0.5" y="0.3"/><tt:Zoom x="0.7"/>
        </tt:Position>
      </tptz:Preset>
    </tptz:GetPresetsResponse></s:Body>
  </s:Envelope>`;
}

function gotoPresetResponseXml() {
  return `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
    <s:Body><tptz:GotoPresetResponse xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"/></s:Body>
  </s:Envelope>`;
}

function setPresetResponseXml(token: string) {
  return `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
    xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
    <s:Body><tptz:SetPresetResponse>
      <tptz:PresetToken>${token}</tptz:PresetToken>
    </tptz:SetPresetResponse></s:Body>
  </s:Envelope>`;
}

function removePresetResponseXml() {
  return `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
    <s:Body><tptz:RemovePresetResponse xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"/></s:Body>
  </s:Envelope>`;
}

function getStatusResponseXml() {
  return `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
    xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"
    xmlns:tt="http://www.onvif.org/ver10/schema">
    <s:Body><tptz:GetStatusResponse>
      <tptz:PTZStatus>
        <tt:Position>
          <tt:PanTilt x="0.5" y="0.3"/>
          <tt:Zoom x="0.7"/>
        </tt:Position>
      </tptz:PTZStatus>
    </tptz:GetStatusResponse></s:Body>
  </s:Envelope>`;
}

function gotoHomeResponseXml() {
  return `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
    <s:Body><tptz:GotoHomePositionResponse xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"/></s:Body>
  </s:Envelope>`;
}

function soapFaultXml(code: string, reason: string) {
  return `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
    <s:Body><s:Fault>
      <s:Code><s:Value>s:${code}</s:Value></s:Code>
      <s:Reason><s:Text>${reason}</s:Text></s:Reason>
    </s:Fault></s:Body>
  </s:Envelope>`;
}

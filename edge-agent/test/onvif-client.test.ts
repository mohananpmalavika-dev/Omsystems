import { afterEach, describe, expect, it, vi } from "vitest";
import { OnvifClient } from "../src/devices/onvif-client.js";

describe("OnvifClient authentication compatibility", () => {
  afterEach(() => vi.restoreAllMocks());

  it("omits WS-Security for an explicitly empty camera password", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(xmlResponse(`
        <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
          xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
          <s:Body><tds:GetDeviceInformationResponse>
            <tds:Manufacturer>Test</tds:Manufacturer><tds:Model>Camera</tds:Model>
            <tds:FirmwareVersion>1.0</tds:FirmwareVersion><tds:SerialNumber>123</tds:SerialNumber>
          </tds:GetDeviceInformationResponse></s:Body>
        </s:Envelope>`))
      .mockResolvedValueOnce(xmlResponse(`
        <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
          xmlns:tds="http://www.onvif.org/ver10/device/wsdl"
          xmlns:tt="http://www.onvif.org/ver10/schema">
          <s:Body><tds:GetCapabilitiesResponse><tds:Capabilities>
            <tt:Media XAddr="http://camera.local/onvif/media"/>
          </tds:Capabilities></tds:GetCapabilitiesResponse></s:Body>
        </s:Envelope>`))
      .mockResolvedValueOnce(xmlResponse(`
        <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
          xmlns:trt="http://www.onvif.org/ver10/media/wsdl"
          xmlns:tt="http://www.onvif.org/ver10/schema">
          <s:Body><trt:GetProfilesResponse><trt:Profiles token="main">
            <tt:Name>Main</tt:Name><tt:VideoEncoderConfiguration>
              <tt:Encoding>H264</tt:Encoding><tt:Resolution>
                <tt:Width>1920</tt:Width><tt:Height>1080</tt:Height>
              </tt:Resolution>
            </tt:VideoEncoderConfiguration>
          </trt:Profiles></trt:GetProfilesResponse></s:Body>
        </s:Envelope>`))
      .mockResolvedValueOnce(xmlResponse(systemDateTimeXml(new Date())));

    const client = new OnvifClient(
      "http://camera.local/onvif/device_service",
      { username: "admin", password: "" },
    );
    const device = await client.inspect();

    expect(device.model).toBe("Camera");
    expect(device.timeSynchronization).toBe("synchronized");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    for (const [, request] of fetchMock.mock.calls) {
      expect(String(request?.body)).not.toContain("UsernameToken");
    }
  });

  it("uses WS-Security for health checks and SystemReboot", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(xmlResponse(`
        <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
          <s:Body><tds:GetSystemDateAndTimeResponse xmlns:tds="http://www.onvif.org/ver10/device/wsdl"/></s:Body>
        </s:Envelope>`))
      .mockResolvedValueOnce(xmlResponse(`
        <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
          <s:Body><tds:SystemRebootResponse xmlns:tds="http://www.onvif.org/ver10/device/wsdl"><tds:Message>Rebooting</tds:Message></tds:SystemRebootResponse></s:Body>
        </s:Envelope>`));
    const client = new OnvifClient(
      "http://camera.local/onvif/device_service",
      { username: "admin", password: "secret" },
    );

    await expect(client.ping()).resolves.toBeUndefined();
    await expect(client.reboot()).resolves.toBe("Rebooting");

    const bodies = fetchMock.mock.calls.map(([, request]) => String(request?.body));
    expect(bodies[0]).toContain("GetSystemDateAndTime");
    expect(bodies[1]).toContain("SystemReboot");
    for (const body of bodies) {
      expect(body).toContain("UsernameToken");
      expect(body).toContain("PasswordDigest");
      expect(body).toContain("wsu:Timestamp");
    }
  });

  it("retries an HTTP 401 challenge with Digest authentication", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", {
        status: 401,
        headers: { "www-authenticate": 'Digest realm="camera", nonce="abc123", qop="auth", algorithm=MD5' },
      }))
      .mockResolvedValueOnce(xmlResponse(`
        <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
          <s:Body><tds:GetSystemDateAndTimeResponse xmlns:tds="http://www.onvif.org/ver10/device/wsdl"/></s:Body>
        </s:Envelope>`));
    const client = new OnvifClient(
      "http://camera.local/onvif/device_service",
      { username: "operator", password: "secret" },
    );

    await expect(client.ping()).resolves.toBeUndefined();

    const authorization = new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("authorization");
    expect(authorization).toMatch(/^Digest /);
    expect(authorization).toContain('username="operator"');
    expect(authorization).toContain("qop=auth");
    expect(authorization).toMatch(/response="[0-9a-f]{32}"/);
  });

  it("falls back from SOAP 1.2 to SOAP 1.1 for older firmware", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Unsupported media type", { status: 415 }))
      .mockResolvedValueOnce(xmlResponse(`
        <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
          <s:Body><tds:GetSystemDateAndTimeResponse xmlns:tds="http://www.onvif.org/ver10/device/wsdl"/></s:Body>
        </s:Envelope>`));
    const client = new OnvifClient(
      "http://camera.local/onvif/device_service",
      { username: "admin", password: "secret" },
    );

    await expect(client.ping()).resolves.toBeUndefined();

    const fallbackRequest = fetchMock.mock.calls[1]?.[1];
    expect(new Headers(fallbackRequest?.headers).get("content-type")).toBe("text/xml; charset=utf-8");
    expect(String(fallbackRequest?.body)).toContain("http://schemas.xmlsoap.org/soap/envelope/");
  });

  it("keeps inspecting through a guessed media service when GetCapabilities is broken", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(xmlResponse(deviceInformationXml()))
      .mockResolvedValueOnce(new Response("broken capabilities", { status: 500 }))
      .mockResolvedValueOnce(new Response("still broken", { status: 500 }))
      .mockResolvedValueOnce(xmlResponse(profilesXml()));
    const client = new OnvifClient(
      "http://camera.local/onvif/device_service",
      { username: "admin", password: "secret" },
    );

    const device = await client.inspect();

    expect(device.profiles).toHaveLength(1);
    expect(device.mediaServiceUrl).toBe("http://camera.local/onvif/media_service");
    expect(device.inspectionLayers).toEqual(expect.arrayContaining([
      expect.objectContaining({ layer: "get-capabilities", status: "failed" }),
      expect.objectContaining({ layer: "get-profiles", status: "fallback" }),
    ]));
  });
});

function xmlResponse(body: string) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/soap+xml" },
  });
}

function deviceInformationXml() {
  return `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
    xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
    <s:Body><tds:GetDeviceInformationResponse>
      <tds:Manufacturer>Legacy</tds:Manufacturer><tds:Model>Camera</tds:Model>
      <tds:FirmwareVersion>1.0</tds:FirmwareVersion><tds:SerialNumber>legacy-1</tds:SerialNumber>
    </tds:GetDeviceInformationResponse></s:Body>
  </s:Envelope>`;
}

function profilesXml() {
  return `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
    xmlns:trt="http://www.onvif.org/ver10/media/wsdl"
    xmlns:tt="http://www.onvif.org/ver10/schema">
    <s:Body><trt:GetProfilesResponse><trt:Profiles token="main">
      <tt:Name>Main</tt:Name><tt:VideoEncoderConfiguration>
        <tt:Encoding>H264</tt:Encoding><tt:Resolution><tt:Width>1920</tt:Width><tt:Height>1080</tt:Height></tt:Resolution>
      </tt:VideoEncoderConfiguration>
    </trt:Profiles></trt:GetProfilesResponse></s:Body>
  </s:Envelope>`;
}

function systemDateTimeXml(value: Date) {
  return `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
    xmlns:tds="http://www.onvif.org/ver10/device/wsdl"
    xmlns:tt="http://www.onvif.org/ver10/schema">
    <s:Body><tds:GetSystemDateAndTimeResponse><tds:SystemDateAndTime>
      <tt:UTCDateTime><tt:Time>
        <tt:Hour>${value.getUTCHours()}</tt:Hour><tt:Minute>${value.getUTCMinutes()}</tt:Minute><tt:Second>${value.getUTCSeconds()}</tt:Second>
      </tt:Time><tt:Date>
        <tt:Year>${value.getUTCFullYear()}</tt:Year><tt:Month>${value.getUTCMonth() + 1}</tt:Month><tt:Day>${value.getUTCDate()}</tt:Day>
      </tt:Date></tt:UTCDateTime>
    </tds:SystemDateAndTime></tds:GetSystemDateAndTimeResponse></s:Body>
  </s:Envelope>`;
}

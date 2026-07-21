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
        </s:Envelope>`));

    const client = new OnvifClient(
      "http://camera.local/onvif/device_service",
      { username: "admin", password: "" },
    );
    const device = await client.inspect();

    expect(device.model).toBe("Camera");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [, request] of fetchMock.mock.calls) {
      expect(String(request?.body)).not.toContain("UsernameToken");
    }
  });
});

function xmlResponse(body: string) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/soap+xml" },
  });
}

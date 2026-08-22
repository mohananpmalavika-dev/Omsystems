import { describe, it, expect } from "vitest";
import { WsDiscovery } from "../../src/onvif/discovery/ws-discovery.js";

describe("ONVIF WS-Discovery Suite", () => {
  it("builds standards-compliant WS-Discovery Probe XML", () => {
    const discovery = new WsDiscovery();
    const msgId = "urn:uuid:12345678-1234-1234-1234-123456789abc";
    const xml = discovery.buildProbeXml(msgId);

    expect(xml).toContain(`<wsa:MessageID>${msgId}</wsa:MessageID>`);
    expect(xml).toContain("<wsa:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</wsa:Action>");
    expect(xml).toContain("<d:Types>dn:NetworkVideoTransmitter tds:Device</d:Types>");
  });

  it("parses incoming ProbeMatch XML into structured device models with scopes and XAddrs", () => {
    const discovery = new WsDiscovery();

    const sampleProbeMatchXml = `
<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery">
  <s:Body>
    <d:ProbeMatches>
      <d:ProbeMatch>
        <wsa:Address>urn:uuid:4a525343-3430-3132-3334-0018ae8a1b2c</wsa:Address>
        <d:Types>dn:NetworkVideoTransmitter tds:Device</d:Types>
        <d:Scopes>
          onvif://www.onvif.org/type/video_encoder
          onvif://www.onvif.org/type/audio_encoder
          onvif://www.onvif.org/type/ptz
          onvif://www.onvif.org/Profile/Streaming
          onvif://www.onvif.org/Profile/G
          onvif://www.onvif.org/Profile/T
          onvif://www.onvif.org/hardware/AXIS-P3245-LV
          onvif://www.onvif.org/name/Vault-Dome-Camera
          onvif://www.onvif.org/location/Floor2-Kollam
          onvif://www.onvif.org/manufacturer/AXIS
        </d:Scopes>
        <d:XAddrs>http://192.168.1.150:80/onvif/device_service</d:XAddrs>
        <d:MetadataVersion>1</d:MetadataVersion>
      </d:ProbeMatch>
    </d:ProbeMatches>
  </s:Body>
</s:Envelope>`.trim();

    const devices = discovery.parseProbeMatchXml(sampleProbeMatchXml, "192.168.1.150", 80);

    expect(devices.length).toBe(1);
    const dev = devices[0];

    expect(dev.endpointReference).toBe("urn:uuid:4a525343-3430-3132-3334-0018ae8a1b2c");
    expect(dev.ipAddress).toBe("192.168.1.150");
    expect(dev.port).toBe(80);
    expect(dev.xaddrs).toContain("http://192.168.1.150:80/onvif/device_service");
    expect(dev.manufacturer).toBe("AXIS");
    expect(dev.hardwareId).toBe("AXIS-P3245-LV");
    expect(dev.name).toBe("Vault-Dome-Camera");
    expect(dev.location).toBe("Floor2-Kollam");
    expect(dev.profiles).toContain("Streaming");
    expect(dev.profiles).toContain("G");
    expect(dev.profiles).toContain("T");
  });
});

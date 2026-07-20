import { describe, expect, it } from "vitest";
import { loadEdgeConfig } from "../src/config.js";
import { parseProbeMatch } from "../src/discovery/onvif-discovery.js";
import {
  attachCredentials,
  redactStreamUri,
} from "../src/devices/onvif-client.js";
import { normalizeVendor } from "../src/devices/compatibility-registry.js";

describe("ONVIF edge utilities", () => {
  it("accepts a gateway ID pre-registered by the dashboard", () => {
    const config = loadEdgeConfig({
      CONTROL_PLANE_URL: "https://control.example.com",
      BRANCH_ID: "branch-1",
      EDGE_AGENT_ID: "agent-registered-1",
      EDGE_AGENT_NAME: "Branch Gateway",
      EDGE_AGENT_VERSION: "0.1.0",
      DEV_USER_ID: "edge-user",
      CAMERA_USERNAME: "operator",
      CAMERA_PASSWORD: "secret",
      ONVIF_ENDPOINTS: "",
      DISCOVERY_TIMEOUT_MS: "5000",
      ONVIF_TIMEOUT_MS: "8000",
      FFPROBE_PATH: "ffprobe",
    });
    expect(config.EDGE_AGENT_ID).toBe("agent-registered-1");
  });
  it("parses WS-Discovery probe matches", () => {
    const result = parseProbeMatch(`<?xml version="1.0"?>
      <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
        xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
        xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing">
        <s:Body><d:ProbeMatches><d:ProbeMatch>
          <a:EndpointReference><a:Address>urn:uuid:camera-1</a:Address></a:EndpointReference>
          <d:Scopes>onvif://www.onvif.org/type/video_encoder</d:Scopes>
          <d:XAddrs>http://192.168.10.20/onvif/device_service</d:XAddrs>
        </d:ProbeMatch></d:ProbeMatches></s:Body>
      </s:Envelope>`, "192.168.10.20");

    expect(result).toMatchObject({
      endpointReference: "urn:uuid:camera-1",
      remoteAddress: "192.168.10.20",
      xaddrs: ["http://192.168.10.20/onvif/device_service"],
    });
  });

  it("adds credentials only for the local probe and can redact them", () => {
    const secured = attachCredentials("rtsp://192.168.10.20/live", {
      username: "operator",
      password: "secret value",
    });
    expect(secured).toContain("operator:secret%20value@");
    expect(redactStreamUri(secured)).toBe("rtsp://192.168.10.20/live");
  });

  it("redacts credentials embedded in vendor-specific RTSP paths", () => {
    const redacted = redactStreamUri(
      "rtsp://operator:secret@192.168.10.20/user=operator_password=opaque_channel=0.sdp",
    );
    expect(redacted).not.toContain("operator");
    expect(redacted).not.toContain("secret");
    expect(redacted).not.toContain("opaque");
  });

  it("normalizes the supported pilot brands", () => {
    expect(normalizeVendor("HIKVISION")).toBe("hikvision");
    expect(normalizeVendor("CP Plus")).toBe("cp-plus");
  });
});

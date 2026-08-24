import { describe, expect, it } from "vitest";
import { loadEdgeConfig } from "../src/config.js";
import { parseProbeMatch } from "../src/discovery/onvif-discovery.js";
import { onvifEndpointRole } from "../src/discovery/onvif-service-candidates.js";
import {
  attachCredentials,
  redactStreamUri,
} from "../src/devices/onvif-client.js";
import { normalizeVendor } from "../src/devices/compatibility-registry.js";
import {
  inferLocalCidrs,
  ipsFromCidr,
  runWithConcurrency,
} from "../src/discovery/rtsp-network-scan.js";

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
          <d:Types>dn:NetworkVideoStorage</d:Types>
          <d:Scopes>onvif://www.onvif.org/type/video_encoder</d:Scopes>
          <d:XAddrs>http://192.168.10.20/onvif/device_service</d:XAddrs>
        </d:ProbeMatch></d:ProbeMatches></s:Body>
      </s:Envelope>`, "192.168.10.20");

    expect(result).toMatchObject({
      endpointReference: "urn:uuid:camera-1",
      remoteAddress: "192.168.10.20",
      xaddrs: ["http://192.168.10.20/onvif/device_service"],
      types: ["dn:NetworkVideoStorage"],
    });
  });

  it("uses ONVIF discovery evidence to distinguish recorders before login", () => {
    expect(onvifEndpointRole({
      endpointReference: null,
      remoteAddress: "192.168.10.20",
      xaddrs: ["http://192.168.10.20/onvif/device_service"],
      scopes: [],
      types: ["dn:NetworkVideoStorage"],
    })).toBe("recorder");
    expect(onvifEndpointRole({
      endpointReference: null,
      remoteAddress: "192.168.10.21",
      xaddrs: ["http://192.168.10.21/onvif/device_service"],
      scopes: [],
      types: ["dn:NetworkVideoTransmitter"],
    })).toBe("camera");
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
    expect(normalizeVendor("CPPLUS")).toBe("cp-plus");
  });

  it("uses real local subnet masks and safely expands camera CIDRs", () => {
    expect(inferLocalCidrs({
      Ethernet: [{
        address: "192.168.50.12",
        netmask: "255.255.255.240",
        family: "IPv4",
        mac: "00:11:22:33:44:55",
        internal: false,
        cidr: "192.168.50.12/28",
        scopeid: 0,
      }],
    })).toEqual(["192.168.50.0/28"]);
    expect(ipsFromCidr("192.168.50.8/30")).toEqual([
      "192.168.50.9",
      "192.168.50.10",
    ]);
    expect(ipsFromCidr("10.0.0.0/16")).toEqual([]);
  });

  it("uses the agent's local /24 when a corporate interface is broader than the safe scan limit", () => {
    expect(inferLocalCidrs({
      Ethernet: [{
        address: "10.42.7.33",
        netmask: "255.255.0.0",
        family: "IPv4",
        mac: "00:11:22:33:44:55",
        internal: false,
        cidr: "10.42.7.33/16",
        scopeid: 0,
      }],
    })).toEqual(["10.42.7.0/24"]);
  });

  it("ignores virtual host-only networks during local camera discovery", () => {
    expect(inferLocalCidrs({
      "Wi-Fi": [{
        address: "192.168.29.101",
        netmask: "255.255.255.0",
        family: "IPv4",
        mac: "00:11:22:33:44:55",
        internal: false,
        cidr: "192.168.29.101/24",
        scopeid: 0,
      }],
      "vEthernet (WSL (Hyper-V firewall))": [{
        address: "172.26.160.1",
        netmask: "255.255.240.0",
        family: "IPv4",
        mac: "00:15:5d:00:00:01",
        internal: false,
        cidr: "172.26.160.1/20",
        scopeid: 0,
      }],
    })).toEqual(["192.168.29.0/24"]);
  });

  it("waits for every queued network probe", async () => {
    const completed: number[] = [];
    await runWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (item) => {
      await new Promise((resolve) => setTimeout(resolve, item % 2 ? 2 : 1));
      completed.push(item);
    });
    expect(completed.sort((left, right) => left - right)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

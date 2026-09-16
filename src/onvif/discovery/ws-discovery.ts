import { createSocket, type Socket } from "node:dgram";
import { randomUUID } from "node:crypto";
import { SoapClient } from "../soap/soap-client.js";

export interface DiscoveredOnvifDevice {
  endpointReference: string; // urn:uuid:...
  ipAddress: string;
  port: number;
  xaddrs: string[];
  types: string[];
  scopes: string[];
  manufacturer?: string;
  model?: string;
  hardwareId?: string;
  name?: string;
  location?: string;
  profiles: string[]; // e.g. ["Streaming", "G", "T", "M"]
  discoveredAt: Date;
}

export interface WsDiscoveryOptions {
  multicastAddress?: string;
  multicastPort?: number;
  timeoutMs?: number;
  listenPort?: number;
}

export class WsDiscovery {
  private readonly multicastAddress: string;
  private readonly multicastPort: number;
  private readonly defaultTimeoutMs: number;

  constructor(options: WsDiscoveryOptions = {}) {
    this.multicastAddress = options.multicastAddress || "239.255.255.250";
    this.multicastPort = options.multicastPort || 3702;
    this.defaultTimeoutMs = options.timeoutMs || 4000;
  }

  /**
   * Broadcasts a WS-Discovery Probe to locate all ONVIF NVTs on the local network
   */
  async discover(timeoutMs?: number): Promise<DiscoveredOnvifDevice[]> {
    const timeout = timeoutMs ?? this.defaultTimeoutMs;
    const devices = new Map<string, DiscoveredOnvifDevice>();
    const messageId = `urn:uuid:${randomUUID()}`;
    const probeXml = this.buildProbeXml(messageId);

    return new Promise((resolve) => {
      let socket: Socket | null = null;
      let timer: NodeJS.Timeout | null = null;

      try {
        socket = createSocket({ type: "udp4", reuseAddr: true });

        socket.on("message", (msg, rinfo) => {
          // A UDP datagram cannot exceed 64KB. Keep parsing bounded anyway so
          // a noisy network cannot spend unbounded CPU on discovery input.
          if (msg.length > 65_507) return;
          const xml = msg.toString("utf8");
          const parsedDevices = this.parseProbeMatchXml(xml, rinfo.address, rinfo.port);
          for (const dev of parsedDevices) {
            const key = dev.endpointReference || dev.xaddrs[0] || `${rinfo.address}:${rinfo.port}`;
            if (!devices.has(key)) {
              devices.set(key, dev);
            }
          }
        });

        socket.on("error", (err) => {
          console.warn("[WsDiscovery] Socket error:", err.message);
        });

        socket.bind(0, () => {
          if (!socket) return;
          try {
            socket.setBroadcast(true);
            socket.setMulticastTTL(4);

            const buffer = Buffer.from(probeXml, "utf8");
            socket.send(buffer, 0, buffer.length, this.multicastPort, this.multicastAddress);
          } catch (err) {
            console.warn("[WsDiscovery] Multicast send error:", err);
          }
        });

        timer = setTimeout(() => {
          if (socket) {
            try {
              socket.close();
            } catch {
              // ignore
            }
          }
          resolve(Array.from(devices.values()));
        }, timeout);
      } catch (err) {
        console.warn("[WsDiscovery] Initialization error:", err);
        if (socket) {
          try {
            socket.close();
          } catch {
            // ignore
          }
        }
        if (timer) clearTimeout(timer);
        resolve(Array.from(devices.values()));
      }
    });
  }

  /**
   * Builds standard WS-Discovery Probe XML
   */
  buildProbeXml(messageId: string): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope 
  xmlns:s="http://www.w3.org/2003/05/soap-envelope" 
  xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing" 
  xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" 
  xmlns:dn="http://www.onvif.org/ver10/network/wsdl"
  xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <s:Header>
    <wsa:MessageID>${messageId}</wsa:MessageID>
    <wsa:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</wsa:To>
    <wsa:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</wsa:Action>
  </s:Header>
  <s:Body>
    <d:Probe>
      <d:Types>dn:NetworkVideoTransmitter tds:Device</d:Types>
    </d:Probe>
  </s:Body>
</s:Envelope>`.trim();
  }

  /**
   * Parses incoming ProbeMatch XML
   */
  parseProbeMatchXml(xml: string, remoteIp: string, _remotePort: number): DiscoveredOnvifDevice[] {
    const devices: DiscoveredOnvifDevice[] = [];
    const probeMatches = SoapClient.extractAllTags(xml, "ProbeMatch");

    for (const matchXml of probeMatches) {
      const endpointRef = SoapClient.extractTag(matchXml, "Address") || "";
      const typesRaw = SoapClient.extractTag(matchXml, "Types") || "";
      const scopesRaw = SoapClient.extractTag(matchXml, "Scopes") || "";
      const xaddrsRaw = SoapClient.extractTag(matchXml, "XAddrs") || "";

      const types = typesRaw.split(/\s+/).filter(Boolean);
      const scopes = scopesRaw.split(/\s+/).filter(Boolean);
      const xaddrs = xaddrsRaw.split(/\s+/).filter(Boolean).slice(0, 8);

      let manufacturer: string | undefined;
      let model: string | undefined;
      let hardwareId: string | undefined;
      let name: string | undefined;
      let location: string | undefined;
      const profiles: string[] = [];

      for (const scope of scopes) {
        let decoded: string;
        try {
          decoded = decodeURIComponent(scope);
        } catch {
          continue;
        }
        if (decoded.includes("/name/")) {
          name = decoded.split("/name/")[1];
        } else if (decoded.includes("/hardware/")) {
          hardwareId = decoded.split("/hardware/")[1];
          model = hardwareId;
        } else if (decoded.includes("/location/")) {
          location = decoded.split("/location/")[1];
        } else if (decoded.includes("/manufacturer/")) {
          manufacturer = decoded.split("/manufacturer/")[1];
        } else if (decoded.includes("/Profile/")) {
          const prof = decoded.split("/Profile/")[1];
          if (prof) profiles.push(prof);
        }
      }

      // XAddr is supplied by an unauthenticated UDP response. Never let it
      // redirect registry traffic to a different host; the packet source is
      // the authoritative network identity during discovery.
      let ip = remoteIp;
      // WS-Discovery responses originate from an ephemeral UDP source port;
      // it is not the ONVIF HTTP service port. Default to the ONVIF HTTP
      // default unless a same-host XAddr explicitly advertises one.
      let port = 80;
      if (xaddrs.length > 0 && xaddrs[0]) {
        try {
          const parsedUrl = new URL(xaddrs[0]);
          const advertisedPort = parsedUrl.port ? Number(parsedUrl.port) : (parsedUrl.protocol === "https:" ? 443 : 80);
          if ((parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") &&
              parsedUrl.hostname === remoteIp && Number.isInteger(advertisedPort) && advertisedPort >= 1 && advertisedPort <= 65535) {
            port = advertisedPort;
          }
        } catch {
          // fallback to remote IP
        }
      }

      devices.push({
        endpointReference: endpointRef,
        ipAddress: ip,
        port,
        xaddrs,
        types,
        scopes,
        manufacturer,
        model,
        hardwareId,
        name,
        location,
        profiles,
        discoveredAt: new Date(),
      });
    }

    return devices;
  }
}

export const wsDiscovery = new WsDiscovery();

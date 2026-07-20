import dgram from "node:dgram";
import { randomUUID } from "node:crypto";
import { XMLParser } from "fast-xml-parser";

export interface DiscoveredOnvifEndpoint {
  endpointReference: string | null;
  xaddrs: string[];
  scopes: string[];
  remoteAddress: string;
}

const multicastAddress = "239.255.255.250";
const multicastPort = 3702;

export async function discoverOnvifDevices(
  timeoutMs = 5000,
): Promise<DiscoveredOnvifEndpoint[]> {
  const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
  const message = Buffer.from(probeEnvelope(randomUUID()));
  const found = new Map<string, DiscoveredOnvifEndpoint>();

  return new Promise((resolve, reject) => {
    const finish = () => {
      socket.close();
      resolve([...found.values()]);
    };
    const timer = setTimeout(finish, timeoutMs);

    socket.on("error", (error) => {
      clearTimeout(timer);
      socket.close();
      reject(error);
    });
    socket.on("message", (buffer, remote) => {
      const parsed = parseProbeMatch(buffer.toString("utf8"), remote.address);
      if (!parsed) return;
      const key = parsed.endpointReference ?? parsed.xaddrs.join("|");
      found.set(key, parsed);
    });
    socket.bind(0, () => {
      socket.setBroadcast(true);
      socket.setMulticastTTL(2);
      socket.send(message, multicastPort, multicastAddress);
    });
  });
}

export function parseProbeMatch(
  xml: string,
  remoteAddress: string,
): DiscoveredOnvifEndpoint | null {
  const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: false });
  const document = parser.parse(xml) as Record<string, unknown>;
  const body = nested(document, "Envelope", "Body");
  const matches = nested(body, "ProbeMatches", "ProbeMatch");
  const match = Array.isArray(matches) ? matches[0] : matches;
  if (!isRecord(match)) return null;

  const xaddrText = stringValue(match.XAddrs);
  if (!xaddrText) return null;
  const endpoint = nested(match, "EndpointReference", "Address");
  const scopes = stringValue(match.Scopes);
  return {
    endpointReference: stringValue(endpoint),
    xaddrs: xaddrText.split(/\s+/).filter(Boolean),
    scopes: scopes?.split(/\s+/).filter(Boolean) ?? [],
    remoteAddress,
  };
}

function probeEnvelope(messageId: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
 xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
 xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
 xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
 <e:Header>
  <w:MessageID>uuid:${messageId}</w:MessageID>
  <w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
  <w:Action e:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
 </e:Header>
 <e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body>
</e:Envelope>`;
}

function nested(value: unknown, ...keys: string[]): unknown {
  let current = value;
  for (const key of keys) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (isRecord(value) && typeof value["#text"] === "string") return value["#text"];
  return null;
}

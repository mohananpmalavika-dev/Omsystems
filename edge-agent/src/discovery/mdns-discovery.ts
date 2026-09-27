import dgram from "node:dgram";
import { logger } from "../utils/logger.js";

export interface DiscoveredMdnsEndpoint {
  ip: string;
  port?: number | undefined;
  hostname?: string | undefined;
  serviceType: string;
  name?: string | undefined;
  txt?: Record<string, string> | undefined;
}

const MDNS_MULTICAST_IPV4 = "224.0.0.251";
const MDNS_PORT = 5353;

const CAMERA_MDNS_SERVICES = [
  "_rtsp._tcp.local",
  "_http._tcp.local",
  "_axis-video._tcp.local",
  "_onvif._tcp.local",
  "_camera._tcp.local",
  "_uniview._tcp.local",
  "_dahua._tcp.local",
];

function encodeDnsName(name: string): Buffer {
  const parts = name.split(".");
  const buffers: Buffer[] = [];
  for (const part of parts) {
    if (!part) continue;
    const partBuf = Buffer.from(part, "utf8");
    buffers.push(Buffer.from([partBuf.length]));
    buffers.push(partBuf);
  }
  buffers.push(Buffer.from([0]));
  return Buffer.concat(buffers);
}

function buildMdnsQuery(serviceNames: string[]): Buffer {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(0x0000, 0); // ID: 0 for mDNS
  header.writeUInt16BE(0x0000, 2); // Flags: standard query
  header.writeUInt16BE(serviceNames.length, 4); // QDCOUNT
  header.writeUInt16BE(0, 6); // ANCOUNT
  header.writeUInt16BE(0, 8); // NSCOUNT
  header.writeUInt16BE(0, 10); // ARCOUNT

  const questions: Buffer[] = [];
  for (const service of serviceNames) {
    const qname = encodeDnsName(service);
    const qtypeAndClass = Buffer.alloc(4);
    qtypeAndClass.writeUInt16BE(12, 0); // PTR = 12
    qtypeAndClass.writeUInt16BE(1, 2); // IN = 1
    questions.push(Buffer.concat([qname, qtypeAndClass]));
  }

  return Buffer.concat([header, ...questions]);
}

function decodeDnsName(buffer: Buffer, offset: number): { name: string; nextOffset: number } {
  const labels: string[] = [];
  let currentOffset = offset;
  let jumped = false;
  let returnOffset = offset;

  while (currentOffset < buffer.length) {
    const length = buffer[currentOffset];
    if (length === undefined || length === 0) {
      currentOffset += 1;
      if (!jumped) returnOffset = currentOffset;
      break;
    }

    if ((length & 0xc0) === 0xc0) {
      if (!jumped) returnOffset = currentOffset + 2;
      const secondByte = buffer[currentOffset + 1] ?? 0;
      const pointerOffset = ((length & 0x3f) << 8) | secondByte;
      currentOffset = pointerOffset;
      jumped = true;
      continue;
    }

    currentOffset += 1;
    if (currentOffset + length > buffer.length) break;
    const label = buffer.toString("utf8", currentOffset, currentOffset + length);
    labels.push(label);
    currentOffset += length;
    if (!jumped) returnOffset = currentOffset;
  }

  return { name: labels.join("."), nextOffset: returnOffset };
}

interface ParsedRecord {
  name: string;
  type: number;
  data: any;
}

export function parseDnsPacket(buffer: Buffer): { answers: ParsedRecord[]; additionals: ParsedRecord[] } {
  if (buffer.length < 12) return { answers: [], additionals: [] };

  const qdcount = buffer.readUInt16BE(4);
  const ancount = buffer.readUInt16BE(6);
  const nscount = buffer.readUInt16BE(8);
  const arcount = buffer.readUInt16BE(10);

  let offset = 12;

  // Skip questions
  for (let i = 0; i < qdcount; i++) {
    const { nextOffset } = decodeDnsName(buffer, offset);
    offset = nextOffset + 4; // Skip QTYPE and QCLASS
  }

  function parseResourceRecords(count: number): ParsedRecord[] {
    const records: ParsedRecord[] = [];
    for (let i = 0; i < count; i++) {
      if (offset >= buffer.length) break;
      const { name, nextOffset } = decodeDnsName(buffer, offset);
      offset = nextOffset;
      if (offset + 10 > buffer.length) break;

      const type = buffer.readUInt16BE(offset);
      const rdLength = buffer.readUInt16BE(offset + 8);
      offset += 10;

      const dataOffset = offset;
      offset += rdLength;

      if (type === 1) {
        // A record (IPv4)
        if (rdLength === 4) {
          const b0 = buffer[dataOffset] ?? 0;
          const b1 = buffer[dataOffset + 1] ?? 0;
          const b2 = buffer[dataOffset + 2] ?? 0;
          const b3 = buffer[dataOffset + 3] ?? 0;
          const ip = [b0, b1, b2, b3].join(".");
          records.push({ name, type, data: { ip } });
        }
      } else if (type === 12) {
        // PTR record
        const { name: ptrName } = decodeDnsName(buffer, dataOffset);
        records.push({ name, type, data: { ptrName } });
      } else if (type === 16) {
        // TXT record
        const txtObj: Record<string, string> = {};
        let tOffset = dataOffset;
        while (tOffset < dataOffset + rdLength) {
          const tLen = buffer[tOffset++];
          if (tLen === undefined || tOffset + tLen > buffer.length) break;
          const entry = buffer.toString("utf8", tOffset, tOffset + tLen);
          tOffset += tLen;
          const eq = entry.indexOf("=");
          if (eq > 0) {
            txtObj[entry.slice(0, eq).toLowerCase()] = entry.slice(eq + 1);
          } else {
            txtObj[entry.toLowerCase()] = "";
          }
        }
        records.push({ name, type, data: { txt: txtObj } });
      } else if (type === 33) {
        // SRV record
        if (rdLength >= 6) {
          const port = buffer.readUInt16BE(dataOffset + 4);
          const { name: target } = decodeDnsName(buffer, dataOffset + 6);
          records.push({ name, type, data: { port, target } });
        }
      }
    }
    return records;
  }

  const answers = parseResourceRecords(ancount);
  parseResourceRecords(nscount); // ignore auth NS
  const additionals = parseResourceRecords(arcount);

  return { answers, additionals };
}

export async function discoverMdnsDevices(
  timeoutMs = 4000,
): Promise<DiscoveredMdnsEndpoint[]> {
  const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
  const discovered = new Map<string, DiscoveredMdnsEndpoint>();

  return new Promise<DiscoveredMdnsEndpoint[]>((resolve) => {
    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      try {
        socket.close();
      } catch {}
      resolve([...discovered.values()]);
    };

    const timer = setTimeout(cleanup, Math.max(1000, timeoutMs));

    socket.on("error", (err) => {
      logger.debug("mDNS socket error (non-fatal)", { error: err.message });
      clearTimeout(timer);
      cleanup();
    });

    socket.on("message", (msg, rinfo) => {
      try {
        const { answers, additionals } = parseDnsPacket(msg);
        const allRecords = [...answers, ...additionals];

        // Map A records
        const aRecords = new Map<string, string>();
        for (const rec of allRecords) {
          if (rec.type === 1 && rec.data?.ip) {
            aRecords.set(rec.name.toLowerCase(), rec.data.ip);
          }
        }

        // Map SRV records
        const srvRecords = new Map<string, { port: number; target: string }>();
        for (const rec of allRecords) {
          if (rec.type === 33 && rec.data?.port) {
            srvRecords.set(rec.name.toLowerCase(), rec.data);
          }
        }

        // Map TXT records
        const txtRecords = new Map<string, Record<string, string>>();
        for (const rec of allRecords) {
          if (rec.type === 16 && rec.data?.txt) {
            txtRecords.set(rec.name.toLowerCase(), rec.data.txt);
          }
        }

        // Process PTR or direct records
        for (const rec of allRecords) {
          if (rec.type === 12 && rec.data?.ptrName) {
            const serviceInstance = rec.data.ptrName.toLowerCase();
            const serviceType = rec.name;
            const srv = srvRecords.get(serviceInstance);
            const targetHost = srv?.target?.toLowerCase();
            const ip = targetHost ? (aRecords.get(targetHost) || rinfo.address) : rinfo.address;
            const port = srv?.port ?? undefined;
            const txt = txtRecords.get(serviceInstance) ?? undefined;
            const name = typeof rec.data.ptrName === "string" ? rec.data.ptrName : undefined;

            const key = `${ip}:${port || 554}`;
            if (!discovered.has(key)) {
              discovered.set(key, {
                ip,
                port,
                hostname: targetHost,
                serviceType,
                name,
                txt,
              });
            }
          }
        }

        // Also fallback if any direct A record was returned from sender
        if (aRecords.size > 0 && discovered.size === 0) {
          for (const [hostname, ip] of aRecords.entries()) {
            discovered.set(ip, {
              ip,
              hostname,
              serviceType: "mDNS-A",
            });
          }
        }
      } catch (err) {
        logger.debug("mDNS parse error", { error: err instanceof Error ? err.message : String(err) });
      }
    });

    socket.bind(0, () => {
      try {
        socket.setBroadcast(true);
        socket.setMulticastTTL(255);
        socket.addMembership(MDNS_MULTICAST_IPV4);

        const query = buildMdnsQuery(CAMERA_MDNS_SERVICES);
        socket.send(query, MDNS_PORT, MDNS_MULTICAST_IPV4, (err) => {
          if (err) logger.debug("mDNS send error", { error: err.message });
        });
      } catch (err) {
        logger.debug("mDNS bind error", { error: err instanceof Error ? err.message : String(err) });
      }
    });
  });
}

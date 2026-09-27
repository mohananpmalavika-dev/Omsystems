import dgram from "node:dgram";
import { XMLParser } from "fast-xml-parser";
import { logger } from "../utils/logger.js";

export interface DiscoveredSsdpEndpoint {
  ip: string;
  port: number;
  location?: string | undefined;
  st?: string | undefined;
  usn?: string | undefined;
  server?: string | undefined;
  manufacturer?: string | undefined;
  model?: string | undefined;
  friendlyName?: string | undefined;
  deviceType?: string | undefined;
}

const MULTICAST_ADDRESS = "239.255.255.250";
const SSDP_PORT = 1900;

const SEARCH_TARGETS = [
  "ssdp:all",
  "upnp:rootdevice",
  "urn:schemas-upnp-org:device:MediaServer:1",
  "urn:schemas-upnp-org:device:Basic:1",
  "urn:schemas-upnp-org:device:DigitalSecurityCamera:1",
];

function buildMSearch(searchTarget: string): Buffer {
  const message = [
    "M-SEARCH * HTTP/1.1",
    `HOST: ${MULTICAST_ADDRESS}:${SSDP_PORT}`,
    'MAN: "ssdp:discover"',
    "MX: 3",
    `ST: ${searchTarget}`,
    "",
    "",
  ].join("\r\n");
  return Buffer.from(message, "utf8");
}

function parseHeaders(raw: string): Map<string, string> {
  const headers = new Map<string, string>();
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim().toUpperCase();
      const value = line.slice(colonIndex + 1).trim();
      headers.set(key, value);
    }
  }
  return headers;
}

export async function parseDeviceXml(
  locationUrl: string,
  timeoutMs = 2000,
): Promise<{ manufacturer?: string | undefined; model?: string | undefined; friendlyName?: string | undefined; deviceType?: string | undefined }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(locationUrl, {
      signal: controller.signal,
      headers: { Accept: "text/xml, application/xml" },
    });
    if (!response.ok) return {};
    const xml = await response.text();
    const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: false });
    const parsed = parser.parse(xml) as Record<string, any>;
    const root = parsed?.root || parsed;
    const device = root?.device || {};

    const manufacturer = typeof device.manufacturer === "string" ? device.manufacturer.trim() : undefined;
    const model = typeof device.modelName === "string"
      ? device.modelName.trim()
      : typeof device.modelNumber === "string"
        ? String(device.modelNumber).trim()
        : undefined;
    const friendlyName = typeof device.friendlyName === "string" ? device.friendlyName.trim() : undefined;
    const deviceType = typeof device.deviceType === "string" ? device.deviceType.trim() : undefined;

    return { manufacturer, model, friendlyName, deviceType };
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

export async function discoverSsdpDevices(
  timeoutMs = 4000,
): Promise<DiscoveredSsdpEndpoint[]> {
  const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
  const endpoints = new Map<string, DiscoveredSsdpEndpoint>();

  const rawResults = await new Promise<DiscoveredSsdpEndpoint[]>((resolve) => {
    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      try {
        socket.close();
      } catch {}
      resolve([...endpoints.values()]);
    };

    const timer = setTimeout(cleanup, Math.max(1000, timeoutMs));

    socket.on("error", (err) => {
      logger.debug("SSDP socket error (non-fatal)", { error: err.message });
      clearTimeout(timer);
      cleanup();
    });

    socket.on("message", (msg, rinfo) => {
      try {
        const raw = msg.toString("utf8");
        const headers = parseHeaders(raw);
        const location = headers.get("LOCATION") ?? undefined;
        const st = (headers.get("ST") || headers.get("NT")) ?? undefined;
        const usn = headers.get("USN") ?? undefined;
        const server = headers.get("SERVER") ?? undefined;

        const ip = rinfo.address;
        const port = rinfo.port;

        const key = usn || `${ip}:${location || port}`;
        if (!endpoints.has(key)) {
          endpoints.set(key, {
            ip,
            port,
            location,
            st,
            usn,
            server,
          });
        }
      } catch {}
    });

    socket.bind(0, () => {
      try {
        socket.setBroadcast(true);
        socket.setMulticastTTL(4);

        for (const target of SEARCH_TARGETS) {
          const packet = buildMSearch(target);
          socket.send(packet, SSDP_PORT, MULTICAST_ADDRESS, (err) => {
            if (err) logger.debug("SSDP send error", { target, error: err.message });
          });
        }
      } catch (err) {
        logger.debug("SSDP init error", { error: err instanceof Error ? err.message : String(err) });
      }
    });
  });

  // Enrich with XML metadata for candidates with LOCATION
  const enriched = await Promise.all(
    rawResults.map(async (endpoint) => {
      if (!endpoint.location) return endpoint;
      try {
        const meta = await parseDeviceXml(endpoint.location, 1500);
        return {
          ...endpoint,
          ...meta,
        };
      } catch {
        return endpoint;
      }
    }),
  );
  return enriched;
}

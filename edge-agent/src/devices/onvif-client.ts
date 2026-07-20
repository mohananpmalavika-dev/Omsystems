import { createHash, randomBytes } from "node:crypto";
import { XMLParser } from "fast-xml-parser";

export interface OnvifCredentials {
  username: string;
  password: string;
}

export interface OnvifProfile {
  token: string;
  name: string;
  codec: "H264" | "H265" | "MJPEG" | "unknown";
  width: number;
  height: number;
}

export interface OnvifDeviceDetails {
  manufacturer: string;
  model: string;
  firmwareVersion: string;
  serialNumber: string;
  mediaServiceUrl: string;
  profiles: OnvifProfile[];
  capabilities: { ptz: boolean; audio: boolean; events: boolean };
}

export class OnvifClient {
  private readonly parser = new XMLParser({
    removeNSPrefix: true,
    ignoreAttributes: false,
    parseTagValue: true,
  });

  constructor(
    private readonly deviceServiceUrl: string,
    private readonly credentials: OnvifCredentials,
    private readonly timeoutMs = 8000,
  ) {}

  async inspect(): Promise<OnvifDeviceDetails> {
    // Several embedded ONVIF implementations reject concurrent SOAP requests.
    // Keep device inspection sequential for broad camera compatibility.
    const info = await this.call(
      this.deviceServiceUrl,
      "http://www.onvif.org/ver10/device/wsdl/GetDeviceInformation",
      `<tds:GetDeviceInformation/>`,
      `xmlns:tds="http://www.onvif.org/ver10/device/wsdl"`,
    );
    const capabilities = await this.call(
      this.deviceServiceUrl,
      "http://www.onvif.org/ver10/device/wsdl/GetCapabilities",
      `<tds:GetCapabilities><tds:Category>All</tds:Category></tds:GetCapabilities>`,
      `xmlns:tds="http://www.onvif.org/ver10/device/wsdl"`,
    );

    const infoResponse = findRecord(info, "GetDeviceInformationResponse");
    const caps = findRecord(capabilities, "Capabilities");
    const media = recordValue(caps?.Media);
    const mediaServiceUrl = textValue(media?.["@_XAddr"]) ??
      textValue(media?.XAddr);
    if (!mediaServiceUrl) throw new Error("ONVIF device did not provide a media service URL");

    const profileDocument = await this.call(
      mediaServiceUrl,
      "http://www.onvif.org/ver10/media/wsdl/GetProfiles",
      `<trt:GetProfiles/>`,
      `xmlns:trt="http://www.onvif.org/ver10/media/wsdl"`,
    );
    const profileResponse = findRecord(profileDocument, "GetProfilesResponse");
    const rawProfiles = arrayValue(profileResponse?.Profiles);
    const profiles = rawProfiles.map(parseProfile).filter((item): item is OnvifProfile => Boolean(item));

    return {
      manufacturer: textValue(infoResponse?.Manufacturer) ?? "unknown",
      model: textValue(infoResponse?.Model) ?? "unknown",
      firmwareVersion: textValue(infoResponse?.FirmwareVersion) ?? "unknown",
      serialNumber: textValue(infoResponse?.SerialNumber) ?? "unknown",
      mediaServiceUrl,
      profiles,
      capabilities: {
        ptz: Boolean(caps?.PTZ),
        audio: rawProfiles.some(hasAudioEncoder),
        events: Boolean(caps?.Events),
      },
    };
  }

  async getStreamUri(mediaServiceUrl: string, profileToken: string) {
    const document = await this.call(
      mediaServiceUrl,
      "http://www.onvif.org/ver10/media/wsdl/GetStreamUri",
      `<trt:GetStreamUri>
        <trt:StreamSetup>
          <tt:Stream>RTP-Unicast</tt:Stream>
          <tt:Transport><tt:Protocol>RTSP</tt:Protocol></tt:Transport>
        </trt:StreamSetup>
        <trt:ProfileToken>${escapeXml(profileToken)}</trt:ProfileToken>
      </trt:GetStreamUri>`,
      `xmlns:trt="http://www.onvif.org/ver10/media/wsdl"
       xmlns:tt="http://www.onvif.org/ver10/schema"`,
    );
    const response = findRecord(document, "GetStreamUriResponse");
    const mediaUri = recordValue(response?.MediaUri);
    const uri = textValue(mediaUri?.Uri);
    if (!uri) throw new Error("ONVIF profile did not return an RTSP URI");
    return uri;
  }

  private async call(
    url: string,
    action: string,
    body: string,
    namespaces: string,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": `application/soap+xml; charset=utf-8; action="${action}"`,
        },
        body: soapEnvelope(body, namespaces, this.credentials),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`ONVIF request failed (${response.status}): ${text.slice(0, 1200)}`);
      }
      const parsed = this.parser.parse(text) as unknown;
      const fault = findRecord(parsed, "Fault");
      if (fault) throw new Error(`ONVIF SOAP fault: ${JSON.stringify(fault).slice(0, 300)}`);
      return parsed;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function attachCredentials(
  uri: string,
  credentials: OnvifCredentials,
): string {
  const parsed = new URL(uri);
  parsed.username = credentials.username;
  parsed.password = credentials.password;
  return parsed.toString();
}

export function redactStreamUri(uri: string): string {
  const parsed = new URL(uri);
  parsed.username = "";
  parsed.password = "";
  parsed.pathname = parsed.pathname.replace(
    /([/_](?:user|username|password)=)[^_/?&]*/gi,
    "$1[redacted]",
  );
  for (const key of [...parsed.searchParams.keys()]) {
    if (/^(?:user|username|password)$/i.test(key)) {
      parsed.searchParams.set(key, "[redacted]");
    }
  }
  return parsed.toString();
}

function soapEnvelope(
  body: string,
  namespaces: string,
  credentials: OnvifCredentials,
) {
  const nonce = randomBytes(20);
  const created = new Date().toISOString();
  const digest = createHash("sha1")
    .update(Buffer.concat([nonce, Buffer.from(created), Buffer.from(credentials.password)]))
    .digest("base64");
  return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
 xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"
 xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd"
 ${namespaces}>
 <s:Header>
  <wsse:Security s:mustUnderstand="1">
   <wsse:UsernameToken>
    <wsse:Username>${escapeXml(credentials.username)}</wsse:Username>
    <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">${digest}</wsse:Password>
    <wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${nonce.toString("base64")}</wsse:Nonce>
    <wsu:Created>${created}</wsu:Created>
   </wsse:UsernameToken>
  </wsse:Security>
 </s:Header>
 <s:Body>${body}</s:Body>
</s:Envelope>`;
}

function parseProfile(value: unknown): OnvifProfile | null {
  const profile = recordValue(value);
  if (!profile) return null;
  const encoder = recordValue(profile.VideoEncoderConfiguration);
  const resolution = recordValue(encoder?.Resolution);
  const token = textValue(profile["@_token"]);
  if (!token) return null;
  const encoding = (textValue(encoder?.Encoding) ?? "unknown").toUpperCase();
  const codec = encoding === "H264" || encoding === "H265" || encoding === "MJPEG"
    ? encoding
    : "unknown";
  return {
    token,
    name: textValue(profile.Name) ?? token,
    codec,
    width: numberValue(resolution?.Width),
    height: numberValue(resolution?.Height),
  };
}

function hasAudioEncoder(value: unknown) {
  return Boolean(recordValue(value)?.AudioEncoderConfiguration);
}

function findRecord(value: unknown, key: string): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findRecord(child, key);
      if (found) return found;
    }
    return undefined;
  }
  const record = recordValue(value);
  if (!record) return undefined;
  const direct = recordValue(record[key]);
  if (direct) return direct;
  for (const child of Object.values(record)) {
    const found = findRecord(child, key);
    if (found) return found;
  }
  return undefined;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
function arrayValue(value: unknown): unknown[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}
function textValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}
function numberValue(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

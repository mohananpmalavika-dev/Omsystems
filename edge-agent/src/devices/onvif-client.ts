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

export interface OnvifInspectionLayer {
  layer: "onvif-authentication" | "get-capabilities" | "get-profiles";
  status: "passed" | "failed" | "fallback";
  detail: string;
}

export interface OnvifDeviceDetails {
  manufacturer: string;
  model: string;
  firmwareVersion: string;
  serialNumber: string;
  mediaServiceUrl: string;
  profiles: OnvifProfile[];
  capabilities: { ptz: boolean; audio: boolean; events: boolean };
  services: string[];
  capabilityTests: Array<{ name: string; status: "pass" | "fail" | "unsupported" | "vendor-specific"; detail?: string }>;
  inspectionLayers: OnvifInspectionLayer[];
  timeSynchronization?: "synchronized" | "drifted" | "unknown";
  clockOffsetMs?: number;
}

export class OnvifClient {
  private readonly parser = new XMLParser({
    removeNSPrefix: true,
    ignoreAttributes: false,
    parseTagValue: true,
  });

  constructor(
    protected readonly deviceServiceUrl: string,
    protected readonly credentials: OnvifCredentials,
    protected readonly timeoutMs = 8000,
  ) {}

  async ping(): Promise<void> {
    await this.call(
      this.deviceServiceUrl,
      "http://www.onvif.org/ver10/device/wsdl/GetSystemDateAndTime",
      `<tds:GetSystemDateAndTime/>`,
      `xmlns:tds="http://www.onvif.org/ver10/device/wsdl"`,
    );
  }

  async reboot(): Promise<string> {
    const document = await this.call(
      this.deviceServiceUrl,
      "http://www.onvif.org/ver10/device/wsdl/SystemReboot",
      `<tds:SystemReboot/>`,
      `xmlns:tds="http://www.onvif.org/ver10/device/wsdl"`,
    );
    const response = findRecord(document, "SystemRebootResponse");
    return textValue(response?.Message) ?? "ONVIF SystemReboot accepted";
  }

  async inspect(): Promise<OnvifDeviceDetails> {
    const inspectionLayers: OnvifInspectionLayer[] = [];
    let info: unknown;
    try {
      info = await this.call(
        this.deviceServiceUrl,
        "http://www.onvif.org/ver10/device/wsdl/GetDeviceInformation",
        `<tds:GetDeviceInformation/>`,
        `xmlns:tds="http://www.onvif.org/ver10/device/wsdl"`,
      );
      inspectionLayers.push({
        layer: "onvif-authentication",
        status: "passed",
        detail: "Authenticated GetDeviceInformation completed",
      });
    } catch (error) {
      throw new Error(`ONVIF authentication or device information failed: ${errorMessage(error)}`, { cause: error });
    }

    let capabilities: unknown;
    try {
      capabilities = await this.call(
        this.deviceServiceUrl,
        "http://www.onvif.org/ver10/device/wsdl/GetCapabilities",
        `<tds:GetCapabilities><tds:Category>All</tds:Category></tds:GetCapabilities>`,
        `xmlns:tds="http://www.onvif.org/ver10/device/wsdl"`,
      );
      inspectionLayers.push({
        layer: "get-capabilities",
        status: "passed",
        detail: "GetCapabilities completed",
      });
    } catch (error) {
      inspectionLayers.push({
        layer: "get-capabilities",
        status: "failed",
        detail: errorMessage(error),
      });
    }

    const infoResponse = findRecord(info, "GetDeviceInformationResponse");
    const caps = findRecord(capabilities, "Capabilities");
    const media = recordValue(caps?.Media);
    const advertisedMediaServiceUrl = textValue(media?.["@_XAddr"]) ?? textValue(media?.XAddr);
    const mediaServiceCandidates = uniqueStrings([
      ...(advertisedMediaServiceUrl
        ? [normalizeServiceAddress(advertisedMediaServiceUrl, this.deviceServiceUrl)]
        : []),
      ...guessedMediaServiceUrls(this.deviceServiceUrl),
    ]);
    let mediaServiceUrl = mediaServiceCandidates[0]!;
    let rawProfiles: unknown[] = [];
    let profileFailure = "No ONVIF media service accepted GetProfiles";
    for (const candidate of mediaServiceCandidates) {
      try {
        const profileDocument = await this.call(
          candidate,
          "http://www.onvif.org/ver10/media/wsdl/GetProfiles",
          `<trt:GetProfiles/>`,
          `xmlns:trt="http://www.onvif.org/ver10/media/wsdl"`,
        );
        const profileResponse = findRecord(profileDocument, "GetProfilesResponse");
        rawProfiles = arrayValue(profileResponse?.Profiles);
        mediaServiceUrl = candidate;
        inspectionLayers.push({
          layer: "get-profiles",
          status: advertisedMediaServiceUrl && candidate === normalizeServiceAddress(advertisedMediaServiceUrl, this.deviceServiceUrl)
            ? "passed"
            : "fallback",
          detail: `${rawProfiles.length} profile(s) returned by ${redactUrl(candidate)}`,
        });
        break;
      } catch (error) {
        profileFailure = errorMessage(error);
      }
    }
    if (!rawProfiles.length) {
      inspectionLayers.push({
        layer: "get-profiles",
        status: "failed",
        detail: profileFailure,
      });
    }
    const profiles = rawProfiles.map(parseProfile).filter((item): item is OnvifProfile => Boolean(item));

    let clockOffsetMs: number | undefined;
    try {
      const timeDocument = await this.call(
        this.deviceServiceUrl,
        "http://www.onvif.org/ver10/device/wsdl/GetSystemDateAndTime",
        `<tds:GetSystemDateAndTime/>`,
        `xmlns:tds="http://www.onvif.org/ver10/device/wsdl"`,
      );
      const deviceTime = parseOnvifUtcDateTime(timeDocument);
      if (deviceTime !== undefined) clockOffsetMs = deviceTime - Date.now();
    } catch {
      // Time support is optional. Unknown remains explicit evidence rather than
      // being guessed from a successful authenticated device-info request.
    }
    const timeSynchronization = clockOffsetMs === undefined
      ? "unknown" as const
      : Math.abs(clockOffsetMs) <= 30_000
        ? "synchronized" as const
        : "drifted" as const;

    const services = buildServices(caps, Boolean(mediaServiceUrl), profiles.length > 0);
    const capabilityTests = buildCapabilityTests({
      manufacturer: textValue(infoResponse?.Manufacturer) ?? "unknown",
      model: textValue(infoResponse?.Model) ?? "unknown",
      firmwareVersion: textValue(infoResponse?.FirmwareVersion) ?? "unknown",
      serialNumber: textValue(infoResponse?.SerialNumber) ?? "unknown",
      services,
      profiles,
      capabilities: {
        ptz: Boolean(caps?.PTZ),
        audio: rawProfiles.some(hasAudioEncoder),
        events: Boolean(caps?.Events),
      },
      inspectionLayers,
    });

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
      services,
      capabilityTests,
      inspectionLayers,
      timeSynchronization,
      ...(clockOffsetMs !== undefined ? { clockOffsetMs } : {}),
    };
  }

  async getStreamUri(mediaServiceUrl: string, profileToken: string) {
    const attempts = [
      {
        action: "http://www.onvif.org/ver10/media/wsdl/GetStreamUri",
        body: `<trt:GetStreamUri>
          <trt:StreamSetup>
            <tt:Stream>RTP-Unicast</tt:Stream>
            <tt:Transport><tt:Protocol>RTSP</tt:Protocol></tt:Transport>
          </trt:StreamSetup>
          <trt:ProfileToken>${escapeXml(profileToken)}</trt:ProfileToken>
        </trt:GetStreamUri>`,
        namespaces: `xmlns:trt="http://www.onvif.org/ver10/media/wsdl"
         xmlns:tt="http://www.onvif.org/ver10/schema"`,
      },
      {
        action: "http://www.onvif.org/ver20/media/wsdl/GetStreamUri",
        body: `<tr2:GetStreamUri>
          <tr2:Protocol>RTSP</tr2:Protocol>
          <tr2:ProfileToken>${escapeXml(profileToken)}</tr2:ProfileToken>
        </tr2:GetStreamUri>`,
        namespaces: `xmlns:tr2="http://www.onvif.org/ver20/media/wsdl"`,
      },
    ];
    let failure = "ONVIF profile did not return an RTSP URI";
    for (const attempt of attempts) {
      try {
        const document = await this.call(
          mediaServiceUrl,
          attempt.action,
          attempt.body,
          attempt.namespaces,
        );
        const response = findRecord(document, "GetStreamUriResponse");
        const mediaUri = recordValue(response?.MediaUri);
        const uri = textValue(mediaUri?.Uri);
        if (uri) return normalizeServiceAddress(uri, this.deviceServiceUrl);
      } catch (error) {
        failure = errorMessage(error);
      }
    }
    throw new Error(failure);
  }

  protected async call(
    url: string,
    action: string,
    body: string,
    namespaces: string,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      let lastFailure = "ONVIF request failed";
      for (const soapVersion of ["1.2", "1.1"] as const) {
        const envelope = soapEnvelope(body, namespaces, this.credentials, soapVersion);
        const headers: Record<string, string> = soapVersion === "1.2"
          ? { "content-type": `application/soap+xml; charset=utf-8; action="${action}"` }
          : { "content-type": "text/xml; charset=utf-8", soapaction: `"${action}"` };
        let response = await fetch(url, {
          method: "POST",
          headers,
          body: envelope,
          signal: controller.signal,
        });
        if (response.status === 401) {
          const authorization = httpAuthorization(
            response.headers.get("www-authenticate"),
            this.credentials,
            url,
          );
          if (authorization) {
            response = await fetch(url, {
              method: "POST",
              headers: { ...headers, authorization },
              body: envelope,
              signal: controller.signal,
            });
          }
        }
        const text = await response.text();
        if (!response.ok) {
          lastFailure = `ONVIF request failed (${response.status}): ${text.slice(0, 1200)}`;
          if (soapVersion === "1.2" && [400, 415, 500].includes(response.status)) continue;
          throw new Error(lastFailure);
        }
        const parsed = this.parser.parse(text) as unknown;
        const fault = findRecord(parsed, "Fault");
        if (fault) {
          lastFailure = `ONVIF SOAP fault: ${JSON.stringify(fault).slice(0, 300)}`;
          if (soapVersion === "1.2") continue;
          throw new Error(lastFailure);
        }
        return parsed;
      }
      throw new Error(lastFailure);
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
  soapVersion: "1.2" | "1.1" = "1.2",
) {
  const soapNamespace = soapVersion === "1.2"
    ? "http://www.w3.org/2003/05/soap-envelope"
    : "http://schemas.xmlsoap.org/soap/envelope/";
  // A number of ONVIF cameras ship with an enabled admin account and no
  // password. Those devices accept unauthenticated SOAP requests but reject a
  // WS-Security PasswordDigest generated from an empty password with HTTP 400.
  // Omitting the security header in that case preserves password-protected
  // device behavior while allowing explicitly passwordless cameras to be
  // inspected and onboarded.
  if (credentials.password === "") {
    return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="${soapNamespace}"
 ${namespaces}>
 <s:Body>${body}</s:Body>
</s:Envelope>`;
  }

  const nonce = randomBytes(20);
  const created = new Date().toISOString();
  const expires = new Date(Date.now() + 5 * 60_000).toISOString();
  const digest = createHash("sha1")
    .update(Buffer.concat([nonce, Buffer.from(created), Buffer.from(credentials.password)]))
    .digest("base64");
  return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="${soapNamespace}"
 xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"
 xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd"
 ${namespaces}>
 <s:Header>
  <wsse:Security s:mustUnderstand="1">
   <wsu:Timestamp wsu:Id="Timestamp-${randomBytes(8).toString("hex")}">
    <wsu:Created>${created}</wsu:Created>
    <wsu:Expires>${expires}</wsu:Expires>
   </wsu:Timestamp>
   <wsse:UsernameToken wsu:Id="UsernameToken-${randomBytes(8).toString("hex")}">
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

function buildServices(caps: Record<string, unknown> | undefined, hasMediaService: boolean, hasProfiles: boolean) {
  const services = ["DeviceManagement"];
  if (hasMediaService) {
    services.push("Media");
    if (hasProfiles) services.push("Media2");
  }
  if (Boolean(caps?.PTZ)) services.push("PTZ");
  if (Boolean(caps?.Events)) services.push("Events");
  if (Boolean(caps?.Imaging)) services.push("Imaging");
  if (Boolean(caps?.Analytics)) services.push("Analytics");
  if (Boolean(caps?.Recording)) services.push("Recording");
  if (Boolean(caps?.DeviceIO)) services.push("DeviceIO");
  if (Boolean(caps?.Replay)) services.push("Replay");
  return services;
}

function buildCapabilityTests(input: {
  manufacturer: string;
  model: string;
  firmwareVersion: string;
  serialNumber: string;
  services: string[];
  profiles: OnvifProfile[];
  capabilities: { ptz: boolean; audio: boolean; events: boolean };
  inspectionLayers: OnvifInspectionLayer[];
}) {
  const hasH264 = input.profiles.some((profile) => profile.codec === "H264");
  const hasH265 = input.profiles.some((profile) => profile.codec === "H265");
  const capabilityLayer = input.inspectionLayers.find((item) => item.layer === "get-capabilities");
  const profileLayer = input.inspectionLayers.find((item) => item.layer === "get-profiles");
  return [
    { name: "ONVIF authentication", status: "pass" as const, detail: "Authenticated SOAP calls succeeded" },
    { name: "Device information", status: "pass" as const, detail: `${input.manufacturer} ${input.model}` },
    { name: "GetCapabilities", status: capabilityLayer?.status === "passed" ? "pass" as const : "fail" as const, detail: capabilityLayer?.detail ?? "GetCapabilities unavailable" },
    { name: "Media profiles", status: input.profiles.length > 0 ? "pass" as const : "fail" as const, detail: profileLayer?.detail ?? "No media profiles returned" },
    { name: "RTSP URI", status: "unsupported" as const, detail: "GetStreamUri has not been verified yet" },
    { name: "H.264", status: hasH264 ? "pass" as const : "unsupported" as const, detail: hasH264 ? "H.264 profile available" : "No H.264 profile exposed" },
    { name: "H.265", status: hasH265 ? "pass" as const : "unsupported" as const, detail: hasH265 ? "H.265 profile available" : "No H.265 profile exposed" },
    { name: "PTZ", status: input.capabilities.ptz ? "pass" as const : "unsupported" as const, detail: input.capabilities.ptz ? "PTZ service exposed" : "PTZ service not exposed" },
    { name: "Events", status: input.capabilities.events ? "pass" as const : "unsupported" as const, detail: input.capabilities.events ? "Event service available" : "Event service unavailable" },
    { name: "Imaging control", status: input.services.includes("Imaging") ? "pass" as const : "unsupported" as const, detail: input.services.includes("Imaging") ? "Imaging service available" : "Imaging service unavailable" },
    { name: "Firmware upgrade", status: input.firmwareVersion && input.firmwareVersion !== "unknown" ? "vendor-specific" as const : "unsupported" as const, detail: input.firmwareVersion && input.firmwareVersion !== "unknown" ? "Vendor-specific upgrade path required" : "Firmware version unavailable" },
  ];
}

function parseOnvifUtcDateTime(document: unknown) {
  const response = findRecord(document, "GetSystemDateAndTimeResponse");
  const system = recordValue(response?.SystemDateAndTime);
  // Only UTC is safe to compare with the trusted reference clock. A local-only
  // response has no reliable offset without complete ONVIF timezone metadata.
  const dateTime = recordValue(system?.UTCDateTime);
  const date = recordValue(dateTime?.Date);
  const time = recordValue(dateTime?.Time);
  const year = numberValue(date?.Year);
  const month = numberValue(date?.Month);
  const day = numberValue(date?.Day);
  const hour = numberValue(time?.Hour);
  const minute = numberValue(time?.Minute);
  const second = numberValue(time?.Second);
  if (!year || !month || !day) return undefined;
  const timestamp = Date.UTC(year, month - 1, day, hour, minute, second);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function guessedMediaServiceUrls(deviceServiceUrl: string) {
  const parsed = new URL(deviceServiceUrl);
  return uniqueStrings([
    new URL("/onvif/media_service", parsed).toString(),
    new URL("/onvif/Media", parsed).toString(),
    new URL("/onvif/media", parsed).toString(),
  ]);
}

function normalizeServiceAddress(value: string, referenceUrl: string) {
  const reference = new URL(referenceUrl);
  const parsed = new URL(value, reference);
  if (["0.0.0.0", "127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
    parsed.hostname = reference.hostname;
  }
  return parsed.toString();
}

function redactUrl(value: string) {
  const parsed = new URL(value);
  parsed.username = "";
  parsed.password = "";
  return parsed.toString();
}

function httpAuthorization(
  challenge: string | null,
  credentials: OnvifCredentials,
  requestUrl: string,
) {
  if (!challenge || !credentials.username) return undefined;
  const digestStart = challenge.toLowerCase().indexOf("digest ");
  if (digestStart >= 0) {
    const parameters = parseDigestChallenge(challenge.slice(digestStart + "digest ".length));
    const realm = parameters.realm;
    const nonce = parameters.nonce;
    if (!realm || !nonce) return undefined;
    const algorithmLabel = (parameters.algorithm ?? "MD5").toUpperCase();
    const hashAlgorithm = algorithmLabel.startsWith("SHA-256") ? "sha256" : "md5";
    const qop = parameters.qop?.split(",").map((value) => value.trim()).find((value) => value === "auth");
    const requestTarget = `${new URL(requestUrl).pathname}${new URL(requestUrl).search}` || "/";
    const cnonce = randomBytes(12).toString("hex");
    const nonceCount = "00000001";
    const digest = (value: string) => createHash(hashAlgorithm).update(value).digest("hex");
    let ha1 = digest(`${credentials.username}:${realm}:${credentials.password}`);
    if (algorithmLabel.endsWith("-SESS")) ha1 = digest(`${ha1}:${nonce}:${cnonce}`);
    const ha2 = digest(`POST:${requestTarget}`);
    const response = qop
      ? digest(`${ha1}:${nonce}:${nonceCount}:${cnonce}:${qop}:${ha2}`)
      : digest(`${ha1}:${nonce}:${ha2}`);
    const values = [
      `username="${quoteHeader(credentials.username)}"`,
      `realm="${quoteHeader(realm)}"`,
      `nonce="${quoteHeader(nonce)}"`,
      `uri="${quoteHeader(requestTarget)}"`,
      `response="${response}"`,
      `algorithm=${algorithmLabel}`,
      ...(parameters.opaque ? [`opaque="${quoteHeader(parameters.opaque)}"`] : []),
      ...(qop ? [`qop=${qop}`, `nc=${nonceCount}`, `cnonce="${cnonce}"`] : []),
    ];
    return `Digest ${values.join(", ")}`;
  }
  if (/\bbasic\b/i.test(challenge)) {
    return `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`;
  }
  return undefined;
}

function parseDigestChallenge(value: string) {
  const result: Record<string, string> = {};
  const pattern = /([a-z0-9_-]+)\s*=\s*(?:"([^"]*)"|([^,\s]+))/gi;
  for (const match of value.matchAll(pattern)) {
    result[match[1]!.toLowerCase()] = match[2] ?? match[3] ?? "";
  }
  return result;
}

function quoteHeader(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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

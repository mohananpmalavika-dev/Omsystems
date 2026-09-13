import { SoapClient } from "../soap/soap-client.js";
import type { WsSecurityCredentials } from "../security/ws-security.js";

export interface VideoEncoderConfiguration {
  token: string;
  name: string;
  encoding: "H264" | "H265" | "JPEG" | "MPEG4";
  resolution: { width: number; height: number };
  quality: number;
  framerateLimit: number;
  bitrateLimitKbps: number;
  govLength?: number;
  h264Profile?: "Baseline" | "Main" | "Extended" | "High";
}

export interface OnvifMediaProfile {
  token: string;
  name: string;
  fixed: boolean;
  videoSourceConfigurationToken?: string;
  videoEncoderConfiguration?: VideoEncoderConfiguration;
  audioEncoderConfigurationToken?: string;
  ptzConfigurationToken?: string;
}

export interface StreamUriResult {
  uri: string;
  invalidAfterBounds?: string;
  invalidAfterConnect?: string;
}

export interface VideoEncoderConfigurationOptions {
  qualityRange: { min: number; max: number };
  resolutionsAvailable: Array<{ width: number; height: number }>;
  govLengthRange?: { min: number; max: number };
  frameRateRange: { min: number; max: number };
  bitrateRangeKbps: { min: number; max: number };
  encodingIntervalRange?: { min: number; max: number };
  h264ProfilesSupported?: string[];
}

export class MediaService {
  private readonly soap: SoapClient;
  private endpoint: string;
  private credentials?: WsSecurityCredentials;
  private isMedia2 = false;

  constructor(endpoint: string, credentials?: WsSecurityCredentials, isMedia2 = false, soap: SoapClient = new SoapClient()) {
    this.endpoint = endpoint;
    this.credentials = credentials;
    this.isMedia2 = isMedia2;
    this.soap = soap;
  }

  setEndpoint(endpoint: string): void {
    this.endpoint = endpoint;
  }

  setCredentials(credentials: WsSecurityCredentials): void {
    this.credentials = credentials;
  }

  /**
   * trt:GetProfiles / tr2:GetProfiles
   */
  async getProfiles(): Promise<OnvifMediaProfile[]> {
    const bodyXml = this.isMedia2
      ? `<tr2:GetProfiles xmlns:tr2="http://www.onvif.org/ver20/media/wsdl"><tr2:Type>All</tr2:Type></tr2:GetProfiles>`
      : `<trt:GetProfiles xmlns:trt="http://www.onvif.org/ver10/media/wsdl" />`;

    const action = this.isMedia2
      ? "http://www.onvif.org/ver20/media/wsdl/GetProfiles"
      : "http://www.onvif.org/ver10/media/wsdl/GetProfiles";

    const response = await this.soap.request({
      endpoint: this.endpoint,
      action,
      bodyXml,
      credentials: this.credentials,
    });

    const profileTags = SoapClient.extractAllFullTags(response, "Profiles");
    const profiles: OnvifMediaProfile[] = [];

    for (const pXml of profileTags) {
      const token = SoapClient.extractAttribute(pXml, "token") || SoapClient.extractTag(pXml, "token") || "profile_default";
      const name = SoapClient.extractTag(pXml, "Name") || token;
      const fixed = SoapClient.extractAttribute(pXml, "fixed") === "true";

      const vsConfigFull = SoapClient.extractAllFullTags(pXml, "VideoSourceConfiguration")[0];
      const vsToken = vsConfigFull ? SoapClient.extractAttribute(vsConfigFull, "token") ?? undefined : undefined;

      const veConfigFull = SoapClient.extractAllFullTags(pXml, "VideoEncoderConfiguration")[0];
      let videoEncoderConfig: VideoEncoderConfiguration | undefined;

      if (veConfigFull) {
        const veToken = SoapClient.extractAttribute(veConfigFull, "token") || "ve_token";
        const veName = SoapClient.extractTag(veConfigFull, "Name") || "video_encoder";
        const encoding = (SoapClient.extractTag(veConfigFull, "Encoding") as any) || "H264";

        const resTag = SoapClient.extractTag(veConfigFull, "Resolution");
        const width = resTag ? parseInt(SoapClient.extractTag(resTag, "Width") || "1920", 10) : 1920;
        const height = resTag ? parseInt(SoapClient.extractTag(resTag, "Height") || "1080", 10) : 1080;

        const quality = parseFloat(SoapClient.extractTag(veConfigFull, "Quality") || "5");

        const rateControlTag = SoapClient.extractTag(veConfigFull, "RateControl");
        const framerateLimit = rateControlTag ? parseInt(SoapClient.extractTag(rateControlTag, "FrameRateLimit") || "30", 10) : 30;
        const bitrateLimitKbps = rateControlTag ? parseInt(SoapClient.extractTag(rateControlTag, "BitrateLimit") || "4096", 10) : 4096;

        const h264Tag = SoapClient.extractTag(veConfigFull, "H264");
        const govLength = h264Tag ? parseInt(SoapClient.extractTag(h264Tag, "GovLength") || "30", 10) : undefined;
        const h264Profile = h264Tag ? (SoapClient.extractTag(h264Tag, "H264Profile") as any) ?? undefined : undefined;

        videoEncoderConfig = {
          token: veToken,
          name: veName,
          encoding,
          resolution: { width, height },
          quality,
          framerateLimit,
          bitrateLimitKbps,
          govLength,
          h264Profile,
        };
      }

      const ptzConfigTag = SoapClient.extractTag(pXml, "PTZConfiguration");
      const ptzToken = ptzConfigTag ? SoapClient.extractAttribute(ptzConfigTag, "token") ?? undefined : undefined;

      profiles.push({
        token,
        name,
        fixed,
        videoSourceConfigurationToken: vsToken,
        videoEncoderConfiguration: videoEncoderConfig,
        ptzConfigurationToken: ptzToken,
      });
    }

    return profiles;
  }

  /**
   * trt:GetStreamUri / tr2:GetStreamUri
   */
  async getStreamUri(profileToken: string, protocol: "UDP" | "TCP" | "RTSP" | "HTTP" = "RTSP"): Promise<StreamUriResult> {
    let bodyXml: string;
    let action: string;

    if (this.isMedia2) {
      bodyXml = `
<tr2:GetStreamUri xmlns:tr2="http://www.onvif.org/ver20/media/wsdl">
  <tr2:Protocol>${protocol}</tr2:Protocol>
  <tr2:ProfileToken>${profileToken}</tr2:ProfileToken>
</tr2:GetStreamUri>`.trim();
      action = "http://www.onvif.org/ver20/media/wsdl/GetStreamUri";
    } else {
      bodyXml = `
<trt:GetStreamUri xmlns:trt="http://www.onvif.org/ver10/media/wsdl">
  <trt:StreamSetup>
    <tt:Stream>RTP-Unicast</tt:Stream>
    <tt:Transport>
      <tt:Protocol>${protocol}</tt:Protocol>
    </tt:Transport>
  </trt:StreamSetup>
  <trt:ProfileToken>${profileToken}</trt:ProfileToken>
</trt:GetStreamUri>`.trim();
      action = "http://www.onvif.org/ver10/media/wsdl/GetStreamUri";
    }

    const response = await this.soap.request({
      endpoint: this.endpoint,
      action,
      bodyXml,
      credentials: this.credentials,
    });

    let rawUri = SoapClient.extractTag(response, "Uri") || "";

    // Inject credentials into RTSP URL if present and URL doesn't contain user info
    if (this.credentials?.username && this.credentials?.password && rawUri.startsWith("rtsp://") && !rawUri.includes("@")) {
      const encUser = encodeURIComponent(this.credentials.username);
      const encPass = encodeURIComponent(this.credentials.password);
      rawUri = rawUri.replace("rtsp://", `rtsp://${encUser}:${encPass}@`);
    }

    return {
      uri: rawUri,
      invalidAfterBounds: SoapClient.extractTag(response, "InvalidAfterBounds") ?? undefined,
      invalidAfterConnect: SoapClient.extractTag(response, "InvalidAfterConnect") ?? undefined,
    };
  }

  /**
   * trt:GetSnapshotUri / tr2:GetSnapshotUri
   */
  async getSnapshotUri(profileToken: string): Promise<string> {
    let bodyXml: string;
    let action: string;

    if (this.isMedia2) {
      bodyXml = `
<tr2:GetSnapshotUri xmlns:tr2="http://www.onvif.org/ver20/media/wsdl">
  <tr2:ProfileToken>${profileToken}</tr2:ProfileToken>
</tr2:GetSnapshotUri>`.trim();
      action = "http://www.onvif.org/ver20/media/wsdl/GetSnapshotUri";
    } else {
      bodyXml = `
<trt:GetSnapshotUri xmlns:trt="http://www.onvif.org/ver10/media/wsdl">
  <trt:ProfileToken>${profileToken}</trt:ProfileToken>
</trt:GetSnapshotUri>`.trim();
      action = "http://www.onvif.org/ver10/media/wsdl/GetSnapshotUri";
    }

    const response = await this.soap.request({
      endpoint: this.endpoint,
      action,
      bodyXml,
      credentials: this.credentials,
    });

    return SoapClient.extractTag(response, "Uri") || "";
  }

  /**
   * Fetches the current live JPEG snapshot binary buffer
   */
  async getSnapshotBuffer(profileToken: string, timeoutMs = 8000): Promise<Buffer> {
    const uri = await this.getSnapshotUri(profileToken);
    if (!uri) throw new Error("Camera did not return a snapshot URI");

    const headers: Record<string, string> = {};
    if (this.credentials?.username && this.credentials?.password) {
      const authStr = Buffer.from(`${this.credentials.username}:${this.credentials.password}`).toString("base64");
      headers["Authorization"] = `Basic ${authStr}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(uri, { headers, signal: controller.signal });
      if (!res.ok) throw new Error(`Snapshot HTTP fetch failed with status ${res.status}: ${res.statusText}`);
      const arrayBuffer = await res.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * trt:SetVideoEncoderConfiguration
   */
  async setVideoEncoderConfiguration(config: {
    token: string;
    name: string;
    encoding: string;
    width: number;
    height: number;
    quality: number;
    framerateLimit: number;
    bitrateLimitKbps: number;
    govLength?: number;
  }): Promise<void> {
    const bodyXml = `
<trt:SetVideoEncoderConfiguration xmlns:trt="http://www.onvif.org/ver10/media/wsdl">
  <trt:Configuration token="${config.token}">
    <tt:Name>${config.name}</tt:Name>
    <tt:UseCount>1</tt:UseCount>
    <tt:Encoding>${config.encoding}</tt:Encoding>
    <tt:Resolution>
      <tt:Width>${config.width}</tt:Width>
      <tt:Height>${config.height}</tt:Height>
    </tt:Resolution>
    <tt:Quality>${config.quality}</tt:Quality>
    <tt:RateControl>
      <tt:FrameRateLimit>${config.framerateLimit}</tt:FrameRateLimit>
      <tt:EncodingInterval>1</tt:EncodingInterval>
      <tt:BitrateLimit>${config.bitrateLimitKbps}</tt:BitrateLimit>
    </tt:RateControl>
    ${
      config.govLength
        ? `<tt:H264>
      <tt:GovLength>${config.govLength}</tt:GovLength>
      <tt:H264Profile>Main</tt:H264Profile>
    </tt:H264>`
        : ""
    }
  </trt:Configuration>
  <trt:ForcePersistence>true</trt:ForcePersistence>
</trt:SetVideoEncoderConfiguration>`.trim();

    await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver10/media/wsdl/SetVideoEncoderConfiguration",
      bodyXml,
      credentials: this.credentials,
    });
  }

  /**
   * trt:GetVideoEncoderConfigurationOptions
   */
  async getVideoEncoderConfigurationOptions(
    configurationToken?: string,
    profileToken?: string
  ): Promise<VideoEncoderConfigurationOptions> {
    const bodyXml = `
<trt:GetVideoEncoderConfigurationOptions xmlns:trt="http://www.onvif.org/ver10/media/wsdl">
  ${configurationToken ? `<trt:ConfigurationToken>${configurationToken}</trt:ConfigurationToken>` : ""}
  ${profileToken ? `<trt:ProfileToken>${profileToken}</trt:ProfileToken>` : ""}
</trt:GetVideoEncoderConfigurationOptions>`.trim();

    const responseXml = await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver10/media/wsdl/GetVideoEncoderConfigurationOptions",
      bodyXml,
      credentials: this.credentials,
    });

    // Quality Range
    const qualityTag = SoapClient.extractTag(responseXml, "QualityRange");
    const qualityMin = qualityTag ? parseInt(SoapClient.extractTag(qualityTag, "Min") || "1", 10) : 1;
    const qualityMax = qualityTag ? parseInt(SoapClient.extractTag(qualityTag, "Max") || "100", 10) : 100;

    // Resolutions Available
    const resolutionsAvailable: Array<{ width: number; height: number }> = [];
    const resBlocks = SoapClient.extractAllFullTags(responseXml, "ResolutionsAvailable");
    for (const resXml of resBlocks) {
      const width = parseInt(SoapClient.extractTag(resXml, "Width") || "0", 10);
      const height = parseInt(SoapClient.extractTag(resXml, "Height") || "0", 10);
      if (width > 0 && height > 0 && !resolutionsAvailable.some(r => r.width === width && r.height === height)) {
        resolutionsAvailable.push({ width, height });
      }
    }

    // Gov Length
    const govTag = SoapClient.extractTag(responseXml, "GovLengthRange");
    const govMin = govTag ? parseInt(SoapClient.extractTag(govTag, "Min") || "1", 10) : undefined;
    const govMax = govTag ? parseInt(SoapClient.extractTag(govTag, "Max") || "300", 10) : undefined;

    // FrameRate Range
    const fpsTag = SoapClient.extractTag(responseXml, "FrameRateRange");
    const fpsMin = fpsTag ? parseInt(SoapClient.extractTag(fpsTag, "Min") || "1", 10) : 1;
    const fpsMax = fpsTag ? parseInt(SoapClient.extractTag(fpsTag, "Max") || "30", 10) : 30;

    // Bitrate Range
    const bitrateTag = SoapClient.extractTag(responseXml, "BitrateRange");
    const bitrateMin = bitrateTag ? parseInt(SoapClient.extractTag(bitrateTag, "Min") || "64", 10) : 64;
    const bitrateMax = bitrateTag ? parseInt(SoapClient.extractTag(bitrateTag, "Max") || "16384", 10) : 16384;

    // Encoding Interval Range
    const intervalTag = SoapClient.extractTag(responseXml, "EncodingIntervalRange");
    const intervalMin = intervalTag ? parseInt(SoapClient.extractTag(intervalTag, "Min") || "1", 10) : undefined;
    const intervalMax = intervalTag ? parseInt(SoapClient.extractTag(intervalTag, "Max") || "1", 10) : undefined;

    // H264 Profiles
    const h264ProfilesSupported: string[] = [];
    const profileMatches = responseXml.match(/<(?:[\w-]+:)?H264ProfilesSupported>([^<]+)<\/(?:[\w-]+:)?H264ProfilesSupported>/gi);
    if (profileMatches) {
      for (const pm of profileMatches) {
        const val = pm.replace(/<\/?[\w:-]+>/g, "").trim();
        if (val && !h264ProfilesSupported.includes(val)) {
          h264ProfilesSupported.push(val);
        }
      }
    }

    return {
      qualityRange: { min: qualityMin, max: qualityMax },
      resolutionsAvailable,
      govLengthRange: govMin !== undefined && govMax !== undefined ? { min: govMin, max: govMax } : undefined,
      frameRateRange: { min: fpsMin, max: fpsMax },
      bitrateRangeKbps: { min: bitrateMin, max: bitrateMax },
      encodingIntervalRange: intervalMin !== undefined && intervalMax !== undefined ? { min: intervalMin, max: intervalMax } : undefined,
      h264ProfilesSupported: h264ProfilesSupported.length > 0 ? h264ProfilesSupported : undefined,
    };
  }
}

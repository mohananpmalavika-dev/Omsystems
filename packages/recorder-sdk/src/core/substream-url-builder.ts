/**
 * Substream URL Builder
 * 
 * Auto-generates correct Mainstream and Substream RTSP URLs
 * for enterprise multi-branch DVR deployments across all major brands.
 */

export type DvrBrand = "hikvision" | "dahua" | "cpplus" | "uniview" | "onvif" | "generic" | "tvt" | "tiandy";

export type StreamProfileType = "main" | "sub" | "mobile";

export interface DvrChannelEndpoint {
  host: string;
  port?: number;
  username?: string;
  password?: string;
  channel: number; // 1-indexed channel number
  brand: DvrBrand;
  streamProfile?: StreamProfileType;
}

export interface BranchDvrConfig {
  branchId: string;
  branchName: string;
  vpnIp: string;
  rtspPort?: number;
  username: string;
  password: string;
  brand: DvrBrand;
  totalChannels: number;
  analyticsProfile?: "retail" | "banking" | "warehouse" | "general";
}

export class SubstreamUrlBuilder {
  /**
   * Build RTSP URL for a specific DVR channel and stream profile
   */
  static buildRtspUrl(config: DvrChannelEndpoint): string {
    const port = config.port ?? 554;
    const auth = config.username && config.password 
      ? `${encodeURIComponent(config.username)}:${encodeURIComponent(config.password)}@` 
      : "";
    const profile = config.streamProfile ?? "sub";
    const channel = Math.max(1, config.channel);

    switch (config.brand.toLowerCase()) {
      case "hikvision": {
        // Hikvision: Channel 1 main = 101, sub = 102
        const streamCode = profile === "main" ? "01" : profile === "sub" ? "02" : "03";
        const channelCode = `${channel}${streamCode}`;
        return `rtsp://${auth}${config.host}:${port}/Streaming/Channels/${channelCode}`;
      }

      case "dahua":
      case "cpplus": {
        // Dahua & CP Plus: subtype 0 = main, 1 = sub, 2 = mobile
        const subtype = profile === "main" ? 0 : profile === "sub" ? 1 : 2;
        return `rtsp://${auth}${config.host}:${port}/cam/realmonitor?channel=${channel}&subtype=${subtype}`;
      }

      case "uniview": {
        // Uniview: /unicast/c{channel}/s{stream}/live (s0 = main, s1 = sub)
        const streamIndex = profile === "main" ? 0 : 1;
        return `rtsp://${auth}${config.host}:${port}/unicast/c${channel}/s${streamIndex}/live`;
      }

      case "tvt": {
        // TVT: /ch{channel}/main or /ch{channel}/sub
        const streamPath = profile === "main" ? "main" : "sub";
        return `rtsp://${auth}${config.host}:${port}/ch${channel}/${streamPath}`;
      }

      case "tiandy": {
        // Tiandy: /media/video{channel}/{main|sub}
        const streamPath = profile === "main" ? "main" : "sub";
        return `rtsp://${auth}${config.host}:${port}/media/video${channel}/${streamPath}`;
      }

      case "onvif":
      case "generic":
      default: {
        // Standard RTSP fallback
        const subSuffix = profile === "main" ? "main" : "sub";
        return `rtsp://${auth}${config.host}:${port}/live/ch${channel}_${subSuffix}`;
      }
    }
  }

  /**
   * Bulk-generates all channel stream configurations for a branch DVR
   */
  static generateBranchChannelStreams(branch: BranchDvrConfig): Array<{
    channel: number;
    name: string;
    mainstreamUrl: string;
    substreamUrl: string;
    branchId: string;
  }> {
    const channels = [];
    for (let ch = 1; ch <= branch.totalChannels; ch++) {
      const mainstreamUrl = this.buildRtspUrl({
        host: branch.vpnIp,
        port: branch.rtspPort ?? 554,
        username: branch.username,
        password: branch.password,
        channel: ch,
        brand: branch.brand,
        streamProfile: "main",
      });

      const substreamUrl = this.buildRtspUrl({
        host: branch.vpnIp,
        port: branch.rtspPort ?? 554,
        username: branch.username,
        password: branch.password,
        channel: ch,
        brand: branch.brand,
        streamProfile: "sub",
      });

      channels.push({
        channel: ch,
        name: `${branch.branchName} - Cam ${ch}`,
        mainstreamUrl,
        substreamUrl,
        branchId: branch.branchId,
      });
    }
    return channels;
  }
}

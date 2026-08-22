/**
 * Authoritative Device Adapter Layer
 * (Vendor-neutral device capability, RTSP/ONVIF URI creation, stream profile discovery, authRef tokenization)
 */

export interface DeviceIdentity {
  manufacturer: string;
  model: string;
  serialNumber: string;
  firmwareVersion: string;
  hardwareRevision?: string;
  macAddress?: string;
}

export interface StreamProfile {
  id: string; // e.g. "main", "sub", "mobile"
  name: string;
  resolution: { width: number; height: number };
  fps: number;
  codec: "h264" | "h265" | "mjpeg";
  bitrateKbps: number;
  audioEnabled: boolean;
}

export interface MediaSource {
  protocol: "rtsp" | "rtsps";
  uri: string;
  transport: "tcp" | "udp" | "auto";
  codec: "h264" | "h265" | "mjpeg";
  authRef: string; // Tokenized secret vault reference - passwords never travel across services
  deviceTimestamp?: Date;
}

export interface DeviceCapabilities {
  channelCount: number;
  supportedProfiles: StreamProfile[];
  onvifVersion?: string;
  ptzSupported: boolean;
  twoWayAudioSupported: boolean;
  edgeStorageSupported: boolean;
  codecs: Array<"h264" | "h265" | "mjpeg">;
}

export interface DeviceAdapter {
  identify(): Promise<DeviceIdentity>;
  getCapabilities(): Promise<DeviceCapabilities>;
  getStreamProfiles(channelId: string): Promise<StreamProfile[]>;
  getLiveSource(channelId: string, profileId: string): Promise<MediaSource>;
  getSnapshot(channelId: string): Promise<{ buffer: Buffer; mimeType: string }>;
  getDeviceTime(): Promise<{ utcTime: Date; timeZone: string; ntpSynced: boolean }>;
}

export class CPPlusDeviceAdapter implements DeviceAdapter {
  constructor(private ip: string, private port = 554, private authRef = "vault:cred:cpplus-default") {}

  async identify(): Promise<DeviceIdentity> {
    return {
      manufacturer: "CP PLUS",
      model: "CP-UNR-432T8-V2",
      serialNumber: "CP-UNR-432T8-SN88301",
      firmwareVersion: "v4.001.0000002.1.R",
      hardwareRevision: "Rev 2.1",
    };
  }

  async getCapabilities(): Promise<DeviceCapabilities> {
    return {
      channelCount: 32,
      supportedProfiles: [
        { id: "main", name: "Main Stream 4K", resolution: { width: 3840, height: 2160 }, fps: 25, codec: "h265", bitrateKbps: 4096, audioEnabled: true },
        { id: "sub", name: "Sub Stream 720p", resolution: { width: 1280, height: 720 }, fps: 20, codec: "h264", bitrateKbps: 1024, audioEnabled: false },
        { id: "mobile", name: "Mobile Stream 360p", resolution: { width: 640, height: 360 }, fps: 15, codec: "h264", bitrateKbps: 384, audioEnabled: false },
      ],
      ptzSupported: false,
      twoWayAudioSupported: true,
      edgeStorageSupported: true,
      codecs: ["h264", "h265"],
    };
  }

  async getStreamProfiles(channelId: string): Promise<StreamProfile[]> {
    const caps = await this.getCapabilities();
    return caps.supportedProfiles;
  }

  async getLiveSource(channelId: string, profileId: string): Promise<MediaSource> {
    const streamNum = profileId === "main" ? 0 : profileId === "sub" ? 1 : 2;
    return {
      protocol: "rtsp",
      uri: `rtsp://${this.ip}:${this.port}/cam/realmonitor?channel=${channelId}&subtype=${streamNum}`,
      transport: "tcp",
      codec: profileId === "main" ? "h265" : "h264",
      authRef: this.authRef,
      deviceTimestamp: new Date(),
    };
  }

  async getSnapshot(channelId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    return { buffer: Buffer.from("CPPLUS_MOCK_JPEG"), mimeType: "image/jpeg" };
  }

  async getDeviceTime(): Promise<{ utcTime: Date; timeZone: string; ntpSynced: boolean }> {
    return { utcTime: new Date(), timeZone: "Asia/Kolkata", ntpSynced: true };
  }
}

export class DahuaDeviceAdapter implements DeviceAdapter {
  constructor(private ip: string, private port = 554, private authRef = "vault:cred:dahua-default") {}

  async identify(): Promise<DeviceIdentity> {
    return {
      manufacturer: "Dahua",
      model: "NVR5432-4KS2",
      serialNumber: "DH-NVR5432-88192",
      firmwareVersion: "DH_NVR5XXX_Eng_V4.001.0000000.1.R",
    };
  }

  async getCapabilities(): Promise<DeviceCapabilities> {
    return {
      channelCount: 32,
      supportedProfiles: [
        { id: "main", name: "Main Stream 1080p", resolution: { width: 1920, height: 1080 }, fps: 30, codec: "h265", bitrateKbps: 4096, audioEnabled: true },
        { id: "sub", name: "Sub Stream D1", resolution: { width: 704, height: 576 }, fps: 25, codec: "h264", bitrateKbps: 768, audioEnabled: false },
      ],
      ptzSupported: false,
      twoWayAudioSupported: true,
      edgeStorageSupported: true,
      codecs: ["h264", "h265"],
    };
  }

  async getStreamProfiles(): Promise<StreamProfile[]> {
    return (await this.getCapabilities()).supportedProfiles;
  }

  async getLiveSource(channelId: string, profileId: string): Promise<MediaSource> {
    const subtype = profileId === "main" ? 0 : 1;
    return {
      protocol: "rtsp",
      uri: `rtsp://${this.ip}:${this.port}/cam/realmonitor?channel=${channelId}&subtype=${subtype}`,
      transport: "tcp",
      codec: profileId === "main" ? "h265" : "h264",
      authRef: this.authRef,
      deviceTimestamp: new Date(),
    };
  }

  async getSnapshot(): Promise<{ buffer: Buffer; mimeType: string }> {
    return { buffer: Buffer.from("DAHUA_MOCK_JPEG"), mimeType: "image/jpeg" };
  }

  async getDeviceTime(): Promise<{ utcTime: Date; timeZone: string; ntpSynced: boolean }> {
    return { utcTime: new Date(), timeZone: "Asia/Kolkata", ntpSynced: true };
  }
}

export class HikvisionDeviceAdapter implements DeviceAdapter {
  constructor(private ip: string, private port = 554, private authRef = "vault:cred:hik-default") {}

  async identify(): Promise<DeviceIdentity> {
    return {
      manufacturer: "Hikvision",
      model: "DS-7732NI-I4",
      serialNumber: "DS-7732NI-SN77192",
      firmwareVersion: "V4.61.025_build220905",
    };
  }

  async getCapabilities(): Promise<DeviceCapabilities> {
    return {
      channelCount: 32,
      supportedProfiles: [
        { id: "main", name: "Main Stream 1080p", resolution: { width: 1920, height: 1080 }, fps: 25, codec: "h265", bitrateKbps: 4096, audioEnabled: true },
        { id: "sub", name: "Sub Stream 720p", resolution: { width: 1280, height: 720 }, fps: 20, codec: "h264", bitrateKbps: 1024, audioEnabled: false },
      ],
      ptzSupported: false,
      twoWayAudioSupported: true,
      edgeStorageSupported: true,
      codecs: ["h264", "h265"],
    };
  }

  async getStreamProfiles(): Promise<StreamProfile[]> {
    return (await this.getCapabilities()).supportedProfiles;
  }

  async getLiveSource(channelId: string, profileId: string): Promise<MediaSource> {
    const streamTrack = profileId === "main" ? "01" : "02";
    return {
      protocol: "rtsp",
      uri: `rtsp://${this.ip}:${this.port}/Streaming/Channels/${channelId}${streamTrack}`,
      transport: "tcp",
      codec: profileId === "main" ? "h265" : "h264",
      authRef: this.authRef,
      deviceTimestamp: new Date(),
    };
  }

  async getSnapshot(): Promise<{ buffer: Buffer; mimeType: string }> {
    return { buffer: Buffer.from("HIK_MOCK_JPEG"), mimeType: "image/jpeg" };
  }

  async getDeviceTime(): Promise<{ utcTime: Date; timeZone: string; ntpSynced: boolean }> {
    return { utcTime: new Date(), timeZone: "Asia/Kolkata", ntpSynced: true };
  }
}

export class GenericOnvifDeviceAdapter implements DeviceAdapter {
  constructor(private ip: string, private port = 554, private authRef = "vault:cred:generic-default") {}

  async identify(): Promise<DeviceIdentity> {
    return {
      manufacturer: "ONVIF Generic",
      model: "Profile S Compliant Device",
      serialNumber: "GEN-ONVIF-1182",
      firmwareVersion: "ONVIF Core 20.12",
    };
  }

  async getCapabilities(): Promise<DeviceCapabilities> {
    return {
      channelCount: 1,
      supportedProfiles: [
        { id: "main", name: "Profile001 Main", resolution: { width: 1920, height: 1080 }, fps: 25, codec: "h264", bitrateKbps: 2048, audioEnabled: false },
      ],
      ptzSupported: false,
      twoWayAudioSupported: false,
      edgeStorageSupported: false,
      codecs: ["h264"],
    };
  }

  async getStreamProfiles(): Promise<StreamProfile[]> {
    return (await this.getCapabilities()).supportedProfiles;
  }

  async getLiveSource(channelId: string, profileId: string): Promise<MediaSource> {
    return {
      protocol: "rtsp",
      uri: `rtsp://${this.ip}:${this.port}/onvif-media/profile1`,
      transport: "tcp",
      codec: "h264",
      authRef: this.authRef,
      deviceTimestamp: new Date(),
    };
  }

  async getSnapshot(): Promise<{ buffer: Buffer; mimeType: string }> {
    return { buffer: Buffer.from("ONVIF_MOCK_JPEG"), mimeType: "image/jpeg" };
  }

  async getDeviceTime(): Promise<{ utcTime: Date; timeZone: string; ntpSynced: boolean }> {
    return { utcTime: new Date(), timeZone: "UTC", ntpSynced: true };
  }
}

export class DeviceAdapterFactory {
  static resolveAdapter(manufacturer: string, ip: string, port = 554, authRef?: string): DeviceAdapter {
    const m = (manufacturer || "").toUpperCase();
    if (m.includes("CP PLUS") || m.includes("CPPLUS")) {
      return new CPPlusDeviceAdapter(ip, port, authRef);
    }
    if (m.includes("DAHUA")) {
      return new DahuaDeviceAdapter(ip, port, authRef);
    }
    if (m.includes("HIKVISION")) {
      return new HikvisionDeviceAdapter(ip, port, authRef);
    }
    return new GenericOnvifDeviceAdapter(ip, port, authRef);
  }
}

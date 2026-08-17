import { SoapClient } from "./soap/soap-client.js";
import type { WsSecurityCredentials } from "./security/ws-security.js";
import { DeviceService, type DeviceInformation, type DeviceCapabilities } from "./services/device-service.js";
import { MediaService, type OnvifMediaProfile, type StreamUriResult } from "./services/media-service.js";
import { PtzService, type PtzVector, type PtzStatus, type PtzPreset } from "./services/ptz-service.js";
import { ImagingService, type ImagingSettings } from "./services/imaging-service.js";
import { EventsService } from "./services/events-service.js";

export interface OnvifCameraClientConfig {
  deviceServiceUrl: string;
  username?: string;
  password?: string;
  passwordType?: "PasswordDigest" | "PasswordText";
  timeoutMs?: number;
  autoSyncTime?: boolean;
}

export class OnvifCameraClient {
  public readonly config: OnvifCameraClientConfig;
  public readonly soap: SoapClient;

  public device: DeviceService;
  public media: MediaService;
  public ptz: PtzService;
  public imaging: ImagingService;
  public events: EventsService;

  private credentials: WsSecurityCredentials;
  private isConnected = false;
  private capabilities?: DeviceCapabilities;
  private deviceInfo?: DeviceInformation;
  private profiles: OnvifMediaProfile[] = [];

  constructor(config: OnvifCameraClientConfig) {
    this.config = {
      autoSyncTime: true,
      timeoutMs: 10000,
      ...config,
    };

    this.credentials = {
      username: this.config.username || "",
      password: this.config.password || "",
      passwordType: this.config.passwordType || "PasswordDigest",
      clockOffsetMs: 0,
    };

    this.soap = new SoapClient({
      timeoutMs: this.config.timeoutMs,
      credentials: this.credentials,
    });

    // Initialize services with deviceServiceUrl as default endpoint until capabilities are discovered
    this.device = new DeviceService(this.config.deviceServiceUrl, this.credentials, this.soap);
    this.media = new MediaService(this.config.deviceServiceUrl, this.credentials, false, this.soap);
    this.ptz = new PtzService(this.config.deviceServiceUrl, this.credentials, this.soap);
    this.imaging = new ImagingService(this.config.deviceServiceUrl, this.credentials, this.soap);
    this.events = new EventsService(this.config.deviceServiceUrl, this.credentials, this.soap);
  }

  /**
   * Connects to the camera:
   * 1. Fetches camera system time & calibrates clock drift to avoid WS-Security rejection.
   * 2. Fetches device information (Manufacturer, Model, Firmware, Serial).
   * 3. Discovers exact service capabilities & updates service URLs (Media, PTZ, Imaging, Events).
   * 4. Queries media profiles.
   */
  async connect(): Promise<{
    deviceInfo: DeviceInformation;
    capabilities: DeviceCapabilities;
    profiles: OnvifMediaProfile[];
    clockDriftMs: number;
  }> {
    let clockDriftMs = 0;

    // 1. Clock Synchronization Check (does not require auth)
    if (this.config.autoSyncTime) {
      try {
        const timeInfo = await this.device.getSystemDateAndTime();
        clockDriftMs = timeInfo.clockDriftMs;
        this.credentials.clockOffsetMs = clockDriftMs;
        this.device.setCredentials(this.credentials);
        this.media.setCredentials(this.credentials);
        this.ptz.setCredentials(this.credentials);
        this.imaging.setCredentials(this.credentials);
        this.events.setCredentials(this.credentials);
      } catch (err) {
        console.warn("[OnvifClient] Time sync probe failed, using host time:", err);
      }
    }

    // 2. Discover Capabilities
    const capabilities = await this.device.getCapabilities();
    this.capabilities = capabilities;

    // Update service endpoints if discovered
    if (capabilities.media2ServiceUrl) {
      this.media = new MediaService(capabilities.media2ServiceUrl, this.credentials, true, this.soap);
    } else if (capabilities.mediaServiceUrl) {
      this.media = new MediaService(capabilities.mediaServiceUrl, this.credentials, false, this.soap);
    }

    if (capabilities.ptzServiceUrl) {
      this.ptz.setEndpoint(capabilities.ptzServiceUrl);
    }

    if (capabilities.imagingServiceUrl) {
      this.imaging.setEndpoint(capabilities.imagingServiceUrl);
    }

    if (capabilities.eventsServiceUrl) {
      this.events.setEndpoint(capabilities.eventsServiceUrl);
    }

    // 3. Fetch Device Information
    const deviceInfo = await this.device.getDeviceInformation();
    this.deviceInfo = deviceInfo;

    // 4. Load Profiles
    try {
      this.profiles = await this.media.getProfiles();
    } catch {
      this.profiles = [];
    }

    this.isConnected = true;

    return {
      deviceInfo,
      capabilities,
      profiles: this.profiles,
      clockDriftMs,
    };
  }

  // --- Convenience Shortcuts ---

  async getProfiles(): Promise<OnvifMediaProfile[]> {
    if (this.profiles.length > 0) return this.profiles;
    this.profiles = await this.media.getProfiles();
    return this.profiles;
  }

  async getStreamUri(profileToken?: string): Promise<StreamUriResult> {
    const token = profileToken || (await this.getDefaultProfileToken());
    return this.media.getStreamUri(token);
  }

  async getSnapshot(profileToken?: string): Promise<Buffer> {
    const token = profileToken || (await this.getDefaultProfileToken());
    return this.media.getSnapshotBuffer(token);
  }

  async ptzContinuousMove(velocity: PtzVector, timeoutSeconds?: number, profileToken?: string): Promise<void> {
    const token = profileToken || (await this.getDefaultProfileToken());
    return this.ptz.continuousMove(token, velocity, timeoutSeconds);
  }

  async ptzStop(panTilt = true, zoom = true, profileToken?: string): Promise<void> {
    const token = profileToken || (await this.getDefaultProfileToken());
    return this.ptz.stop(token, panTilt, zoom);
  }

  async ptzGetStatus(profileToken?: string): Promise<PtzStatus> {
    const token = profileToken || (await this.getDefaultProfileToken());
    return this.ptz.getStatus(token);
  }

  async ptzGetPresets(profileToken?: string): Promise<PtzPreset[]> {
    const token = profileToken || (await this.getDefaultProfileToken());
    return this.ptz.getPresets(token);
  }

  async ptzGotoPreset(presetToken: string, speed?: PtzVector, profileToken?: string): Promise<void> {
    const token = profileToken || (await this.getDefaultProfileToken());
    return this.ptz.gotoPreset(token, presetToken, speed);
  }

  async getImaging(videoSourceToken?: string): Promise<ImagingSettings> {
    const token = videoSourceToken || (await this.getDefaultVideoSourceToken());
    return this.imaging.getImagingSettings(token);
  }

  async setImaging(settings: ImagingSettings, videoSourceToken?: string): Promise<void> {
    const token = videoSourceToken || (await this.getDefaultVideoSourceToken());
    return this.imaging.setImagingSettings(token, settings);
  }

  private async getDefaultProfileToken(): Promise<string> {
    const profiles = await this.getProfiles();
    const first = profiles[0];
    if (!first) throw new Error("No media profiles available on this camera");
    return first.token;
  }

  private async getDefaultVideoSourceToken(): Promise<string> {
    const profiles = await this.getProfiles();
    for (const p of profiles) {
      if (p.videoSourceConfigurationToken) return p.videoSourceConfigurationToken;
    }
    return "VideoSource0";
  }
}

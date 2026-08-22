import { SoapClient } from "../soap/soap-client.js";
import type { WsSecurityCredentials } from "../security/ws-security.js";

export interface DeviceInformation {
  manufacturer: string;
  model: string;
  firmwareVersion: string;
  serialNumber: string;
  hardwareId: string;
}

export interface SystemDateAndTime {
  dateTimeType: "Manual" | "NTP";
  daylightSavings: boolean;
  timeZone?: string;
  utcDateTime: Date;
  localDateTime?: Date;
  clockDriftMs: number; // Device time - Host time in ms
}

export interface DeviceCapabilities {
  deviceServiceUrl?: string;
  mediaServiceUrl?: string;
  media2ServiceUrl?: string;
  ptzServiceUrl?: string;
  imagingServiceUrl?: string;
  eventsServiceUrl?: string;
  analyticsServiceUrl?: string;
  rawXml?: string;
}

export interface OnvifUser {
  username: string;
  userLevel: "Administrator" | "Operator" | "User" | "Anonymous";
}

export class DeviceService {
  private readonly soap: SoapClient;
  private endpoint: string;
  private credentials?: WsSecurityCredentials;

  constructor(endpoint: string, credentials?: WsSecurityCredentials, soap: SoapClient = new SoapClient()) {
    this.endpoint = endpoint;
    this.credentials = credentials;
    this.soap = soap;
  }

  setEndpoint(endpoint: string): void {
    this.endpoint = endpoint;
  }

  setCredentials(credentials: WsSecurityCredentials): void {
    this.credentials = credentials;
  }

  /**
   * tds:GetDeviceInformation
   */
  async getDeviceInformation(): Promise<DeviceInformation> {
    const bodyXml = `<tds:GetDeviceInformation xmlns:tds="http://www.onvif.org/ver10/device/wsdl" />`;

    const response = await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver10/device/wsdl/GetDeviceInformation",
      bodyXml,
      credentials: this.credentials,
    });

    return {
      manufacturer: SoapClient.extractTag(response, "Manufacturer") || "Unknown",
      model: SoapClient.extractTag(response, "Model") || "Unknown",
      firmwareVersion: SoapClient.extractTag(response, "FirmwareVersion") || "Unknown",
      serialNumber: SoapClient.extractTag(response, "SerialNumber") || "Unknown",
      hardwareId: SoapClient.extractTag(response, "HardwareId") || "Unknown",
    };
  }

  /**
   * tds:GetSystemDateAndTime
   * Crucial for discovering camera clock offset to prevent WS-Security timestamp rejection!
   */
  async getSystemDateAndTime(): Promise<SystemDateAndTime> {
    const bodyXml = `<tds:GetSystemDateAndTime xmlns:tds="http://www.onvif.org/ver10/device/wsdl" />`;

    // Note: GetSystemDateAndTime does not require WS-Security headers by ONVIF spec
    const response = await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver10/device/wsdl/GetSystemDateAndTime",
      bodyXml,
    });

    const dateTimeType = (SoapClient.extractTag(response, "DateTimeType") as "Manual" | "NTP") || "Manual";
    const daylightSavings = SoapClient.extractTag(response, "DaylightSavings") === "true";
    const timeZone = SoapClient.extractTag(response, "TZ") || undefined;

    // Parse UTC Date Time
    const utcTag = SoapClient.extractTag(response, "UTCDateTime");
    let utcDate = new Date();

    if (utcTag) {
      const year = parseInt(SoapClient.extractTag(utcTag, "Year") || "1970", 10);
      const month = parseInt(SoapClient.extractTag(utcTag, "Month") || "1", 10) - 1; // 0-indexed in JS Date
      const day = parseInt(SoapClient.extractTag(utcTag, "Day") || "1", 10);
      const hour = parseInt(SoapClient.extractTag(utcTag, "Hour") || "0", 10);
      const minute = parseInt(SoapClient.extractTag(utcTag, "Minute") || "0", 10);
      const second = parseInt(SoapClient.extractTag(utcTag, "Second") || "0", 10);

      utcDate = new Date(Date.UTC(year, month, day, hour, minute, second));
    }

    const hostNow = Date.now();
    const clockDriftMs = utcDate.getTime() - hostNow;

    return {
      dateTimeType,
      daylightSavings,
      timeZone,
      utcDateTime: utcDate,
      clockDriftMs,
    };
  }

  /**
   * tds:SetSystemDateAndTime
   */
  async setSystemDateAndTime(options: {
    dateTimeType: "Manual" | "NTP";
    daylightSavings?: boolean;
    timeZone?: string;
    utcDateTime?: Date;
  }): Promise<void> {
    const utc = options.utcDateTime || new Date();
    const year = utc.getUTCFullYear();
    const month = utc.getUTCMonth() + 1;
    const day = utc.getUTCDate();
    const hour = utc.getUTCHours();
    const minute = utc.getUTCMinutes();
    const second = utc.getUTCSeconds();

    const bodyXml = `
<tds:SetSystemDateAndTime xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <tds:DateTimeType>${options.dateTimeType}</tds:DateTimeType>
  <tds:DaylightSavings>${options.daylightSavings ?? false}</tds:DaylightSavings>
  ${options.timeZone ? `<tds:TimeZone><tt:TZ>${options.timeZone}</tt:TZ></tds:TimeZone>` : ""}
  ${
    options.dateTimeType === "Manual"
      ? `<tds:UTCDateTime>
    <tt:Time>
      <tt:Hour>${hour}</tt:Hour>
      <tt:Minute>${minute}</tt:Minute>
      <tt:Second>${second}</tt:Second>
    </tt:Time>
    <tt:Date>
      <tt:Year>${year}</tt:Year>
      <tt:Month>${month}</tt:Month>
      <tt:Day>${day}</tt:Day>
    </tt:Date>
  </tds:UTCDateTime>`
      : ""
  }
</tds:SetSystemDateAndTime>`.trim();

    await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver10/device/wsdl/SetSystemDateAndTime",
      bodyXml,
      credentials: this.credentials,
    });
  }

  /**
   * tds:GetCapabilities
   */
  async getCapabilities(): Promise<DeviceCapabilities> {
    const bodyXml = `
<tds:GetCapabilities xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <tds:Category>All</tds:Category>
</tds:GetCapabilities>`.trim();

    const response = await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver10/device/wsdl/GetCapabilities",
      bodyXml,
      credentials: this.credentials,
    });

    const mediaTag = SoapClient.extractTag(response, "Media");
    const media2Tag = SoapClient.extractTag(response, "Media2");
    const ptzTag = SoapClient.extractTag(response, "PTZ");
    const imagingTag = SoapClient.extractTag(response, "Imaging");
    const eventsTag = SoapClient.extractTag(response, "Events");
    const analyticsTag = SoapClient.extractTag(response, "Analytics");

    return {
      deviceServiceUrl: this.endpoint,
      mediaServiceUrl: mediaTag ? SoapClient.extractTag(mediaTag, "XAddr") ?? undefined : undefined,
      media2ServiceUrl: media2Tag ? SoapClient.extractTag(media2Tag, "XAddr") ?? undefined : undefined,
      ptzServiceUrl: ptzTag ? SoapClient.extractTag(ptzTag, "XAddr") ?? undefined : undefined,
      imagingServiceUrl: imagingTag ? SoapClient.extractTag(imagingTag, "XAddr") ?? undefined : undefined,
      eventsServiceUrl: eventsTag ? SoapClient.extractTag(eventsTag, "XAddr") ?? undefined : undefined,
      analyticsServiceUrl: analyticsTag ? SoapClient.extractTag(analyticsTag, "XAddr") ?? undefined : undefined,
      rawXml: response,
    };
  }

  /**
   * tds:GetUsers
   */
  async getUsers(): Promise<OnvifUser[]> {
    const bodyXml = `<tds:GetUsers xmlns:tds="http://www.onvif.org/ver10/device/wsdl" />`;

    const response = await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver10/device/wsdl/GetUsers",
      bodyXml,
      credentials: this.credentials,
    });

    const userTags = SoapClient.extractAllTags(response, "User");
    return userTags.map((u) => ({
      username: SoapClient.extractTag(u, "Username") || "unknown",
      userLevel: (SoapClient.extractTag(u, "UserLevel") as any) || "User",
    }));
  }

  /**
   * tds:SystemReboot
   */
  async systemReboot(): Promise<string> {
    const bodyXml = `<tds:SystemReboot xmlns:tds="http://www.onvif.org/ver10/device/wsdl" />`;

    const response = await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver10/device/wsdl/SystemReboot",
      bodyXml,
      credentials: this.credentials,
    });

    return SoapClient.extractTag(response, "Message") || "Reboot initiated";
  }
}

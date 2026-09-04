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

export interface NtpInformation {
  fromDHCP: boolean;
  manualServers: string[];
  dhcpServers: string[];
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

export interface OnvifNetworkInterface {
  token: string;
  enabled: boolean;
  macAddress?: string;
  mtu?: number;
  ipv4?: {
    enabled: boolean;
    dhcp: boolean;
    manual?: Array<{
      address: string;
      prefixLength: number;
    }>;
  };
}

export interface OnvifDnsInformation {
  fromDHCP: boolean;
  searchDomain: string[];
  manualServers: string[];
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
   * tds:GetNTP
   */
  async getNtp(): Promise<NtpInformation> {
    const bodyXml = `<tds:GetNTP xmlns:tds="http://www.onvif.org/ver10/device/wsdl" />`;

    const response = await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver10/device/wsdl/GetNTP",
      bodyXml,
      credentials: this.credentials,
    });

    const fromDHCP = SoapClient.extractTag(response, "FromDHCP") === "true";
    const manualTags = SoapClient.extractAllTags(response, "NTPManual");
    const dhcpTags = SoapClient.extractAllTags(response, "NTPFromDHCP");

    const manualServers = manualTags
      .map(
        (t) =>
          SoapClient.extractTag(t, "DNSname") ||
          SoapClient.extractTag(t, "IPv4Address") ||
          SoapClient.extractTag(t, "IPv6Address")
      )
      .filter((s): s is string => Boolean(s));

    const dhcpServers = dhcpTags
      .map(
        (t) =>
          SoapClient.extractTag(t, "DNSname") ||
          SoapClient.extractTag(t, "IPv4Address") ||
          SoapClient.extractTag(t, "IPv6Address")
      )
      .filter((s): s is string => Boolean(s));

    return {
      fromDHCP,
      manualServers,
      dhcpServers,
    };
  }

  /**
   * tds:SetNTP
   */
  async setNtp(options: {
    fromDHCP: boolean;
    manualServers?: string[];
  }): Promise<void> {
    const serversXml = (options.manualServers || [])
      .map((server) => {
        const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(server);
        return `
  <tds:NTPManual>
    <tt:Type xmlns:tt="http://www.onvif.org/ver10/schema">${isIp ? "IPv4" : "DNS"}</tt:Type>
    ${isIp ? `<tt:IPv4Address xmlns:tt="http://www.onvif.org/ver10/schema">${server}</tt:IPv4Address>` : `<tt:DNSname xmlns:tt="http://www.onvif.org/ver10/schema">${server}</tt:DNSname>`}
  </tds:NTPManual>`;
      })
      .join("");

    const bodyXml = `
<tds:SetNTP xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <tds:FromDHCP>${options.fromDHCP}</tds:FromDHCP>${serversXml}
</tds:SetNTP>`.trim();

    await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver10/device/wsdl/SetNTP",
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
   * tds:GetNetworkInterfaces
   */
  async getNetworkInterfaces(): Promise<OnvifNetworkInterface[]> {
    const bodyXml = `<tds:GetNetworkInterfaces xmlns:tds="http://www.onvif.org/ver10/device/wsdl" />`;

    const response = await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver10/device/wsdl/GetNetworkInterfaces",
      bodyXml,
      credentials: this.credentials,
    });

    const ifaceTags = SoapClient.extractAllTags(response, "NetworkInterfaces");
    return ifaceTags.map((tag) => {
      const token = SoapClient.extractAttribute(tag, "token") || "eth0";
      const enabled = SoapClient.extractTag(tag, "Enabled") === "true";
      const macAddress = SoapClient.extractTag(tag, "HwAddress") || undefined;
      const mtuStr = SoapClient.extractTag(tag, "MTU");
      const mtu = mtuStr ? parseInt(mtuStr, 10) : undefined;

      const ipv4Tag = SoapClient.extractTag(tag, "IPv4");
      let ipv4: OnvifNetworkInterface["ipv4"] = undefined;

      if (ipv4Tag) {
        const ipEnabled = SoapClient.extractTag(ipv4Tag, "Enabled") === "true";
        const dhcp = SoapClient.extractTag(ipv4Tag, "DHCP") === "true";
        const manualTags = SoapClient.extractAllTags(ipv4Tag, "Manual");

        const manual = manualTags.map((m) => ({
          address: SoapClient.extractTag(m, "Address") || "",
          prefixLength: parseInt(SoapClient.extractTag(m, "PrefixLength") || "24", 10),
        })).filter((m) => Boolean(m.address));

        ipv4 = {
          enabled: ipEnabled,
          dhcp,
          manual,
        };
      }

      return {
        token,
        enabled,
        macAddress,
        mtu,
        ipv4,
      };
    });
  }

  /**
   * tds:SetNetworkInterfaces
   */
  async setNetworkInterfaces(token: string, config: {
    ipAddress: string;
    prefixLength: number;
    dhcpEnabled: boolean;
  }): Promise<void> {
    const bodyXml = `
<tds:SetNetworkInterfaces xmlns:tds="http://www.onvif.org/ver10/device/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema">
  <tds:InterfaceToken>${token}</tds:InterfaceToken>
  <tds:NetworkInterface>
    <tt:Enabled>true</tt:Enabled>
    <tt:IPv4>
      <tt:Enabled>true</tt:Enabled>
      <tt:Manual>
        <tt:Address>${config.ipAddress}</tt:Address>
        <tt:PrefixLength>${config.prefixLength}</tt:PrefixLength>
      </tt:Manual>
      <tt:DHCP>${config.dhcpEnabled}</tt:DHCP>
    </tt:IPv4>
  </tds:NetworkInterface>
</tds:SetNetworkInterfaces>`.trim();

    await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver10/device/wsdl/SetNetworkInterfaces",
      bodyXml,
      credentials: this.credentials,
    });
  }

  /**
   * tds:GetNetworkDefaultGateway
   */
  async getNetworkDefaultGateway(): Promise<string[]> {
    const bodyXml = `<tds:GetNetworkDefaultGateway xmlns:tds="http://www.onvif.org/ver10/device/wsdl" />`;

    const response = await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver10/device/wsdl/GetNetworkDefaultGateway",
      bodyXml,
      credentials: this.credentials,
    });

    return SoapClient.extractAllTags(response, "IPv4Address")
      .map((t) => t.replace(/<\/?.*?>/g, "").trim())
      .filter((s): s is string => Boolean(s));
  }

  /**
   * tds:SetNetworkDefaultGateway
   */
  async setNetworkDefaultGateway(gateways: string[]): Promise<void> {
    const gwXml = gateways
      .map((gw) => `<tds:IPv4Address>${gw}</tds:IPv4Address>`)
      .join("");

    const bodyXml = `
<tds:SetNetworkDefaultGateway xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  ${gwXml}
</tds:SetNetworkDefaultGateway>`.trim();

    await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver10/device/wsdl/SetNetworkDefaultGateway",
      bodyXml,
      credentials: this.credentials,
    });
  }

  /**
   * tds:GetDNS
   */
  async getDNS(): Promise<OnvifDnsInformation> {
    const bodyXml = `<tds:GetDNS xmlns:tds="http://www.onvif.org/ver10/device/wsdl" />`;

    const response = await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver10/device/wsdl/GetDNS",
      bodyXml,
      credentials: this.credentials,
    });

    const fromDHCP = SoapClient.extractTag(response, "FromDHCP") === "true";
    const manualTags = SoapClient.extractAllTags(response, "DNSManual");
    const manualServers = manualTags
      .map((t) => SoapClient.extractTag(t, "IPv4Address") || SoapClient.extractTag(t, "DNSname"))
      .filter((s): s is string => Boolean(s));

    const domainTags = SoapClient.extractAllTags(response, "SearchDomain");
    const searchDomain = domainTags
      .map((t) => t.replace(/<\/?.*?>/g, "").trim())
      .filter((s): s is string => Boolean(s));

    return {
      fromDHCP,
      searchDomain,
      manualServers,
    };
  }

  /**
   * tds:SetDNS
   */
  async setDNS(options: { fromDHCP: boolean; manualServers?: string[] }): Promise<void> {
    const serversXml = (options.manualServers || [])
      .map((server) => {
        const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(server);
        return `
  <tds:DNSManual>
    <tt:Type xmlns:tt="http://www.onvif.org/ver10/schema">${isIp ? "IPv4" : "DNS"}</tt:Type>
    ${isIp ? `<tt:IPv4Address xmlns:tt="http://www.onvif.org/ver10/schema">${server}</tt:IPv4Address>` : `<tt:DNSname xmlns:tt="http://www.onvif.org/ver10/schema">${server}</tt:DNSname>`}
  </tds:DNSManual>`;
      })
      .join("");

    const bodyXml = `
<tds:SetDNS xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <tds:FromDHCP>${options.fromDHCP}</tds:FromDHCP>${serversXml}
</tds:SetDNS>`.trim();

    await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver10/device/wsdl/SetDNS",
      bodyXml,
      credentials: this.credentials,
    });
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

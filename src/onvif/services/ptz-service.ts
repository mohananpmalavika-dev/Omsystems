import { SoapClient } from "../soap/soap-client.js";
import type { WsSecurityCredentials } from "../security/ws-security.js";

export interface PtzVector {
  x: number; // Pan: -1.0 (full left) to +1.0 (full right)
  y: number; // Tilt: -1.0 (full down) to +1.0 (full up)
  z?: number; // Zoom: -1.0 (wide) to +1.0 (telephoto)
}

export interface PtzStatus {
  position: {
    panTilt?: { x: number; y: number };
    zoom?: { x: number };
  };
  moveStatus: {
    panTilt: "IDLE" | "MOVING" | "UNKNOWN";
    zoom: "IDLE" | "MOVING" | "UNKNOWN";
  };
  utcTime: Date;
}

export interface PtzPreset {
  token: string;
  name: string;
}

export class PtzService {
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
   * tptz:ContinuousMove
   */
  async continuousMove(
    profileToken: string,
    velocity: PtzVector,
    timeoutSeconds?: number,
  ): Promise<void> {
    const timeoutXml = timeoutSeconds ? `<tptz:Timeout>PT${timeoutSeconds}S</tptz:Timeout>` : "";
    const zoomXml = velocity.z !== undefined ? `<tt:Zoom x="${velocity.z}" />` : "";

    const bodyXml = `
<tptz:ContinuousMove xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
  <tptz:ProfileToken>${profileToken}</tptz:ProfileToken>
  <tptz:Velocity>
    <tt:PanTilt x="${velocity.x}" y="${velocity.y}" />
    ${zoomXml}
  </tptz:Velocity>
  ${timeoutXml}
</tptz:ContinuousMove>`.trim();

    await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver20/ptz/wsdl/ContinuousMove",
      bodyXml,
      credentials: this.credentials,
    });
  }

  /**
   * tptz:AbsoluteMove
   */
  async absoluteMove(
    profileToken: string,
    position: PtzVector,
    speed?: PtzVector,
  ): Promise<void> {
    const zoomXml = position.z !== undefined ? `<tt:Zoom x="${position.z}" />` : "";
    const speedXml = speed
      ? `<tptz:Speed><tt:PanTilt x="${speed.x}" y="${speed.y}" />${speed.z !== undefined ? `<tt:Zoom x="${speed.z}" />` : ""}</tptz:Speed>`
      : "";

    const bodyXml = `
<tptz:AbsoluteMove xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
  <tptz:ProfileToken>${profileToken}</tptz:ProfileToken>
  <tptz:Position>
    <tt:PanTilt x="${position.x}" y="${position.y}" />
    ${zoomXml}
  </tptz:Position>
  ${speedXml}
</tptz:AbsoluteMove>`.trim();

    await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver20/ptz/wsdl/AbsoluteMove",
      bodyXml,
      credentials: this.credentials,
    });
  }

  /**
   * tptz:RelativeMove
   */
  async relativeMove(
    profileToken: string,
    translation: PtzVector,
    speed?: PtzVector,
  ): Promise<void> {
    const zoomXml = translation.z !== undefined ? `<tt:Zoom x="${translation.z}" />` : "";
    const speedXml = speed
      ? `<tptz:Speed><tt:PanTilt x="${speed.x}" y="${speed.y}" />${speed.z !== undefined ? `<tt:Zoom x="${speed.z}" />` : ""}</tptz:Speed>`
      : "";

    const bodyXml = `
<tptz:RelativeMove xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
  <tptz:ProfileToken>${profileToken}</tptz:ProfileToken>
  <tptz:Translation>
    <tt:PanTilt x="${translation.x}" y="${translation.y}" />
    ${zoomXml}
  </tptz:Translation>
  ${speedXml}
</tptz:RelativeMove>`.trim();

    await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver20/ptz/wsdl/RelativeMove",
      bodyXml,
      credentials: this.credentials,
    });
  }

  /**
   * tptz:Stop
   */
  async stop(profileToken: string, panTilt = true, zoom = true): Promise<void> {
    const bodyXml = `
<tptz:Stop xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
  <tptz:ProfileToken>${profileToken}</tptz:ProfileToken>
  <tptz:PanTilt>${panTilt}</tptz:PanTilt>
  <tptz:Zoom>${zoom}</tptz:Zoom>
</tptz:Stop>`.trim();

    await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver20/ptz/wsdl/Stop",
      bodyXml,
      credentials: this.credentials,
    });
  }

  /**
   * tptz:GetStatus
   */
  async getStatus(profileToken: string): Promise<PtzStatus> {
    const bodyXml = `
<tptz:GetStatus xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
  <tptz:ProfileToken>${profileToken}</tptz:ProfileToken>
</tptz:GetStatus>`.trim();

    const response = await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver20/ptz/wsdl/GetStatus",
      bodyXml,
      credentials: this.credentials,
    });

    const positionTag = SoapClient.extractTag(response, "Position") || response;
    const ptTag = SoapClient.extractSelfClosingTag(positionTag, "PanTilt");
    const zoomTag = SoapClient.extractSelfClosingTag(positionTag, "Zoom");
    const moveTag = SoapClient.extractTag(response, "MoveStatus");

    let panTiltPos: { x: number; y: number } | undefined;
    if (ptTag) {
      const xAttr = SoapClient.extractAttribute(ptTag, "x") || SoapClient.extractTag(ptTag, "x");
      const yAttr = SoapClient.extractAttribute(ptTag, "y") || SoapClient.extractTag(ptTag, "y");
      if (xAttr !== null && yAttr !== null) {
        panTiltPos = {
          x: parseFloat(xAttr),
          y: parseFloat(yAttr),
        };
      }
    }

    let zoomPos: { x: number } | undefined;
    if (zoomTag) {
      const zAttr = SoapClient.extractAttribute(zoomTag, "x") || SoapClient.extractTag(zoomTag, "x");
      if (zAttr !== null) {
        zoomPos = {
          x: parseFloat(zAttr),
        };
      }
    }

    const ptMove = moveTag ? (SoapClient.extractTag(moveTag, "PanTilt") as any) || "IDLE" : "IDLE";
    const zoomMove = moveTag ? (SoapClient.extractTag(moveTag, "Zoom") as any) || "IDLE" : "IDLE";

    return {
      position: {
        panTilt: panTiltPos,
        zoom: zoomPos,
      },
      moveStatus: {
        panTilt: ptMove,
        zoom: zoomMove,
      },
      utcTime: new Date(),
    };
  }

  /**
   * tptz:GetPresets
   */
  async getPresets(profileToken: string): Promise<PtzPreset[]> {
    const bodyXml = `
<tptz:GetPresets xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
  <tptz:ProfileToken>${profileToken}</tptz:ProfileToken>
</tptz:GetPresets>`.trim();

    const response = await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver20/ptz/wsdl/GetPresets",
      bodyXml,
      credentials: this.credentials,
    });

    const presetTags = SoapClient.extractAllTags(response, "Preset");
    return presetTags.map((p) => ({
      token: SoapClient.extractAttribute(p, "token") || SoapClient.extractTag(p, "token") || "preset",
      name: SoapClient.extractTag(p, "Name") || "Preset",
    }));
  }

  /**
   * tptz:SetPreset
   */
  async setPreset(profileToken: string, presetName?: string, presetToken?: string): Promise<string> {
    const nameXml = presetName ? `<tptz:PresetName>${presetName}</tptz:PresetName>` : "";
    const tokenXml = presetToken ? `<tptz:PresetToken>${presetToken}</tptz:PresetToken>` : "";

    const bodyXml = `
<tptz:SetPreset xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
  <tptz:ProfileToken>${profileToken}</tptz:ProfileToken>
  ${nameXml}
  ${tokenXml}
</tptz:SetPreset>`.trim();

    const response = await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver20/ptz/wsdl/SetPreset",
      bodyXml,
      credentials: this.credentials,
    });

    return SoapClient.extractTag(response, "PresetToken") || "preset_created";
  }

  /**
   * tptz:GotoPreset
   */
  async gotoPreset(profileToken: string, presetToken: string, speed?: PtzVector): Promise<void> {
    const speedXml = speed
      ? `<tptz:Speed><tt:PanTilt x="${speed.x}" y="${speed.y}" />${speed.z !== undefined ? `<tt:Zoom x="${speed.z}" />` : ""}</tptz:Speed>`
      : "";

    const bodyXml = `
<tptz:GotoPreset xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
  <tptz:ProfileToken>${profileToken}</tptz:ProfileToken>
  <tptz:PresetToken>${presetToken}</tptz:PresetToken>
  ${speedXml}
</tptz:GotoPreset>`.trim();

    await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver20/ptz/wsdl/GotoPreset",
      bodyXml,
      credentials: this.credentials,
    });
  }

  /**
   * tptz:RemovePreset
   */
  async removePreset(profileToken: string, presetToken: string): Promise<void> {
    const bodyXml = `
<tptz:RemovePreset xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
  <tptz:ProfileToken>${profileToken}</tptz:ProfileToken>
  <tptz:PresetToken>${presetToken}</tptz:PresetToken>
</tptz:RemovePreset>`.trim();

    await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver20/ptz/wsdl/RemovePreset",
      bodyXml,
      credentials: this.credentials,
    });
  }

  /**
   * tptz:GotoHomePosition
   */
  async gotoHomePosition(profileToken: string, speed?: PtzVector): Promise<void> {
    const speedXml = speed
      ? `<tptz:Speed><tt:PanTilt x="${speed.x}" y="${speed.y}" />${speed.z !== undefined ? `<tt:Zoom x="${speed.z}" />` : ""}</tptz:Speed>`
      : "";

    const bodyXml = `
<tptz:GotoHomePosition xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
  <tptz:ProfileToken>${profileToken}</tptz:ProfileToken>
  ${speedXml}
</tptz:GotoHomePosition>`.trim();

    await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver20/ptz/wsdl/GotoHomePosition",
      bodyXml,
      credentials: this.credentials,
    });
  }
}

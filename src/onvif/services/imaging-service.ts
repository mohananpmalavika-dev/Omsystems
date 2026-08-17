import { SoapClient } from "../soap/soap-client.js";
import type { WsSecurityCredentials } from "../security/ws-security.js";

export interface ImagingSettings {
  brightness?: number; // 0.0 - 100.0
  colorSaturation?: number; // 0.0 - 100.0
  contrast?: number; // 0.0 - 100.0
  sharpness?: number; // 0.0 - 100.0
  exposure?: {
    mode: "AUTO" | "MANUAL";
    exposureTime?: number;
    gain?: number;
    iris?: number;
  };
  focus?: {
    autoFocusMode: "AUTO" | "MANUAL";
    defaultSpeed?: number;
    nearLimit?: number;
    farLimit?: number;
  };
  wideDynamicRange?: {
    mode: "OFF" | "ON";
    level?: number;
  };
  whiteBalance?: {
    mode: "AUTO" | "MANUAL";
    crGain?: number;
    cbGain?: number;
  };
  irCutFilter?: "ON" | "OFF" | "AUTO";
}

export class ImagingService {
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
   * timg:GetImagingSettings
   */
  async getImagingSettings(videoSourceToken: string): Promise<ImagingSettings> {
    const bodyXml = `
<timg:GetImagingSettings xmlns:timg="http://www.onvif.org/ver20/imaging/wsdl">
  <timg:VideoSourceToken>${videoSourceToken}</timg:VideoSourceToken>
</timg:GetImagingSettings>`.trim();

    const response = await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver20/imaging/wsdl/GetImagingSettings",
      bodyXml,
      credentials: this.credentials,
    });

    const settingsTag = SoapClient.extractTag(response, "ImagingSettings") || response;

    const brightness = SoapClient.extractTag(settingsTag, "Brightness");
    const colorSaturation = SoapClient.extractTag(settingsTag, "ColorSaturation");
    const contrast = SoapClient.extractTag(settingsTag, "Contrast");
    const sharpness = SoapClient.extractTag(settingsTag, "Sharpness");
    const irCutFilter = SoapClient.extractTag(settingsTag, "IrCutFilter") as any;

    const expTag = SoapClient.extractTag(settingsTag, "Exposure");
    const focusTag = SoapClient.extractTag(settingsTag, "Focus");
    const wdrTag = SoapClient.extractTag(settingsTag, "WideDynamicRange");
    const wbTag = SoapClient.extractTag(settingsTag, "WhiteBalance");

    return {
      brightness: brightness ? parseFloat(brightness) : undefined,
      colorSaturation: colorSaturation ? parseFloat(colorSaturation) : undefined,
      contrast: contrast ? parseFloat(contrast) : undefined,
      sharpness: sharpness ? parseFloat(sharpness) : undefined,
      irCutFilter: irCutFilter ?? undefined,
      exposure: expTag
        ? {
            mode: (SoapClient.extractTag(expTag, "Mode") as any) || "AUTO",
            exposureTime: SoapClient.extractTag(expTag, "ExposureTime") ? parseFloat(SoapClient.extractTag(expTag, "ExposureTime")!) : undefined,
            gain: SoapClient.extractTag(expTag, "Gain") ? parseFloat(SoapClient.extractTag(expTag, "Gain")!) : undefined,
            iris: SoapClient.extractTag(expTag, "Iris") ? parseFloat(SoapClient.extractTag(expTag, "Iris")!) : undefined,
          }
        : undefined,
      focus: focusTag
        ? {
            autoFocusMode: (SoapClient.extractTag(focusTag, "AutoFocusMode") as any) || "AUTO",
            defaultSpeed: SoapClient.extractTag(focusTag, "DefaultSpeed") ? parseFloat(SoapClient.extractTag(focusTag, "DefaultSpeed")!) : undefined,
          }
        : undefined,
      wideDynamicRange: wdrTag
        ? {
            mode: (SoapClient.extractTag(wdrTag, "Mode") as any) || "OFF",
            level: SoapClient.extractTag(wdrTag, "Level") ? parseFloat(SoapClient.extractTag(wdrTag, "Level")!) : undefined,
          }
        : undefined,
      whiteBalance: wbTag
        ? {
            mode: (SoapClient.extractTag(wbTag, "Mode") as any) || "AUTO",
            crGain: SoapClient.extractTag(wbTag, "CrGain") ? parseFloat(SoapClient.extractTag(wbTag, "CrGain")!) : undefined,
            cbGain: SoapClient.extractTag(wbTag, "CbGain") ? parseFloat(SoapClient.extractTag(wbTag, "CbGain")!) : undefined,
          }
        : undefined,
    };
  }

  /**
   * timg:SetImagingSettings
   */
  async setImagingSettings(videoSourceToken: string, settings: ImagingSettings, forcePersistence = true): Promise<void> {
    const brightnessXml = settings.brightness !== undefined ? `<tt:Brightness>${settings.brightness}</tt:Brightness>` : "";
    const contrastXml = settings.contrast !== undefined ? `<tt:Contrast>${settings.contrast}</tt:Contrast>` : "";
    const colorSaturationXml = settings.colorSaturation !== undefined ? `<tt:ColorSaturation>${settings.colorSaturation}</tt:ColorSaturation>` : "";
    const sharpnessXml = settings.sharpness !== undefined ? `<tt:Sharpness>${settings.sharpness}</tt:Sharpness>` : "";
    const irCutXml = settings.irCutFilter ? `<tt:IrCutFilter>${settings.irCutFilter}</tt:IrCutFilter>` : "";

    const expXml = settings.exposure
      ? `<tt:Exposure>
           <tt:Mode>${settings.exposure.mode}</tt:Mode>
           ${settings.exposure.exposureTime !== undefined ? `<tt:ExposureTime>${settings.exposure.exposureTime}</tt:ExposureTime>` : ""}
           ${settings.exposure.gain !== undefined ? `<tt:Gain>${settings.exposure.gain}</tt:Gain>` : ""}
           ${settings.exposure.iris !== undefined ? `<tt:Iris>${settings.exposure.iris}</tt:Iris>` : ""}
         </tt:Exposure>`
      : "";

    const focusXml = settings.focus
      ? `<tt:Focus>
           <tt:AutoFocusMode>${settings.focus.autoFocusMode}</tt:AutoFocusMode>
         </tt:Focus>`
      : "";

    const wdrXml = settings.wideDynamicRange
      ? `<tt:WideDynamicRange>
           <tt:Mode>${settings.wideDynamicRange.mode}</tt:Mode>
           ${settings.wideDynamicRange.level !== undefined ? `<tt:Level>${settings.wideDynamicRange.level}</tt:Level>` : ""}
         </tt:WideDynamicRange>`
      : "";

    const bodyXml = `
<timg:SetImagingSettings xmlns:timg="http://www.onvif.org/ver20/imaging/wsdl">
  <timg:VideoSourceToken>${videoSourceToken}</timg:VideoSourceToken>
  <timg:ImagingSettings>
    ${brightnessXml}
    ${contrastXml}
    ${colorSaturationXml}
    ${sharpnessXml}
    ${irCutXml}
    ${expXml}
    ${focusXml}
    ${wdrXml}
  </timg:ImagingSettings>
  <timg:ForcePersistence>${forcePersistence}</timg:ForcePersistence>
</timg:SetImagingSettings>`.trim();

    await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver20/imaging/wsdl/SetImagingSettings",
      bodyXml,
      credentials: this.credentials,
    });
  }

  /**
   * timg:Move (Focus)
   */
  async moveFocus(videoSourceToken: string, focus: { absolute?: number; relative?: number; continuousSpeed?: number }): Promise<void> {
    let focusXml = "";
    if (focus.absolute !== undefined) {
      focusXml = `<tt:Absolute><tt:Position>${focus.absolute}</tt:Position></tt:Absolute>`;
    } else if (focus.relative !== undefined) {
      focusXml = `<tt:Relative><tt:Distance>${focus.relative}</tt:Distance></tt:Relative>`;
    } else if (focus.continuousSpeed !== undefined) {
      focusXml = `<tt:Continuous><tt:Speed>${focus.continuousSpeed}</tt:Speed></tt:Continuous>`;
    }

    const bodyXml = `
<timg:Move xmlns:timg="http://www.onvif.org/ver20/imaging/wsdl">
  <timg:VideoSourceToken>${videoSourceToken}</timg:VideoSourceToken>
  <timg:Focus>
    ${focusXml}
  </timg:Focus>
</timg:Move>`.trim();

    await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver20/imaging/wsdl/Move",
      bodyXml,
      credentials: this.credentials,
    });
  }

  /**
   * timg:Stop (Focus)
   */
  async stop(videoSourceToken: string): Promise<void> {
    const bodyXml = `
<timg:Stop xmlns:timg="http://www.onvif.org/ver20/imaging/wsdl">
  <timg:VideoSourceToken>${videoSourceToken}</timg:VideoSourceToken>
</timg:Stop>`.trim();

    await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver20/imaging/wsdl/Stop",
      bodyXml,
      credentials: this.credentials,
    });
  }
}

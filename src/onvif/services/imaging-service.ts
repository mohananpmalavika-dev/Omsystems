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

export interface ImagingOptions {
  brightness?: { min: number; max: number };
  colorSaturation?: { min: number; max: number };
  contrast?: { min: number; max: number };
  sharpness?: { min: number; max: number };
  exposure?: {
    mode?: Array<"AUTO" | "MANUAL">;
    exposureTime?: { min: number; max: number };
    gain?: { min: number; max: number };
    iris?: { min: number; max: number };
  };
  focus?: {
    autoFocusModes?: Array<"AUTO" | "MANUAL">;
    defaultSpeed?: { min: number; max: number };
  };
  wideDynamicRange?: {
    mode?: Array<"OFF" | "ON">;
    level?: { min: number; max: number };
  };
  whiteBalance?: {
    mode?: Array<"AUTO" | "MANUAL">;
    crGain?: { min: number; max: number };
    cbGain?: { min: number; max: number };
  };
  irCutFilterModes?: Array<"ON" | "OFF" | "AUTO">;
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

  /**
   * timg:GetOptions
   */
  async getOptions(videoSourceToken: string): Promise<ImagingOptions> {
    const bodyXml = `
<timg:GetOptions xmlns:timg="http://www.onvif.org/ver20/imaging/wsdl">
  <timg:VideoSourceToken>${videoSourceToken}</timg:VideoSourceToken>
</timg:GetOptions>`.trim();

    const responseXml = await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver20/imaging/wsdl/GetOptions",
      bodyXml,
      credentials: this.credentials,
    });

    const parseRange = (tagName: string): { min: number; max: number } | undefined => {
      const tag = SoapClient.extractTag(responseXml, tagName);
      if (!tag) return undefined;
      const minStr = SoapClient.extractTag(tag, "Min");
      const maxStr = SoapClient.extractTag(tag, "Max");
      if (minStr !== null && maxStr !== null) {
        return { min: parseFloat(minStr), max: parseFloat(maxStr) };
      }
      return undefined;
    };

    const brightness = parseRange("Brightness");
    const colorSaturation = parseRange("ColorSaturation");
    const contrast = parseRange("Contrast");
    const sharpness = parseRange("Sharpness");

    // Exposure options
    const exposureTag = SoapClient.extractTag(responseXml, "Exposure");
    let exposure: ImagingOptions["exposure"] = undefined;
    if (exposureTag) {
      const modeMatches = exposureTag.match(/<(?:[\w-]+:)?Mode>([^<]+)<\/(?:[\w-]+:)?Mode>/gi);
      const modes: Array<"AUTO" | "MANUAL"> = [];
      if (modeMatches) {
        for (const m of modeMatches) {
          const val = m.replace(/<\/?[\w:-]+>/g, "").trim().toUpperCase();
          if ((val === "AUTO" || val === "MANUAL") && !modes.includes(val)) {
            modes.push(val);
          }
        }
      }
      const exposureTimeTag = SoapClient.extractTag(exposureTag, "ExposureTime");
      const exposureTime = exposureTimeTag ? {
        min: parseFloat(SoapClient.extractTag(exposureTimeTag, "Min") || "0"),
        max: parseFloat(SoapClient.extractTag(exposureTimeTag, "Max") || "0"),
      } : undefined;
      const gainTag = SoapClient.extractTag(exposureTag, "Gain");
      const gain = gainTag ? {
        min: parseFloat(SoapClient.extractTag(gainTag, "Min") || "0"),
        max: parseFloat(SoapClient.extractTag(gainTag, "Max") || "0"),
      } : undefined;
      const irisTag = SoapClient.extractTag(exposureTag, "Iris");
      const iris = irisTag ? {
        min: parseFloat(SoapClient.extractTag(irisTag, "Min") || "0"),
        max: parseFloat(SoapClient.extractTag(irisTag, "Max") || "0"),
      } : undefined;

      exposure = {
        mode: modes.length > 0 ? modes : undefined,
        exposureTime,
        gain,
        iris,
      };
    }

    // WideDynamicRange
    const wdrTag = SoapClient.extractTag(responseXml, "WideDynamicRange");
    let wideDynamicRange: ImagingOptions["wideDynamicRange"] = undefined;
    if (wdrTag) {
      const levelRange = parseRange("Level");
      const modeMatches = wdrTag.match(/<(?:[\w-]+:)?Mode>([^<]+)<\/(?:[\w-]+:)?Mode>/gi);
      const modes: Array<"OFF" | "ON"> = [];
      if (modeMatches) {
        for (const m of modeMatches) {
          const val = m.replace(/<\/?[\w:-]+>/g, "").trim().toUpperCase();
          if ((val === "OFF" || val === "ON") && !modes.includes(val)) {
            modes.push(val);
          }
        }
      }
      wideDynamicRange = {
        mode: modes.length > 0 ? modes : undefined,
        level: levelRange,
      };
    }

    // WhiteBalance
    const wbTag = SoapClient.extractTag(responseXml, "WhiteBalance");
    let whiteBalance: ImagingOptions["whiteBalance"] = undefined;
    if (wbTag) {
      const crTag = SoapClient.extractTag(wbTag, "CrGain");
      const crGain = crTag ? {
        min: parseFloat(SoapClient.extractTag(crTag, "Min") || "0"),
        max: parseFloat(SoapClient.extractTag(crTag, "Max") || "0"),
      } : undefined;
      const cbTag = SoapClient.extractTag(wbTag, "CbGain");
      const cbGain = cbTag ? {
        min: parseFloat(SoapClient.extractTag(cbTag, "Min") || "0"),
        max: parseFloat(SoapClient.extractTag(cbTag, "Max") || "0"),
      } : undefined;
      whiteBalance = { crGain, cbGain };
    }

    // IrCutFilterModes
    const irCutFilterModes: Array<"ON" | "OFF" | "AUTO"> = [];
    const irMatches = responseXml.match(/<(?:[\w-]+:)?IrCutFilterModes>([^<]+)<\/(?:[\w-]+:)?IrCutFilterModes>/gi);
    if (irMatches) {
      for (const m of irMatches) {
        const val = m.replace(/<\/?[\w:-]+>/g, "").trim().toUpperCase();
        if ((val === "ON" || val === "OFF" || val === "AUTO") && !irCutFilterModes.includes(val)) {
          irCutFilterModes.push(val);
        }
      }
    }

    return {
      brightness,
      colorSaturation,
      contrast,
      sharpness,
      exposure,
      wideDynamicRange,
      whiteBalance,
      irCutFilterModes: irCutFilterModes.length > 0 ? irCutFilterModes : undefined,
    };
  }
}

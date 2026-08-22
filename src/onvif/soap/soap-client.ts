import type { WsSecurityCredentials } from "../security/ws-security.js";
import { WsSecurityManager } from "../security/ws-security.js";

export interface SoapClientOptions {
  timeoutMs?: number;
  credentials?: WsSecurityCredentials;
}

export interface SoapRequestOptions {
  endpoint: string;
  action?: string;
  bodyXml: string;
  credentials?: WsSecurityCredentials;
  timeoutMs?: number;
}

export interface SoapFault {
  code: string;
  subcode?: string;
  reason: string;
  detail?: string;
}

export class SoapError extends Error {
  public readonly fault?: SoapFault;
  public readonly httpStatus?: number;

  constructor(message: string, fault?: SoapFault, httpStatus?: number) {
    super(message);
    this.name = "SoapError";
    this.fault = fault;
    this.httpStatus = httpStatus;
  }
}

export class SoapClient {
  private defaultOptions: SoapClientOptions;

  constructor(options: SoapClientOptions = {}) {
    this.defaultOptions = {
      timeoutMs: 10000,
      ...options,
    };
  }

  /**
   * Sends an ONVIF SOAP request and returns the parsed XML response string or parsed object
   */
  async request(options: SoapRequestOptions): Promise<string> {
    const timeout = options.timeoutMs ?? this.defaultOptions.timeoutMs ?? 10000;
    const creds = options.credentials ?? this.defaultOptions.credentials;

    let securityHeaderXml = "";
    if (creds && creds.username) {
      const securityResult = WsSecurityManager.generateHeader(creds);
      securityHeaderXml = securityResult.headerXml;
    }

    const envelopeXml = this.buildEnvelopeXml(options.bodyXml, securityHeaderXml);

    const headers: Record<string, string> = {
      "Content-Type": "application/soap+xml; charset=utf-8",
      Accept: "application/soap+xml, application/xml, text/xml",
    };

    if (options.action) {
      headers["SOAPAction"] = `"${options.action}"`;
    }

    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(options.endpoint, {
        method: "POST",
        headers,
        body: envelopeXml,
        signal: controller.signal,
      });

      const responseText = await res.text();

      if (!res.ok) {
        const fault = this.parseSoapFault(responseText);
        const faultMsg = fault
          ? `SOAP Fault [${fault.code}${fault.subcode ? `/${fault.subcode}` : ""}]: ${fault.reason}`
          : `HTTP ${res.status} ${res.statusText}: ${responseText.slice(0, 300)}`;
        throw new SoapError(faultMsg, fault ?? undefined, res.status);
      }

      // Check if response contains a SOAP Fault inside a 200 OK
      const fault = this.parseSoapFault(responseText);
      if (fault) {
        throw new SoapError(
          `SOAP Fault [${fault.code}${fault.subcode ? `/${fault.subcode}` : ""}]: ${fault.reason}`,
          fault,
          res.status,
        );
      }

      return responseText;
    } catch (err: any) {
      if (err.name === "AbortError") {
        throw new SoapError(`SOAP request to [${options.endpoint}] timed out after ${timeout}ms`);
      }
      if (err instanceof SoapError) throw err;
      throw new SoapError(`SOAP request failed: ${err.message || String(err)}`);
    } finally {
      clearTimeout(timeoutTimer);
    }
  }

  /**
   * Wraps body XML in a full ONVIF SOAP 1.2 envelope with namespaces
   */
  buildEnvelopeXml(bodyXml: string, headerXml = ""): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope 
  xmlns:s="http://www.w3.org/2003/05/soap-envelope"
  xmlns:e="http://www.w3.org/2003/05/soap-encoding"
  xmlns:wsa="http://www.w3.org/2005/08/addressing"
  xmlns:tt="http://www.onvif.org/ver10/schema"
  xmlns:tds="http://www.onvif.org/ver10/device/wsdl"
  xmlns:trt="http://www.onvif.org/ver10/media/wsdl"
  xmlns:tr2="http://www.onvif.org/ver20/media/wsdl"
  xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"
  xmlns:timg="http://www.onvif.org/ver20/imaging/wsdl"
  xmlns:tev="http://www.onvif.org/ver10/events/wsdl"
  xmlns:tns1="http://www.onvif.org/ver10/topics"
  xmlns:ter="http://www.onvif.org/ver10/error">
  <s:Header>
    ${headerXml}
  </s:Header>
  <s:Body>
    ${bodyXml}
  </s:Body>
</s:Envelope>`.trim();
  }

  /**
   * Robust XML tag extractor and parser helper
   */
  static extractTag(xml: string, tagName: string): string | null {
    // Matches <prefix:tagName ...>value</prefix:tagName> or <tagName ...>value</tagName>
    const regex = new RegExp(`<(?:[\\w-]+:)?${tagName}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tagName}>`, "i");
    const match = xml.match(regex);
    return (match && match[1]) ? match[1].trim() : null;
  }

  static extractAllTags(xml: string, tagName: string): string[] {
    const results: string[] = [];
    const regex = new RegExp(`<(?:[\\w-]+:)?${tagName}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tagName}>`, "gi");
    let match;
    while ((match = regex.exec(xml)) !== null) {
      if (match[1]) results.push(match[1].trim());
    }
    return results;
  }

  /**
   * Extracts full tag matches including the opening element `<prefix:tagName ...>...</prefix:tagName>` or `<prefix:tagName ... />`
   */
  static extractAllFullTags(xml: string, tagName: string): string[] {
    const results: string[] = [];
    const regex = new RegExp(
      `<(?:[\\w-]+:)?${tagName}(?:\\s+[^>]*)?(?:\\/>|>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tagName}>)`,
      "gi",
    );
    let match;
    while ((match = regex.exec(xml)) !== null) {
      if (match[0]) results.push(match[0].trim());
    }
    return results;
  }

  static extractSelfClosingTag(xml: string, tagName: string): string | null {
    const regex = new RegExp(`<(?:[\\w-]+:)?${tagName}(?:\\s+[^>]*)?\\/?>`, "i");
    const match = xml.match(regex);
    return (match && match[0]) ? match[0].trim() : null;
  }

  static extractAttribute(tagXml: string, attrName: string): string | null {
    const regex = new RegExp(`${attrName}=["']([^"']+)["']`, "i");
    const match = tagXml.match(regex);
    return (match && match[1]) ? match[1] : null;
  }

  private parseSoapFault(xml: string): SoapFault | null {
    if (!xml.includes("Fault") && !xml.includes("fault")) return null;

    const code = SoapClient.extractTag(xml, "Value") || SoapClient.extractTag(xml, "faultcode") || "env:Receiver";
    const subcode = SoapClient.extractTag(xml, "Subcode") ? SoapClient.extractTag(SoapClient.extractTag(xml, "Subcode") || "", "Value") ?? undefined : undefined;
    const reason = SoapClient.extractTag(xml, "Text") || SoapClient.extractTag(xml, "faultstring") || "Unknown SOAP Fault";
    const detail = SoapClient.extractTag(xml, "Detail") || SoapClient.extractTag(xml, "detail") || undefined;

    return {
      code,
      subcode,
      reason,
      detail,
    };
  }
}

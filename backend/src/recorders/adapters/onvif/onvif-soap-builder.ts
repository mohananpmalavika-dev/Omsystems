/**
 * ONVIF SOAP Builder
 * 
 * Constructs well-formed SOAP envelopes for ONVIF operations.
 * Handles namespaces, headers, and body structure.
 */

import { OnvifWsSecurityProvider, RecorderCredentials } from '../../transport/recorder-auth.js';

/**
 * ONVIF namespaces
 */
export const ONVIF_NAMESPACES = {
  SOAP_ENV: 'http://www.w3.org/2003/05/soap-envelope',
  SOAP_ENC: 'http://www.w3.org/2003/05/soap-encoding',
  
  // ONVIF services
  DEVICE: 'http://www.onvif.org/ver10/device/wsdl',
  MEDIA: 'http://www.onvif.org/ver10/media/wsdl',
  MEDIA2: 'http://www.onvif.org/ver20/media/wsdl',
  RECORDING: 'http://www.onvif.org/ver10/recording/wsdl',
  SEARCH: 'http://www.onvif.org/ver10/search/wsdl',
  REPLAY: 'http://www.onvif.org/ver10/replay/wsdl',
  EVENTS: 'http://www.onvif.org/ver10/events/wsdl',
  
  // Schema namespaces
  SCHEMA: 'http://www.onvif.org/ver10/schema',
  
  // WS-* namespaces
  WSA: 'http://www.w3.org/2005/08/addressing',
  WSSE: 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd',
  WSU: 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd'
};

/**
 * SOAP envelope options
 */
export interface SoapEnvelopeOptions {
  /**
   * Service namespace (e.g., DEVICE, MEDIA)
   */
  serviceNamespace: string;

  /**
   * Service prefix (e.g., 'tds', 'trt')
   */
  servicePrefix: string;

  /**
   * SOAP body content
   */
  body: string;

  /**
   * Include WS-Security header
   */
  includeAuth?: boolean;

  /**
   * Credentials for auth
   */
  credentials?: RecorderCredentials;

  /**
   * Custom timestamp for auth
   */
  timestamp?: Date;

  /**
   * Additional namespaces
   */
  additionalNamespaces?: Record<string, string>;
}

/**
 * ONVIF SOAP builder
 */
export class OnvifSoapBuilder {
  private readonly wsSecurityProvider?: OnvifWsSecurityProvider;

  constructor(credentials?: RecorderCredentials) {
    if (credentials) {
      this.wsSecurityProvider = new OnvifWsSecurityProvider(credentials);
    }
  }

  /**
   * Build complete SOAP envelope
   */
  buildEnvelope(options: SoapEnvelopeOptions): string {
    const namespaces = this.buildNamespaceDeclarations(options);
    const header = options.includeAuth ? this.buildHeader(options.timestamp) : '';
    const body = this.buildBody(options.body);

    return this.formatXml(`
      <soap:Envelope ${namespaces}>
        ${header}
        ${body}
      </soap:Envelope>
    `);
  }

  /**
   * Build namespace declarations
   */
  private buildNamespaceDeclarations(options: SoapEnvelopeOptions): string {
    const declarations = [
      `xmlns:soap="${ONVIF_NAMESPACES.SOAP_ENV}"`,
      `xmlns:${options.servicePrefix}="${options.serviceNamespace}"`,
      `xmlns:tt="${ONVIF_NAMESPACES.SCHEMA}"`
    ];

    if (options.includeAuth) {
      declarations.push(`xmlns:wsse="${ONVIF_NAMESPACES.WSSE}"`);
      declarations.push(`xmlns:wsu="${ONVIF_NAMESPACES.WSU}"`);
    }

    if (options.additionalNamespaces) {
      for (const [prefix, uri] of Object.entries(options.additionalNamespaces)) {
        declarations.push(`xmlns:${prefix}="${uri}"`);
      }
    }

    return declarations.join(' ');
  }

  /**
   * Build SOAP header with WS-Security
   */
  private buildHeader(timestamp?: Date): string {
    if (!this.wsSecurityProvider) {
      return '';
    }

    const securityHeader = this.wsSecurityProvider.getSecurityHeader(timestamp);

    return `
      <soap:Header>
        ${securityHeader}
      </soap:Header>
    `;
  }

  /**
   * Build SOAP body
   */
  private buildBody(content: string): string {
    return `
      <soap:Body>
        ${content}
      </soap:Body>
    `;
  }

  /**
   * Format and clean XML
   */
  private formatXml(xml: string): string {
    return xml
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('');
  }

  /**
   * Escape XML special characters
   */
  static escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

/**
 * Device service operations
 */
export class OnvifDeviceOperations {
  constructor(private readonly builder: OnvifSoapBuilder) {}

  /**
   * GetSystemDateAndTime
   */
  getSystemDateAndTime(): string {
    return this.builder.buildEnvelope({
      serviceNamespace: ONVIF_NAMESPACES.DEVICE,
      servicePrefix: 'tds',
      body: '<tds:GetSystemDateAndTime/>',
      includeAuth: false // This operation typically doesn't require auth
    });
  }

  /**
   * GetDeviceInformation
   */
  getDeviceInformation(): string {
    return this.builder.buildEnvelope({
      serviceNamespace: ONVIF_NAMESPACES.DEVICE,
      servicePrefix: 'tds',
      body: '<tds:GetDeviceInformation/>',
      includeAuth: true
    });
  }

  /**
   * GetCapabilities
   */
  getCapabilities(categories?: string[]): string {
    const categoryElements = categories
      ? categories.map(cat => `<tds:Category>${cat}</tds:Category>`).join('')
      : '<tds:Category>All</tds:Category>';

    return this.builder.buildEnvelope({
      serviceNamespace: ONVIF_NAMESPACES.DEVICE,
      servicePrefix: 'tds',
      body: `
        <tds:GetCapabilities>
          ${categoryElements}
        </tds:GetCapabilities>
      `,
      includeAuth: true
    });
  }

  /**
   * GetServices
   */
  getServices(includeCapability: boolean = true): string {
    return this.builder.buildEnvelope({
      serviceNamespace: ONVIF_NAMESPACES.DEVICE,
      servicePrefix: 'tds',
      body: `
        <tds:GetServices>
          <tds:IncludeCapability>${includeCapability}</tds:IncludeCapability>
        </tds:GetServices>
      `,
      includeAuth: true
    });
  }
}

/**
 * Media service operations
 */
export class OnvifMediaOperations {
  constructor(private readonly builder: OnvifSoapBuilder) {}

  /**
   * GetProfiles
   */
  getProfiles(): string {
    return this.builder.buildEnvelope({
      serviceNamespace: ONVIF_NAMESPACES.MEDIA,
      servicePrefix: 'trt',
      body: '<trt:GetProfiles/>',
      includeAuth: true
    });
  }

  /**
   * GetProfile
   */
  getProfile(profileToken: string): string {
    return this.builder.buildEnvelope({
      serviceNamespace: ONVIF_NAMESPACES.MEDIA,
      servicePrefix: 'trt',
      body: `
        <trt:GetProfile>
          <trt:ProfileToken>${OnvifSoapBuilder.escapeXml(profileToken)}</trt:ProfileToken>
        </trt:GetProfile>
      `,
      includeAuth: true
    });
  }

  /**
   * GetVideoSources
   */
  getVideoSources(): string {
    return this.builder.buildEnvelope({
      serviceNamespace: ONVIF_NAMESPACES.MEDIA,
      servicePrefix: 'trt',
      body: '<trt:GetVideoSources/>',
      includeAuth: true
    });
  }

  /**
   * GetStreamUri
   */
  getStreamUri(profileToken: string, protocol: 'UDP' | 'TCP' | 'RTSP' | 'HTTP' = 'RTSP'): string {
    return this.builder.buildEnvelope({
      serviceNamespace: ONVIF_NAMESPACES.MEDIA,
      servicePrefix: 'trt',
      body: `
        <trt:GetStreamUri>
          <trt:StreamSetup>
            <tt:Stream>RTP-Unicast</tt:Stream>
            <tt:Transport>
              <tt:Protocol>${protocol}</tt:Protocol>
            </tt:Transport>
          </trt:StreamSetup>
          <trt:ProfileToken>${OnvifSoapBuilder.escapeXml(profileToken)}</trt:ProfileToken>
        </trt:GetStreamUri>
      `,
      includeAuth: true
    });
  }

  /**
   * GetVideoSourceConfigurations
   */
  getVideoSourceConfigurations(): string {
    return this.builder.buildEnvelope({
      serviceNamespace: ONVIF_NAMESPACES.MEDIA,
      servicePrefix: 'trt',
      body: '<trt:GetVideoSourceConfigurations/>',
      includeAuth: true
    });
  }
}

/**
 * Recording service operations
 */
export class OnvifRecordingOperations {
  constructor(private readonly builder: OnvifSoapBuilder) {}

  /**
   * GetRecordings
   */
  getRecordings(): string {
    return this.builder.buildEnvelope({
      serviceNamespace: ONVIF_NAMESPACES.RECORDING,
      servicePrefix: 'trc',
      body: '<trc:GetRecordings/>',
      includeAuth: true
    });
  }

  /**
   * GetRecordingConfiguration
   */
  getRecordingConfiguration(recordingToken: string): string {
    return this.builder.buildEnvelope({
      serviceNamespace: ONVIF_NAMESPACES.RECORDING,
      servicePrefix: 'trc',
      body: `
        <trc:GetRecordingConfiguration>
          <trc:RecordingToken>${OnvifSoapBuilder.escapeXml(recordingToken)}</trc:RecordingToken>
        </trc:GetRecordingConfiguration>
      `,
      includeAuth: true
    });
  }
}

/**
 * Search service operations
 */
export class OnvifSearchOperations {
  constructor(private readonly builder: OnvifSoapBuilder) {}

  /**
   * FindRecordings
   */
  findRecordings(
    searchScope: {
      sources?: string[];
      recordingTokens?: string[];
    },
    startTime?: Date,
    endTime?: Date,
    maxMatches: number = 100
  ): string {
    const scopeElements: string[] = [];

    if (searchScope.sources) {
      searchScope.sources.forEach(source => {
        scopeElements.push(`
          <tse:IncludedSources>
            <tt:Token>${OnvifSoapBuilder.escapeXml(source)}</tt:Token>
          </tse:IncludedSources>
        `);
      });
    }

    if (searchScope.recordingTokens) {
      searchScope.recordingTokens.forEach(token => {
        scopeElements.push(`
          <tse:IncludedRecordings>${OnvifSoapBuilder.escapeXml(token)}</tse:IncludedRecordings>
        `);
      });
    }

    const timeRange = (startTime && endTime) ? `
      <tse:StartPoint>${startTime.toISOString()}</tse:StartPoint>
      <tse:EndPoint>${endTime.toISOString()}</tse:EndPoint>
    ` : '';

    return this.builder.buildEnvelope({
      serviceNamespace: ONVIF_NAMESPACES.SEARCH,
      servicePrefix: 'tse',
      body: `
        <tse:FindRecordings>
          <tse:Scope>
            ${scopeElements.join('')}
          </tse:Scope>
          ${timeRange}
          <tse:MaxMatches>${maxMatches}</tse:MaxMatches>
          <tse:KeepAliveTime>PT30S</tse:KeepAliveTime>
        </tse:FindRecordings>
      `,
      includeAuth: true
    });
  }

  /**
   * GetRecordingSearchResults
   */
  getRecordingSearchResults(searchToken: string, maxResults: number = 50): string {
    return this.builder.buildEnvelope({
      serviceNamespace: ONVIF_NAMESPACES.SEARCH,
      servicePrefix: 'tse',
      body: `
        <tse:GetRecordingSearchResults>
          <tse:SearchToken>${OnvifSoapBuilder.escapeXml(searchToken)}</tse:SearchToken>
          <tse:MaxResults>${maxResults}</tse:MaxResults>
        </tse:GetRecordingSearchResults>
      `,
      includeAuth: true
    });
  }

  /**
   * EndSearch
   */
  endSearch(searchToken: string): string {
    return this.builder.buildEnvelope({
      serviceNamespace: ONVIF_NAMESPACES.SEARCH,
      servicePrefix: 'tse',
      body: `
        <tse:EndSearch>
          <tse:SearchToken>${OnvifSoapBuilder.escapeXml(searchToken)}</tse:SearchToken>
        </tse:EndSearch>
      `,
      includeAuth: true
    });
  }
}

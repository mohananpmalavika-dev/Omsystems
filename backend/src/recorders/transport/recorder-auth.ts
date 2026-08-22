/**
 * Recorder Authentication Providers
 * 
 * Standardized authentication mechanisms for recorder adapters.
 * Supports:
 * - HTTP Basic
 * - HTTP Digest
 * - ONVIF WS-Security
 * - Vendor session tokens
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger.js';

/**
 * Recorder credentials
 */
export interface RecorderCredentials {
  username: string;
  password: string;
  
  /**
   * Optional session token (for session-based auth)
   */
  sessionToken?: string;

  /**
   * Optional API key
   */
  apiKey?: string;
}

/**
 * HTTP authentication headers
 */
export interface AuthHeaders {
  [key: string]: string;
}

/**
 * Base authentication provider
 */
export abstract class AuthProvider {
  constructor(protected readonly credentials: RecorderCredentials) {}

  /**
   * Generate authentication headers
   */
  abstract getHeaders(options?: AuthRequestOptions): AuthHeaders;

  /**
   * Handle authentication challenge (if applicable)
   */
  async handleChallenge?(challenge: string): Promise<void>;

  /**
   * Clean up (if applicable)
   */
  destroy?(): void;
}

/**
 * Authentication request options
 */
export interface AuthRequestOptions {
  method?: string;
  uri?: string;
  body?: string;
  realm?: string;
  nonce?: string;
  qop?: string;
  opaque?: string;
}

/**
 * HTTP Basic Authentication
 * 
 * Simplest form - base64 encoded username:password
 * Not secure without TLS.
 */
export class BasicAuthProvider extends AuthProvider {
  getHeaders(): AuthHeaders {
    const credentials = `${this.credentials.username}:${this.credentials.password}`;
    const encoded = Buffer.from(credentials, 'utf-8').toString('base64');

    return {
      'Authorization': `Basic ${encoded}`
    };
  }
}

/**
 * HTTP Digest Authentication
 * 
 * Challenge-response authentication used by many IP cameras.
 * More secure than Basic as password is not sent directly.
 */
export class DigestAuthProvider extends AuthProvider {
  private nc = 0; // Nonce count
  private cachedChallenge?: DigestChallenge;

  getHeaders(options: AuthRequestOptions = {}): AuthHeaders {
    if (!this.cachedChallenge) {
      // No challenge yet - return empty (will trigger 401)
      return {};
    }

    const response = this.calculateResponse(
      options.method ?? 'GET',
      options.uri ?? '/',
      this.cachedChallenge
    );

    const authValue = this.buildAuthorizationHeader(
      response,
      options.method ?? 'GET',
      options.uri ?? '/',
      this.cachedChallenge
    );

    return {
      'Authorization': authValue
    };
  }

  /**
   * Handle WWW-Authenticate challenge
   */
  async handleChallenge(challengeHeader: string): Promise<void> {
    this.cachedChallenge = this.parseChallenge(challengeHeader);
    this.nc = 0; // Reset nonce count

    logger.debug('Digest auth challenge received', {
      realm: this.cachedChallenge.realm,
      algorithm: this.cachedChallenge.algorithm,
      qop: this.cachedChallenge.qop
    });
  }

  /**
   * Parse WWW-Authenticate header
   */
  private parseChallenge(header: string): DigestChallenge {
    const parts = header.replace(/^Digest\s+/i, '').split(',');
    const challenge: any = {};

    parts.forEach(part => {
      const [key, value] = part.split('=').map(s => s.trim());
      challenge[key] = value?.replace(/"/g, '');
    });

    return {
      realm: challenge.realm || '',
      nonce: challenge.nonce || '',
      algorithm: challenge.algorithm || 'MD5',
      qop: challenge.qop,
      opaque: challenge.opaque
    };
  }

  /**
   * Calculate digest response
   */
  private calculateResponse(
    method: string,
    uri: string,
    challenge: DigestChallenge
  ): string {
    const { realm, nonce, algorithm, qop } = challenge;
    const username = this.credentials.username;
    const password = this.credentials.password;

    // HA1 = MD5(username:realm:password)
    const ha1 = this.hash(`${username}:${realm}:${password}`, algorithm);

    // HA2 = MD5(method:uri)
    const ha2 = this.hash(`${method}:${uri}`, algorithm);

    // Response
    if (qop === 'auth' || qop === 'auth-int') {
      this.nc++;
      const ncHex = this.nc.toString(16).padStart(8, '0');
      const cnonce = this.generateCnonce();

      // response = MD5(HA1:nonce:nc:cnonce:qop:HA2)
      return this.hash(
        `${ha1}:${nonce}:${ncHex}:${cnonce}:${qop}:${ha2}`,
        algorithm
      );
    } else {
      // response = MD5(HA1:nonce:HA2)
      return this.hash(`${ha1}:${nonce}:${ha2}`, algorithm);
    }
  }

  /**
   * Build Authorization header value
   */
  private buildAuthorizationHeader(
    response: string,
    method: string,
    uri: string,
    challenge: DigestChallenge
  ): string {
    const parts = [
      `username="${this.credentials.username}"`,
      `realm="${challenge.realm}"`,
      `nonce="${challenge.nonce}"`,
      `uri="${uri}"`,
      `response="${response}"`,
      `algorithm=${challenge.algorithm}`
    ];

    if (challenge.qop) {
      const ncHex = this.nc.toString(16).padStart(8, '0');
      const cnonce = this.generateCnonce();
      parts.push(`qop=${challenge.qop}`);
      parts.push(`nc=${ncHex}`);
      parts.push(`cnonce="${cnonce}"`);
    }

    if (challenge.opaque) {
      parts.push(`opaque="${challenge.opaque}"`);
    }

    return `Digest ${parts.join(', ')}`;
  }

  /**
   * Generate client nonce
   */
  private generateCnonce(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Hash function
   */
  private hash(data: string, algorithm: string): string {
    const hashAlg = algorithm.toLowerCase().replace(/-/g, '');
    return crypto.createHash(hashAlg).update(data).digest('hex');
  }
}

/**
 * Digest challenge structure
 */
interface DigestChallenge {
  realm: string;
  nonce: string;
  algorithm: string;
  qop?: string;
  opaque?: string;
}

/**
 * ONVIF WS-Security UsernameToken Provider
 * 
 * SOAP-based authentication used by ONVIF devices.
 * Uses UsernameToken with PasswordDigest.
 */
export class OnvifWsSecurityProvider extends AuthProvider {
  /**
   * Generate WS-Security header XML
   */
  getSecurityHeader(created?: Date): string {
    const createdDate = created ?? new Date();
    const createdStr = createdDate.toISOString();
    
    const nonce = this.generateNonce();
    const nonceBase64 = Buffer.from(nonce, 'utf-8').toString('base64');
    
    const digest = this.calculatePasswordDigest(
      nonce,
      createdStr,
      this.credentials.password
    );

    return `
      <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"
                     xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
        <wsse:UsernameToken>
          <wsse:Username>${this.escapeXml(this.credentials.username)}</wsse:Username>
          <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">${digest}</wsse:Password>
          <wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${nonceBase64}</wsse:Nonce>
          <wsu:Created>${createdStr}</wsu:Created>
        </wsse:UsernameToken>
      </wsse:Security>
    `.trim();
  }

  /**
   * Get standard HTTP headers (not used for SOAP)
   */
  getHeaders(): AuthHeaders {
    // WS-Security is embedded in SOAP envelope, not HTTP headers
    return {};
  }

  /**
   * Calculate password digest
   * 
   * Digest = Base64(SHA1(nonce + created + password))
   */
  private calculatePasswordDigest(
    nonce: string,
    created: string,
    password: string
  ): string {
    const combined = nonce + created + password;
    const hash = crypto.createHash('sha1').update(combined, 'utf-8').digest();
    return hash.toString('base64');
  }

  /**
   * Generate random nonce
   */
  private generateNonce(): string {
    // Generate 16 random bytes as nonce
    return crypto.randomBytes(16).toString('utf-8');
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

/**
 * Session-based authentication provider
 * 
 * For recorders that use login/session tokens.
 * Common pattern:
 * 1. POST credentials to login endpoint
 * 2. Receive session token/cookie
 * 3. Include token in subsequent requests
 */
export class SessionAuthProvider extends AuthProvider {
  private sessionToken?: string;
  private sessionExpiry?: Date;

  /**
   * Perform login and obtain session token
   */
  async login(
    loginUrl: string,
    httpClient: any
  ): Promise<void> {
    const response = await httpClient.post(loginUrl, {
      username: this.credentials.username,
      password: this.credentials.password
    });

    if (response.status !== 200) {
      throw new Error(`Login failed: HTTP ${response.status}`);
    }

    // Extract session token (implementation varies by vendor)
    this.sessionToken = this.extractSessionToken(response);
    
    // Set expiry (default 1 hour if not specified)
    const expiryMinutes = this.extractSessionExpiry(response) ?? 60;
    this.sessionExpiry = new Date(Date.now() + expiryMinutes * 60000);

    logger.debug('Session established', {
      expiresAt: this.sessionExpiry
    });
  }

  /**
   * Get headers with session token
   */
  getHeaders(): AuthHeaders {
    if (!this.sessionToken) {
      throw new Error('No active session - call login() first');
    }

    if (this.sessionExpiry && new Date() > this.sessionExpiry) {
      throw new Error('Session expired - call login() again');
    }

    return {
      'X-Session-Token': this.sessionToken
    };
  }

  /**
   * Check if session is valid
   */
  isSessionValid(): boolean {
    return !!(
      this.sessionToken &&
      (!this.sessionExpiry || new Date() < this.sessionExpiry)
    );
  }

  /**
   * Logout and clear session
   */
  async logout(logoutUrl: string, httpClient: any): Promise<void> {
    if (this.sessionToken) {
      try {
        await httpClient.post(logoutUrl, {}, {
          headers: this.getHeaders()
        });
      } catch (error) {
        logger.warn('Logout failed', { error });
      }

      this.sessionToken = undefined;
      this.sessionExpiry = undefined;
    }
  }

  /**
   * Extract session token from response
   * Override in vendor-specific implementations
   */
  protected extractSessionToken(response: any): string {
    // Default: check common locations
    return (
      response.data?.sessionToken ||
      response.data?.token ||
      response.headers['x-session-token'] ||
      response.headers['authorization']?.replace(/^Bearer\s+/, '')
    );
  }

  /**
   * Extract session expiry from response
   * Override in vendor-specific implementations
   */
  protected extractSessionExpiry(response: any): number | undefined {
    return response.data?.expiresIn || response.data?.ttl;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.sessionToken = undefined;
    this.sessionExpiry = undefined;
  }
}

/**
 * API Key authentication provider
 * 
 * For recorders that use API keys.
 */
export class ApiKeyAuthProvider extends AuthProvider {
  constructor(
    credentials: RecorderCredentials,
    private readonly headerName: string = 'X-API-Key'
  ) {
    super(credentials);
  }

  getHeaders(): AuthHeaders {
    const apiKey = this.credentials.apiKey;
    
    if (!apiKey) {
      throw new Error('No API key provided');
    }

    return {
      [this.headerName]: apiKey
    };
  }
}

/**
 * Create auth provider based on type
 */
export function createAuthProvider(
  type: 'basic' | 'digest' | 'onvif' | 'session' | 'apikey',
  credentials: RecorderCredentials,
  options?: {
    apiKeyHeader?: string;
  }
): AuthProvider {
  switch (type) {
    case 'basic':
      return new BasicAuthProvider(credentials);
    
    case 'digest':
      return new DigestAuthProvider(credentials);
    
    case 'onvif':
      return new OnvifWsSecurityProvider(credentials);
    
    case 'session':
      return new SessionAuthProvider(credentials);
    
    case 'apikey':
      return new ApiKeyAuthProvider(credentials, options?.apiKeyHeader);
    
    default:
      throw new Error(`Unknown auth type: ${type}`);
  }
}

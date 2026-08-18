/**
 * Recorder HTTP Transport
 * 
 * Common HTTP client for all recorder drivers.
 * Handles:
 * - Authentication (Basic, Digest, custom)
 * - Timeouts and retries
 * - Connection pooling
 * - TLS/certificate handling
 * - Request correlation
 * - Redacted logging
 */

import type { RecorderContext, RecorderDriverErrorCode } from "../core/recorder-driver.types.js";
import {
  RecorderDriverError,
  RecorderConnectionError,
  RecorderAuthenticationError,
  RecorderTimeoutError,
  RecorderProtocolError
} from "../core/recorder-driver.types.js";

/**
 * HTTP transport configuration
 */
export interface HttpTransportConfig {
  /** Connection timeout (ms) */
  connectionTimeoutMs: number;
  
  /** Operation timeout (ms) */
  operationTimeoutMs: number;
  
  /** Maximum retry attempts */
  maxRetries: number;
  
  /** Retry delay (ms) */
  retryDelayMs: number;
  
  /** Exponential backoff multiplier */
  backoffMultiplier: number;
  
  /** Validate TLS certificates */
  validateTls: boolean;
  
  /** Maximum redirects to follow */
  maxRedirects: number;
  
  /** Connection pool size */
  maxConnections: number;
  
  /** Keep-alive timeout (ms) */
  keepAliveMs: number;
}

/**
 * Default transport configuration
 */
export const DEFAULT_HTTP_CONFIG: HttpTransportConfig = {
  connectionTimeoutMs: 5000,
  operationTimeoutMs: 10000,
  maxRetries: 2,
  retryDelayMs: 1000,
  backoffMultiplier: 2,
  validateTls: true,
  maxRedirects: 3,
  maxConnections: 10,
  keepAliveMs: 60000
};

/**
 * HTTP request options
 */
export interface HttpRequestOptions {
  /** HTTP method */
  method: "GET" | "POST" | "PUT" | "DELETE";
  
  /** Request path */
  path: string;
  
  /** Query parameters */
  query?: Record<string, string | number | boolean>;
  
  /** Request headers */
  headers?: Record<string, string>;
  
  /** Request body */
  body?: string | Buffer;
  
  /** Content type */
  contentType?: string;
  
  /** Response type */
  responseType?: "text" | "json" | "buffer";
  
  /** Timeout override (ms) */
  timeoutMs?: number;
  
  /** Disable retries */
  noRetry?: boolean;
  
  /** Authentication override */
  auth?: {
    username: string;
    password: string;
    type?: "basic" | "digest";
  };
  [key: string]: any;
}

/**
 * HTTP response
 */
export interface HttpResponse<T = string> {
  /** Status code */
  statusCode: number;
  
  /** Status message */
  statusMessage: string;
  
  /** Response headers */
  headers: Record<string, string | string[]>;
  
  /** Response body */
  body: T;
  
  /** Request duration (ms) */
  durationMs: number;
  
  /** Correlation ID */
  correlationId?: string;
}

/**
 * Authentication provider interface
 */
export interface AuthProvider {
  /**
   * Add authentication to request
   */
  authenticate(
    options: HttpRequestOptions,
    credentials: { username: string; password: string }
  ): Promise<HttpRequestOptions>;
  
  /**
   * Handle authentication challenge
   * Returns true if retry should be attempted
   */
  handleChallenge?(
    response: HttpResponse<string>,
    credentials: { username: string; password: string }
  ): Promise<boolean>;
}

/**
 * Basic authentication provider
 */
export class BasicAuthProvider implements AuthProvider {
  async authenticate(
    options: HttpRequestOptions,
    credentials: { username: string; password: string }
  ): Promise<HttpRequestOptions> {
    const encoded = Buffer.from(
      `${credentials.username}:${credentials.password}`
    ).toString("base64");
    
    return {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Basic ${encoded}`
      }
    };
  }
}

/**
 * Digest authentication provider
 * Implements RFC 2617 Digest Access Authentication
 */
export class DigestAuthProvider implements AuthProvider {
  private challengeCache = new Map<string, DigestChallenge>();
  
  async authenticate(
    options: HttpRequestOptions,
    credentials: { username: string; password: string }
  ): Promise<HttpRequestOptions> {
    const cacheKey = `${options.method}:${options.path}`;
    const challenge = this.challengeCache.get(cacheKey);
    
    if (!challenge) {
      // First request - will get 401 with challenge
      return options;
    }
    
    // Generate digest response
    const authHeader = this.generateDigestResponse(
      challenge,
      credentials,
      options.method,
      options.path
    );
    
    return {
      ...options,
      headers: {
        ...options.headers,
        Authorization: authHeader
      }
    };
  }
  
  async handleChallenge(
    response: HttpResponse<string>,
    credentials: { username: string; password: string }
  ): Promise<boolean> {
    if (response.statusCode !== 401) {
      return false;
    }
    
    const wwwAuth = response.headers["www-authenticate"] as string;
    if (!wwwAuth || !wwwAuth.toLowerCase().startsWith("digest")) {
      return false;
    }
    
    const challenge = this.parseDigestChallenge(wwwAuth);
    if (challenge) {
      // Cache challenge for next request
      this.challengeCache.set("*", challenge);
      return true;
    }
    
    return false;
  }
  
  private parseDigestChallenge(header: string): DigestChallenge | null {
    const realm = this.extractParam(header, "realm");
    const nonce = this.extractParam(header, "nonce");
    const qop = this.extractParam(header, "qop");
    const opaque = this.extractParam(header, "opaque");
    
    if (!realm || !nonce) {
      return null;
    }
    
    return { realm, nonce, qop, opaque };
  }
  
  private generateDigestResponse(
    challenge: DigestChallenge,
    credentials: { username: string; password: string },
    method: string,
    uri: string
  ): string {
    const { createHash, randomBytes } = require("crypto");
    
    const nc = "00000001";
    const cnonce = randomBytes(8).toString("hex");
    
    // HA1 = MD5(username:realm:password)
    const ha1 = createHash("md5")
      .update(`${credentials.username}:${challenge.realm}:${credentials.password}`)
      .digest("hex");
    
    // HA2 = MD5(method:uri)
    const ha2 = createHash("md5")
      .update(`${method}:${uri}`)
      .digest("hex");
    
    // response = MD5(HA1:nonce:nc:cnonce:qop:HA2)
    const response = createHash("md5")
      .update(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${challenge.qop || "auth"}:${ha2}`)
      .digest("hex");
    
    let authHeader = `Digest username="${credentials.username}", ` +
      `realm="${challenge.realm}", ` +
      `nonce="${challenge.nonce}", ` +
      `uri="${uri}", ` +
      `response="${response}"`;
    
    if (challenge.qop) {
      authHeader += `, qop=${challenge.qop}, nc=${nc}, cnonce="${cnonce}"`;
    }
    
    if (challenge.opaque) {
      authHeader += `, opaque="${challenge.opaque}"`;
    }
    
    return authHeader;
  }
  
  private extractParam(header: string, param: string): string | undefined {
    const match = header.match(new RegExp(`${param}="([^"]+)"`));
    return match?.[1];
  }
}

interface DigestChallenge {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
}

/**
 * Recorder HTTP transport
 * 
 * Provides common HTTP operations for all drivers.
 */
export class RecorderHttpTransport {
  private config: HttpTransportConfig;
  private authProvider?: AuthProvider;
  
  constructor(
    config?: Partial<HttpTransportConfig>,
    authProvider?: AuthProvider
  ) {
    this.config = { ...DEFAULT_HTTP_CONFIG, ...config };
    this.authProvider = authProvider;
  }
  
  /**
   * Set authentication provider
   */
  setAuthProvider(provider: AuthProvider): void {
    this.authProvider = provider;
  }
  
  /**
   * Make HTTP request
   */
  async request<T = string>(
    ctx: RecorderContext,
    options: HttpRequestOptions
  ): Promise<HttpResponse<T>> {
    const startTime = Date.now();
    
    // Resolve credentials if needed
    let credentials: { username: string; password: string } | undefined;
    if (options.auth || this.authProvider) {
      credentials = await this.resolveCredentials(ctx);
    }
    
    // Apply authentication
    let requestOptions = options;
    if (credentials && this.authProvider) {
      requestOptions = await this.authProvider.authenticate(options, credentials);
    }
    
    // Build URL
    const url = this.buildUrl(ctx.endpoint.baseUrl, options.path, options.query);
    
    // Execute with retry
    const response = await this.executeWithRetry(
      ctx,
      url,
      requestOptions,
      credentials
    );
    
    // Add duration
    response.durationMs = Date.now() - startTime;
    response.correlationId = ctx.correlationId;
    
    return response as HttpResponse<T>;
  }
  
  /**
   * GET request
   */
  async get<T = string>(
    ctx: RecorderContext,
    path: string,
    query?: Record<string, string | number | boolean>,
    options?: Partial<HttpRequestOptions>
  ): Promise<HttpResponse<T>> {
    return this.request<T>(ctx, {
      method: "GET",
      path,
      query,
      ...options
    });
  }
  
  /**
   * POST request
   */
  async post<T = string>(
    ctx: RecorderContext,
    path: string,
    body?: string | Buffer,
    options?: Partial<HttpRequestOptions>
  ): Promise<HttpResponse<T>> {
    return this.request<T>(ctx, {
      method: "POST",
      path,
      body,
      ...options
    });
  }
  
  /**
   * Execute request with retry logic
   */
  private async executeWithRetry(
    ctx: RecorderContext,
    url: string,
    options: HttpRequestOptions,
    credentials?: { username: string; password: string }
  ): Promise<HttpResponse<string>> {
    const maxAttempts = options.noRetry ? 1 : this.config.maxRetries + 1;
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this.executeRequest(ctx, url, options);
        
        // Handle authentication challenge
        if (response.statusCode === 401 && credentials && this.authProvider?.handleChallenge) {
          const shouldRetry = await this.authProvider.handleChallenge(response, credentials);
          if (shouldRetry && attempt < maxAttempts) {
            // Re-authenticate and retry
            const authenticatedOptions = await this.authProvider.authenticate(options, credentials);
            continue;
          }
        }
        
        // Check for HTTP errors
        if (response.statusCode >= 400) {
          this.throwHttpError(response);
        }
        
        return response;
        
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry non-retryable errors
        if (!this.isRetryable(error)) {
          throw error;
        }
        
        // Don't retry on last attempt
        if (attempt === maxAttempts) {
          throw error;
        }
        
        // Wait before retry with exponential backoff
        const delay = this.config.retryDelayMs * Math.pow(this.config.backoffMultiplier, attempt - 1);
        await this.delay(delay);
      }
    }
    
    throw lastError || new Error("Request failed");
  }
  
  /**
   * Execute single request (to be implemented with actual HTTP client)
   */
  private async executeRequest(
    ctx: RecorderContext,
    url: string,
    options: HttpRequestOptions
  ): Promise<HttpResponse<string>> {
    // This would use node:http/https or axios in actual implementation
    // For now, this is a placeholder that shows the structure
    
    throw new Error("HTTP client not implemented - use axios or node:http");
  }
  
  /**
   * Check if error is retryable
   */
  private isRetryable(error: unknown): boolean {
    if (error instanceof RecorderDriverError) {
      return error.retryable;
    }
    
    // Network errors are generally retryable
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes("timeout") ||
        message.includes("econnrefused") ||
        message.includes("enotfound") ||
        message.includes("etimedout") ||
        message.includes("socket hang up")
      );
    }
    
    return false;
  }
  
  /**
   * Throw appropriate error for HTTP status
   */
  private throwHttpError(response: HttpResponse<string>): never {
    const { statusCode } = response;
    
    if (statusCode === 401 || statusCode === 403) {
      throw new RecorderAuthenticationError(
        `Authentication failed (HTTP ${statusCode})`
      );
    }
    
    if (statusCode === 404) {
      throw new RecorderDriverError(
        "Resource not found (HTTP 404)",
        "ENDPOINT_NOT_FOUND",
        false
      );
    }
    
    if (statusCode === 429) {
      throw new RecorderDriverError(
        "Rate limited (HTTP 429)",
        "RATE_LIMITED",
        true
      );
    }
    
    if (statusCode >= 500) {
      throw new RecorderDriverError(
        `Server error (HTTP ${statusCode})`,
        "SERVICE_UNAVAILABLE",
        true
      );
    }
    
    throw new RecorderDriverError(
      `HTTP error ${statusCode}`,
      "PROTOCOL_ERROR",
      false
    );
  }
  
  /**
   * Build full URL
   */
  private buildUrl(
    baseUrl: string,
    path: string,
    query?: Record<string, string | number | boolean>
  ): string {
    let url = baseUrl;
    if (path) {
      url += path.startsWith("/") ? path : `/${path}`;
    }
    
    if (query && Object.keys(query).length > 0) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        params.append(key, String(value));
      }
      url += `?${params.toString()}`;
    }
    
    return url;
  }
  
  /**
   * Resolve credentials from context
   */
  private async resolveCredentials(
    ctx: RecorderContext
  ): Promise<{ username: string; password: string }> {
    // In real implementation, this would retrieve credentials from secret store
    // using ctx.credentialRef
    
    throw new Error("Credential resolution not implemented");
  }
  
  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

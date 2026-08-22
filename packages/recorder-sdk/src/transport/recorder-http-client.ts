/**
 * Recorder HTTP Client
 * 
 * Axios-based HTTP client for recorder communication.
 * Implements RecorderHttpTransport with actual network operations.
 */

import axios from "axios";
import type { AxiosInstance, AxiosError, AxiosRequestConfig } from "axios";
import type { RecorderContext } from "../core/recorder-driver.types.js";
import {
  RecorderDriverError,
  RecorderConnectionError,
  RecorderAuthenticationError,
  RecorderTimeoutError,
  RecorderProtocolError
} from "../core/recorder-driver.types.js";
import type {
  HttpTransportConfig,
  HttpRequestOptions,
  HttpResponse,
  AuthProvider
} from "./recorder-http-transport.js";
import { DEFAULT_HTTP_CONFIG } from "./recorder-http-transport.js";

/**
 * Credential resolver interface
 * Retrieves credentials from secret store
 */
export interface CredentialResolver {
  resolve(
    credentialRef: string,
    tenantId: string
  ): Promise<{ username: string; password: string }>;
}

/**
 * In-memory credential store (for testing/development)
 */
export class InMemoryCredentialResolver implements CredentialResolver {
  private credentials = new Map<string, { username: string; password: string }>();
  
  async resolve(
    credentialRef: string,
    tenantId: string
  ): Promise<{ username: string; password: string }> {
    const key = `${tenantId}:${credentialRef}`;
    const creds = this.credentials.get(key);
    
    if (!creds) {
      throw new RecorderAuthenticationError(
        `Credentials not found: ${credentialRef}`
      );
    }
    
    return creds;
  }
  
  store(
    credentialRef: string,
    tenantId: string,
    credentials: { username: string; password: string }
  ): void {
    const key = `${tenantId}:${credentialRef}`;
    this.credentials.set(key, credentials);
  }
}

/**
 * Recorder HTTP client
 * Production-ready HTTP client with retry, timeout, auth
 */
export class RecorderHttpClient {
  private axiosInstances = new Map<string, AxiosInstance>();
  private config: HttpTransportConfig;
  private authProvider?: AuthProvider;
  private credentialResolver?: CredentialResolver;
  
  constructor(
    config?: Partial<HttpTransportConfig>,
    authProvider?: AuthProvider,
    credentialResolver?: CredentialResolver
  ) {
    this.config = { ...DEFAULT_HTTP_CONFIG, ...config };
    this.authProvider = authProvider;
    this.credentialResolver = credentialResolver;
  }
  
  /**
   * Set authentication provider
   */
  setAuthProvider(provider: AuthProvider): void {
    this.authProvider = provider;
  }
  
  /**
   * Set credential resolver
   */
  setCredentialResolver(resolver: CredentialResolver): void {
    this.credentialResolver = resolver;
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
    if (options.auth) {
      credentials = options.auth;
    } else if (this.authProvider && this.credentialResolver) {
      credentials = await this.credentialResolver.resolve(
        ctx.credentialRef.ref,
        ctx.tenantId
      );
    }
    
    // Apply authentication
    let requestOptions = options;
    if (credentials && this.authProvider) {
      requestOptions = await this.authProvider.authenticate(options, credentials);
    }
    
    // Execute with retry
    const response = await this.executeWithRetry(
      ctx,
      requestOptions,
      credentials
    );
    
    // Add metadata
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
      responseType: "text",
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
      responseType: "text",
      ...options
    });
  }
  
  /**
   * Execute request with retry logic
   */
  private async executeWithRetry(
    ctx: RecorderContext,
    options: HttpRequestOptions,
    credentials?: { username: string; password: string }
  ): Promise<HttpResponse<string>> {
    const maxAttempts = options.noRetry ? 1 : this.config.maxRetries + 1;
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this.executeRequest(ctx, options);
        
        // Handle authentication challenge
        if (response.statusCode === 401 && credentials && this.authProvider?.handleChallenge) {
          const shouldRetry = await this.authProvider.handleChallenge(response, credentials);
          if (shouldRetry && attempt < maxAttempts) {
            // Re-authenticate and retry
            const authenticatedOptions = await this.authProvider.authenticate(options, credentials);
            options = authenticatedOptions;
            continue;
          }
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
   * Execute single request with axios
   */
  private async executeRequest(
    ctx: RecorderContext,
    options: HttpRequestOptions
  ): Promise<HttpResponse<string>> {
    const client = this.getAxiosInstance(ctx.endpoint.baseUrl);
    
    // Build full path with query
    const path = this.buildPath(options.path, options.query);
    
    // Build axios config
    const axiosConfig: AxiosRequestConfig = {
      method: options.method,
      url: path,
      headers: options.headers || {},
      timeout: options.timeoutMs || ctx.timeoutMs || this.config.operationTimeoutMs,
      validateStatus: () => true, // Don't throw on any status
      maxRedirects: this.config.maxRedirects
    };
    
    // Add body if present
    if (options.body) {
      axiosConfig.data = options.body;
      
      // Set content type
      if (options.contentType) {
        axiosConfig.headers!["Content-Type"] = options.contentType;
      } else if (typeof options.body === "string") {
        axiosConfig.headers!["Content-Type"] = "application/x-www-form-urlencoded";
      }
    }
    
    // Add correlation ID
    if (ctx.correlationId) {
      axiosConfig.headers!["X-Correlation-ID"] = ctx.correlationId;
    }
    
    // Response type
    if (options.responseType === "buffer") {
      axiosConfig.responseType = "arraybuffer";
    } else {
      axiosConfig.responseType = "text";
    }
    
    try {
      const axiosResponse = await client.request(axiosConfig);
      
      return {
        statusCode: axiosResponse.status,
        statusMessage: axiosResponse.statusText,
        headers: this.normalizeHeaders(axiosResponse.headers),
        body: axiosResponse.data,
        durationMs: 0 // Set by caller
      };
      
    } catch (error) {
      throw this.normalizeAxiosError(error as AxiosError, ctx);
    }
  }
  
  /**
   * Get or create axios instance for base URL
   */
  private getAxiosInstance(baseUrl: string): AxiosInstance {
    let instance = this.axiosInstances.get(baseUrl);
    
    if (!instance) {
      instance = axios.create({
        baseURL: baseUrl,
        timeout: this.config.connectionTimeoutMs,
        maxRedirects: this.config.maxRedirects,
        // Connection pooling
        httpAgent: this.createHttpAgent(),
        httpsAgent: this.createHttpsAgent()
      });
      
      this.axiosInstances.set(baseUrl, instance);
    }
    
    return instance;
  }
  
  /**
   * Create HTTP agent with keep-alive
   */
  private createHttpAgent(): any {
    const http = require("http");
    return new http.Agent({
      keepAlive: true,
      keepAliveMsecs: this.config.keepAliveMs,
      maxSockets: this.config.maxConnections,
      maxFreeSockets: Math.floor(this.config.maxConnections / 2)
    });
  }
  
  /**
   * Create HTTPS agent with keep-alive and TLS config
   */
  private createHttpsAgent(): any {
    const https = require("https");
    return new https.Agent({
      keepAlive: true,
      keepAliveMsecs: this.config.keepAliveMs,
      maxSockets: this.config.maxConnections,
      maxFreeSockets: Math.floor(this.config.maxConnections / 2),
      rejectUnauthorized: this.config.validateTls
    });
  }
  
  /**
   * Build path with query parameters
   */
  private buildPath(
    path: string,
    query?: Record<string, string | number | boolean>
  ): string {
    if (!query || Object.keys(query).length === 0) {
      return path;
    }
    
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      params.append(key, String(value));
    }
    
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}${params.toString()}`;
  }
  
  /**
   * Normalize axios headers
   */
  private normalizeHeaders(
    headers: Record<string, any>
  ): Record<string, string | string[]> {
    const normalized: Record<string, string | string[]> = {};
    
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === "string") {
        normalized[key.toLowerCase()] = value;
      } else if (Array.isArray(value)) {
        normalized[key.toLowerCase()] = value;
      }
    }
    
    return normalized;
  }
  
  /**
   * Normalize axios error to recorder error
   */
  private normalizeAxiosError(
    error: AxiosError,
    ctx: RecorderContext
  ): RecorderDriverError {
    // Network errors
    if (error.code === "ECONNREFUSED") {
      return new RecorderConnectionError(
        `Connection refused to ${ctx.endpoint.host}:${ctx.endpoint.port}`,
        error
      );
    }
    
    if (error.code === "ETIMEDOUT" || error.code === "ECONNABORTED") {
      return new RecorderTimeoutError(
        `Connection timed out after ${ctx.timeoutMs || this.config.operationTimeoutMs}ms`,
        error
      );
    }
    
    if (error.code === "ENOTFOUND") {
      return new RecorderDriverError(
        `Could not resolve hostname ${ctx.endpoint.host}`,
        "DNS_RESOLUTION_FAILED",
        false,
        error
      );
    }
    
    if (error.code === "CERT_HAS_EXPIRED" || error.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
      return new RecorderDriverError(
        "TLS certificate validation failed",
        "CERTIFICATE_ERROR",
        false,
        error
      );
    }
    
    // HTTP status errors
    if (error.response) {
      const status = error.response.status;
      
      if (status === 401 || status === 403) {
        return new RecorderAuthenticationError(
          `Authentication failed (HTTP ${status})`,
          error
        );
      }
      
      if (status === 404) {
        return new RecorderDriverError(
          "Resource not found (HTTP 404)",
          "ENDPOINT_NOT_FOUND",
          false,
          error
        );
      }
      
      if (status === 429) {
        return new RecorderDriverError(
          "Rate limited (HTTP 429)",
          "RATE_LIMITED",
          true,
          error
        );
      }
      
      if (status >= 500) {
        return new RecorderDriverError(
          `Server error (HTTP ${status})`,
          "SERVICE_UNAVAILABLE",
          true,
          error
        );
      }
      
      return new RecorderProtocolError(
        `HTTP error ${status}`,
        error
      );
    }
    
    // Generic error
    return new RecorderDriverError(
      error.message || "Request failed",
      "UNKNOWN_ERROR",
      false,
      error
    );
  }
  
  /**
   * Check if error is retryable
   */
  private isRetryable(error: unknown): boolean {
    if (error instanceof RecorderDriverError) {
      return error.retryable;
    }
    
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      
      // Network errors are retryable
      if (
        axiosError.code === "ECONNREFUSED" ||
        axiosError.code === "ETIMEDOUT" ||
        axiosError.code === "ECONNABORTED" ||
        axiosError.code === "ECONNRESET"
      ) {
        return true;
      }
      
      // 5xx errors are retryable
      if (axiosError.response?.status && axiosError.response.status >= 500) {
        return true;
      }
      
      // 408 Request Timeout is retryable
      if (axiosError.response?.status === 408) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Close all connections
   */
  dispose(): void {
    this.axiosInstances.clear();
  }
}

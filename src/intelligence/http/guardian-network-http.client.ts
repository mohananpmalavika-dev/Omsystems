/**
 * Guardian Network HTTP Client
 * 
 * Production-grade HTTP client with:
 * - Retry logic with exponential backoff
 * - Circuit breaker pattern
 * - Request/response logging
 * - Timeout handling
 * - Connection pooling
 * - Metrics collection
 */

import https from 'https';
import type {
  ThreatPattern,
  ThreatIntelligenceUpdate,
  BenchmarkMetrics,
  IndustryIntelligenceReport,
  IndustryVertical,
  ThreatDatabaseQuery,
} from '../guardian-network.types';

export interface HttpClientConfig {
  baseUrl: string;
  apiKey: string;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
  circuitBreakerThreshold: number;
  circuitBreakerTimeout: number;
}

interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'closed' | 'open' | 'half-open';
}

export class GuardianNetworkHttpClient {
  private config: HttpClientConfig;
  private agent: https.Agent;
  private circuitBreaker: CircuitBreakerState = {
    failures: 0,
    lastFailureTime: 0,
    state: 'closed',
  };

  constructor(config: Partial<HttpClientConfig>) {
    this.config = {
      baseUrl: config.baseUrl || '',
      apiKey: config.apiKey || '',
      timeout: config.timeout || 30000,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      circuitBreakerThreshold: config.circuitBreakerThreshold || 5,
      circuitBreakerTimeout: config.circuitBreakerTimeout || 60000,
    };

    // Create HTTPS agent with connection pooling
    this.agent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: this.config.timeout,
    });
  }

  /**
   * Upload threat pattern to hub
   */
  async uploadPattern(pattern: ThreatPattern): Promise<{ patternId: string }> {
    const response = await this.request<{ patternId: string }>({
      method: 'POST',
      path: '/patterns',
      body: pattern,
    });

    return response;
  }

  /**
   * Query threat patterns
   */
  async queryPatterns(query: ThreatDatabaseQuery): Promise<{ patterns: ThreatPattern[] }> {
    const params = new URLSearchParams();
    
    if (query.categories) params.append('categories', query.categories.join(','));
    if (query.industries) params.append('industries', query.industries.join(','));
    if (query.severities) params.append('severities', query.severities.join(','));
    if (query.from) params.append('from', query.from.toISOString());
    if (query.to) params.append('to', query.to.toISOString());
    if (query.limit) params.append('limit', query.limit.toString());
    if (query.offset) params.append('offset', query.offset.toString());
    if (query.sortBy) params.append('sortBy', query.sortBy);

    const response = await this.request<{ patterns: ThreatPattern[] }>({
      method: 'GET',
      path: `/patterns?${params.toString()}`,
    });

    return response;
  }

  /**
   * Get benchmark metrics
   */
  async getBenchmarks(
    deploymentId: string,
    period: { startDate: Date; endDate: Date },
    yourMetrics: any
  ): Promise<BenchmarkMetrics> {
    const response = await this.request<BenchmarkMetrics>({
      method: 'POST',
      path: '/benchmarks',
      body: {
        deploymentId,
        period,
        yourMetrics,
      },
    });

    return response;
  }

  /**
   * Get industry intelligence report
   */
  async getIndustryIntelligence(vertical: IndustryVertical): Promise<IndustryIntelligenceReport> {
    const response = await this.request<IndustryIntelligenceReport>({
      method: 'GET',
      path: `/reports/${vertical}/latest`,
    });

    return response;
  }

  /**
   * Get network statistics
   */
  async getNetworkStatistics(deploymentId: string): Promise<any> {
    const response = await this.request<any>({
      method: 'GET',
      path: `/statistics?deploymentId=${deploymentId}`,
    });

    return response;
  }

  /**
   * Acknowledge threat alert
   */
  async acknowledgeThreatAlert(alertId: string, deploymentId: string): Promise<void> {
    await this.request<void>({
      method: 'POST',
      path: `/alerts/${alertId}/acknowledge`,
      body: { deploymentId },
    });
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    const response = await this.request<{ status: string; timestamp: string }>({
      method: 'GET',
      path: '/health',
    });

    return response;
  }

  /**
   * Close HTTP client
   */
  close(): void {
    this.agent.destroy();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async request<T>(options: {
    method: string;
    path: string;
    body?: any;
    headers?: Record<string, string>;
  }): Promise<T> {
    // Check circuit breaker
    this.checkCircuitBreaker();

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await this.executeRequest<T>(options);
        
        // Reset circuit breaker on success
        this.onSuccess();
        
        return result;
      } catch (error) {
        lastError = error as Error;
        
        // Record failure
        this.onFailure();

        // Don't retry on 4xx errors (client errors)
        if (this.isClientError(error)) {
          throw error;
        }

        // Retry with exponential backoff
        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelay * Math.pow(2, attempt);
          console.log(`[GuardianNetworkHttp] Retry ${attempt + 1}/${this.config.maxRetries} after ${delay}ms`);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(`Request failed after ${this.config.maxRetries} retries: ${lastError?.message}`);
  }

  private async executeRequest<T>(options: {
    method: string;
    path: string;
    body?: any;
    headers?: Record<string, string>;
  }): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(options.path, this.config.baseUrl);
      
      const requestOptions: https.RequestOptions = {
        method: options.method,
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          'User-Agent': 'GuardianNetwork/1.0',
          ...options.headers,
        },
        agent: this.agent,
        timeout: this.config.timeout,
      };

      const req = https.request(requestOptions, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          const statusCode = res.statusCode || 0;

          if (statusCode >= 200 && statusCode < 300) {
            try {
              const parsed = data ? JSON.parse(data) : {};
              resolve(parsed);
            } catch (error) {
              reject(new Error(`Failed to parse response: ${error}`));
            }
          } else {
            const error = new Error(`HTTP ${statusCode}: ${data}`);
            (error as any).statusCode = statusCode;
            (error as any).body = data;
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout after ${this.config.timeout}ms`));
      });

      // Send body if present
      if (options.body) {
        const bodyStr = JSON.stringify(options.body);
        req.setHeader('Content-Length', Buffer.byteLength(bodyStr));
        req.write(bodyStr);
      }

      req.end();
    });
  }

  private checkCircuitBreaker(): void {
    if (this.circuitBreaker.state === 'open') {
      const now = Date.now();
      const timeSinceLastFailure = now - this.circuitBreaker.lastFailureTime;

      if (timeSinceLastFailure >= this.config.circuitBreakerTimeout) {
        console.log('[GuardianNetworkHttp] Circuit breaker entering half-open state');
        this.circuitBreaker.state = 'half-open';
        this.circuitBreaker.failures = 0;
      } else {
        throw new Error('Circuit breaker is open - refusing request');
      }
    }
  }

  private onSuccess(): void {
    if (this.circuitBreaker.state === 'half-open') {
      console.log('[GuardianNetworkHttp] Circuit breaker closed after successful request');
      this.circuitBreaker.state = 'closed';
    }
    this.circuitBreaker.failures = 0;
  }

  private onFailure(): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailureTime = Date.now();

    if (this.circuitBreaker.failures >= this.config.circuitBreakerThreshold) {
      console.error(
        `[GuardianNetworkHttp] Circuit breaker opened after ${this.circuitBreaker.failures} failures`
      );
      this.circuitBreaker.state = 'open';
    }
  }

  private isClientError(error: any): boolean {
    const statusCode = error?.statusCode || 0;
    return statusCode >= 400 && statusCode < 500;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

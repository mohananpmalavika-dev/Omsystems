import { createHash, randomBytes } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { AxProConnectionConfig, AxProCredentials, AxProRawPayload } from './types';
import { AxProError } from './errors';

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

interface DigestChallenge {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
  algorithm?: string;
}

export interface AxProHttpResponse<T = AxProRawPayload> {
  status: number;
  headers: Headers;
  data: T;
  responseTimeMs: number;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  parseTagValue: true,
});

export function parseAxProPayload(body: string, contentType = ''): AxProRawPayload {
  if (!body.trim()) return {};

  if (contentType.includes('xml') || body.trimStart().startsWith('<')) {
    const parsed = xmlParser.parse(body) as unknown;
    return isRecord(parsed) ? parsed : { value: parsed };
  }

  try {
    const parsed = JSON.parse(body) as unknown;
    return isRecord(parsed) ? parsed : { value: parsed };
  } catch {
    return { value: body };
  }
}

export function isRecord(value: unknown): value is AxProRawPayload {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class AxProClient {
  private readonly fetchImpl: FetchLike;

  constructor(
    private readonly config: AxProConnectionConfig,
    private readonly credentials: AxProCredentials,
    fetchImpl?: FetchLike,
  ) {
    this.fetchImpl = fetchImpl || fetch;
    this.validateConfig();
  }

  async getSystemInfo(): Promise<AxProHttpResponse> {
    return this.request(this.config.endpointPaths?.systemInfo || '/ISAPI/System/deviceInfo');
  }

  async getCapabilities(): Promise<AxProHttpResponse> {
    return this.request(this.requireEndpoint('capabilities'));
  }

  async getDeviceList(): Promise<AxProHttpResponse> {
    return this.request(this.requireEndpoint('devices'));
  }

  async getDeviceStatus(deviceId?: string): Promise<AxProHttpResponse> {
    const path = this.requireEndpoint('deviceStatus');
    return this.request(path, deviceId ? { deviceId } : undefined);
  }

  async getEvents(since?: Date, limit?: number): Promise<AxProHttpResponse> {
    const path = this.requireEndpoint('events');
    const query: Record<string, string> = {};
    if (since) query.since = since.toISOString();
    if (limit) query.limit = String(limit);
    return this.request(path, query);
  }

  private async request(
    path: string,
    query?: Record<string, string>,
    method = 'GET',
  ): Promise<AxProHttpResponse> {
    const url = this.buildUrl(path, query);
    const baseHeaders: Record<string, string> = {
      Accept: 'application/json, application/xml;q=0.9, */*;q=0.1',
    };
    const authMethod = this.config.authMethod || 'auto';
    const initialHeaders = {
      ...baseHeaders,
      ...(authMethod === 'digest' ? {} : { Authorization: this.basicAuthHeader() }),
    };

    const startedAt = Date.now();
    let response = await this.fetchWithTimeout(url, method, initialHeaders);

    if (response.status === 401 && authMethod !== 'basic') {
      const challengeHeader = response.headers.get('www-authenticate') || '';
      const challenge = parseDigestChallenge(challengeHeader);
      if (challenge) {
        const digestHeader = this.digestAuthHeader(challenge, method, new URL(url).pathname + new URL(url).search);
        response = await this.fetchWithTimeout(url, method, {
          ...baseHeaders,
          Authorization: digestHeader,
        });
      }
    }

    const responseTimeMs = Date.now() - startedAt;
    const body = await response.text();
    if (!response.ok) {
      throw new AxProError(
        response.status === 401 ? 'AXPRO_AUTHENTICATION_FAILED' : 'AXPRO_HTTP_ERROR',
        `AX PRO request failed with HTTP ${response.status}`,
        response.status,
      );
    }

    return {
      status: response.status,
      headers: response.headers,
      data: parseAxProPayload(body, response.headers.get('content-type') || ''),
      responseTimeMs,
    };
  }

  private async fetchWithTimeout(
    url: string,
    method: string,
    headers: Record<string, string>,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs || 10_000);
    try {
      return await this.fetchImpl(url, {
        method,
        headers,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AxProError('AXPRO_TIMEOUT', 'AX PRO request timed out');
      }
      throw new AxProError(
        'AXPRO_NETWORK_ERROR',
        `AX PRO request could not be completed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildUrl(path: string, query?: Record<string, string>): string {
    if (!path.startsWith('/') || path.startsWith('//')) {
      throw new AxProError('AXPRO_INVALID_ENDPOINT', 'AX PRO endpoint paths must be relative paths beginning with /');
    }

    const protocol = this.config.protocol.toLowerCase();
    const url = new URL(`${protocol}://${this.config.host}`);
    url.port = String(this.config.port);
    url.pathname = path;
    for (const [key, value] of Object.entries(query || {})) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  private requireEndpoint(name: keyof NonNullable<AxProConnectionConfig['endpointPaths']>): string {
    const endpoint = this.config.endpointPaths?.[name];
    if (!endpoint) {
      throw new AxProError(
        'AXPRO_ENDPOINT_NOT_CONFIGURED',
        `AX PRO ${name} endpoint is not configured for this firmware/model`,
      );
    }
    return endpoint;
  }

  private basicAuthHeader(): string {
    return `Basic ${Buffer.from(`${this.credentials.username}:${this.credentials.password}`, 'utf8').toString('base64')}`;
  }

  private digestAuthHeader(challenge: DigestChallenge, method: string, uri: string): string {
    const algorithm = (challenge.algorithm || 'MD5').toUpperCase();
    if (algorithm !== 'MD5') {
      throw new AxProError('AXPRO_DIGEST_ALGORITHM_UNSUPPORTED', `Unsupported AX PRO digest algorithm: ${algorithm}`);
    }

    const hash = (value: string) => createHash('md5').update(value).digest('hex');
    const ha1 = hash(`${this.credentials.username}:${challenge.realm}:${this.credentials.password}`);
    const ha2 = hash(`${method}:${uri}`);
    const qop = challenge.qop?.split(',').map((item) => item.trim()).find((item) => item === 'auth');
    const nonceCount = '00000001';
    const cnonce = randomBytes(16).toString('hex');
    const response = qop
      ? hash(`${ha1}:${challenge.nonce}:${nonceCount}:${cnonce}:${qop}:${ha2}`)
      : hash(`${ha1}:${challenge.nonce}:${ha2}`);

    const parts = [
      `username="${escapeAuthValue(this.credentials.username)}"`,
      `realm="${escapeAuthValue(challenge.realm)}"`,
      `nonce="${escapeAuthValue(challenge.nonce)}"`,
      `uri="${escapeAuthValue(uri)}"`,
      `response="${response}"`,
      `algorithm=${algorithm}`,
    ];
    if (qop) {
      parts.push(`qop=${qop}`, `nc=${nonceCount}`, `cnonce="${cnonce}"`);
    }
    if (challenge.opaque) parts.push(`opaque="${escapeAuthValue(challenge.opaque)}"`);
    return `Digest ${parts.join(', ')}`;
  }

  private validateConfig(): void {
    if (!this.credentials.username || !this.credentials.password) {
      throw new AxProError('AXPRO_CREDENTIALS_INVALID', 'AX PRO credentials are required at request time');
    }
    if (!this.config.host || /[\s/@]/.test(this.config.host)) {
      throw new AxProError('AXPRO_HOST_INVALID', 'AX PRO host is invalid');
    }
    if (this.config.protocol === 'HTTP' && !this.config.allowInsecureHttp && process.env.NODE_ENV === 'production') {
      throw new AxProError('AXPRO_INSECURE_TRANSPORT', 'HTTP is disabled for AX PRO integrations in production unless explicitly enabled');
    }
    if (!Number.isInteger(this.config.port) || this.config.port < 1 || this.config.port > 65535) {
      throw new AxProError('AXPRO_PORT_INVALID', 'AX PRO port must be between 1 and 65535');
    }
  }
}

function parseDigestChallenge(value: string): DigestChallenge | null {
  if (!/^Digest\s/i.test(value)) return null;
  const attributes: Record<string, string> = {};
  const expression = /([a-zA-Z]+)=((?:"[^"]*")|(?:[^,\s]+))/g;
  for (const match of value.replace(/^Digest\s*/i, '').matchAll(expression)) {
    const key = match[1];
    const raw = match[2];
    if (key && raw) attributes[key.toLowerCase()] = raw.replace(/^"|"$/g, '');
  }
  if (!attributes.realm || !attributes.nonce) return null;
  return {
    realm: attributes.realm,
    nonce: attributes.nonce,
    qop: attributes.qop,
    opaque: attributes.opaque,
    algorithm: attributes.algorithm,
  };
}

function escapeAuthValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}


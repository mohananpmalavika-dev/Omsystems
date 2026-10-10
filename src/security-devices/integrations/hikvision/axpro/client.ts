import { createHash, randomBytes } from 'node:crypto';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { validateAxProConnection } from './validation.js';
import { AxProConnectionConfig, AxProCredentials, AxProRawPayload } from './types.js';
import { AxProError } from './errors.js';

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
  // Zone/event identities must retain leading zeroes; mappers explicitly
  // convert telemetry numbers and booleans where appropriate.
  parseTagValue: false,
  processEntities: false,
});

export function parseAxProPayload(body: string, contentType = ''): AxProRawPayload {
  if (!body.trim()) throw new AxProError('AXPRO_PAYLOAD_INVALID', 'AX PRO returned an empty payload', 400);

  if (contentType.includes('xml') || body.trimStart().startsWith('<')) {
    if (/<!DOCTYPE|<!ENTITY/i.test(body) || XMLValidator.validate(body) !== true) {
      throw new AxProError('AXPRO_PAYLOAD_INVALID', 'AX PRO returned invalid XML', 400);
    }
    const parsed = xmlParser.parse(body) as unknown;
    validatePayloadDepth(parsed);
    return isRecord(parsed) ? parsed : { value: parsed };
  }

  try {
    const parsed = JSON.parse(body) as unknown;
    validatePayloadDepth(parsed);
    return isRecord(parsed) ? parsed : { value: parsed };
  } catch {
    throw new AxProError('AXPRO_PAYLOAD_INVALID', 'AX PRO returned invalid JSON', 400);
  }
}

function validatePayloadDepth(value: unknown): void {
  const stack = [{ value, depth: 0 }];
  while (stack.length) {
    const item = stack.pop()!;
    if (item.depth > 48) throw new AxProError('AXPRO_PAYLOAD_INVALID', 'AX PRO payload nesting is too deep', 400);
    if (item.value && typeof item.value === 'object') {
      for (const child of Object.values(item.value)) stack.push({ value: child, depth: item.depth + 1 });
    }
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
    const initialHeaders = { ...baseHeaders, ...(authMethod === 'basic' ? { Authorization: this.basicAuthHeader() } : {}) };

    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 10_000);
    try {
      let response = await this.fetchImpl(url, { method, headers: initialHeaders, signal: controller.signal, redirect: 'error' });
      if (response.status === 401 && authMethod !== 'basic') {
        const challengeHeader = response.headers.get('www-authenticate') || '';
        const challenge = parseDigestChallenge(challengeHeader);
        const authorization = challenge
          ? this.digestAuthHeader(challenge, method, new URL(url).pathname + new URL(url).search)
          : authMethod === 'auto' && /^Basic\s/i.test(challengeHeader) ? this.basicAuthHeader() : undefined;
        await response.body?.cancel();
        if (authorization) response = await this.fetchImpl(url, { method, headers: { ...baseHeaders, Authorization: authorization }, signal: controller.signal, redirect: 'error' });
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new AxProError(
          response.status === 401 ? 'AXPRO_AUTHENTICATION_FAILED' : 'AXPRO_HTTP_ERROR',
          `AX PRO request failed with HTTP ${response.status}`,
          response.status,
        );
      }
      const body = await readAxProBody(response, controller.signal);
      return {
        status: response.status,
        headers: response.headers,
        data: parseAxProPayload(body, response.headers.get('content-type') || ''),
        responseTimeMs: Date.now() - startedAt,
      };
    } catch (error) {
      if (controller.signal.aborted) {
        throw new AxProError('AXPRO_TIMEOUT', 'AX PRO request timed out');
      }
      if (error instanceof AxProError) throw error;
      throw new AxProError(
        'AXPRO_NETWORK_ERROR',
        'AX PRO request could not be completed',
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
    const host = this.config.host.includes(':') && !this.config.host.startsWith('[') ? `[${this.config.host}]` : this.config.host;
    const url = new URL(`${protocol}://${host}:${this.config.port}`);
    url.port = String(this.config.port);
    const endpoint = new URL(path, url);
    if (endpoint.origin !== url.origin) throw new AxProError('AXPRO_INVALID_ENDPOINT', 'AX PRO endpoint origin must match the configured host', 400);
    for (const [key, value] of Object.entries(query || {})) {
      endpoint.searchParams.set(key, value);
    }
    return endpoint.toString();
  }

  private requireEndpoint(name: keyof NonNullable<AxProConnectionConfig['endpointPaths']>): string {
    const endpoint = this.config.endpointPaths?.[name];
    if (!endpoint) {
      throw new AxProError(
        'AXPRO_ENDPOINT_NOT_CONFIGURED',
        `AX PRO ${String(name)} endpoint is not configured for this firmware/model`,
      );
    }
    return endpoint;
  }

  private basicAuthHeader(): string {
    return `Basic ${Buffer.from(`${this.credentials.username}:${this.credentials.password}`, 'utf8').toString('base64')}`;
  }

  private digestAuthHeader(challenge: DigestChallenge, method: string, uri: string): string {
    const algorithm = (challenge.algorithm || 'MD5').toUpperCase();
    if (!['MD5', 'SHA-256', 'MD5-SESS', 'SHA-256-SESS'].includes(algorithm)) {
      throw new AxProError('AXPRO_DIGEST_ALGORITHM_UNSUPPORTED', `Unsupported AX PRO digest algorithm: ${algorithm}`);
    }

    const hash = (value: string) => createHash(algorithm.startsWith('SHA-256') ? 'sha256' : 'md5').update(value).digest('hex');
    const cnonce = randomBytes(16).toString('hex');
    const baseHa1 = hash(`${this.credentials.username}:${challenge.realm}:${this.credentials.password}`);
    const ha1 = algorithm.endsWith('-SESS') ? hash(`${baseHa1}:${challenge.nonce}:${cnonce}`) : baseHa1;
    const ha2 = hash(`${method}:${uri}`);
    const qop = challenge.qop?.split(',').map((item) => item.trim()).find((item) => item === 'auth');
    const nonceCount = '00000001';
    if (challenge.qop && !qop) throw new AxProError('AXPRO_DIGEST_QOP_UNSUPPORTED', 'AX PRO digest requires auth quality of protection');
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
    else if (algorithm.endsWith('-SESS')) parts.push(`cnonce="${cnonce}"`);
    if (challenge.opaque) parts.push(`opaque="${escapeAuthValue(challenge.opaque)}"`);
    return `Digest ${parts.join(', ')}`;
  }

  private validateConfig(): void {
    validateAxProConnection(this.config);
    if (!this.credentials.username || !this.credentials.password) {
      throw new AxProError('AXPRO_CREDENTIALS_INVALID', 'AX PRO credentials are required at request time');
    }
    if (this.config.protocol === 'HTTP' && !this.config.allowInsecureHttp && process.env.NODE_ENV === 'production') {
      throw new AxProError('AXPRO_INSECURE_TRANSPORT', 'HTTP is disabled for AX PRO integrations in production unless explicitly enabled');
    }
    if (!Number.isInteger(this.config.port) || this.config.port < 1 || this.config.port > 65535) {
      throw new AxProError('AXPRO_PORT_INVALID', 'AX PRO port must be between 1 and 65535');
    }
  }
}

export const AXPRO_MAX_BODY_BYTES = 1_048_576;

/** Keep the deadline active through body streaming, including digest retries. */
export async function readAxProBody(response: Response | Request, signal?: AbortSignal): Promise<string> {
  if (Number(response.headers.get('content-length')) > AXPRO_MAX_BODY_BYTES) throw new AxProError('AXPRO_PAYLOAD_TOO_LARGE', 'AX PRO payload exceeds 1 MiB', 413);
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let completed = false;
  const abort = () => { void reader.cancel().catch(() => { }); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      if (signal?.aborted) throw new AxProError('AXPRO_TIMEOUT', 'AX PRO request timed out');
      const { done, value } = await reader.read();
      if (signal?.aborted) throw new AxProError('AXPRO_TIMEOUT', 'AX PRO request timed out');
      if (done) { completed = true; break; }
      length += value.byteLength;
      if (length > AXPRO_MAX_BODY_BYTES) throw new AxProError('AXPRO_PAYLOAD_TOO_LARGE', 'AX PRO payload exceeds 1 MiB', 413);
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    signal?.removeEventListener('abort', abort);
    if (!completed) await reader.cancel().catch(() => { });
    reader.releaseLock();
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


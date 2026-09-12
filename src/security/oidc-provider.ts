/**
 * OIDC Authorization Code + PKCE provider.
 *
 * Production enterprise authentication supporting Google Workspace, Okta,
 * Azure AD, Keycloak, Auth0, and generic OIDC Identity Providers.
 *
 * Authentication is performed via standard OIDC authorization-code exchange
 * with PKCE (S256), cryptographic nonce validation, state anti-replay protection,
 * and JWKS cryptographic signature verification.
 */

import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  ClientSecretBasic,
  ClientSecretPost,
  discovery,
  fetchUserInfo,
  None,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
  type Configuration,
} from "openid-client";
import { Redis } from "ioredis";
import { createPublicKey, verify, createHash } from "node:crypto";
import { pool } from "../database/pool.js";
import {
  type IOidcRepository,
  PostgresOidcRepository,
  MemoryOidcRepository,
} from "../database/oidc-repository.js";

export type OIDCProviderType =
  | "google"
  | "okta"
  | "azure-ad"
  | "auth0"
  | "keycloak"
  | "generic";

export interface OIDCTenantConfig {
  tenantId: string;
  provider: OIDCProviderType;
  issuerUrl: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userinfoEndpoint?: string;
  jwksUri?: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scopes?: string[];
  hostedDomain?: string; // Google Workspace 'hd' claim restriction
  allowedDomains?: string[]; // Allowed email domain whitelist
  attributeMapping?: {
    userId?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    displayName?: string;
    groups?: string;
  };
  roleMapping?: Record<string, string[]>;
  defaultRole?: string;
  requirePKCE?: boolean;
  requireStateValidation?: boolean;
  clockToleranceSeconds?: number;
  sessionDurationSeconds?: number;
  validateEmailVerified?: boolean;
  isEnabled?: boolean;
  metadata?: Record<string, unknown>;
}

export interface OIDCSession {
  state: string;
  nonce: string;
  codeVerifier: string;
  tenantId: string;
  redirectUrl?: string;
  createdAt: number;
}

export interface OIDCUserProfile {
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName: string;
  groups?: string[];
  roles?: string[];
  hostedDomain?: string;
  provider: OIDCProviderType;
  rawClaims: Record<string, unknown>;
}

export interface OIDCDiscoveryHealth {
  healthy: boolean;
  tenantId: string;
  provider: OIDCProviderType;
  issuer: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userinfoEndpoint?: string;
  jwksUri?: string;
  latencyMs: number;
  error?: string;
}

interface OIDCStateStore {
  set(state: string, session: OIDCSession, ttlSeconds: number): Promise<void>;
  get(state: string): Promise<OIDCSession | undefined>;
  delete(state: string): Promise<void>;
}

class MemoryOIDCStateStore implements OIDCStateStore {
  private readonly sessions = new Map<string, OIDCSession>();

  async set(state: string, session: OIDCSession, _ttlSeconds: number): Promise<void> {
    this.sessions.set(state, session);
  }

  async get(state: string): Promise<OIDCSession | undefined> {
    const session = this.sessions.get(state);
    if (session && Date.now() - session.createdAt > 15 * 60 * 1000) {
      this.sessions.delete(state);
      return undefined;
    }
    return session;
  }

  async delete(state: string): Promise<void> {
    this.sessions.delete(state);
  }
}

class RedisOIDCStateStore implements OIDCStateStore {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = "sentinel:oidc:state:",
  ) {}

  async set(state: string, session: OIDCSession, ttlSeconds: number): Promise<void> {
    await this.redis.set(`${this.prefix}${state}`, JSON.stringify(session), "EX", ttlSeconds);
  }

  async get(state: string): Promise<OIDCSession | undefined> {
    const value = await this.redis.get(`${this.prefix}${state}`);
    if (!value) return undefined;
    try {
      const parsed = JSON.parse(value) as Partial<OIDCSession>;
      if (
        typeof parsed.state !== "string" ||
        typeof parsed.nonce !== "string" ||
        typeof parsed.codeVerifier !== "string" ||
        typeof parsed.tenantId !== "string" ||
        typeof parsed.createdAt !== "number"
      ) return undefined;
      return parsed as OIDCSession;
    } catch {
      return undefined;
    }
  }

  async delete(state: string): Promise<void> {
    await this.redis.del(`${this.prefix}${state}`);
  }
}

function createDefaultStateStore(): OIDCStateStore {
  const rawRedisUrl = process.env.REDIS_URL;
  if (rawRedisUrl) {
    try {
      const parsed = new URL(rawRedisUrl);
      const options: any = {
        host: parsed.hostname,
        port: parseInt(parsed.port || "6379", 10),
        password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        lazyConnect: false,
        retryStrategy: () => null,
      };
      if (parsed.username && parsed.username !== "default") {
        options.username = decodeURIComponent(parsed.username);
      }
      const client = new Redis(options);
      client.on("error", (err) => {
        console.warn("[OIDCProvider] Redis state store warning:", err.message);
      });
      return new RedisOIDCStateStore(client);
    } catch (err) {
      console.warn("[OIDCProvider] Failed to create Redis state store:", err);
    }
  }

  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_MEMORY_STORE) {
    return {
      set: async () => { throw new Error("OIDC_STATE_STORE_UNAVAILABLE"); },
      get: async () => { throw new Error("OIDC_STATE_STORE_UNAVAILABLE"); },
      delete: async () => { throw new Error("OIDC_STATE_STORE_UNAVAILABLE"); },
    };
  }

  return new MemoryOIDCStateStore();
}

/**
 * Provider template presets for rapid and secure enterprise configuration.
 */
export function getOidcProviderPreset(
  provider: OIDCProviderType,
  options: {
    tenantId: string;
    clientId: string;
    clientSecret?: string;
    redirectUri: string;
    domain?: string;
    hostedDomain?: string;
  },
): OIDCTenantConfig {
  switch (provider) {
    case "google": {
      return {
        tenantId: options.tenantId,
        provider: "google",
        issuerUrl: "https://accounts.google.com",
        authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenEndpoint: "https://oauth2.googleapis.com/token",
        userinfoEndpoint: "https://openidconnect.googleapis.com/v1/userinfo",
        jwksUri: "https://www.googleapis.com/oauth2/v3/certs",
        clientId: options.clientId,
        clientSecret: options.clientSecret,
        redirectUri: options.redirectUri,
        scopes: ["openid", "profile", "email"],
        hostedDomain: options.hostedDomain,
        validateEmailVerified: true,
        attributeMapping: {
          userId: "sub",
          email: "email",
          displayName: "name",
          firstName: "given_name",
          lastName: "family_name",
        },
        requirePKCE: true,
      };
    }
    case "okta": {
      const oktaDomain = options.domain || "dev-sample.okta.com";
      const issuerUrl = oktaDomain.startsWith("http")
        ? oktaDomain.replace(/\/$/, "")
        : `https://${oktaDomain.replace(/\/$/, "")}`;
      return {
        tenantId: options.tenantId,
        provider: "okta",
        issuerUrl,
        authorizationEndpoint: `${issuerUrl}/v1/authorize`,
        tokenEndpoint: `${issuerUrl}/v1/token`,
        userinfoEndpoint: `${issuerUrl}/v1/userinfo`,
        jwksUri: `${issuerUrl}/v1/keys`,
        clientId: options.clientId,
        clientSecret: options.clientSecret,
        redirectUri: options.redirectUri,
        scopes: ["openid", "profile", "email", "groups"],
        validateEmailVerified: true,
        attributeMapping: {
          userId: "sub",
          email: "email",
          displayName: "name",
          groups: "groups",
        },
        requirePKCE: true,
      };
    }
    case "azure-ad": {
      const tenant = options.domain || "common";
      const issuerUrl = `https://login.microsoftonline.com/${tenant}/v2.0`;
      return {
        tenantId: options.tenantId,
        provider: "azure-ad",
        issuerUrl,
        authorizationEndpoint: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
        tokenEndpoint: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
        userinfoEndpoint: `https://graph.microsoft.com/oidc/userinfo`,
        jwksUri: `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`,
        clientId: options.clientId,
        clientSecret: options.clientSecret,
        redirectUri: options.redirectUri,
        scopes: ["openid", "profile", "email"],
        attributeMapping: {
          userId: "oid",
          email: "preferred_username",
          displayName: "name",
          groups: "roles",
        },
        requirePKCE: true,
      };
    }
    default: {
      return {
        tenantId: options.tenantId,
        provider: "generic",
        issuerUrl: options.domain || "https://sso.enterprise.local",
        clientId: options.clientId,
        clientSecret: options.clientSecret,
        redirectUri: options.redirectUri,
        scopes: ["openid", "profile", "email"],
        requirePKCE: true,
      };
    }
  }
}

export class OIDCProvider {
  private readonly configs = new Map<string, OIDCTenantConfig>();
  private readonly clients = new Map<string, Configuration>();
  private readonly jwksKeyCache = new Map<string, { keys: any[]; fetchedAt: number }>();
  private readonly stateTtlSeconds = 15 * 60;
  private readonly repository: IOidcRepository;

  constructor(
    private readonly stateStore: OIDCStateStore = createDefaultStateStore(),
    repository?: IOidcRepository,
  ) {
    if (repository) {
      this.repository = repository;
    } else if (pool) {
      this.repository = new PostgresOidcRepository(pool);
    } else {
      this.repository = new MemoryOidcRepository();
    }
  }

  async registerTenant(config: OIDCTenantConfig): Promise<void> {
    const issuer = new URL(config.issuerUrl);
    const redirect = new URL(config.redirectUri);
    if (process.env.NODE_ENV === "production" && (issuer.protocol !== "https:" || redirect.protocol !== "https:")) {
      throw new Error("OIDC issuer and redirect URI must use HTTPS in production");
    }

    const sanitized: OIDCTenantConfig = {
      ...config,
      issuerUrl: issuer.toString().replace(/\/$/, ""),
      redirectUri: redirect.toString(),
      scopes: config.scopes?.length ? config.scopes : ["openid", "profile", "email"],
      requirePKCE: true,
      requireStateValidation: true,
      clockToleranceSeconds: config.clockToleranceSeconds ?? 60,
      sessionDurationSeconds: config.sessionDurationSeconds ?? 480 * 60,
      validateEmailVerified: config.validateEmailVerified ?? true,
      isEnabled: config.isEnabled ?? true,
    };

    // Store in-memory cache and persist in repository
    this.configs.set(sanitized.tenantId, sanitized);
    this.clients.delete(sanitized.tenantId);
    this.jwksKeyCache.delete(sanitized.tenantId);

    try {
      await this.repository.saveTenantConfig(sanitized);
    } catch (err) {
      console.warn(`[OIDCProvider] Warning: failed to persist tenant config for ${sanitized.tenantId}:`, err);
    }
  }

  async initiateLogin(
    tenantId: string,
    redirectUrl?: string,
    extraParams?: { prompt?: string; loginHint?: string },
  ): Promise<{ authUrl: string; state: string; nonce: string }> {
    const config = await this.requireTenant(tenantId);
    const state = randomState();
    const nonce = randomNonce();
    const codeVerifier = randomPKCECodeVerifier();
    const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);

    await this.stateStore.set(state, {
      state,
      nonce,
      codeVerifier,
      tenantId,
      ...(redirectUrl ? { redirectUrl } : {}),
      createdAt: Date.now(),
    }, this.stateTtlSeconds);

    const params: Record<string, string> = {
      client_id: config.clientId,
      response_type: "code",
      redirect_uri: config.redirectUri,
      scope: (config.scopes ?? ["openid", "profile", "email"]).join(" "),
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    };

    // Google Workspace specific enhancements
    if (config.provider === "google") {
      if (config.hostedDomain) {
        params.hd = config.hostedDomain;
      }
      params.access_type = "offline";
      params.prompt = extraParams?.prompt || "consent";
    }

    if (extraParams?.loginHint) {
      params.login_hint = extraParams.loginHint;
    }
    if (extraParams?.prompt && config.provider !== "google") {
      params.prompt = extraParams.prompt;
    }

    let authUrl: string;
    if (config.authorizationEndpoint) {
      const parsedAuth = new URL(config.authorizationEndpoint);
      for (const [k, v] of Object.entries(params)) {
        parsedAuth.searchParams.set(k, v);
      }
      authUrl = parsedAuth.toString();
    } else {
      try {
        const client = await this.getClient(config);
        authUrl = buildAuthorizationUrl(client, params).toString();
      } catch (err) {
        const fallbackEndpoint = this.getNonProductionEndpoint(config);
        const parsed = new URL(fallbackEndpoint);
        for (const [k, v] of Object.entries(params)) {
          parsed.searchParams.set(k, v);
        }
        authUrl = parsed.toString();
      }
    }

    try {
      await this.repository.recordAuditEvent({
        tenantId,
        eventType: "LOGIN_INITIATED",
        provider: config.provider,
        metadata: { redirectUrl, statePrefix: state.substring(0, 8) },
      });
    } catch {
      // Non-blocking audit record
    }

    return { authUrl, state, nonce };
  }

  async handleCallback(
    callbackParams: { code?: string; state: string; id_token?: string; error?: string; error_description?: string },
  ): Promise<{ profile: OIDCUserProfile; tenantId: string; redirectUrl?: string }> {
    if (callbackParams.error) {
      throw new Error(`OIDC IdP returned error: ${callbackParams.error} - ${callbackParams.error_description ?? ""}`);
    }
    if (callbackParams.id_token) {
      throw new Error("OIDC_ID_TOKEN_CALLBACK_NOT_SUPPORTED_USE_AUTHORIZATION_CODE");
    }
    if (!callbackParams.code) throw new Error("OIDC_AUTHORIZATION_CODE_REQUIRED");

    const session = await this.stateStore.get(callbackParams.state);
    if (!session || session.state !== callbackParams.state) throw new Error("Invalid or expired OIDC state");
    
    // Single-use anti-replay consumption
    await this.stateStore.delete(callbackParams.state);

    const config = await this.requireTenant(session.tenantId);
    let allClaims: Record<string, unknown>;

    try {
      const client = await this.getClient(config);
      const callbackUrl = new URL(config.redirectUri);
      callbackUrl.searchParams.set("code", callbackParams.code);
      callbackUrl.searchParams.set("state", callbackParams.state);

      const tokenSet = await authorizationCodeGrant(client, callbackUrl, {
        expectedState: session.state,
        expectedNonce: session.nonce,
        pkceCodeVerifier: session.codeVerifier,
      });

      const claims = tokenSet.claims();
      if (!claims?.sub) throw new Error("OIDC token response did not contain a validated ID token subject");

      const userInfo = tokenSet.access_token && client.serverMetadata().userinfo_endpoint
        ? await fetchUserInfo(client, tokenSet.access_token, claims.sub)
        : undefined;

      allClaims = { ...claims, ...(userInfo ?? {}) } as Record<string, unknown>;
    } catch (discoveryOrGrantError: any) {
      // If code was mock/simulated or discovery failed in air-gapped test environment
      throw new Error(`OIDC token exchange failed: ${discoveryOrGrantError?.message}`);
    }

    // Map and strictly validate identity claims
    const profile = this.mapClaimsToUserProfile(allClaims, config);

    try {
      await this.repository.recordAuditEvent({
        tenantId: session.tenantId,
        eventType: "LOGIN_SUCCESS",
        userId: profile.userId,
        email: profile.email,
        provider: config.provider,
      });
    } catch {
      // Non-blocking
    }

    return {
      profile,
      tenantId: session.tenantId,
      ...(session.redirectUrl ? { redirectUrl: session.redirectUrl } : {}),
    };
  }

  /**
   * Cryptographically validates an ID token against the IdP's JWKS.
   * Useful for manual token validation, adapter testing, and token introspection.
   */
  async verifyIdToken(
    config: OIDCTenantConfig,
    idToken: string,
    expectedNonce?: string,
  ): Promise<Record<string, unknown>> {
    const [part0, part1, part2] = idToken.split(".");
    if (!part0 || !part1 || !part2) {
      throw new Error("Invalid JWT token format: expected 3 segments");
    }

    const header = JSON.parse(Buffer.from(part0, "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(part1, "base64url").toString("utf8"));
    const signature = Buffer.from(part2, "base64url");
    const signingInput = Buffer.from(`${part0}.${part1}`);

    // Validate standard claims
    const now = Math.floor(Date.now() / 1000);
    const tolerance = config.clockToleranceSeconds ?? 60;

    if (!payload.iss || !payload.iss.startsWith(config.issuerUrl)) {
      throw new Error(`Token issuer mismatch: expected ${config.issuerUrl}, got ${payload.iss}`);
    }
    if (!payload.aud || (payload.aud !== config.clientId && !payload.aud.includes?.(config.clientId))) {
      throw new Error(`Token audience mismatch: expected ${config.clientId}, got ${payload.aud}`);
    }
    if (payload.exp && payload.exp < now - tolerance) {
      throw new Error(`Token has expired at ${new Date(payload.exp * 1000).toISOString()}`);
    }
    if (payload.nbf && payload.nbf > now + tolerance) {
      throw new Error(`Token not yet valid until ${new Date(payload.nbf * 1000).toISOString()}`);
    }
    if (expectedNonce && payload.nonce !== expectedNonce) {
      throw new Error(`Token nonce mismatch: expected ${expectedNonce}, got ${payload.nonce}`);
    }

    // Google Workspace hosted domain validation
    if (config.provider === "google" && config.hostedDomain) {
      if (payload.hd !== config.hostedDomain) {
        throw new Error(`Google Workspace hosted domain mismatch: expected ${config.hostedDomain}, got ${payload.hd}`);
      }
    }

    // Email verification check
    if (config.validateEmailVerified !== false && payload.email) {
      if (payload.email_verified === false) {
        throw new Error("OIDC identity rejected: email address has not been verified by provider");
      }
    }

    // Allowed domains check
    if (config.allowedDomains && config.allowedDomains.length > 0 && payload.email) {
      const emailDomain = payload.email.split("@")[1]?.toLowerCase();
      if (!emailDomain || !config.allowedDomains.map((d) => d.toLowerCase()).includes(emailDomain)) {
        throw new Error(`Email domain '${emailDomain}' is not permitted for tenant ${config.tenantId}`);
      }
    }

    // Cryptographic signature check against JWKS
    const jwks = await this.getJwksKeys(config);
    const key = jwks.find((k) => !header.kid || k.kid === header.kid);
    if (!key) {
      throw new Error(`No matching JWKS key found for kid '${header.kid}'`);
    }

    const publicKey = createPublicKey({ key, format: "jwk" });
    const verified = verify(
      header.alg === "RS256" ? "RSA-SHA256" : header.alg === "ES256" ? "sha256" : "RSA-SHA256",
      signingInput,
      publicKey,
      signature,
    );

    if (!verified) {
      throw new Error("ID token cryptographic signature verification failed");
    }

    return payload;
  }

  /**
   * Health and connectivity test for an OIDC tenant configuration
   */
  async testDiscovery(tenantIdOrConfig: string | OIDCTenantConfig): Promise<OIDCDiscoveryHealth> {
    const startTime = Date.now();
    let config: OIDCTenantConfig;
    if (typeof tenantIdOrConfig === "string") {
      const found = await this.getTenantConfig(tenantIdOrConfig);
      if (!found) {
        return {
          healthy: false,
          tenantId: tenantIdOrConfig,
          provider: "generic",
          issuer: "unknown",
          latencyMs: 0,
          error: `Tenant '${tenantIdOrConfig}' not configured`,
        };
      }
      config = found;
    } else {
      config = tenantIdOrConfig;
    }

    try {
      const client = await this.getClient(config);
      const serverMetadata = client.serverMetadata();
      const latencyMs = Date.now() - startTime;
      return {
        healthy: true,
        tenantId: config.tenantId,
        provider: config.provider,
        issuer: serverMetadata.issuer,
        authorizationEndpoint: serverMetadata.authorization_endpoint,
        tokenEndpoint: serverMetadata.token_endpoint,
        userinfoEndpoint: serverMetadata.userinfo_endpoint,
        jwksUri: serverMetadata.jwks_uri,
        latencyMs,
      };
    } catch (err: any) {
      return {
        healthy: false,
        tenantId: config.tenantId,
        provider: config.provider,
        issuer: config.issuerUrl,
        latencyMs: Date.now() - startTime,
        error: err.message || "Failed to discover OIDC provider metadata",
      };
    }
  }

  private async getJwksKeys(config: OIDCTenantConfig): Promise<any[]> {
    const cached = this.jwksKeyCache.get(config.tenantId);
    if (cached && Date.now() - cached.fetchedAt < 3600 * 1000) {
      return cached.keys;
    }

    const jwksUri = config.jwksUri || `${config.issuerUrl}/.well-known/jwks.json`;
    const res = await fetch(jwksUri);
    if (!res.ok) throw new Error(`Failed to fetch JWKS from ${jwksUri}: HTTP ${res.status}`);
    const data = await res.json() as { keys: any[] };
    if (!Array.isArray(data.keys)) throw new Error("Invalid JWKS payload: 'keys' array missing");

    this.jwksKeyCache.set(config.tenantId, { keys: data.keys, fetchedAt: Date.now() });
    return data.keys;
  }

  private async getClient(config: OIDCTenantConfig): Promise<Configuration> {
    const existing = this.clients.get(config.tenantId);
    if (existing) return existing;

    const authMethod = config.clientSecret ? "client_secret_basic" : "none";
    const client = await discovery(
      new URL(config.issuerUrl),
      config.clientId,
      {
        ...(config.clientSecret ? { client_secret: config.clientSecret } : {}),
        redirect_uris: [config.redirectUri],
        response_types: ["code"],
        token_endpoint_auth_method: authMethod,
      },
      config.clientSecret ? ClientSecretBasic(config.clientSecret) : None(),
    );
    this.clients.set(config.tenantId, client);
    return client;
  }

  private mapClaimsToUserProfile(claims: Record<string, unknown>, config: OIDCTenantConfig): OIDCUserProfile {
    const mapping = config.attributeMapping ?? {};
    const userId = this.claimString(claims, mapping.userId) ?? this.claimString(claims, "sub");
    const email = this.claimString(claims, mapping.email) ?? this.claimString(claims, "email") ?? this.claimString(claims, "preferred_username");
    if (!userId || !email) throw new Error("OIDC identity is missing required sub or email claims");

    // Google Workspace hosted domain validation
    if (config.provider === "google" && config.hostedDomain) {
      const hd = this.claimString(claims, "hd");
      if (hd !== config.hostedDomain) {
        throw new Error(`Google Workspace hosted domain mismatch: expected ${config.hostedDomain}, got ${hd ?? "none"}`);
      }
    }

    // Email verification validation
    if (config.validateEmailVerified !== false && claims.email) {
      if (claims.email_verified === false) {
        throw new Error("OIDC identity rejected: email address has not been verified by provider");
      }
    }

    // Allowed domains whitelist validation
    if (config.allowedDomains && config.allowedDomains.length > 0) {
      const emailDomain = email.split("@")[1]?.toLowerCase();
      if (!emailDomain || !config.allowedDomains.map((d) => d.toLowerCase()).includes(emailDomain)) {
        throw new Error(`Email domain '${emailDomain}' is not permitted for tenant ${config.tenantId}`);
      }
    }

    const displayName = this.claimString(claims, mapping.displayName) ?? this.claimString(claims, "name") ?? email;

    // Groups resolution (supporting Okta, Azure AD roles, and generic attributes)
    const groupsValue = claims[mapping.groups ?? "groups"] ?? claims.roles;
    const groups = Array.isArray(groupsValue) ? groupsValue.map(String) : groupsValue ? [String(groupsValue)] : [];

    // Map external groups to internal banking roles
    const roles: string[] = [];
    if (config.roleMapping) {
      for (const [extGroup, intRoles] of Object.entries(config.roleMapping)) {
        if (groups.includes(extGroup)) {
          roles.push(...intRoles);
        }
      }
    }
    if (roles.length === 0 && config.defaultRole) {
      roles.push(config.defaultRole);
    }

    return {
      userId,
      email: email.toLowerCase(),
      firstName: this.claimString(claims, mapping.firstName) ?? this.claimString(claims, "given_name"),
      lastName: this.claimString(claims, mapping.lastName) ?? this.claimString(claims, "family_name"),
      displayName,
      groups,
      roles: Array.from(new Set(roles)),
      hostedDomain: this.claimString(claims, "hd"),
      provider: config.provider,
      rawClaims: claims,
    };
  }

  private claimString(claims: Record<string, unknown>, key: string | undefined): string | undefined {
    const value = key ? claims[key] : undefined;
    return typeof value === "string" && value.trim() ? value : undefined;
  }

  private getNonProductionEndpoint(config: OIDCTenantConfig): string {
    if (process.env.NODE_ENV === "production" && !process.env.ALLOW_LOCAL_DISCOVERY) {
      throw new Error("OIDC authorization endpoint must be configured or obtained through provider discovery");
    }
    if (config.authorizationEndpoint) return config.authorizationEndpoint;
    const suffix = config.provider === "google"
      ? "/o/oauth2/v2/auth"
      : config.provider === "okta"
        ? "/v1/authorize"
        : config.provider === "azure-ad"
          ? "/oauth2/v2.0/authorize"
          : config.provider === "keycloak"
            ? "/protocol/openid-connect/auth"
            : "/authorize";
    return `${config.issuerUrl}${suffix}`;
  }

  private async requireTenant(tenantId: string): Promise<OIDCTenantConfig> {
    const config = await this.getTenantConfig(tenantId);
    if (!config) throw new Error(`OIDC configuration not found for tenant: ${tenantId}`);
    return config;
  }

  async getTenantConfig(tenantId: string): Promise<OIDCTenantConfig | undefined> {
    const cached = this.configs.get(tenantId);
    if (cached) return cached;

    const fromDb = await this.repository.getTenantConfig(tenantId);
    if (fromDb) {
      this.configs.set(tenantId, fromDb);
      return fromDb;
    }
    return undefined;
  }

  async removeTenant(tenantId: string): Promise<void> {
    this.configs.delete(tenantId);
    this.clients.delete(tenantId);
    this.jwksKeyCache.delete(tenantId);
    await this.repository.deleteTenantConfig(tenantId);
  }

  async listTenants(): Promise<OIDCTenantConfig[]> {
    return this.repository.listTenantConfigs();
  }
}

export const oidcProvider = new OIDCProvider();

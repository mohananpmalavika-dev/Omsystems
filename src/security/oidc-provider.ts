/**
 * OIDC Authorization Code + PKCE provider.
 *
 * Production authentication is deliberately limited to an authorization-code
 * exchange performed by openid-client. That library validates issuer,
 * audience, expiration, nonce, and JWKS signatures from discovered metadata.
 * This module never decodes and trusts a JWT payload.
 */

import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  ClientSecretBasic,
  discovery,
  fetchUserInfo,
  None,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
  type Configuration,
} from "openid-client";
import { Redis } from "ioredis";

export interface OIDCTenantConfig {
  tenantId: string;
  provider: "azure-ad" | "okta" | "auth0" | "keycloak" | "google" | "generic";
  issuerUrl: string;
  authorizationEndpoint?: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scopes?: string[];
  attributeMapping?: {
    userId?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    displayName?: string;
    groups?: string;
  };
  requirePKCE?: boolean;
  requireStateValidation?: boolean;
  clockToleranceSeconds?: number;
  sessionDurationSeconds?: number;
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
  rawClaims: Record<string, unknown>;
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
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const client = new Redis(redisUrl, {
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        lazyConnect: false,
      });
      client.on("error", (err) => {
        console.warn("[OIDCProvider] Redis state store connection warning:", err.message);
      });
      return new RedisOIDCStateStore(client);
    } catch (err) {
      console.warn("[OIDCProvider] Failed to create Redis state store:", err);
    }
  }

  if (process.env.NODE_ENV === "production") {
    return {
      set: async () => { throw new Error("OIDC_STATE_STORE_UNAVAILABLE"); },
      get: async () => { throw new Error("OIDC_STATE_STORE_UNAVAILABLE"); },
      delete: async () => { throw new Error("OIDC_STATE_STORE_UNAVAILABLE"); },
    };
  }

  // Local state is intentionally available only outside production.
  return new MemoryOIDCStateStore();
}

export class OIDCProvider {
  private readonly configs = new Map<string, OIDCTenantConfig>();
  private readonly clients = new Map<string, Configuration>();
  private readonly stateTtlSeconds = 15 * 60;

  constructor(private readonly stateStore: OIDCStateStore = createDefaultStateStore()) {}

  async registerTenant(config: OIDCTenantConfig): Promise<void> {
    const issuer = new URL(config.issuerUrl);
    const redirect = new URL(config.redirectUri);
    if (process.env.NODE_ENV === "production" && (issuer.protocol !== "https:" || redirect.protocol !== "https:")) {
      throw new Error("OIDC issuer and redirect URI must use HTTPS in production");
    }

    this.configs.set(config.tenantId, {
      ...config,
      issuerUrl: issuer.toString().replace(/\/$/, ""),
      redirectUri: redirect.toString(),
      scopes: config.scopes?.length ? config.scopes : ["openid", "profile", "email"],
      // These checks are mandatory for the production authorization-code flow.
      requirePKCE: true,
      requireStateValidation: true,
      clockToleranceSeconds: config.clockToleranceSeconds ?? 60,
      sessionDurationSeconds: config.sessionDurationSeconds ?? 480 * 60,
    });
    this.clients.delete(config.tenantId);
  }

  async initiateLogin(tenantId: string, redirectUrl?: string): Promise<{ authUrl: string; state: string; nonce: string }> {
    const config = this.requireTenant(tenantId);
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
    };
    params.code_challenge = codeChallenge;
    params.code_challenge_method = "S256";

    // Discovery is mandatory before the callback exchange. This endpoint only
    // controls the browser redirect and never validates identity claims.
    let authUrl: string;
    if (process.env.NODE_ENV === "production" || config.authorizationEndpoint) {
      const client = await this.getClient(config);
      authUrl = buildAuthorizationUrl(client, params).toString();
    } else {
      const authorizationEndpoint = this.getNonProductionEndpoint(config);
      authUrl = `${authorizationEndpoint}${authorizationEndpoint.includes("?") ? "&" : "?"}${new URLSearchParams(params).toString()}`;
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
    // State is single-use even if token exchange fails.
    await this.stateStore.delete(callbackParams.state);

    const config = this.requireTenant(session.tenantId);
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
    const allClaims = { ...claims, ...(userInfo ?? {}) } as Record<string, unknown>;

    return {
      profile: this.mapClaimsToUserProfile(allClaims, config),
      tenantId: session.tenantId,
      ...(session.redirectUrl ? { redirectUrl: session.redirectUrl } : {}),
    };
  }

  private async getClient(config: OIDCTenantConfig): Promise<Configuration> {
    const existing = this.clients.get(config.tenantId);
    if (existing) return existing;

    const client = await discovery(
      new URL(config.issuerUrl),
      config.clientId,
      {
        ...(config.clientSecret ? { client_secret: config.clientSecret } : {}),
        redirect_uris: [config.redirectUri],
        response_types: ["code"],
        token_endpoint_auth_method: config.clientSecret ? "client_secret_basic" : "none",
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

    const displayName = this.claimString(claims, mapping.displayName) ?? this.claimString(claims, "name") ?? email;
    const groupsValue = claims[mapping.groups ?? "groups"] ?? claims.roles;
    const groups = Array.isArray(groupsValue) ? groupsValue.map(String) : groupsValue ? [String(groupsValue)] : [];

    return {
      userId,
      email: email.toLowerCase(),
      firstName: this.claimString(claims, mapping.firstName) ?? this.claimString(claims, "given_name"),
      lastName: this.claimString(claims, mapping.lastName) ?? this.claimString(claims, "family_name"),
      displayName,
      groups,
      rawClaims: claims,
    };
  }

  private claimString(claims: Record<string, unknown>, key: string | undefined): string | undefined {
    const value = key ? claims[key] : undefined;
    return typeof value === "string" && value.trim() ? value : undefined;
  }

  private getNonProductionEndpoint(config: OIDCTenantConfig): string {
    if (process.env.NODE_ENV === "production") {
      throw new Error("OIDC authorization endpoint must be configured or obtained through provider discovery");
    }
    const suffix = config.provider === "azure-ad"
      ? "/oauth2/v2.0/authorize"
      : config.provider === "keycloak"
        ? "/protocol/openid-connect/auth"
        : "/authorize";
    return `${config.issuerUrl}${suffix}`;
  }

  private requireTenant(tenantId: string): OIDCTenantConfig {
    const config = this.configs.get(tenantId);
    if (!config) throw new Error(`OIDC configuration not found for tenant: ${tenantId}`);
    return config;
  }

  getTenantConfig(tenantId: string): OIDCTenantConfig | undefined {
    return this.configs.get(tenantId);
  }

  removeTenant(tenantId: string): void {
    this.configs.delete(tenantId);
    this.clients.delete(tenantId);
  }
}

export const oidcProvider = new OIDCProvider();

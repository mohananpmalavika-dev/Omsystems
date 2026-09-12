/**
 * Authoritative PostgreSQL Repository for OpenID Connect (OIDC) Single Sign-On
 * Provides durable multi-tenant configuration storage and immutable security audit logs.
 */

import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import type { OIDCTenantConfig } from "../security/oidc-provider.js";

export interface OidcAuditRecord {
  id?: string;
  tenantId: string;
  eventType:
    | "LOGIN_INITIATED"
    | "LOGIN_SUCCESS"
    | "LOGIN_FAILED"
    | "TOKEN_REFRESHED"
    | "SESSION_REVOKED"
    | "CONFIG_SAVED"
    | "CONFIG_DELETED";
  userId?: string;
  email?: string;
  provider: string;
  clientIp?: string;
  userAgent?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface IOidcRepository {
  saveTenantConfig(config: OIDCTenantConfig): Promise<void>;
  getTenantConfig(tenantId: string): Promise<OIDCTenantConfig | null>;
  listTenantConfigs(): Promise<OIDCTenantConfig[]>;
  deleteTenantConfig(tenantId: string): Promise<boolean>;
  recordAuditEvent(event: OidcAuditRecord): Promise<void>;
  getAuditEvents(tenantId: string, limit?: number): Promise<OidcAuditRecord[]>;
}

export class PostgresOidcRepository implements IOidcRepository {
  constructor(private readonly pool: Pool) {}

  async saveTenantConfig(config: OIDCTenantConfig): Promise<void> {
    const query = `
      INSERT INTO oidc_tenant_configs (
        tenant_id, provider, issuer_url, client_id, client_secret,
        redirect_uri, scopes, authorization_endpoint, token_endpoint,
        userinfo_endpoint, jwks_uri, hosted_domain, allowed_domains,
        attribute_mapping, role_mapping, default_role, require_pkce,
        require_state_validation, clock_tolerance_seconds, session_duration_seconds,
        is_enabled, metadata, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13,
        $14, $15, $16, $17,
        $18, $19, $20,
        $21, $22, NOW()
      )
      ON CONFLICT (tenant_id) DO UPDATE SET
        provider = EXCLUDED.provider,
        issuer_url = EXCLUDED.issuer_url,
        client_id = EXCLUDED.client_id,
        client_secret = COALESCE(EXCLUDED.client_secret, oidc_tenant_configs.client_secret),
        redirect_uri = EXCLUDED.redirect_uri,
        scopes = EXCLUDED.scopes,
        authorization_endpoint = EXCLUDED.authorization_endpoint,
        token_endpoint = EXCLUDED.token_endpoint,
        userinfo_endpoint = EXCLUDED.userinfo_endpoint,
        jwks_uri = EXCLUDED.jwks_uri,
        hosted_domain = EXCLUDED.hosted_domain,
        allowed_domains = EXCLUDED.allowed_domains,
        attribute_mapping = EXCLUDED.attribute_mapping,
        role_mapping = EXCLUDED.role_mapping,
        default_role = EXCLUDED.default_role,
        require_pkce = EXCLUDED.require_pkce,
        require_state_validation = EXCLUDED.require_state_validation,
        clock_tolerance_seconds = EXCLUDED.clock_tolerance_seconds,
        session_duration_seconds = EXCLUDED.session_duration_seconds,
        is_enabled = EXCLUDED.is_enabled,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    `;

    const values = [
      config.tenantId,
      config.provider,
      config.issuerUrl,
      config.clientId,
      config.clientSecret ?? null,
      config.redirectUri,
      config.scopes ?? ["openid", "profile", "email"],
      config.authorizationEndpoint ?? null,
      config.tokenEndpoint ?? null,
      config.userinfoEndpoint ?? null,
      config.jwksUri ?? null,
      config.hostedDomain ?? null,
      config.allowedDomains ?? [],
      JSON.stringify(config.attributeMapping ?? {}),
      JSON.stringify(config.roleMapping ?? {}),
      config.defaultRole ?? "BANK_OPERATOR",
      config.requirePKCE ?? true,
      config.requireStateValidation ?? true,
      config.clockToleranceSeconds ?? 60,
      config.sessionDurationSeconds ?? 28800,
      config.isEnabled ?? true,
      JSON.stringify(config.metadata ?? {}),
    ];

    await this.pool.query(query, values);
  }

  async getTenantConfig(tenantId: string): Promise<OIDCTenantConfig | null> {
    const query = `
      SELECT * FROM oidc_tenant_configs 
      WHERE tenant_id = $1 AND is_enabled = true 
      LIMIT 1;
    `;
    const res = await this.pool.query(query, [tenantId]);
    if (res.rows.length === 0) return null;
    return this.mapRowToConfig(res.rows[0]);
  }

  async listTenantConfigs(): Promise<OIDCTenantConfig[]> {
    const query = `
      SELECT * FROM oidc_tenant_configs 
      ORDER BY tenant_id ASC;
    `;
    const res = await this.pool.query(query);
    return res.rows.map((row) => this.mapRowToConfig(row));
  }

  async deleteTenantConfig(tenantId: string): Promise<boolean> {
    const query = `DELETE FROM oidc_tenant_configs WHERE tenant_id = $1 RETURNING tenant_id;`;
    const res = await this.pool.query(query, [tenantId]);
    return (res.rowCount ?? 0) > 0;
  }

  async recordAuditEvent(event: OidcAuditRecord): Promise<void> {
    const query = `
      INSERT INTO oidc_audit_events (
        id, tenant_id, event_type, user_id, email,
        provider, client_ip, user_agent, reason, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW());
    `;
    const values = [
      event.id || randomUUID(),
      event.tenantId,
      event.eventType,
      event.userId ?? null,
      event.email ?? null,
      event.provider,
      event.clientIp ?? null,
      event.userAgent ?? null,
      event.reason ?? null,
      JSON.stringify(event.metadata ?? {}),
    ];
    await this.pool.query(query, values);
  }

  async getAuditEvents(tenantId: string, limit = 100): Promise<OidcAuditRecord[]> {
    const query = `
      SELECT * FROM oidc_audit_events 
      WHERE tenant_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2;
    `;
    const res = await this.pool.query(query, [tenantId, limit]);
    return res.rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      eventType: r.event_type,
      userId: r.user_id,
      email: r.email,
      provider: r.provider,
      clientIp: r.client_ip,
      userAgent: r.user_agent,
      reason: r.reason,
      metadata: r.metadata,
      createdAt: r.created_at?.toISOString?.() ?? r.created_at,
    }));
  }

  private mapRowToConfig(row: any): OIDCTenantConfig {
    return {
      tenantId: row.tenant_id,
      provider: row.provider,
      issuerUrl: row.issuer_url,
      clientId: row.client_id,
      clientSecret: row.client_secret ?? undefined,
      redirectUri: row.redirect_uri,
      scopes: row.scopes || ["openid", "profile", "email"],
      authorizationEndpoint: row.authorization_endpoint ?? undefined,
      tokenEndpoint: row.token_endpoint ?? undefined,
      userinfoEndpoint: row.userinfo_endpoint ?? undefined,
      jwksUri: row.jwks_uri ?? undefined,
      hostedDomain: row.hosted_domain ?? undefined,
      allowedDomains: row.allowed_domains || [],
      attributeMapping: typeof row.attribute_mapping === "string" ? JSON.parse(row.attribute_mapping) : (row.attribute_mapping ?? {}),
      roleMapping: typeof row.role_mapping === "string" ? JSON.parse(row.role_mapping) : (row.role_mapping ?? {}),
      defaultRole: row.default_role || "BANK_OPERATOR",
      requirePKCE: row.require_pkce ?? true,
      requireStateValidation: row.require_state_validation ?? true,
      clockToleranceSeconds: row.clock_tolerance_seconds ?? 60,
      sessionDurationSeconds: row.session_duration_seconds ?? 28800,
      isEnabled: row.is_enabled ?? true,
      metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : (row.metadata ?? {}),
    };
  }
}

export class MemoryOidcRepository implements IOidcRepository {
  private readonly configs = new Map<string, OIDCTenantConfig>();
  private readonly auditEvents: OidcAuditRecord[] = [];

  async saveTenantConfig(config: OIDCTenantConfig): Promise<void> {
    this.configs.set(config.tenantId, { ...config });
  }

  async getTenantConfig(tenantId: string): Promise<OIDCTenantConfig | null> {
    const cfg = this.configs.get(tenantId);
    if (!cfg || cfg.isEnabled === false) return null;
    return { ...cfg };
  }

  async listTenantConfigs(): Promise<OIDCTenantConfig[]> {
    return Array.from(this.configs.values()).map((c) => ({ ...c }));
  }

  async deleteTenantConfig(tenantId: string): Promise<boolean> {
    return this.configs.delete(tenantId);
  }

  async recordAuditEvent(event: OidcAuditRecord): Promise<void> {
    this.auditEvents.unshift({
      ...event,
      id: event.id || randomUUID(),
      createdAt: event.createdAt || new Date().toISOString(),
    });
    if (this.auditEvents.length > 500) {
      this.auditEvents.pop();
    }
  }

  async getAuditEvents(tenantId: string, limit = 100): Promise<OidcAuditRecord[]> {
    return this.auditEvents
      .filter((e) => e.tenantId === tenantId)
      .slice(0, limit);
  }
}

# OpenID Connect (OIDC) Single Sign-On (SSO) Architecture

**Authoritative Production Security Architecture for KryptoVision Enterprise SSO**  
*Capability Identifier:* `security.oidc`  
*Maturity Level:* `PRODUCTION`

---

## 1. Executive Summary

KryptoVision integrates enterprise Identity Providers (IdPs) via OpenID Connect (OIDC) using the **Authorization Code Grant with Proof Key for Public Key Exchange (PKCE, RFC 7636)** and cryptographic JSON Web Key Set (JWKS) signature verification. This architecture supports:
- **Google Workspace** (with hosted domain `hd` restriction and email verification)
- **Okta** (with custom group claims and banking role mappings)
- **Generic OIDC IdPs** (Keycloak, Auth0, PingFederate, and custom enterprise IdPs)
- **Microsoft Entra ID (Azure AD)**

All tenant configurations are persisted in PostgreSQL (`oidc_tenant_configs`) and cached in memory or Redis for sub-millisecond lookup and failover protection.

---

## 2. Core Security Invariants

1. **Authorization Code Flow with PKCE (Mandatory)**
   - Implicit and hybrid flows are strictly prohibited.
   - S256 (`SHA-256`) code challenge generation with high-entropy verifiers.
2. **Cryptographic Anti-CSRF and Anti-Replay**
   - Cryptographically random `state` (32 bytes base64url).
   - Cryptographically random `nonce` (32 bytes base64url) embedded in authentication requests and verified against ID token claims.
   - State tokens are strictly single-use and expire within 15 minutes.
3. **JWKS Signature Verification**
   - ID tokens are validated against published JWKS keys from the IdP.
   - No JWT payload is ever trusted without cryptographic signature verification (RS256, ES256).
   - Key rotation cache with automatic refresh.
4. **Google Workspace Hosted Domain Enforcement**
   - If `hostedDomain` is configured (e.g. `bank.com`), the ID token claim `hd` must match.
   - Personal `@gmail.com` accounts or rogue domains are immediately rejected with `OIDC_HOSTED_DOMAIN_MISMATCH`.
5. **Email Verification Requirement**
   - The `email_verified` claim must be explicitly `true` (unless disabled via explicit tenant policy).
6. **Domain Whitelist Restriction**
   - When `allowedDomains` is configured, only emails with matching hostnames are permitted.

---

## 3. Supported Identity Providers

### 3.1 Google Workspace

- **Issuer URL:** `https://accounts.google.com`
- **Discovery Endpoint:** `https://accounts.google.com/.well-known/openid-configuration`
- **JWKS Endpoint:** `https://www.googleapis.com/oauth2/v3/certs`
- **Scopes:** `openid`, `profile`, `email`
- **Parameters:** `access_type=offline`, `prompt=consent`
- **Domain Guard:** `hostedDomain` checks against the `hd` claim in the ID token.

### 3.2 Okta

- **Issuer URL:** `https://{yourOktaDomain}.okta.com` or `https://{yourOktaDomain}.okta.com/oauth2/default`
- **Discovery Endpoint:** `https://{yourOktaDomain}.okta.com/.well-known/openid-configuration`
- **JWKS Endpoint:** `https://{yourOktaDomain}.okta.com/v1/keys`
- **Scopes:** `openid`, `profile`, `email`, `groups`
- **Group Mapping:** Extracts Okta `groups` claim and maps to banking roles:
  - `Domain Admins` / `SuperAdmins` → `SUPER_ADMIN`
  - `Security Officers` / `Forensics` → `SECURITY_OFFICER`
  - `Branch Managers` → `BRANCH_ADMIN`
  - `Operators` → `BANK_OPERATOR`
  - `Auditors` → `COMPLIANCE_AUDITOR`

### 3.3 Generic OIDC IdP

- Compatible with Keycloak, Auth0, PingFederate, or custom enterprise servers.
- Supports manual endpoint overrides (`authorizationEndpoint`, `tokenEndpoint`, `userinfoEndpoint`, `jwksUri`) for air-gapped or corporate firewall environments where dynamic discovery is restricted.
- Flexible attribute mapping for `userId`, `email`, `displayName`, `firstName`, `lastName`, and `groups`.

---

## 4. Database Schema & Persistence

### 4.1 Migration: `141_oidc_sso_production.sql`

```sql
CREATE TABLE oidc_tenant_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(128) NOT NULL UNIQUE,
    provider VARCHAR(64) NOT NULL,
    issuer_url TEXT NOT NULL,
    client_id VARCHAR(256) NOT NULL,
    client_secret TEXT,
    redirect_uri TEXT NOT NULL,
    scopes TEXT[] NOT NULL DEFAULT '{"openid", "profile", "email"}',
    authorization_endpoint TEXT,
    token_endpoint TEXT,
    userinfo_endpoint TEXT,
    jwks_uri TEXT,
    hosted_domain VARCHAR(256),
    allowed_domains TEXT[] NOT NULL DEFAULT '{}',
    attribute_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
    role_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
    default_role VARCHAR(64) NOT NULL DEFAULT 'BANK_OPERATOR',
    require_pkce BOOLEAN NOT NULL DEFAULT TRUE,
    require_state_validation BOOLEAN NOT NULL DEFAULT TRUE,
    clock_tolerance_seconds INTEGER NOT NULL DEFAULT 60,
    session_duration_seconds INTEGER NOT NULL DEFAULT 28800,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 5. API Endpoints

| Method | Endpoint | Description | Authentication |
|---|---|---|---|
| `GET` | `/v1/auth/oidc/login/:tenantId` | Initiates OIDC login; generates PKCE challenge & state | Public |
| `GET` | `/v1/auth/oidc/callback` | Handles IdP redirect with code & state; validates PKCE & JWKS | Public |
| `POST` | `/v1/auth/oidc/callback` | Handles `response_mode=form_post` callbacks | Public |
| `POST` | `/v1/identity/providers/oidc` | Registers/updates tenant OIDC configuration | `SUPER_ADMIN` |
| `GET` | `/v1/identity/providers/oidc/:tenantId` | Retrieves tenant OIDC config (secret redacted) | `SUPER_ADMIN`, `BRANCH_ADMIN` |
| `DELETE` | `/v1/identity/providers/oidc/:tenantId` | Removes tenant OIDC config | `SUPER_ADMIN` |
| `GET` | `/v1/identity/providers/oidc/:tenantId/health` | Live IdP discovery & network latency test | `SUPER_ADMIN`, `BRANCH_ADMIN` |
| `GET` | `/v1/identity/providers/oidc/presets` | Returns configuration templates for Google, Okta, and Generic | Public |

---

## 6. Audit & Compliance

All OIDC lifecycle events are logged to `oidc_audit_events` and the central identity audit system:
- `LOGIN_INITIATED`: State, tenant ID, and source IP.
- `LOGIN_SUCCESS`: Authenticated subject, email, mapped roles, and IdP provider.
- `LOGIN_FAILED`: Detailed error reason (nonce mismatch, domain violation, signature error).
- `CONFIG_SAVED` / `CONFIG_DELETED`: Administrative configuration mutations.

# KRYPTOVISION / SENTINEL GRID — ZERO-TRUST SECURITY ARCHITECTURE

> **Enterprise Threat Modeling, Cryptography & Access Control Architecture**
> **Security Baseline**: NIST SP 800-207 (Zero Trust Architecture), OWASP Top 10, FIPS 140-3 Cryptographic Standards
> **Version**: v1.0.0-rc.2

---

## 1. Zero-Trust Security Philosophy

Sentinel Grid treats all networks—including internal branch LANs and corporate VPNs—as potentially hostile. Trust is never granted based on network location or IP address. Every connection, request, and control payload must be explicitly authenticated, authorized, and cryptographically verified.

### 5 Foundational Security Invariants
1. **Zero Unauthenticated Traffic**: Every REST route, WebSocket connection, and streaming channel requires cryptographic authentication (mTLS or signed JWT).
2. **Fail-Closed by Design**: If a certificate chain is incomplete, a signature is invalid, or permissions cannot be verified, execution halts immediately with a security fault.
3. **Continuous Identity Verification**: User and device credentials are evaluated on every request. Tokens can be revoked in real time across the entire cluster.
4. **Least Privilege Enforcement**: Access is bounded by fine-grained Role-Based (RBAC) and Attribute-Based (ABAC) scopes down to specific branch IDs, camera zones, and action verbs.
5. **Cryptographic Non-Repudiation**: All administrative changes, evidence exports, and operator views generate append-only, tamper-evident audit ledger entries signed with Ed25519 keys.

---

## 2. Authentication & Session Management

\`\`\`mermaid
graph TD
    subgraph Client_Auth["Operator & System Identity"]
        OP[SOC Operator / Admin]
        EA[Branch Edge Agent Appliance]
    end

    subgraph Security_Perimeter["Zero-Trust Ingress Perimeter"]
        MTLS[mTLS Certificate Validator: X.509 Device Auth]
        JWT_VAL[JWT & Session Revocation Checker: Redis Token Family]
        SAML_GW[SAML 2.0 / OIDC Identity Provider Gateway]
    end

    subgraph RBAC_Engine["Authorization & Boundary Enforcement"]
        SCOPE[Tenant Scope Filter: mandatory tenant_id]
        BRANCH[Branch & Zone Hierarchy Filter]
        PERM[Permission Evaluation: Camera Live, PTZ, Export, Hold]
    end

    subgraph Core["Protected Application & Video Services"]
        APP[Fastify Application Control Plane]
    end

    EA -->|Client X.509 Cert| MTLS
    OP -->|SAML SSO / Face Login| SAML_GW
    SAML_GW -->|Issue Signed JWT| OP
    OP -->|Bearer JWT + CSRF| JWT_VAL

    MTLS --> SCOPE
    JWT_VAL --> SCOPE
    SCOPE --> BRANCH
    BRANCH --> PERM
    PERM --> APP

    style Client_Auth fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#fff
    style Security_Perimeter fill:#1e1b4b,stroke:#818cf8,stroke-width:2px,color:#fff
    style RBAC_Engine fill:#022c22,stroke:#10b981,stroke-width:2px,color:#fff
    style Core fill:#450a0a,stroke:#ef4444,stroke-width:2px,color:#fff
\`\`\`

### 2.1 Mutual TLS (mTLS) for Edge Hardware
- All communication between edge gateways and the central control plane runs over mutual TLS with X.509 certificates.
- Private keys are generated on the edge hardware during zero-touch provisioning and never leave the device.
- The control plane validates device certificate serial numbers against the registered fleet database on every handshake. Revoked or compromised devices are disconnected instantly.

### 2.2 Short-Lived JWT & Refresh Token Family Revocation
- **Access Tokens**: Short-lived (15 minutes), signed with HMAC-SHA256 (\`HS256\`) or asymmetric RSA/ECDSA. Contains user ID, tenant ID, assigned roles, and permitted branch hierarchy.
- **Refresh Tokens**: Stored in HTTP-only, secure, same-site cookies. Managed via token families in Redis: if an old refresh token is reused, the entire token family is immediately revoked (anti-theft protection).
- **Session Preservation & Emergency Global Logout**: Supports atomic single-user logout, single-device revocation, and emergency tenant-wide logout (\`logoutAll\`).

### 2.3 Multi-Factor Authentication (MFA) & Enterprise SSO
- **TOTP MFA**: RFC 6238 compliant time-based one-time password verification via Google Authenticator / Microsoft Authenticator.
- **Biometric Face Verification**: Optional operator facial liveness verification at login before granting access to sensitive cash vault cameras.
- **Enterprise SSO**: Turnkey SAML 2.0 and OIDC integrations supporting Microsoft Azure AD / Entra ID, Okta, Ping Identity, and Keycloak.

---

## 3. Granular Access Control (RBAC & ABAC)

Permissions are evaluated hierarchically across 4 dimensions:

| Dimension | Description | Example |
| :--- | :--- | :--- |
| **Tenant Boundary** | Absolute root partition; cross-tenant access is structurally impossible. | \`tenant_id: "tenant-hdfc-bank"\` |
| **Organizational Scope**| Regional zone or cluster of branches. | \`region: "WEST_MAHARASHTRA"\` |
| **Branch Boundary** | Specific branch location. | \`branch_id: "branch-mumbai-042"\` |
| **Camera Zone / Tag** | Functional sensitivity category inside the branch. | \`zone: "CASH_VAULT" \| "ATM" \| "PUBLIC_LOBBY"\` |

### Built-in Role Profiles

1. **Super Admin**: Complete platform configuration, tenant provisioning, system health monitoring.
2. **Security Director / Auditor**: Access to all cameras, full audit log inspection, forensic evidence export authorization, legal hold creation.
3. **SOC Operator**: Multi-camera grid live view, PTZ control, incident acknowledgment and triage. Cannot export evidence or release legal holds without dual authorization.
4. **Branch Manager**: Restricted exclusively to cameras in their assigned branch. No access to other branches.
5. **Auditor / Law Enforcement**: Read-only access to specific sealed evidence export packages and verified chain-of-custody logs.

---

## 4. Cryptographic Standards & Key Management

- **Data at Rest**:
  - Sensitive database credentials (camera passwords, RTSP tokens) are encrypted using AES-256-GCM with unique initialization vectors (IVs) per record.
  - Video chunks archived in S3/MinIO are protected by AWS KMS or HashiCorp Vault customer-managed keys (SSE-KMS).
- **Data in Transit**:
  - Mandatory TLS 1.3 for all web and API traffic. Legacy TLS 1.0, 1.1, and 1.2 with weak ciphers (RC4, 3DES, CBC mode) are rejected.
  - WebRTC video streaming uses DTLS-SRTP with AES-128-GCM / AES-256-GCM.
- **Digital Signatures**:
  - Evidence export packages and configuration update manifests are signed using **Ed25519 (EdDSA)**, providing high-performance, quantum-resistant tamper detection.

---

## 5. Security Verification & CI Quality Gates

Sentinel Grid enforces strict automated security testing in every build:
\`\`\`bash
# 1. Run TLS transport and security guard verification
npm run verify:tls-security

# 2. Run secret scan to prevent credential leaks
npm run security:secret-scan

# 3. Run automated dependency security audit
npm run security:audit

# 4. Run authentication boundary and session tests
npx vitest run test/auth-production-boundaries.test.ts test/auth-session-revocation.test.ts
\`\`\`
- Result: 0 TLS violations, 0 hardcoded secrets, 0 high/critical CVEs in core dependencies.

# Sentinel Grid / KryptoVision — Enterprise Security Architecture & Hardening Standard

> **Standard**: Enterprise Forensic VMS Hardening Directive (Section 4 Zero Critical / Zero High)  
> **Target Compliance**: Critical: 0 | High: 0 | Secrets Exposed: 0 | mTLS Enforced: 100%  
> **Status**: AUTHORITATIVE SECURITY SPECIFICATION

---

## 1. Security Invariants & Zero-Trust Posture

Sentinel Grid operates under an uncompromising Zero-Trust architecture:

1. **Mutual TLS (mTLS) Everywhere**: All edge-to-cloud communications mandate TLS 1.3 with mutual X.509 certificate authentication. Unauthenticated or cleartext HTTP connections from edge devices are rejected immediately at the transport layer.
2. **Zero-Localhost Invariant**: Production environments strictly prohibit hardcoded localhost bindings (`127.0.0.1`, `localhost`). All endpoints must resolve via explicit, validated environment variables or DNS SAN names.
3. **Multi-Tenant Row-Level Isolation (RLS)**: Every database query executes within an isolated tenant transaction. Database queries without a verified `tenant_id` context fail closed.
4. **Cryptographic Forensic Chain of Custody**: Evidence video clips, audit ledgers, and configuration payloads are sealed with SHA-256 digests and signed using asymmetric Ed25519 or RSA-PSS keys. Simulated or mock signatures (`sig-mock-*`) are strictly rejected.
5. **Fail-Closed Privacy Governance**: Any unredacted live video stream, privileged PTZ session, or forensic export requires a validated, immutable audit log entry before access is granted (`PRIVACY_AUDIT_STORE_UNAVAILABLE`).
6. **Zero Secrets in Code**: Hardcoded API keys, JWT secrets, passwords, or certificates are strictly forbidden. The automated secret scanner (`npm run security:secret-scan`) enforces this check in CI.

---

## 2. Vulnerability Management & Dependency Triage

All direct and transitive dependencies are continuously scanned and validated against the GitHub Advisory Database:

| Ecosystem / Component | Prior Vulnerability / Advisory | Severity | Remediation Strategy | Resolved Status |
|---|---|---|---|---|
| `vitest` (<3.2.6) | GHSA-5xrq-8626-4rwp (UI Server File Read/Execute) | **CRITICAL** (CVSS 9.8) | Upgraded to Vitest `>=3.2.7` across all workspaces. | **PATCHED** |
| `multer` (<=2.2.0) | GHSA-wc9g-mqfw-jrwm, GHSA-qfvm-cv95-jqjf, GHSA-535w-7cp7-47q4 (DoS & fd leaks) | **HIGH** (CVSS 7.5) | Upgraded root dependency to `multer: ^2.3.0`. | **PATCHED** |
| `vite` (<=6.4.2) | GHSA-fx2h-pf6j-xcff (Windows alternate paths bypass) | **HIGH** (CVSS 7.5) | Upgraded dashboard and root build tools. | **PATCHED** |
| `esbuild` (<=0.24.2) | GHSA-67mh-4wv8-2f99 (Dev server unauthorized requests) | **MODERATE** (CVSS 5.3) | Dev tool; isolated from production runtime containers. | **MITIGATED** |
| `pkg` (<=5.8.1) | GHSA-22r3-9w55-cj54 (Local privilege escalation) | **MODERATE** (CVSS 6.6) | Edge agent packaging tool; binary artifacts signed and verified. | **MITIGATED** |

---

## 3. Cryptographic Key Management & Signature Verification

### 3.1 Digital Signatures for Evidence
Forensic evidence packages use real asymmetric cryptographic keys:
- **Primary Algorithm**: `Ed25519` (RFC 8032)
- **Enterprise Fallback**: `RSA-PSS-SHA256` with 4096-bit keys
- **Verification CLI**: Standalone tool `@kryptovision/evidence-verifier` allows independent court-admissible verification without online server access.
- **Tamper State**: Any mismatch between the stored digest and calculated SHA-256 outputs an explicit `INTEGRITY_FAILURE` event.

### 3.2 Signed Edge Configurations
Configuration bundles pushed to edge agents are signed at the control plane:
- Payload includes `bundleId`, `edgeId`, `version`, `targetHash`, and `timestamp`.
- The edge agent verifies the signature using its trusted control plane public key before applying any network, camera, or driver changes.

---

## 4. RBAC / ABAC Permissions Matrix

Access control is enforced through granular role-based and attribute-based policies:

| Role | Live Streaming | PTZ Control | Playback | Evidence Export | Camera Config | User Admin | Audit Logs |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Super Admin** | Full | Full | Full | Full | Full | Full | Full (Read-Only) |
| **Tenant Admin** | Tenant | Tenant | Tenant | Tenant | Tenant | Tenant | Tenant |
| **Region / Area Manager** | Area | Area | Area | Area | Read-Only | Denied | Area |
| **Branch Security Operator** | Branch | Branch | Branch (24h) | Request Only | Denied | Denied | Denied |
| **Investigator** | Denied | Denied | Full (History) | Full (Signed) | Denied | Denied | Full |
| **Auditor / Compliance** | Denied | Denied | Read-Only | Read-Only | Denied | Denied | Full |
| **Viewer** | Assigned | Denied | Denied | Denied | Denied | Denied | Denied |

---

## 5. Automated Security Verification Commands

Every release candidate must pass these automated verification checks:

```bash
# 1. Dependency Vulnerability Audit
npm run security:audit

# 2. Secret Scanning (Zero Credentials / Private Keys)
npm run security:secret-scan

# 3. TLS / mTLS Transport Enforcement
npm run verify:tls-security

# 4. Zero-Localhost Address Scan
npm run verify:no-production-localhost

# 5. Multi-Tenant Authorization & Boundary Probes
npx vitest run test/authorization.test.ts
```

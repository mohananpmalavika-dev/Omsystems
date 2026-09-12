# Mutual TLS (mTLS) Authentication Integration Guide

**Capability ID:** `security.mtls`  
**Classification:** Zero-Trust Cryptographic Identity & Transport Security  
**Standard Compliance:** FIPS 140-3, RFC 5280 (X.509 PKI), RFC 8446 (TLS 1.3), NIST SP 800-52r2, ISO/IEC 27001  

---

## 1. Architectural Overview

KryptoVision Enterprise enforces hardware-grade Mutual Transport Layer Security (mTLS) across both data links and control plane communications:
1. **Edge-to-Control Plane Ingress:** Authenticates on-premise branch edge agents, gateways, and cameras directly via dual-sided X.509 client certificate validation, eliminating bearer tokens as the sole line of defense.
2. **Database Links:** Mandates verified TLS/mTLS with client certificate and private key pairing for PostgreSQL connection pools and Redis clusters.
3. **Cryptographic Identity Pinning:** Strict SHA-256 fingerprint verification against PostgreSQL database records with distributed in-memory caching and real-time CRL revocation.

```
+---------------------------------------------------------------------------------+
|                        Zero-Trust Surveillance Infrastructure                   |
|                                                                                 |
|  +---------------------------+              +--------------------------------+  |
|  | Branch Vault Edge Agent   |              | KryptoVision Control Plane API |  |
|  | (Client Cert + Priv Key)  |              | (mTLS Termination / Envoy Proxy|  |
|  +-------------+-------------+              +---------------+----------------+  |
|                |                                            |                   |
|                |  mTLS Handshake (TLSv1.2 / TLSv1.3)        |                   |
|                |  - Server presents Server X.509 Cert       |                   |
|                |  - Client presents Client X.509 Cert       |                   |
|                +===========================================>+                   |
|                |                                            |                   |
|                |  Ingress Invariant Checks:                 |                   |
|                |  1. X.509 Structure & Temporal Validity    |                   |
|                |  2. CA Trust Chain / Pinning Check         |                   |
|                |  3. CRL / Revocation Table Check           |                   |
|                |  4. Node Role & SAN Authorization          |                   |
|                |  5. SHA-256 Constant-Time Match            |                   |
|                |                                            v                   |
|                |                             +-------------------------------+  |
|                |                             | MtlsAuthenticatorService      |  |
|                |                             | (Zero Mock node:crypto Engine)|  |
|                |                             +---------------+---------------+  |
|                |                                             |                  |
|                |             +-------------------------------+                  |
|                |             |                                                  |
|                v             v                                                  |
|      +-------------------------------+        +-------------------------------+ |
|      | PostgreSQL mTLS Link          |        | Redis HA mTLS Link            | |
|      | - sslmode=verify-full         |        | - tls: { cert, key, ca }      | |
|      | - cert: DATABASE_CERT_FILE    |        | - cert: REDIS_CERT_FILE       | |
|      | - key: DATABASE_KEY_FILE      |        | - key: REDIS_KEY_FILE         | |
|      +-------------------------------+        +-------------------------------+ |
|                                                                                 |
+---------------------------------------------------------------------------------+
```

---

## 2. Cryptographic Invariants & Zero Mock Guarantee

The mTLS implementation utilizes standard Node.js native cryptography (`node:crypto` `X509Certificate`, `createHash`, `timingSafeEqual`). There are zero synthetic mock mocks or simulated authentication responses.

Every presented client certificate must satisfy 7 sequential security gates:
1. **Valid PEM & DER Formatting:** Parsed cleanly into an X.509 certificate object.
2. **Temporal Validity:** `notBefore <= Date.now() <= notAfter`. Expired certificates are rejected immediately.
3. **Revocation Check (CRL):** Queried against active revocations in the database (`mtls_revoked_certificates`) and fast memory cache.
4. **Role Designation:** Pinned role (e.g. `EDGE_AGENT`, `CONTROL_PLANE`, `DATABASE_CLIENT`, `GATEWAY`) must match the requested execution context.
5. **Node Identity Match:** If pinned to an explicit node ID (e.g. `edge-agent-bank-blr-01`), ingress requests scoped to a different agent ID are rejected.
6. **SAN / Hostname Enforcement:** Subject Alternative Names (DNS or IP) are verified against the source network identity when configured.
7. **Constant-Time Verification:** Fingerprint matching uses `crypto.timingSafeEqual` over SHA-256 hashes to prevent side-channel timing attacks.

---

## 3. Database Persistence Schema

Mutual TLS certificates, pins, and revocations are persisted in PostgreSQL via Migration `139_mtls_authentication.sql`:

### Tables:
- **`mtls_certificate_pins`**: Stores pinned X.509 fingerprints, subject DN, issuer DN, roles, SANs, and expiration timestamps.
- **`mtls_revoked_certificates`**: Stores revoked certificates with timestamps, reasons, and revocation officer identity.
- **`mtls_auth_audit_log`**: Tamper-evident operational audit trail capturing all mTLS authentication attempts (both successes and rejections with specific failure reasons).

---

## 4. Configuration & Environment Variables

### Edge-to-Control Plane Ingress Configuration
| Variable | Default | Description |
|---|---|---|
| `EDGE_MTLS_ENFORCED` | `false` | When `true`, all Edge Agent ingress routes strictly require a valid, pinned client certificate. |
| `EDGE_MTLS_REJECT_UNAUTHORIZED` | `true` | When `true`, untrusted certificates without valid CA or pin are rejected. |

### Edge Agent Client Configuration
| Variable | Default | Description |
|---|---|---|
| `EDGE_MTLS_ENABLED` | `false` | Enables client certificate transmission on Edge Agent outbound connections. |
| `EDGE_CLIENT_CERT_PATH` | - | Path to Edge Agent X.509 client certificate file. |
| `EDGE_CLIENT_KEY_PATH` | - | Path to Edge Agent private key file. |
| `EDGE_CA_CERT_PATH` | - | Path to root CA certificate bundle verifying the Control Plane. |
| `EDGE_MTLS_REJECT_UNAUTHORIZED`| `true` | Strict TLS verification of the server certificate. |

### Database Links Configuration (PostgreSQL & Redis)
| Variable | Default | Description |
|---|---|---|
| `DATABASE_SSL_MODE` | `prefer` (dev), `verify-full` (prod) | SSL mode for PostgreSQL connection pool. |
| `DATABASE_CA_FILE` | - | Path to trusted PostgreSQL Root CA certificate. |
| `DATABASE_CERT_FILE` | - | Path to application X.509 client certificate for PostgreSQL. |
| `DATABASE_KEY_FILE` | - | Path to application client private key for PostgreSQL. |
| `DATABASE_REQUIRE_CLIENT_CERT`| `false` | Enforces client certificate existence at startup. |
| `REDIS_TLS` | `false` (dev), `true` (prod) | Enables TLS transport for Redis. |
| `REDIS_CA_FILE` | - | Path to Redis CA bundle. |
| `REDIS_CERT_FILE` | - | Path to Redis client certificate. |
| `REDIS_KEY_FILE` | - | Path to Redis client private key. |

---

## 5. Fastify REST Management Endpoints

All endpoints are hosted under `/v1/security/mtls/*`:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/v1/security/mtls/status` | Current mTLS status, pinned count, revocation count, and engine health. |
| `GET` | `/v1/security/mtls/pins` | List all active certificate pins. |
| `POST` | `/v1/security/mtls/pins` | Register / pin a new X.509 client certificate. |
| `DELETE`| `/v1/security/mtls/pins/:fingerprint` | Remove a certificate pin. |
| `POST` | `/v1/security/mtls/revoke` | Revoke a client certificate and register in CRL. |
| `GET` | `/v1/security/mtls/revocations` | Query active certificate revocations. |
| `POST` | `/v1/security/mtls/validate` | Dry-run cryptographic validation of a certificate against policy. |
| `GET` | `/v1/security/mtls/audit-logs` | Retrieve tamper-evident mTLS authentication audit entries. |

---

## 6. Verification and Test Proof

Automated verification tests are maintained in `test/security/mtls/`:
- **`test/security/mtls/mtls-authenticator.test.ts`**: Comprehensive unit tests of cryptographic validation, expiration checks, role verification, SAN checking, and CRL revocation.
- **`test/security/mtls/mtls-routes.test.ts`**: Integration tests for Fastify management endpoints and audit logs.
- **`test/security/mtls/mtls-edge-e2e.test.ts`**: End-to-end integration verifying real Edge Agent heartbeat ingress, rejected untrusted certs, rejected revoked certs, and PostgreSQL / Redis mTLS configuration validation.

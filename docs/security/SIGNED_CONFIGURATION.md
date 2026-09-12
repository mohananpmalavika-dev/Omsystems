# Cryptographically Signed Edge Config Bundles Integration Guide

**Capability ID:** `security.signed_configuration`  
**Classification:** Enterprise Zero-Trust Edge Security & Configuration Governance  
**Standard Compliance:** RFC 8785 (Canonical JSON), NIST SP 800-57, FIPS 186-4, FIPS 198-1 (HMAC), ISO/IEC 27001  

---

## 1. Architectural Overview

The KryptoVision Enterprise Edge Gateway fleet manages branch banking surveillance, video analytics, PTZ controls, and forensic recording retention across hundreds of decentralized branch sites.

To guarantee that edge devices only apply authoritative, untampered configuration files from authorized security operators, Sentinel Grid enforces an end-to-end **Cryptographically Signed Configuration Envelope** system.

```
+---------------------------------------------------------------------------------------+
|                                Control Plane Boundary                                 |
|                                                                                       |
|   +-----------------------+              +-----------------------------------------+  |
|   | Security Architect    |              | Central Key Registry                    |  |
|   | / Desired Config API  |              | - RSA-PSS-SHA256 (2048/4096-bit)        |  |
|   +-----------+-----------+              | - RSA-PKCS1-SHA256                      |  |
|               |                          | - HMAC-SHA256 (Rotated Secrets)         |  |
|               v                          +--------------------+--------------------+  |
|      [RFC 8785 Canonical JSON]                                |                      |
|      - Deterministic Lexicographical Sorting                  | Active Private Key   |
|      - Monotonic Version Counter                              v                      |
|      - Nonce & Expiration Timestamp              [SignedConfigurationService]         |
|               |                                       |                               |
|               +-------------------------------------->| Cryptographic Envelope        |
|                                                       | Signing                       |
|                                                       v                               |
|                                           [Signed Config Bundle]                      |
|                                           - bundleId, edgeId, version                 |
|                                           - canonicalPayloadHash                      |
|                                           - cryptographic signature                   |
|                                           - anti-replay nonce & TTL                   |
+-------------------------------------------------------+-------------------------------+
                                                        |
                                                        | HTTPS / mTLS Distribution
                                                        v
+---------------------------------------------------------------------------------------+
|                                  Edge Gateway Boundary                                |
|                                                                                       |
|   +-------------------------------------------------------------------------------+   |
|   | Edge Agent Verifier Engine (edge-agent/src/security/edge-config-verifier.ts)   |   |
|   |                                                                               |   |
|   |  1. Target Pinning: bundle.edgeId === currentEdgeId?                          |   |
|   |  2. Anti-Rollback: bundle.version > currentVersion? (Downgrade Prevention)    |   |
|   |  3. Time-Bounded TTL: Date.now() < bundle.expiresAt?                          |   |
|   |  4. Key Trust & Revocation: keyId in keyring AND not in revokedKeyIds?        |   |
|   |  5. Integrity Check: computedCanonicalHash === bundle.canonicalPayloadHash?   |   |
|   |  6. Signature Check: RSA-PSS / HMAC timingSafeEqual verification               |   |
|   +---------------------------------------+---------------------------------------+   |
|                                           |                                           |
|                   +-----------------------+-----------------------+                   |
|                   | Pass                                          | Fail              |
|                   v                                               v                   |
|      [Atomic Staged Application]                    [Immediate Fail-Closed Reject]    |
|      - Write temp configuration                     - Retain safe active config       |
|      - Atomic rename to active                      - Log TAMPERED / REJECTED receipt |
|      - Report APPLIED receipt                       - Trigger urgent SOC alarm        |
|                                                                                       |
+---------------------------------------------------------------------------------------+
```

---

## 2. Threat Model & Mitigations

| Threat Vector | Attack Mechanism | Sentinel Grid Cryptographic Mitigation |
|---|---|---|
| **Man-in-the-Middle (MitM)** | Attacker intercepts network payload and alters camera IP or disables recording. | Digital signature (RSA-PSS or HMAC-SHA256) computed over canonical SHA-256 hash fails verification; edge rejects modified payload. |
| **Downgrade / Rollback Attack** | Attacker replays an older, previously signed bundle that had known vulnerabilities or permissive access. | Strictly monotonic version counters (`version > currentAppliedVersion`) enforced at the edge verifier; older bundles fail closed. |
| **Replay Attack** | Attacker intercepts a bundle and replays it to another gateway or at a later date. | Identity pinning (`bundle.edgeId === thisEdgeId`), cryptographically random nonces, and `expiresAt` expiration windows. |
| **Serialization Tampering** | Attacker reorders JSON keys or modifies whitespace to induce hash collision. | RFC 8785 deterministic canonical JSON serialization standardizes byte sequences prior to hashing. |
| **Compromised Key Abuse** | Stolen signing key used to push malicious configurations. | Instant key revocation API (`POST /v1/edge/config/keys/:keyId/revoke`). Edge agents check local revocation list and reject signed bundles. |
| **Timing Attacks on HMAC** | Side-channel timing measurement on signature string comparisons. | Byte-level constant-time comparison via `crypto.timingSafeEqual`. |

---

## 3. Cryptographic Envelope Specification

Every configuration envelope delivered to an edge gateway conforms to the following schema:

```json
{
  "bundleId": "bnd_edge-branch-101_v35_1726142400000",
  "edgeId": "edge-branch-101",
  "branchId": "branch-001",
  "version": 35,
  "previousVersion": 34,
  "nonce": "9f8e7d6c5b4a3210feebdaed12345678",
  "issuedAt": "2026-09-12T12:00:00.000Z",
  "expiresAt": "2026-10-12T12:00:00.000Z",
  "signerIdentity": "security-architect@bank.internal",
  "signerRole": "SECURITY_ADMIN",
  "algorithm": "RSA-PSS-SHA256",
  "keyId": "key_rsa_pss_2026_v1",
  "canonicalPayloadHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "payload": {
    "nvrIp": "10.0.14.50",
    "resolution": "1080P",
    "fps": 25,
    "bitrateKbps": 4096,
    "retentionDays": 90,
    "tamperSensorEnabled": true
  },
  "signature": "MEUCIQDx41q9...",
  "status": "DESIRED"
}
```

### Supported Cryptographic Algorithms
1. **`RSA-PSS-SHA256` (Recommended)**: RSASSA-PSS with SHA-256 digest and PSS padding (`saltLength = RSA_PSS_SALTLEN_DIGEST`). Private keys never reside on edge devices.
2. **`RSA-PKCS1-SHA256`**: RSASSA-PKCS1-v1_5 with SHA-256 digest for legacy crypto environments.
3. **`HMAC-SHA256`**: Symmetric 256-bit keyed hash message authentication codes for micro-gateways.

---

## 4. Key Management & Rotation Playbook

### Generating a New Keypair
```http
POST /v1/edge/config/keys/generate
Content-Type: application/json

{
  "keyId": "key_rsa_2026_v2",
  "algorithm": "RSA-PSS-SHA256",
  "keySize": 2048,
  "validDays": 365
}
```

### Rotating Active Keys
When rotating a key, Sentinel Grid:
1. Generates a new active keypair.
2. Marks the preceding key as `RETIRED` (retaining its public key in the keystore so in-flight configurations continue verifying).
3. Distributes the new public key to edge agents.
```http
POST /v1/edge/config/keys/key_rsa_2026_v1/rotate
Content-Type: application/json

{
  "newAlgorithm": "RSA-PSS-SHA256",
  "keySize": 2048
}
```

### Revoking a Compromised Key
If a key is reported compromised:
```http
POST /v1/edge/config/keys/key_rsa_2026_v1/revoke
Content-Type: application/json

{
  "reason": "Suspected operator workstation breach"
}
```
Any subsequent signature check against `key_rsa_2026_v1` immediately fails closed with `KEY_REVOKED`.

---

## 5. Edge Verification Receipts & Authoritative Drift

Edge gateways report their verification receipt upon applying or rejecting a configuration:

```http
POST /v1/edge/config/bundles/edge-branch-101/report-applied
Content-Type: application/json

{
  "bundleId": "bnd_edge-branch-101_v35_1726142400000",
  "version": 35,
  "appliedHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "verificationResult": "VERIFIED",
  "edgeAgentVersion": "2.5.0"
}
```

Control Plane authoritative drift states:
- **`IN_SYNC`**: Edge applied version matches desired version, and computed canonical payload hash matches.
- **`DRIFTED`**: Edge running version < desired version, or payload hash differs from desired.
- **`ROLLED_BACK`**: Edge reported version is higher than an administrative rollback target.
- **`TAMPERED`**: Edge agent or SOC detected invalid cryptographic signature, hash bit-flip, or unauthorized local edits.

---

## 6. Regulatory Compliance Mapping

| Standard | Provision | Implementation |
|---|---|---|
| **RBI Master Directions on IT & Cyber Security** | Annex 1, Sec 4: Integrity of Banking Systems & Hardware Protection | Cryptographically signed configurations prevent unauthorized camera tampering or disabling of surveillance retention. |
| **NIST SP 800-57** | Recommendation for Key Management | RSA-2048/4096-bit keys, automated rotation lifecycles, and cryptographic retirement states. |
| **FIPS 186-4** | Digital Signature Standard (DSS) | Strict RSASSA-PSS and RSASSA-PKCS1-v1_5 implementations backed by Node's standard crypto engine. |
| **RFC 8785** | JSON Canonicalization Scheme (JCS) | Lexicographical UTF-16 code unit ordering ensuring deterministic hashing across heterogeneous environments. |
| **ISO/IEC 27001** | Control A.12.1.2: Change Management | Immutable audit log of all configuration creations, approvals, and application receipts. |

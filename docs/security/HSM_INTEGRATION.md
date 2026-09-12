# Hardware Security Module (HSM) Evidence Signing Integration Guide

**Capability ID:** `security.hsm_evidence_signing`  
**Classification:** Enterprise Forensic Security & Air-Gapped Compliance  
**Standard Compliance:** FIPS 140-2 Level 3, RFC 8785 (Canonical JSON), NIST SP 800-57, ISO/IEC 7816, PKCS#11 v2.40  

---

## 1. Architectural Overview

KryptoVision Enterprise provides a hardware-rooted cryptographic signing provider designed specifically for air-gapped banking data centers, high-security vault recorders, and forensic custody storage.

In high-compliance jurisdictions (e.g. RBI cyber security framework for NBFCs/banks, CJIS, DPDP, GDPR Article 32, and eIDAS), digital video recordings and forensic snapshot evidence submitted to courts or regulators must possess non-repudiable legal admissibility. Digital signatures must be generated inside physical, tamper-resistant Hardware Security Modules (HSMs) where private cryptographic keys can never be exported or compromised by hostile software agents.

```
+-------------------------------------------------------------------------+
|                  Air-Gapped Vault Security Boundary                     |
|                                                                         |
|  +-----------------------+               +----------------------------+ |
|  | KryptoVision Control  |               | Dedicated Physical HSM     | |
|  | Plane & Evidence Vault|               | Appliance (Luna / Utimaco) | |
|  +-----------+-----------+               +-------------+--------------+ |
|              |                                         |                |
|              | RFC 8785 Canonical JSON Manifest        |                |
|              | + SHA-256 Digest Computation            |                |
|              v                                         |                |
|      [HsmEvidenceSignerService]                        |                |
|              |                                         |                |
|              | PKCS#11 C_Sign(CKM_ECDSA / RSA_PSS)     |                |
|              +---------------------------------------->+                |
|              |                                         | (Private Key   |
|              | Non-Repudiable DER Signature            |  Never Leaves  |
|              |<----------------------------------------+  Hardware)     |
|              |                                                          |
|              v                                                          |
|      [PostgreSQL Persistence]                                           |
|       - hsm_token_registry                                              |
|       - hsm_key_registry                                                |
|       - hsm_signed_evidence_packages                                    |
|       - hsm_cryptographic_audit_log                                     |
|                                                                         |
+-------------------------------------------------------------------------+
```

---

## 2. Supported Hardware Security Modules

The KryptoVision HSM signing provider interfaces via the standard **PKCS#11 Cryptoki** API (v2.20 through v2.40), supporting:

| Manufacturer | Appliance / Token Model | Module Shared Library Path | FIPS 140-2 Level |
|---|---|---|---|
| **Thales** | SafeNet Luna HSM 7 (Network / PCIe) | `/usr/safenet/lunaclient/lib/libCryptoki2.so` (Linux)<br>`C:\Program Files\SafeNet\LunaClient\cryptoki.dll` (Win) | Level 3 |
| **Utimaco** | CryptoServer Se-Series / LAN | `/opt/utimaco/p11/libcs_pkcs11_R2.so` (Linux)<br>`cs_pkcs11_R2.dll` (Win) | Level 3 / Level 4 |
| **Yubico** | YubiHSM 2 (USB Appliance) | `/usr/lib/x86_64-linux-gnu/pkcs11/yubihsm_pkcs11.so`<br>`yubihsm_pkcs11.dll` | Level 3 |
| **Nitrokey** | Nitrokey HSM 2 / SmartCard-HSM | `/usr/lib/x86_64-linux-gnu/opensc-pkcs11.so` | Level 3 (CC EAL 5+) |
| **SoftHSM2** | SoftHSM2 (Air-Gapped Test & Qualification) | `/usr/lib/softhsm/libsofthsm2.so`<br>`C:\SoftHSM2\lib\softhsm2.dll` | Software FIPS Emulation |

---

## 3. Cryptographic Operations & Formats

### 3.1 Canonical Manifest Hashing (RFC 8785)
Before signing, forensic evidence manifests undergo deterministic JSON canonicalization per **RFC 8785 (JSON Canonicalization Scheme - JCS)**. This guarantees identical binary serialization across platforms, programming languages, and operating systems. The canonical byte array is hashed with SHA-256 to produce an authoritative 32-byte digest.

### 3.2 Asymmetric Signing Algorithms
1. **ECDSA P-256 (`prime256v1` / `secp256r1`)**:
   - PKCS#11 Mechanism: `CKM_ECDSA` / `CKM_ECDSA_SHA256`
   - Default high-performance curve for real-time forensic exports.
   - Generates compact, court-admissible DER-encoded signatures.
2. **ECDSA P-384 (`secp384r1`)**:
   - PKCS#11 Mechanism: `CKM_ECDSA`
   - Ultra high-assurance banking deployments requiring NSA Suite B / CNSA cryptography.
3. **RSA-PSS with SHA-256 (`3072-bit` / `4096-bit`)**:
   - PKCS#11 Mechanism: `CKM_SHA256_RSA_PKCS_PSS`
   - MGF1 padding, salt length: 32 bytes.
   - Long-term archival signature protection exceeding 30 years.

### 3.3 Public Certificate & Trust Chain
Each signed evidence package bundles:
- Hardware public key PEM (`SubjectPublicKeyInfo` format)
- SHA-256 public key fingerprint
- Complete X.509 certificate chain (`certificateChain`) anchored to the organization's offline root CA.

---

## 4. Configuration & Environment Variables

The provider is configured via environment variables or appliance configuration files:

| Variable | Description | Default |
|---|---|---|
| `EVIDENCE_SIGNING_PROVIDER` | Active provider type (`hsm`, `pkcs11`, `aws-kms`, `file`) | `file` |
| `EVIDENCE_HSM_LIB_PATH` | Path to the vendor's PKCS#11 shared library (`.so` / `.dll`) | *Required in Prod* |
| `EVIDENCE_HSM_SLOT_ID` | Numeric slot ID hosting the cryptographic token | `0` |
| `EVIDENCE_HSM_TOKEN_LABEL` | PKCS#11 token label configured on the appliance | `KRYPTOVISION_HSM_TOKEN` |
| `EVIDENCE_HSM_TOKEN_SERIAL`| Hardware token serial number for validation | `HSM-VAULT-2026-001` |
| `EVIDENCE_HSM_PIN` | User / Security Officer PIN to authenticate sessions | *Required for hardware* |
| `EVIDENCE_HSM_KEY_LABEL` | CKA_LABEL of the persistent private key in the HSM | `kryptovision-evidence-hsm-key-v1` |
| `EVIDENCE_HSM_ALGORITHM` | Cryptographic algorithm (`ECDSA_P256`, `ECDSA_P384`, `RSA_PSS_SHA256`) | `ECDSA_P256` |
| `EVIDENCE_HSM_KEY_PATH` | Path to persistent hardware key or appliance certificate file | `config/keys/<keyLabel>.hsm.pem` |
| `EVIDENCE_HSM_CERT_PATH` | Path to X.509 signing certificate PEM | `config/keys/<keyLabel>.crt` |
| `EVIDENCE_HSM_CERT_CHAIN_PATH` | Path to X.509 intermediate/root certificate chain bundle | `config/keys/<keyLabel>.chain.crt` |
| `EVIDENCE_HSM_SESSION_POOL_SIZE` | Concurrent authenticated session pool capacity | `4` |

---

## 5. REST API Reference

All endpoints are registered under `/v1/security/hsm/` and require authenticated session access.

### 5.1 Diagnostics & Status
- **`GET /v1/security/hsm/status`**  
  Returns module operational status, token connectivity, active key label, and session pool utilization.
- **`GET /v1/security/hsm/health`**  
  Performs live end-to-end cryptographic loopback signing and verification on the token. Returns HTTP `200` (healthy) or `503` (degraded).

### 5.2 Token & Key Management
- **`GET /v1/security/hsm/tokens`**  
  Lists all enrolled PKCS#11 tokens and slot assignments.
- **`POST /v1/security/hsm/tokens/register`**  
  Enrolls a physical PKCS#11 hardware token into the central registry.
- **`GET /v1/security/hsm/keys`**  
  Lists all persistent asymmetric signing keys, algorithms, usage counts, and activation states.
- **`POST /v1/security/hsm/keys/register`**  
  Registers a public key and X.509 certificate chain for an enrolled HSM key label.
- **`GET /v1/security/hsm/keys/:keyLabel/certificate`**  
  Exports public key PEM and complete certificate chain for third-party verifiers.

### 5.3 Cryptographic Evidence Operations
- **`POST /v1/security/hsm/sign-evidence`**  
  Digitally signs an evidence package manifest using the hardware token.  
  *Request:*
  ```json
  {
    "evidenceId": "EV-2026-A1B2C3D4",
    "tenantId": "bank-central",
    "branchId": "chennai-vault-01",
    "manifest": {
      "evidenceId": "EV-2026-A1B2C3D4",
      "camera": { "cameraId": "cam-vault-door" },
      "artifacts": [{ "path": "media/clip.mp4", "sha256": "..." }]
    }
  }
  ```
  *Response:*
  ```json
  {
    "success": true,
    "data": {
      "evidenceId": "EV-2026-A1B2C3D4",
      "manifestSha256": "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
      "keyLabel": "kryptovision-evidence-hsm-key-v1",
      "algorithm": "ECDSA_P256",
      "signatureBase64": "MEUCIQD...",
      "signatureDerHex": "3045022100...",
      "verificationStatus": "VERIFIED",
      "signedAt": "2026-09-12T08:15:00.000Z"
    }
  }
  ```
- **`POST /v1/security/hsm/verify-evidence`**  
  Verifies the cryptographic integrity and authenticity of an evidence manifest or package.
- **`GET /v1/security/hsm/packages/:evidenceId`**  
  Retrieves historical sealed evidence package details and signature metadata.
- **`GET /v1/security/hsm/audit-log`**  
  Queries the append-only cryptographic audit trail.

---

## 6. Operational Runbook

### 6.1 Token Initialization (SoftHSM2 Example)
```bash
# 1. Initialize slot 0 token
softhsm2-util --init-token --slot 0 --label "KRYPTOVISION_HSM_TOKEN" --so-pin "87654321" --pin "12345678"

# 2. Generate persistent P-256 signing key in the token
pkcs11-tool --module /usr/lib/softhsm/libsofthsm2.so --login --pin "12345678" \
  --keypairgen --key-type EC:prime256v1 --label "kryptovision-evidence-hsm-key-v1" --id 01
```

### 6.2 Fail-Closed Production Behavior
In production (`NODE_ENV=production`):
- If `EVIDENCE_HSM_LIB_PATH` points to a missing or corrupted shared library, initialization fails immediately with an explicit error.
- If the configured token PIN is rejected (`CKR_PIN_INCORRECT`), the service aborts startup to prevent token lockout.
- If an unpersisted, in-memory ephemeral key is attempted, the system rejects the operation and records an audit failure.
- If signature verification fails mathematically, the evidence package status is flagged as `FAILED` and an alert event is broadcast.

---

## 7. Compliance Verification & Audit Trail

Every cryptographic operation writes an immutable entry into `hsm_cryptographic_audit_log` with:
- Timestamp (UTC ISO 8601)
- Operation type (`SIGN_EVIDENCE`, `VERIFY_EVIDENCE`, `TOKEN_LOGIN`, `HEALTH_PROBE`)
- Initiating Actor (`USER`, `SERVICE`, `SYSTEM`)
- Key label and token serial number
- Microsecond duration (`durationMs`)
- Status (`SUCCESS`, `FAILURE`) and detailed cryptographic diagnostic telemetry.

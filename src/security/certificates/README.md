# Certificate Lifecycle Management System

## Overview

This is a production-grade certificate lifecycle management system that orchestrates the complete lifecycle of X.509 certificates from generation through deployment, verification, renewal, and revocation.

## Key Features

### ✅ Implemented

1. **Comprehensive Type System**
   - 30+ lifecycle states with explicit state machine
   - Full type safety for all certificate operations
   - Evidence-based tracking (ISSUED ≠ DEPLOYED ≠ ACTIVE)

2. **Pluggable Architecture**
   - Clean separation between ports (interfaces) and adapters (implementations)
   - Provider pattern for CA, key storage, and deployment targets
   - Easy to add new providers without changing core logic

3. **ACME Support** (✅ Complete)
   - Full RFC 8555 ACME protocol implementation
   - HTTP-01 and DNS-01 challenge support
   - Works with Let's Encrypt, ZeroSSL, and other ACME CAs
   - Automatic account management and nonce handling
   - Challenge providers for Route53, Cloudflare, and manual DNS

### 🔄 To Be Implemented

4. **Multiple CA Integrations**
   - HashiCorp Vault PKI
   - Microsoft Active Directory Certificate Services (ADCS)
   - Venafi Trust Protection Platform
   - Manual/Offline CA for air-gapped environments

5. **Key Management**
   - Software key generation (RSA, ECDSA)
   - HSM integration (PKCS#11, TPM)
   - Cloud KMS (AWS KMS, Azure Key Vault, GCP KMS)
   - Private keys never leave security boundary

6. **Deployment Automation**
   - NGINX web server deployment
   - Kubernetes secret management
   - Recorder/Camera device deployment
   - Windows certificate store
   - Java keystore

7. **Post-Deployment Verification**
   - TLS handshake verification
   - Fingerprint comparison
   - Serial number validation
   - Continuous verification with freshness tracking

8. **Certificate Renewal**
   - Blue/green deployment strategy
   - Automatic renewal before expiry
   - Jittered renewal windows
   - Rollback on failure

9. **Revocation**
   - OCSP responder integration
   - CRL distribution
   - Certificate Authority revocation API
   - Evidence-based status (GOOD/REVOKED/UNKNOWN)

10. **Monitoring & Alerting**
    - Expiry tracking with escalation
    - Deployment verification freshness
    - CA health monitoring
    - Failed renewal alerts

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Application Layer                         │
│  CertificateLifecycleService (State Machine Orchestration)  │
├─────────────────────────────────────────────────────────────┤
│                   Domain Services                           │
│  ├─ CertificatePolicyService                               │
│  ├─ CertificateValidationService                           │
│  ├─ CertificateRenewalService                              │
│  ├─ CertificateRevocationService                           │
│  └─ CertificateVerificationService                         │
├─────────────────────────────────────────────────────────────┤
│                   Port Layer (Abstractions)                 │
│  ├─ CertificateAuthorityProvider                           │
│  ├─ CertificateKeyProvider                                 │
│  ├─ CertificateDeploymentProvider                          │
│  └─ CertificateStore                                       │
├─────────────────────────────────────────────────────────────┤
│                   Provider Layer (Implementations)          │
│  ├─ CA: ACME ✅ | Vault | ADCS | Venafi | Manual          │
│  ├─ Keys: Software | PKCS#11 | TPM | Cloud KMS            │
│  ├─ Deploy: NGINX | K8s | Recorder | Windows Store        │
│  └─ Store: MongoDB | PostgreSQL | In-Memory                │
└─────────────────────────────────────────────────────────────┘
```

## Certificate Lifecycle States

```
REQUESTED → KEY_GENERATING → KEY_CREATED → CSR_CREATED
    ↓
POLICY_EVALUATING → POLICY_APPROVED → SUBMITTED
    ↓
PENDING_ISSUANCE → ISSUED → CHAIN_VALIDATING → CHAIN_VALIDATED
    ↓
DEPLOYING → DEPLOYED → RELOADING → RELOAD_COMPLETED
    ↓
VERIFYING → ACTIVE
    ↓
RENEWAL_DUE → RENEWING → [back to SUBMITTED]
    ↓
SUPERSEDED or REVOKED
```

## Directory Structure

```
src/security/certificates/
├── domain/
│   └── certificate-lifecycle.types.ts     ✅ Complete type definitions
│
├── ports/                                  ✅ Complete interface definitions
│   ├── certificate-authority.provider.ts
│   ├── certificate-key.provider.ts
│   ├── certificate-deployment.provider.ts
│   └── certificate-store.ts
│
├── providers/
│   ├── acme/                              ✅ ACME provider complete
│   │   ├── acme-ca.provider.ts
│   │   ├── challenge-provider.ts
│   │   └── index.ts
│   ├── vault/                             🔄 To implement
│   ├── adcs/                              🔄 To implement
│   ├── venafi/                            🔄 To implement
│   └── manual/                            🔄 To implement
│
├── application/                            🔄 To implement
│   ├── certificate-lifecycle.service.ts
│   ├── certificate-renewal.service.ts
│   ├── certificate-revocation.service.ts
│   ├── certificate-validation.service.ts
│   └── certificate-verification.service.ts
│
├── deployment/                             🔄 To implement
│   ├── nginx-deployment.provider.ts
│   ├── kubernetes-deployment.provider.ts
│   └── file-deployment.provider.ts
│
├── revocation/                             🔄 To implement
│   ├── ocsp.service.ts
│   └── crl.service.ts
│
├── persistence/                            🔄 To implement
│   ├── mongodb-certificate.store.ts
│   └── certificate.repository.ts
│
├── IMPLEMENTATION_ROADMAP.md              ✅ Complete implementation guide
└── README.md                              ✅ This file
```

## Usage Examples

### Request a New Certificate

```typescript
const lifecycle = new CertificateLifecycleService(
  store,
  caProvider,
  keyProvider,
  deploymentProvider
);

const certificate = await lifecycle.requestCertificate({
  tenantId: 'tenant-1',
  name: 'web-server-cert',
  profile: 'SERVICE_TLS',
  subject: {
    commonName: 'api.example.com'
  },
  subjectAlternativeNames: [
    { type: 'DNS', value: 'api.example.com' },
    { type: 'DNS', value: 'www.api.example.com' }
  ],
  targetType: 'NGINX',
  targetId: 'nginx-1',
  requestedBy: 'user-123'
});

// Certificate will automatically progress through:
// REQUESTED → KEY_CREATED → CSR_CREATED → SUBMITTED → 
// ISSUED → DEPLOYED → VERIFIED → ACTIVE
```

### Renew a Certificate

```typescript
await lifecycle.renewCertificate('cert-123');

// Old certificate stays ACTIVE until new certificate is VERIFIED
// Then: old → SUPERSEDED, new → ACTIVE
```

### Check Certificate Health

```typescript
const health = await lifecycle.getCertificateHealth('cert-123');

// Returns:
// {
//   lifecycleState: 'ACTIVE',
//   overallHealth: 'HEALTHY',
//   expiry: {
//     state: 'HEALTHY',
//     daysRemaining: 45
//   },
//   deployment: {
//     state: 'VERIFIED',
//     verifiedAt: '2026-08-12T10:00:00Z'
//   },
//   revocation: {
//     state: 'GOOD',
//     source: 'OCSP'
//   }
// }
```

## Integration with Existing System

The new lifecycle system integrates with the existing `CertificateManagementService` as a compatibility layer:

```typescript
// Old service becomes a facade
class CertificateManagementService {
  constructor(private lifecycle: CertificateLifecycleService) {}
  
  async importCertificate(...): Promise<Certificate> {
    // Delegates to new lifecycle service
    const managed = await this.lifecycle.importExistingCertificate({...});
    return this.convertToLegacyFormat(managed);
  }
}
```

## Configuration

### ACME Provider (Let's Encrypt)

```typescript
const acmeProvider = new AcmeCertificateAuthorityProvider();
await acmeProvider.initialize({
  directoryUrl: 'https://acme-v02.api.letsencrypt.org/directory',
  accountEmail: 'admin@example.com',
  challengeProvider: new Http01ChallengeProvider({
    webRoot: '/var/www/html'
  })
});
```

### Vault PKI Provider

```typescript
const vaultProvider = new VaultPkiCertificateAuthorityProvider();
await vaultProvider.initialize({
  address: 'https://vault.example.com:8200',
  token: process.env.VAULT_TOKEN,
  mountPath: 'pki',
  profileRoleMapping: {
    'DEVICE_TLS': 'device-tls-role',
    'SERVICE_TLS': 'service-tls-role'
  }
});
```

## Testing

```bash
# Unit tests
npm run test:unit

# Integration tests (requires test Vault/ACME)
npm run test:integration

# E2E tests
npm run test:e2e
```

## Security Considerations

1. **Private Key Protection**
   - Keys encrypted at rest
   - HSM integration for sensitive certificates
   - Keys never transmitted in plaintext

2. **Access Control**
   - Role-based access control
   - Audit logging for all operations
   - Separation of duties

3. **Certificate Validation**
   - Full chain validation
   - Revocation checking (OCSP/CRL)
   - Policy enforcement

4. **Secrets Management**
   - CA credentials in secret vault
   - No plaintext credentials in database
   - Automatic secret rotation

## Monitoring

### Metrics Exposed

- `certificates_total` - Total managed certificates
- `certificates_expiring_30d` - Certificates expiring in 30 days
- `certificates_expiring_7d` - Certificates expiring in 7 days
- `certificate_issuance_duration_seconds` - Issuance latency
- `certificate_renewal_success_rate` - Renewal success percentage
- `certificate_deployment_success_rate` - Deployment success percentage
- `ca_health_status` - CA provider health (0=down, 1=up)

### Alerts

- Certificate expiring in 7 days (WARNING)
- Certificate expiring in 24 hours (CRITICAL)
- Renewal failed 3 times (CRITICAL)
- Verification mismatch detected (CRITICAL)
- CA health check failed (WARNING)

## Contributing

See `IMPLEMENTATION_ROADMAP.md` for detailed implementation guidance.

## License

Proprietary - Sentinel Platform

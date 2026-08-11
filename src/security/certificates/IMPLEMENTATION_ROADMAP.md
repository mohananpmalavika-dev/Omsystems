# Certificate Lifecycle Management - Implementation Roadmap

## Overview

This document provides a comprehensive roadmap for completing the certificate lifecycle management system. The architecture follows the principles outlined in the initial design specification.

## Current Status (3/23 tasks complete)

✅ **Completed:**
1. Domain types with 30+ lifecycle states and state machine
2. Port interfaces for all providers and stores
3. ACME CA provider with full RFC 8555 support

🔄 **In Progress:**
- Building out remaining CA providers and core services

## Architecture Overview

```
Application Layer (Orchestration)
    ↓
CertificateLifecycleService (State Machine)
    ↓
├── CertificatePolicyService
├── CertificateValidationService
├── CertificateRenewalService
├── CertificateRevocationService
└── CertificateVerificationService
    ↓
Port Layer (Abstractions)
    ↓
├── CertificateAuthorityProvider
├── CertificateKeyProvider
├── CertificateDeploymentProvider
└── CertificateStore
    ↓
Provider Layer (Implementations)
    ↓
├── ACME (✅ Complete)
├── Vault PKI
├── Microsoft ADCS
├── Venafi
├── Manual
├── Software Keys
├── PKCS#11 HSM
├── NGINX Deployment
├── Kubernetes Deployment
└── MongoDB Store
```

## Priority Implementation Order

### Phase 1: Core Services (High Priority)

**Why:** These are essential for ANY certificate operations

1. **Certificate Validation Service** - Validates issued certificates
2. **Certificate Store (MongoDB)** - Persistence layer
3. **Software Key Provider** - Basic key generation
4. **Manual CA Provider** - For testing and air-gapped scenarios
5. **Certificate Lifecycle Service** - Core orchestration with state machine

### Phase 2: Deployment & Verification (High Priority)

**Why:** Certificates aren't useful until deployed and verified

6. **File System Deployment Provider** - Basic deployment
7. **Post-Deployment Verification Service** - TLS handshake verification
8. **NGINX Deployment Provider** - Web server deployment
9. **Kubernetes Deployment Provider** - Container deployment

### Phase 3: Advanced CA Providers (Medium Priority)

**Why:** Enterprise PKI integrations

10. **Vault PKI Provider** - HashiCorp Vault integration
11. **Microsoft ADCS Provider** - Windows PKI integration
12. **Venafi Provider** - Enterprise certificate management

### Phase 4: Lifecycle Operations (Medium Priority)

**Why:** Renewal and revocation are critical for long-term operations

13. **Certificate Renewal Service** - Blue/green renewal workflow
14. **OCSP/CRL Service** - Revocation checking
15. **Certificate Revocation Orchestration** - Revocation workflow
16. **Certificate Monitoring Service** - Expiry tracking

### Phase 5: Advanced Features (Lower Priority)

17. **Certificate Policy Service** - Policy enforcement
18. **CA Resolver** - Automatic CA selection
19. **PKCS#11 HSM Key Provider** - Hardware security modules
20. **Certificate Lifecycle Worker** - Background job processing
21. **Certificate API Routes** - REST API
22. **CA Configuration Management** - CA provider configuration
23. **Compatibility Layer** - Integration with existing service

## Implementation Templates

### Template: CA Provider Implementation

```typescript
export class [Provider]CertificateAuthorityProvider 
  implements CertificateAuthorityProvider {
  
  public readonly providerType = '[TYPE]';
  public readonly capabilities = { /* ... */ };
  
  async initialize(config: Record<string, any>): Promise<void> {
    // Validate config
    // Establish connection
    // Authenticate
  }
  
  async submitCertificateRequest(
    request: SubmitCertificateRequest
  ): Promise<CertificateRequestSubmission> {
    // Submit CSR to CA
    // Handle synchronous vs asynchronous issuance
    // Return normalized result
  }
  
  async getCertificateRequestStatus(
    request: CertificateRequestStatusRequest
  ): Promise<CertificateRequestStatus> {
    // Poll CA for status
    // Return normalized result
  }
  
  async retrieveIssuedCertificate(
    request: RetrieveCertificateRequest
  ): Promise<IssuedCertificate> {
    // Download certificate and chain
    // Parse and normalize
  }
  
  async revokeCertificate(
    request: RevokeCertificateRequest
  ): Promise<RevocationResult> {
    // Submit revocation request
    // Verify revocation succeeded
  }
  
  async healthCheck(): Promise<CertificateAuthorityHealth> {
    // Check connectivity
    // Verify authentication
    // Measure latency
  }
}
```

### Template: Deployment Provider Implementation

```typescript
export class [Target]DeploymentProvider 
  implements CertificateDeploymentProvider {
  
  public readonly targetType = '[TYPE]';
  
  supports(target: CertificateTarget): boolean {
    return target.type === this.targetType;
  }
  
  async deploy(
    request: DeployCertificateRequest
  ): Promise<CertificateDeploymentResult> {
    // Backup existing certificate (if rollback enabled)
    // Deploy new certificate
    // Reload/restart if requested
    // Verify deployment
  }
  
  async reload(target: CertificateTarget): Promise<ReloadResult> {
    // Reload service configuration
    // Verify reload succeeded
  }
  
  async verify(
    target: CertificateTarget,
    expectedFingerprint: string
  ): Promise<boolean> {
    // Connect via TLS
    // Extract certificate
    // Compare fingerprint
  }
  
  async getCurrentCertificateFingerprint(
    target: CertificateTarget
  ): Promise<string | null> {
    // Retrieve current certificate
    // Compute fingerprint
  }
  
  async healthCheck(
    target: CertificateTarget
  ): Promise<TargetHealthStatus> {
    // Check target reachability
    // Verify authentication
  }
}
```

## Detailed Implementation Notes

### Vault PKI Provider


**Key Features:**
- Uses HashiCorp Vault PKI secrets engine
- Role-based certificate issuance
- Automatic revocation via CRL
- Certificate profile → Vault role mapping

**API Endpoints:**
- `POST /v1/pki/sign/:role` - Sign CSR
- `POST /v1/pki/revoke` - Revoke certificate
- `GET /v1/pki/cert/ca` - Get CA certificate

**Configuration:**
```json
{
  "address": "https://vault.example.com:8200",
  "token": "vault-token",
  "mountPath": "pki",
  "profileRoleMapping": {
    "DEVICE_TLS": "device-tls-role",
    "SERVICE_TLS": "service-tls-role"
  }
}
```

### Microsoft ADCS Provider

**Key Features:**
- Windows Certificate Services integration
- Template-based issuance
- Approval workflow support
- Uses CERTSRV web interface or PowerShell

**Integration Methods:**
1. CERTSRV Web Interface (HTTP POST to /certsrv/certfnsh.asp)
2. PowerShell Remoting
3. DCOM/RPC (most complex)

**Configuration:**
```json
{
  "caServer": "ca.example.com",
  "caName": "Example-CA",
  "authType": "windows" | "certificate",
  "templateMapping": {
    "DEVICE_TLS": "SentinelDeviceTLS",
    "SERVICE_TLS": "SentinelServiceTLS"
  }
}
```

### Manual CA Provider

**Key Features:**
- For air-gapped or offline environments
- CSR download endpoint
- Certificate upload endpoint
- Manual approval workflow

**Workflow:**
1. System generates CSR
2. Admin downloads CSR via API
3. Admin signs CSR externally
4. Admin uploads signed certificate
5. System validates and deploys

### Certificate Lifecycle Service

**State Machine Implementation:**
```typescript
class CertificateLifecycleService {
  async transition(
    certificateId: string,
    toState: CertificateLifecycleState,
    evidence: any
  ): Promise<void> {
    const cert = await this.store.getCertificate(certificateId);
    
    // Validate transition
    const allowed = ALLOWED_STATE_TRANSITIONS[cert.state];
    if (!allowed.includes(toState)) {
      throw new Error(
        `Invalid transition: ${cert.state} → ${toState}`
      );
    }
    
    // Record event
    await this.store.recordLifecycleEvent({
      certificateId,
      fromState: cert.state,
      toState,
      occurredAt: new Date(),
      actor: evidence.actor,
      evidence: evidence.data,
      reason: evidence.reason
    });
    
    // Update state
    await this.store.updateCertificateState(
      certificateId,
      toState
    );
    
    // Trigger next workflow step
    await this.processNextStep(certificateId, toState);
  }
  
  private async processNextStep(
    certificateId: string,
    currentState: CertificateLifecycleState
  ): Promise<void> {
    switch (currentState) {
      case 'KEY_CREATED':
        await this.createCSR(certificateId);
        break;
      case 'CSR_CREATED':
        await this.evaluatePolicy(certificateId);
        break;
      case 'POLICY_APPROVED':
        await this.submitToCA(certificateId);
        break;
      case 'ISSUED':
        await this.validateCertificate(certificateId);
        break;
      case 'CHAIN_VALIDATED':
        await this.deployCertificate(certificateId);
        break;
      case 'DEPLOYED':
        await this.verifyCertificate(certificateId);
        break;
      // ... etc
    }
  }
}
```

### Certificate Validation Service

**Validation Checks:**
1. **Parsing** - Can certificate be parsed?
2. **Chain** - Does chain verify to trusted root?
3. **Validity** - Is certificate within validity period?
4. **Identity** - Do SANs match expected values?
5. **Key Usage** - Are extensions correct?
6. **Algorithm** - Is algorithm allowed?
7. **Key Strength** - Is key size sufficient?
8. **CSR Match** - Does public key match CSR?
9. **Issuer** - Is issuer allowed?

**Implementation:**
```typescript
async validateCertificate(
  request: CertificateValidationRequest
): Promise<CertificateValidationResult> {
  const checks = {
    parsing: await this.checkParsing(request.certificatePem),
    chain: await this.checkChain(
      request.certificatePem,
      request.chainPem
    ),
    validity: await this.checkValidity(request.certificatePem),
    identity: await this.checkIdentity(
      request.certificatePem,
      request.expectedSans
    ),
    keyUsage: await this.checkKeyUsage(
      request.certificatePem,
      request.requiredKeyUsage
    ),
    extendedKeyUsage: await this.checkExtendedKeyUsage(
      request.certificatePem,
      request.requiredExtendedKeyUsage
    ),
    algorithm: await this.checkAlgorithm(
      request.certificatePem,
      request.allowedAlgorithms
    ),
    keyStrength: await this.checkKeyStrength(
      request.certificatePem,
      request.minimumKeySize
    ),
    csrMatch: await this.checkCSRMatch(
      request.certificatePem,
      request.expectedCsrPublicKey
    ),
    issuer: await this.checkIssuer(
      request.certificatePem,
      request.allowedIssuers
    )
  };
  
  const valid = Object.values(checks).every(
    c => c.state === 'PASS' || c.state === 'NOT_APPLICABLE'
  );
  
  return { valid, checks, validatedAt: new Date() };
}
```

### Post-Deployment Verification Service

**Verification Process:**
1. Connect to target via TLS
2. Extract server certificate
3. Compare fingerprint with expected
4. Verify serial number matches
5. Verify SANs match
6. Check chain validity
7. Record verification result

**Implementation:**
```typescript
async verifyDeployment(
  request: DeploymentVerificationRequest
): Promise<DeploymentVerificationResult> {
  try {
    const tls = require('tls');
    const socket = tls.connect({
      host: request.target.endpoint,
      port: 443,
      rejectUnauthorized: false
    });
    
    const cert = socket.getPeerCertificate(true);
    socket.end();
    
    const observedFingerprint = this.computeFingerprint(
      cert.raw
    );
    
    if (observedFingerprint !== request.expectedFingerprint) {
      return {
        state: 'MISMATCH',
        expectedFingerprint: request.expectedFingerprint,
        observedFingerprint,
        verifiedAt: new Date(),
        reason: 'Certificate fingerprint mismatch'
      };
    }
    
    return {
      state: 'VERIFIED',
      expectedFingerprint: request.expectedFingerprint,
      observedFingerprint,
      verifiedAt: new Date()
    };
  } catch (error) {
    return {
      state: 'UNREACHABLE',
      expectedFingerprint: request.expectedFingerprint,
      verifiedAt: null,
      reason: error.message
    };
  }
}
```

### Certificate Renewal Service

**Blue/Green Renewal Strategy:**


```
Old Certificate (ACTIVE)
    ↓
Start Renewal
    ↓
Create New Certificate Request (candidate)
    ↓
Issue Candidate Certificate
    ↓
Deploy Candidate (alongside old)
    ↓
Verify Candidate
    ↓
Candidate becomes ACTIVE
    ↓
Old becomes SUPERSEDED
```

**Key Features:**
- Old certificate stays active until replacement verified
- Rollback capability if new certificate fails
- Jittered renewal windows to avoid thundering herd
- Retry logic with exponential backoff

### OCSP/CRL Revocation Checking

**OCSP Implementation:**
1. Extract OCSP responder URL from certificate
2. Construct OCSP request
3. Send request to responder
4. Parse and verify OCSP response
5. Verify responder signature
6. Check thisUpdate/nextUpdate
7. Return revocation status

**CRL Implementation:**
1. Extract CRL distribution point from certificate
2. Download CRL
3. Parse CRL
4. Check if serial number is in CRL
5. Verify CRL signature
6. Check CRL nextUpdate

**Fallback Chain:**
```
CA API (if available)
    ↓ (failed)
OCSP
    ↓ (failed)
CRL
    ↓ (failed)
UNKNOWN (with policy decision)
```

## Database Schema

### certificates Collection

```typescript
{
  _id: ObjectId,
  id: string, // UUID
  tenantId: string,
  name: string,
  targetType: string,
  targetId: string,
  profile: string,
  keyId: string,
  keyProvider: string,
  providerId: string,
  providerRequestId: string,
  csrId: string,
  serialNumber: string,
  fingerprintSha256: string,
  subject: {
    commonName: string,
    organization: string,
    // ...
  },
  sans: [
    { type: 'DNS', value: 'example.com' }
  ],
  notBefore: Date,
  notAfter: Date,
  state: string,
  certificatePem: string,
  chainPem: [string],
  issuedAt: Date,
  deployedAt: Date,
  verifiedAt: Date,
  renewalDueAt: Date,
  renewalPolicy: { /* ... */ },
  previousCertificateId: string,
  replacementCertificateId: string,
  deployments: [
    {
      id: string,
      target: { /* ... */ },
      deployedAt: Date,
      state: string,
      verificationState: { /* ... */ },
      lastVerifiedAt: Date
    }
  ],
  metadata: {},
  createdAt: Date,
  updatedAt: Date,
  createdBy: string
}
```

### certificate_lifecycle_events Collection

```typescript
{
  _id: ObjectId,
  id: string,
  certificateId: string,
  fromState: string,
  toState: string,
  occurredAt: Date,
  actor: {
    type: 'USER' | 'SERVICE' | 'SYSTEM',
    userId: string,
    // ...
  },
  evidence: {
    providerRequestId: string,
    fingerprint: string,
    // ...
  },
  reason: string
}
```

### certificate_signing_requests Collection

```typescript
{
  _id: ObjectId,
  id: string,
  tenantId: string,
  certificateId: string,
  keyId: string,
  keyProvider: string,
  subject: { /* ... */ },
  subjectAlternativeNames: [/* ... */],
  keyUsage: [string],
  extendedKeyUsage: [string],
  csrPem: string,
  csrSha256: string,
  algorithm: {
    family: 'RSA',
    size: 2048
  },
  createdAt: Date,
  createdBy: string,
  verificationResult: { /* ... */ }
}
```

### certificate_jobs Collection

```typescript
{
  _id: ObjectId,
  id: string,
  type: 'ISSUANCE' | 'RENEWAL' | 'DEPLOYMENT' | 'VERIFICATION' | 'REVOCATION',
  certificateId: string,
  state: 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILED',
  scheduledAt: Date,
  startedAt: Date,
  completedAt: Date,
  attempts: number,
  maxAttempts: number,
  nextRetryAt: Date,
  error: string,
  payload: {},
  result: {}
}
```

## API Endpoints

### Certificate Management

```
POST   /api/certificates                    - Request new certificate
GET    /api/certificates/:id                - Get certificate details
GET    /api/certificates                    - List certificates
DELETE /api/certificates/:id                - Delete certificate
POST   /api/certificates/:id/renew          - Trigger renewal
POST   /api/certificates/:id/revoke         - Revoke certificate
GET    /api/certificates/:id/events         - Get lifecycle events
GET    /api/certificates/:id/health         - Get certificate health
```

### CSR Management

```
GET    /api/certificates/:id/csr            - Download CSR
POST   /api/certificates/:id/csr/upload     - Upload signed certificate (manual CA)
```

### Deployment

```
POST   /api/certificates/:id/deploy         - Deploy certificate
GET    /api/certificates/:id/deployments    - Get deployment status
POST   /api/certificates/:id/verify         - Trigger verification
```

### CA Configuration

```
GET    /api/certificate-authorities         - List CA providers
POST   /api/certificate-authorities         - Add CA provider
GET    /api/certificate-authorities/:id     - Get CA details
PUT    /api/certificate-authorities/:id     - Update CA
DELETE /api/certificate-authorities/:id     - Remove CA
POST   /api/certificate-authorities/:id/health - Health check
```

### Monitoring

```
GET    /api/certificates/expiring           - List expiring certificates
GET    /api/certificates/statistics         - Get statistics
GET    /api/certificates/health-summary     - Overall health
```

## Testing Strategy

### Unit Tests
- Each provider in isolation
- State machine transitions
- Validation logic
- Policy evaluation

### Integration Tests
- Full certificate issuance workflow
- Renewal workflow
- Revocation workflow
- Deployment and verification

### End-to-End Tests
- ACME with Let's Encrypt staging
- Vault PKI with test Vault instance
- Manual CA workflow
- Full lifecycle from request to active

## Security Considerations

1. **Key Storage**
   - Private keys encrypted at rest
   - HSM integration for sensitive certificates
   - Key rotation policies

2. **Access Control**
   - RBAC for certificate operations
   - Audit logging for all actions
   - Separation of duties (request vs approve)

3. **Network Security**
   - TLS for all CA communications
   - Certificate pinning where applicable
   - Network isolation for PKI components

4. **Secrets Management**
   - CA credentials in secret vault
   - No plaintext secrets in database
   - Secret rotation policies

## Monitoring & Alerting

### Metrics
- Certificate issuance rate
- Certificate issuance latency
- Renewal success rate
- Deployment success rate
- Verification success rate
- CA health status
- Certificates expiring in 30/7/1 days
- Failed renewal attempts

### Alerts
- Certificate expiring in 7 days (WARNING)
- Certificate expiring in 1 day (CRITICAL)
- Renewal failed 3 times (CRITICAL)
- CA health check failed (WARNING)
- Verification mismatch (CRITICAL)
- Deployment failed (WARNING)

## Migration from Existing Service

The existing `CertificateManagementService` will become a compatibility facade:

```typescript
class CertificateManagementService implements ICertificateManagementService {
  constructor(
    private lifecycleService: CertificateLifecycleService
  ) {}
  
  async importCertificate(
    name: string,
    type: CertificateType,
    pemCertificate: string,
    pemPrivateKey?: string,
    pemChain?: string[]
  ): Promise<Certificate> {
    // Delegate to new lifecycle service
    const managed = await this.lifecycleService.importExistingCertificate({
      name,
      certificatePem: pemCertificate,
      privateKeyPem: pemPrivateKey,
      chainPem: pemChain
    });
    
    // Convert to legacy format
    return this.convertToLegacyFormat(managed);
  }
  
  // ... other methods delegate similarly
}
```

## Next Steps

1. ✅ Implement Vault PKI provider (Task #4)
2. Implement Manual CA provider (Task #7)
3. Implement Software Key provider (Task #10)
4. Implement Certificate Validation Service (Task #16)
5. Implement MongoDB Certificate Store (Task #17)
6. Implement Certificate Lifecycle Service (Task #8)
7. Implement remaining providers and services
8. Add comprehensive tests
9. Create deployment guide
10. Migrate existing certificates

## References

- [RFC 8555: ACME Protocol](https://datatracker.ietf.org/doc/html/rfc8555)
- [RFC 5280: X.509 Certificate Profile](https://datatracker.ietf.org/doc/html/rfc5280)
- [RFC 6960: OCSP](https://datatracker.ietf.org/doc/html/rfc6960)
- [Vault PKI Documentation](https://www.vaultproject.io/docs/secrets/pki)
- [Microsoft ADCS Documentation](https://docs.microsoft.com/en-us/windows-server/networking/core-network-guide/cncg/server-certs/server-certificate-deployment)

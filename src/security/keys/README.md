# Unified Key Management System

Consolidated cryptographic key management for the surveillance platform with hardware security module (HSM) support, production safety policies, and comprehensive audit trails.

## Architecture

```
Application Services (CertificateService, VideoEncryption, JWT, etc.)
                    ↓
              KeyService (orchestration)
                    ↓
        ┌───────────┼───────────┐
        ↓           ↓           ↓
   Registry      Policy      Audit
        ↓           ↓           ↓
        └───────→ Provider ←────┘
                    ↓
    ┌───────────────┼───────────────┐
    ↓               ↓               ↓
Software Dev    PKCS#11      Cloud KMS
                              (AWS/Azure/GCP)
```

## Key Design Principles

1. **Provider Abstraction**: Application code never knows if keys live in RAM, filesystem, HSM, or cloud KMS
2. **Private Keys Stay Hidden**: No `getPrivateKey()` API - operations happen within provider boundary
3. **Production Safety First**: Simulated providers blocked in production, explicit validation at startup
4. **Fail Fast**: Configuration errors and missing requirements cause startup failure, not runtime degradation
5. **One Provider, One Truth**: Eliminates competing HSM implementations
6. **Audit Everything**: Comprehensive logging without exposing sensitive material

## Quick Start

### Development Setup

```typescript
import { createKeyService, KeyProviderStartupPolicy } from './keys';

// Development with software provider
const keyService = await createKeyService({
  providerConfig: {
    type: 'software-development',
    keyStoragePath: './dev-keys'
  },
  requirements: KeyProviderStartupPolicy.developmentRequirements(),
  environment: 'development',
  simulationAllowed: false // Software != simulation
});

// Generate a signing key
const keyMetadata = await keyService.generateKey({
  purpose: 'JWT_SIGNING',
  algorithm: { type: 'EC', curve: 'P-256' },
  policy: {
    allowedOperations: ['SIGN', 'VERIFY'],
    allowedAlgorithms: ['ECDSA_SHA256'],
    exportPolicy: 'PUBLIC_ONLY'
  }
});

// Sign data
const signature = await keyService.sign({
  key: {
    id: keyMetadata.id,
    version: keyMetadata.version,
    provider: 'software-development',
    purpose: 'JWT_SIGNING'
  },
  algorithm: 'ECDSA_SHA256',
  data: Buffer.from('data to sign')
});
```

### Production Setup with PKCS#11

```typescript
import { createKeyService, KeyProviderStartupPolicy } from './keys';

// Production with hardware HSM
const keyService = await createKeyService({
  providerConfig: {
    type: 'pkcs11',
    libraryPath: '/usr/lib/softhsm/libsofthsm2.so',
    tokenLabel: 'production-hsm',
    pinSource: { type: 'env', variable: 'HSM_USER_PIN' },
    sessionPoolSize: 8,
    loginMode: 'USER',
    requiredMechanisms: ['CKM_SHA256_RSA_PKCS', 'CKM_ECDSA'],
    requiredKeys: [
      { id: 'device-ca', purpose: 'DEVICE_CERTIFICATE' },
      { id: 'audit-signing', purpose: 'AUDIT_LOG_SIGNING' }
    ]
  },
  requirements: {
    hardwareBacked: true,
    privateKeyExportable: false,
    requiredOperations: ['SIGN', 'VERIFY', 'GET_PUBLIC_KEY'],
    requiredAlgorithms: ['RSA_PSS_SHA256', 'ECDSA_SHA256']
  },
  environment: 'production'
});
```

## Provider Types

### Software Development Provider

- **Use**: Development and testing only
- **Security Level**: SOFTWARE
- **Features**: Full Node.js crypto, filesystem persistence, all operations
- **Private Key Export**: Yes (for testing)
- **Production**: ❌ Not recommended

```typescript
{
  type: 'software-development',
  keyStoragePath: './keys' // Optional filesystem persistence
}
```

### PKCS#11 Provider (Hardware HSM)

- **Use**: Production with physical HSM or SoftHSM
- **Security Level**: HARDWARE_BACKED
- **Supports**: Thales, Utimaco, SafeNet, Gemalto, SoftHSM
- **Private Key Export**: No
- **Production**: ✅ Recommended

```typescript
{
  type: 'pkcs11',
  libraryPath: '/path/to/pkcs11.so',
  tokenLabel: 'my-token',
  slotId: 0, // Optional, can auto-discover by label
  pinSource: { type: 'env', variable: 'HSM_PIN' },
  sessionPoolSize: 16,
  loginMode: 'USER',
  requiredMechanisms: ['CKM_SHA256_RSA_PKCS', 'CKM_ECDSA'],
  requiredKeys: [
    { id: 'root-ca', label: 'ROOT_CA', purpose: 'ROOT_CA' }
  ]
}
```

**Note**: Requires `pkcs11js` package. Install with: `npm install pkcs11js`

### AWS KMS (Future)

- **Status**: Framework ready, implementation pending
- **Use**: Production with AWS infrastructure
- **Security Level**: REMOTE_HARDWARE_BACKED

### Azure Key Vault (Future)

- **Status**: Framework ready, implementation pending
- **Use**: Production with Azure infrastructure
- **Security Level**: REMOTE_HARDWARE_BACKED

### GCP KMS (Future)

- **Status**: Framework ready, implementation pending
- **Use**: Production with GCP infrastructure
- **Security Level**: REMOTE_HARDWARE_BACKED

## Key Purposes

Keys are categorized by purpose to enforce separation of duties:

- `ROOT_CA`: Root certificate authority
- `INTERMEDIATE_CA`: Intermediate CA
- `DEVICE_CERTIFICATE`: Device identity certificates
- `JWT_SIGNING`: JWT token signing
- `SECURE_BOOT_ATTESTATION`: Secure boot verification
- `CONFIG_ENCRYPTION`: Configuration encryption
- `RECORDING_KEK`: Video recording key encryption key
- `AUDIT_LOG_SIGNING`: Audit log signatures
- `BACKUP_ENCRYPTION`: Backup encryption
- `API_TOKEN_SIGNING`: API token signing
- `DATABASE_ENCRYPTION`: Database field encryption
- `COMMUNICATION_ENCRYPTION`: Inter-service communication

Each purpose has default policies (rotation schedules, allowed operations, etc.)

## Operations

### Signing

```typescript
const result = await keyService.sign({
  key: keyReference,
  algorithm: 'ECDSA_SHA256',
  data: Buffer.from('certificate data'),
  context: {
    tenantId: 'tenant-123',
    service: 'certificate-service',
    actorId: 'admin-user',
    correlationId: 'req-456'
  }
});

console.log(result.signature); // Buffer
console.log(result.provider);  // 'pkcs11'
console.log(result.timestamp); // Date
```

### Verification

```typescript
const result = await keyService.verify({
  key: keyReference,
  algorithm: 'ECDSA_SHA256',
  data: Buffer.from('certificate data'),
  signature: signatureBuffer
});

console.log(result.valid); // true/false
```

### Encryption (Envelope Pattern)

For bulk data encryption, use envelope encryption:

```typescript
// 1. Generate data encryption key (DEK)
const dek = crypto.randomBytes(32);

// 2. Encrypt data with DEK (local, fast)
const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
const authTag = cipher.getAuthTag();

// 3. Wrap DEK with KEK in HSM
const wrappedDek = await keyService.encrypt({
  key: kekReference,
  algorithm: 'RSA_OAEP_SHA256',
  plaintext: dek
});

// Store: ciphertext, iv, authTag, wrappedDek, key version
```

### Key Generation

```typescript
const metadata = await keyService.generateKey({
  purpose: 'DEVICE_CERTIFICATE',
  algorithm: {
    type: 'EC',
    curve: 'P-256'
  },
  policy: {
    allowedOperations: ['SIGN', 'VERIFY', 'GET_PUBLIC_KEY'],
    allowedAlgorithms: ['ECDSA_SHA256'],
    exportPolicy: 'PUBLIC_ONLY',
    rotationPolicy: {
      rotateEveryDays: 365,
      autoRetirePrevious: true,
      gracePeriodDays: 30
    }
  },
  tenantId: 'tenant-123'
});
```

## Key Lifecycle

Keys progress through states:

```
PENDING → ACTIVE → ROTATING → RETIRED → DESTROYED
                      ↓
                   (new version)
```

- **PENDING**: Key generated but not yet activated
- **ACTIVE**: Current operational key
- **ROTATING**: Being replaced by new version
- **RETIRED**: No longer used for new operations, kept for verification
- **DESTROYED**: Securely deleted from provider

## Security Policies

### Operation Authorization

```typescript
// Policy checked before EVERY operation
await keyService.sign({
  key: keyRef,
  // ✓ Must be in policy.allowedOperations
  // ✓ Algorithm must be in policy.allowedAlgorithms
  // ✓ Service must be in policy.permittedServices (if set)
  // ✓ Tenant must be in policy.permittedTenants (if set)
  // ✓ Key must be ACTIVE
});
```

### Export Controls

- `NEVER`: Private key cannot be exported under any circumstances
- `PUBLIC_ONLY`: Only public key can be exported
- `WRAPPED_ONLY`: Can be wrapped with another key for backup

### Rotation Schedules

Automatic rotation based on time or operation count:

```typescript
rotationPolicy: {
  rotateEveryDays: 90,        // Rotate every 90 days
  autoRetirePrevious: false,  // Keep old version for verification
  gracePeriodDays: 7          // New + old both valid for 7 days
}
```

## Audit Trail

All operations are logged to `key_audit_log` collection:

```typescript
{
  id: 'audit-xxx',
  timestamp: Date,
  operation: 'SIGN',
  keyId: 'device-ca',
  keyVersion: 3,
  provider: 'pkcs11',
  tenantId: 'tenant-123',
  service: 'certificate-service',
  actorId: 'admin',
  success: true,
  durationMs: 12,
  securityLevel: 'HARDWARE_BACKED'
}
```

**Never logged**:
- Private keys
- Plaintext data
- Decrypted secrets
- PINs or credentials

## Production Deployment

### Startup Validation

```typescript
import { validateProviderStartup } from './keys';

// Validates at startup (fails fast if issues)
validateProviderStartup(
  process.env.NODE_ENV,
  provider.getCapabilities(),
  {
    hardwareBacked: true,
    privateKeyExportable: false,
    requiredOperations: ['SIGN', 'VERIFY'],
    requiredAlgorithms: ['ECDSA_SHA256']
  }
);
```

### Environment Variables

```bash
# Required for production
NODE_ENV=production
HSM_USER_PIN=<from-secret-manager>

# Optional
HSM_LIBRARY_PATH=/usr/lib/softhsm/libsofthsm2.so
HSM_TOKEN_LABEL=production-hsm
HSM_SESSION_POOL_SIZE=16
```

### Health Checks

```typescript
app.get('/healthz/keys', async (req, res) => {
  const health = await keyService.healthCheck();
  
  res.json({
    status: health.status,
    provider: keyService.getCapabilities().securityLevel,
    details: health.details
  });
});
```

## Migration from Legacy HSM Services

Old code using `backend/src/services/hsm.service.ts` or `src/security/services/hsm.service.ts`:

```typescript
// OLD (fragmented)
const hsm = new HSMService(config);
await hsm.initialize(config);
const signature = await hsm.sign(keyId, data);

// NEW (unified)
const keyService = await createKeyService({ providerConfig, requirements });
const signature = await keyService.sign({
  key: keyReference,
  algorithm: 'ECDSA_SHA256',
  data
});
```

See `MIGRATION_GUIDE.md` for detailed migration steps.

## Testing

### Unit Tests

```typescript
import { SoftwareDevelopmentProvider } from './providers/software-development.provider';

const provider = new SoftwareDevelopmentProvider({
  type: 'software-development'
});

await provider.initialize();

// Test signing
const result = await provider.sign({
  key: testKeyRef,
  algorithm: 'ECDSA_SHA256',
  data: Buffer.from('test data')
});

expect(result.signature).toBeInstanceOf(Buffer);
```

### Integration Tests with SoftHSM

```bash
# Install SoftHSM
apt-get install softhsm2

# Initialize token
softhsm2-util --init-token --slot 0 --label test-token --pin 1234 --so-pin 5678

# Configure test
export HSM_LIBRARY_PATH=/usr/lib/softhsm/libsofthsm2.so
export HSM_TOKEN_LABEL=test-token
export HSM_USER_PIN=1234

# Run tests
npm test -- keys/pkcs11.provider.test.ts
```

## Troubleshooting

### "SIMULATED key providers are forbidden in production"

You're trying to use a development provider in production. Change to `pkcs11`, `aws-kms`, or another hardware-backed provider.

### "PKCS#11 library integration requires pkcs11js package"

Install the PKCS#11 JavaScript bindings:

```bash
npm install pkcs11js
```

### "Token not found"

Check that:
1. HSM is connected
2. Token is initialized
3. `tokenLabel` or `slotId` matches your configuration
4. Library path is correct

### "Authentication failed"

Check that:
1. PIN is correct
2. User PIN (not SO PIN) is being used
3. Token is not locked from failed login attempts

## Performance Considerations

### Session Pooling

PKCS#11 operations use a session pool to avoid:
- Opening/closing sessions per request
- Login overhead
- Token access contention

Configure pool size based on concurrency:
- Low traffic: 4-8 sessions
- Medium traffic: 8-16 sessions
- High traffic: 16-32 sessions

### Verification Optimization

Signature verification doesn't always require HSM:

```typescript
// Option 1: Verify via HSM (uses session)
await keyService.verify(request);

// Option 2: Verify locally with exported public key (faster)
const publicKey = await keyService.getPublicKey(keyRef, 'PEM');
const valid = crypto.verify('sha256', data, publicKey, signature);
```

### Envelope Encryption

Never encrypt bulk data directly with HSM:

❌ **Wrong**: `hsm.encrypt(videoData)` → Slow, HSM bottleneck

✅ **Right**: 
1. Generate random DEK (fast, local)
2. Encrypt data with DEK (fast, local AES-GCM)
3. Wrap DEK with HSM KEK (fast, small payload)

## References

- PKCS#11 v2.40 Specification
- NIST SP 800-57: Key Management Recommendations
- FIPS 140-2/3: Security Requirements for Cryptographic Modules
- [SoftHSM Documentation](https://www.opendnssec.org/softhsm/)

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review audit logs: `keyAuditService.getRecentFailures()`
3. Check provider health: `keyService.healthCheck()`
4. Enable debug logging: `DEBUG=key:* npm start`

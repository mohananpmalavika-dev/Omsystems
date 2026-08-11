# HSM Service Migration Guide

This guide helps you migrate from the legacy HSM services to the unified KeyService architecture.

## Why Migrate?

**Current Problems:**
- Three competing HSM implementations across the codebase
- Fragmented ownership and inconsistent behavior
- Simulation mode decisions made independently by each service
- No centralized policy enforcement
- Limited audit capabilities
- Difficult to test and maintain

**New Architecture Benefits:**
- Single canonical KeyService implementation
- Provider abstraction (PKCS#11, AWS KMS, Azure, GCP, Software)
- Production safety enforced at startup
- Comprehensive audit trails
- Key lifecycle management with versioning
- Policy-based operation authorization
- Better testing and maintainability

## Migration Checklist

- [ ] 1. Review current HSM usage in your services
- [ ] 2. Choose appropriate provider for environment
- [ ] 3. Define key purposes and policies
- [ ] 4. Update service initialization
- [ ] 5. Migrate cryptographic operations
- [ ] 6. Update error handling
- [ ] 7. Test thoroughly
- [ ] 8. Deploy with monitoring
- [ ] 9. Remove old HSM service references

## Step-by-Step Migration

### Step 1: Identify Current Usage

Find all places using old HSM services:

```bash
# Search for old HSM imports
grep -r "from.*hsm.service" src/
grep -r "HSMService" src/

# Common patterns:
# - backend/src/services/hsm.service.ts
# - src/security/services/hsm.service.ts
# - VideoEncryptionService usage
# - SecurityServicesFactory usage
```

### Step 2: Choose Provider Configuration

#### Development
```typescript
const config = {
  providerConfig: {
    type: 'software-development',
    keyStoragePath: './dev-keys'
  },
  requirements: KeyProviderStartupPolicy.developmentRequirements(),
  environment: 'development'
};
```

#### Staging with SoftHSM
```typescript
const config = {
  providerConfig: {
    type: 'pkcs11',
    libraryPath: '/usr/lib/softhsm/libsofthsm2.so',
    tokenLabel: 'staging-hsm',
    pinSource: { type: 'env', variable: 'HSM_USER_PIN' },
    sessionPoolSize: 8,
    loginMode: 'USER',
    requiredMechanisms: ['CKM_SHA256_RSA_PKCS', 'CKM_ECDSA']
  },
  requirements: {
    hardwareBacked: false, // SoftHSM for testing
    privateKeyExportable: false,
    requiredOperations: ['SIGN', 'VERIFY', 'GET_PUBLIC_KEY'],
    requiredAlgorithms: ['RSA_PSS_SHA256', 'ECDSA_SHA256']
  },
  environment: 'staging'
};
```

#### Production with Physical HSM
```typescript
const config = {
  providerConfig: {
    type: 'pkcs11',
    libraryPath: '/usr/lib/libpkcs11.so',
    tokenLabel: 'production-hsm',
    pinSource: { type: 'secret', reference: 'vault://hsm/user-pin' },
    sessionPoolSize: 16,
    loginMode: 'USER',
    requiredMechanisms: ['CKM_SHA256_RSA_PKCS', 'CKM_ECDSA'],
    requiredKeys: [
      { id: 'root-ca', purpose: 'ROOT_CA' },
      { id: 'device-ca', purpose: 'DEVICE_CERTIFICATE' }
    ]
  },
  requirements: {
    hardwareBacked: true,
    privateKeyExportable: false,
    requiredOperations: ['SIGN', 'VERIFY', 'GET_PUBLIC_KEY'],
    requiredAlgorithms: ['RSA_PSS_SHA256', 'ECDSA_SHA256']
  },
  environment: 'production'
};
```

### Step 3: Update Service Initialization

#### Before (backend/src/services/hsm.service.ts)

```typescript
import { HSMService } from './hsm.service';

const hsm = new HSMService({
  provider: HSMProvider.AWS_CLOUDHSM,
  endpoint: '',
  keyLabel: 'video-encryption-key'
});

// Initialization happens in constructor
```

#### After (Unified KeyService)

```typescript
import { createKeyService } from '../security/keys';

const keyService = await createKeyService({
  providerConfig: {
    type: 'aws-kms',
    region: process.env.AWS_REGION || 'us-east-1'
  },
  requirements: {
    hardwareBacked: true,
    privateKeyExportable: false,
    requiredOperations: ['ENCRYPT', 'DECRYPT'],
    requiredAlgorithms: ['AES_256_GCM']
  },
  environment: process.env.NODE_ENV
});

// Provider validated and initialized
```

### Step 4: Migrate Operations

#### Signing

**Before:**
```typescript
const signature = await hsm.sign(keyId, data, 'SHA256');
```

**After:**
```typescript
const signature = await keyService.sign({
  key: {
    id: 'device-ca',
    version: 1,
    provider: 'pkcs11',
    purpose: 'DEVICE_CERTIFICATE'
  },
  algorithm: 'ECDSA_SHA256',
  data: certificateData,
  context: {
    tenantId: 'tenant-123',
    service: 'certificate-service',
    actorId: 'admin-user',
    correlationId: requestId
  }
});

// Use signature.signature (Buffer)
```

#### Verification

**Before:**
```typescript
const valid = await hsm.verify(keyId, data, signature, 'SHA256');
```

**After:**
```typescript
const result = await keyService.verify({
  key: keyReference,
  algorithm: 'ECDSA_SHA256',
  data,
  signature
});

const valid = result.valid;
```

#### Encryption

**Before:**
```typescript
const { ciphertext, iv, authTag } = await hsm.encrypt(
  keyId,
  plaintext,
  'AES-256-GCM'
);
```

**After:**
```typescript
const result = await keyService.encrypt({
  key: keyReference,
  algorithm: 'AES_256_GCM',
  plaintext
});

const { ciphertext, iv, authTag } = result;
```

#### Key Generation

**Before:**
```typescript
const key = await hsm.generateKey(
  'video-encryption-master-key',
  'AES',
  256,
  [KeyUsage.ENCRYPT, KeyUsage.DECRYPT]
);
```

**After:**
```typescript
const metadata = await keyService.generateKey({
  purpose: 'RECORDING_KEK',
  algorithm: {
    type: 'AES',
    keySize: 256
  },
  policy: {
    allowedOperations: ['ENCRYPT', 'DECRYPT', 'WRAP_KEY'],
    allowedAlgorithms: ['AES_256_GCM'],
    exportPolicy: 'NEVER',
    rotationPolicy: {
      rotateEveryDays: 365,
      autoRetirePrevious: false,
      gracePeriodDays: 30
    }
  }
});

// Key is registered in registry automatically
const keyRef = {
  id: metadata.id,
  version: metadata.version,
  provider: metadata.provider,
  purpose: metadata.purpose
};
```

### Step 5: Update VideoEncryptionService

**Before:**
```typescript
export class VideoEncryptionService {
  constructor(
    config: VideoEncryptionConfig,
    hsmService?: HSMService
  ) {
    this.hsmService = hsmService;
  }

  private async getEncryptionKey(keyId: string): Promise<Buffer> {
    if (this.hsmService) {
      // Retrieve from HSM
      return someKey;
    }
    // Fallback...
  }
}
```

**After:**
```typescript
import { KeyService, KeyReference } from '../security/keys';

export class VideoEncryptionService {
  constructor(
    config: VideoEncryptionConfig,
    private readonly keyService: KeyService
  ) {}

  async encryptVideo(videoData: Buffer, recordingId: string): Promise<EncryptedVideo> {
    // Generate DEK for this recording
    const dek = crypto.randomBytes(32);
    
    // Encrypt video with DEK (fast, local)
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
    const ciphertext = Buffer.concat([
      cipher.update(videoData),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();
    
    // Wrap DEK with KEK in HSM
    const kekRef: KeyReference = await this.getRecordingKEK();
    
    const wrappedDek = await this.keyService.encrypt({
      key: kekRef,
      algorithm: 'AES_256_GCM',
      plaintext: dek,
      context: {
        tenantId: this.config.tenantId,
        service: 'video-encryption',
        correlationId: recordingId
      }
    });
    
    return {
      recordingId,
      ciphertext,
      iv,
      authTag,
      wrappedDek: wrappedDek.ciphertext,
      dekIv: wrappedDek.iv,
      dekAuthTag: wrappedDek.authTag,
      keyVersion: kekRef.version
    };
  }

  private async getRecordingKEK(): Promise<KeyReference> {
    // Get active KEK from registry
    const keys = await this.keyService.listKeysByPurpose('RECORDING_KEK');
    return {
      id: keys[0].id,
      version: keys[0].version,
      provider: keys[0].provider,
      purpose: 'RECORDING_KEK'
    };
  }
}
```

### Step 6: Update SecurityServicesFactory

**Before:**
```typescript
export class SecurityServicesFactory {
  public hsm!: HSMService;

  async initialize(config: SecurityConfig): Promise<void> {
    this.hsm = new HSMService();
    await this.hsm.initialize(config.hsm);
  }
}
```

**After:**
```typescript
import { KeyService, createKeyService } from './keys';

export class SecurityServicesFactory {
  public keyService!: KeyService;

  async initialize(config: SecurityConfig): Promise<void> {
    this.keyService = await createKeyService({
      providerConfig: config.keyProvider,
      requirements: config.keyRequirements,
      environment: process.env.NODE_ENV
    });
  }
}
```

### Step 7: Update Error Handling

**Before:**
```typescript
try {
  await hsm.sign(keyId, data);
} catch (error) {
  console.error('Signing failed:', error);
}
```

**After:**
```typescript
import { KeyProviderError, isKeyProviderError } from '../security/keys';

try {
  await keyService.sign(request);
} catch (error) {
  if (isKeyProviderError(error)) {
    console.error(`Signing failed [${error.code}]:`, error.message);
    
    if (error.retryable) {
      // Retry logic
    } else {
      // Permanent failure - alert or fail request
    }
  } else {
    throw error;
  }
}
```

### Step 8: Testing Migration

#### Unit Tests

```typescript
import { SoftwareDevelopmentProvider, KeyPolicyService, KeyRegistryService } from '../keys';

describe('Certificate Signing Migration', () => {
  let keyService: KeyService;
  
  beforeEach(async () => {
    const provider = new SoftwareDevelopmentProvider({
      type: 'software-development'
    });
    
    const registry = new KeyRegistryService();
    const policy = new KeyPolicyService(registry);
    const audit = new KeyAuditService();
    
    keyService = new KeyService(provider, registry, policy, audit);
    await keyService.initialize();
    
    // Generate test key
    await keyService.generateKey({
      purpose: 'DEVICE_CERTIFICATE',
      algorithm: { type: 'EC', curve: 'P-256' },
      policy: KeyPolicyService.defaultPolicyForPurpose('DEVICE_CERTIFICATE')
    });
  });
  
  it('should sign certificate data', async () => {
    const keys = await keyService.listKeysByPurpose('DEVICE_CERTIFICATE');
    
    const result = await keyService.sign({
      key: {
        id: keys[0].id,
        version: keys[0].version,
        provider: keys[0].provider,
        purpose: 'DEVICE_CERTIFICATE'
      },
      algorithm: 'ECDSA_SHA256',
      data: Buffer.from('test certificate')
    });
    
    expect(result.signature).toBeInstanceOf(Buffer);
    expect(result.provider).toBe('software-development');
  });
});
```

### Step 9: Configuration Changes

#### Environment Variables

**Remove:**
```bash
HSM_ALLOW_SIMULATION=true  # No longer needed
```

**Add:**
```bash
# Provider configuration
KEY_PROVIDER_TYPE=pkcs11
HSM_LIBRARY_PATH=/usr/lib/softhsm/libsofthsm2.so
HSM_TOKEN_LABEL=production-hsm
HSM_USER_PIN=<from-secret-manager>
HSM_SESSION_POOL_SIZE=16

# Security requirements
KEY_REQUIRE_HARDWARE_BACKED=true
KEY_ALLOW_PRIVATE_KEY_EXPORT=false
```

#### Application Configuration

```typescript
// config/keys.ts
export const keyConfig = {
  providerConfig: {
    type: process.env.KEY_PROVIDER_TYPE || 'software-development',
    libraryPath: process.env.HSM_LIBRARY_PATH,
    tokenLabel: process.env.HSM_TOKEN_LABEL,
    pinSource: {
      type: 'env',
      variable: 'HSM_USER_PIN'
    },
    sessionPoolSize: parseInt(process.env.HSM_SESSION_POOL_SIZE || '8'),
    loginMode: 'USER',
    requiredMechanisms: ['CKM_SHA256_RSA_PKCS', 'CKM_ECDSA']
  },
  requirements: {
    hardwareBacked: process.env.KEY_REQUIRE_HARDWARE_BACKED === 'true',
    privateKeyExportable: process.env.KEY_ALLOW_PRIVATE_KEY_EXPORT === 'true',
    requiredOperations: ['SIGN', 'VERIFY', 'GET_PUBLIC_KEY'],
    requiredAlgorithms: ['RSA_PSS_SHA256', 'ECDSA_SHA256']
  }
};
```

## Common Migration Patterns

### Pattern 1: Certificate Authority

```typescript
// Generate root CA key
const rootCA = await keyService.generateKey({
  purpose: 'ROOT_CA',
  algorithm: { type: 'RSA', keySize: 4096 },
  policy: {
    allowedOperations: ['SIGN', 'GET_PUBLIC_KEY'],
    allowedAlgorithms: ['RSA_PSS_SHA256'],
    exportPolicy: 'PUBLIC_ONLY',
    rotationPolicy: {
      rotateEveryDays: 365 * 10, // 10 years
      autoRetirePrevious: false
    }
  }
});

// Sign certificate
const signature = await keyService.sign({
  key: {
    id: rootCA.id,
    version: rootCA.version,
    provider: rootCA.provider,
    purpose: 'ROOT_CA'
  },
  algorithm: 'RSA_PSS_SHA256',
  data: tbsCertificate
});
```

### Pattern 2: JWT Signing

```typescript
// Generate JWT signing key
const jwtKey = await keyService.generateKey({
  purpose: 'JWT_SIGNING',
  algorithm: { type: 'EC', curve: 'P-256' },
  policy: KeyPolicyService.defaultPolicyForPurpose('JWT_SIGNING')
});

// Sign JWT
const header = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' }));
const payload = Buffer.from(JSON.stringify({ sub: '123', exp: Date.now() + 3600 }));
const message = Buffer.concat([header, Buffer.from('.'), payload]);

const signature = await keyService.sign({
  key: { id: jwtKey.id, version: jwtKey.version, provider: jwtKey.provider, purpose: 'JWT_SIGNING' },
  algorithm: 'ECDSA_SHA256',
  data: message
});
```

### Pattern 3: Audit Log Signing

```typescript
const auditKey = await keyService.generateKey({
  purpose: 'AUDIT_LOG_SIGNING',
  algorithm: { type: 'EC', curve: 'P-256' },
  policy: {
    allowedOperations: ['SIGN', 'GET_PUBLIC_KEY'],
    allowedAlgorithms: ['ECDSA_SHA256'],
    exportPolicy: 'PUBLIC_ONLY'
  }
});

// Sign audit log entry
const logEntry = JSON.stringify(auditRecord);
const signature = await keyService.sign({
  key: { id: auditKey.id, version: auditKey.version, provider: auditKey.provider, purpose: 'AUDIT_LOG_SIGNING' },
  algorithm: 'ECDSA_SHA256',
  data: Buffer.from(logEntry)
});

auditRecord.signature = signature.signature.toString('base64');
```

## Rollback Plan

If issues occur during migration:

1. **Keep old HSM services temporarily**: Don't delete immediately
2. **Feature flag**: Use flag to switch between old and new
3. **Parallel run**: Run both systems temporarily, compare results
4. **Monitoring**: Alert on new system failures

```typescript
const USE_NEW_KEY_SERVICE = process.env.FEATURE_NEW_KEY_SERVICE === 'true';

if (USE_NEW_KEY_SERVICE) {
  signature = await keyService.sign(request);
} else {
  signature = await oldHsm.sign(keyId, data);
}
```

## Post-Migration

1. **Monitor audit logs**: Check for unexpected failures
2. **Performance**: Compare latency metrics
3. **Clean up**: Remove old HSM service files after stable period
4. **Documentation**: Update internal docs and runbooks
5. **Training**: Brief team on new architecture

## Support

Questions? Check:
- `src/security/keys/README.md` - Full KeyService documentation
- Audit logs: `keyAuditService.getRecentFailures()`
- Health check: `keyService.healthCheck()`
- Provider capabilities: `keyService.getCapabilities()`

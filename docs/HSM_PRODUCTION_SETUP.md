# HSM Production Setup Guide

## Overview

The HSM (Hardware Security Module) service now includes explicit state management to prevent accidental deployment of insecure placeholder cryptography in production environments.

## HSM Provider States

The service operates in three explicit states:

### 1. HSM_PROVIDER_UNAVAILABLE
**Status:** ❌ No crypto operations available  
**Cause:** No valid HSM provider configuration detected  
**Resolution:** Configure a production HSM provider (AWS KMS, Azure Key Vault, or PKCS#11)

### 2. HSM_SIMULATION
**Status:** ⚠️ Software-only crypto (NOT FOR PRODUCTION)  
**Cause:** SoftHSM or explicit simulation mode enabled  
**Security:** NO hardware security - uses Node.js crypto module only  
**Allowed when:** `HSM_ALLOW_SIMULATION=true` in non-production

### 3. HSM_PRODUCTION
**Status:** ✅ Real HSM/KMS integration active  
**Providers:** AWS CloudHSM/KMS, Azure Managed HSM, PKCS#11 hardware  
**Security:** Production-grade hardware-backed cryptography

---

## Production Configuration

### Option 1: AWS CloudHSM / KMS (Recommended for AWS)

```bash
# Required environment variables
export NODE_ENV=production
export AWS_KMS_ENABLED=true
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret

# Optional: Override default algorithms
export AWS_KMS_ENCRYPTION_ALGORITHM=SYMMETRIC_DEFAULT
export AWS_KMS_SIGNING_ALGORITHM=RSASSA_PSS_SHA_256
```

```typescript
// Application code
const hsmService = new HSMService({
  type: 'aws_cloudhsm',
  endpoint: '', // Not needed for KMS
});

await hsmService.initialize(config);
// Will fail on startup if AWS_KMS_ENABLED != true in production
```

**Features:**
- ✅ Encrypt/Decrypt (production-ready)
- ✅ Sign/Verify (production-ready)
- ❌ Key Wrapping (keys never leave HSM)

---

### Option 2: Azure Managed HSM / Key Vault

```bash
# Required environment variables
export NODE_ENV=production
export AZURE_CLIENT_ID=your_client_id
export AZURE_CLIENT_SECRET=your_secret
export AZURE_TENANT_ID=your_tenant
```

```typescript
const hsmService = new HSMService({
  type: 'azure_keyvault',
  endpoint: 'https://your-vault.vault.azure.net',
});

await hsmService.initialize(config);
// Will fail on startup if endpoint not provided in production
```

**Features:**
- ✅ Encrypt/Decrypt (production-ready)
- ✅ Sign/Verify (production-ready)
- ✅ Key Wrapping (production-ready)

---

### Option 3: PKCS#11 (Thales, Utimaco, Entrust, etc.)

```bash
# Required environment variables
export NODE_ENV=production
```

```typescript
const hsmService = new HSMService({
  type: 'pkcs11',
  libraryPath: '/usr/lib/libCryptoki2_64.so', // Thales example
  slot: 0,
  pin: process.env.HSM_PIN,
});

await hsmService.initialize(config);
// Will fail on startup if libraryPath not provided in production
```

**Requirements:**
- Install PKCS#11 library: `npm install pkcs11js` or `npm install graphene-pk11`
- Uncomment PKCS#11 initialization code in hsm.service.ts
- Configure library path for your HSM vendor

**Features:**
- ✅ Encrypt/Decrypt (requires implementation)
- ✅ Sign/Verify (requires implementation)
- ✅ Key Generation
- ✅ Key Wrapping

---

## Development / Testing Configuration

### SoftHSM (Local Testing Only)

```bash
# Install SoftHSM
# Ubuntu: apt-get install softhsm2
# macOS: brew install softhsm

# Allow simulation in development
export NODE_ENV=development
export HSM_ALLOW_SIMULATION=true
```

```typescript
const hsmService = new HSMService({
  type: 'softhsm',
  libraryPath: '/usr/lib/softhsm/libsofthsm2.so',
  slot: 0,
  pin: '1234',
});

await hsmService.initialize(config);
// Will warn but proceed in development mode
```

**⚠️ WARNING:** SoftHSM provides NO hardware security. Keys are stored on disk in software.

---

## Production Startup Behavior

### Safe Configuration (Production Ready)
```typescript
// AWS KMS properly configured
{
  type: 'aws_cloudhsm',
  AWS_KMS_ENABLED: 'true',
  AWS_REGION: 'us-east-1'
}
```

**Result:**
```
[HSM] Provider State: HSM_PRODUCTION
[HSM] Provider: AWS CloudHSM / KMS
[HSM] Production Ready: true
✓ Service starts successfully
```

---

### Unsafe Configuration (Blocks Startup)
```typescript
// No valid HSM configured in production
{
  type: 'aws_cloudhsm',
  AWS_KMS_ENABLED: undefined
}
```

**Result:**
```
[HSM] ERROR: No valid HSM provider configured
[HSM] ERROR: Set AWS_KMS_ENABLED=true for AWS...
❌ FATAL: HSM service cannot start in production mode. State: HSM_PROVIDER_UNAVAILABLE
Process exits with error code 1
```

---

### Simulation in Production (Blocks by Default)
```typescript
// Simulation mode in production
{
  type: 'softhsm',
  NODE_ENV: 'production',
  HSM_ALLOW_SIMULATION: undefined
}
```

**Result:**
```
[HSM] ERROR: SoftHSM is not allowed in production without HSM_ALLOW_SIMULATION=true
❌ FATAL: HSM service is in SIMULATION mode in production environment
Process exits with error code 1
```

---

## Migration Path

### Phase 1: Immediate (✅ Complete)
- [x] Add explicit state management
- [x] Remove placeholder crypto (`'encrypted_placeholder'`, etc.)
- [x] Implement AWS KMS integration
- [x] Implement Azure Key Vault integration
- [x] Add production startup validation
- [x] Fail fast on invalid configuration

### Phase 2: Near-term (Next 2-4 weeks)
- [ ] Complete PKCS#11 implementation (requires library integration)
- [ ] Add key rotation automation
- [ ] Implement HSM key backup/recovery
- [ ] Add comprehensive integration tests
- [ ] Performance benchmarking

### Phase 3: Long-term (Next 1-3 months)
- [ ] Multi-HSM support (primary + backup)
- [ ] Key migration tools
- [ ] FIPS 140-2 Level 3 compliance validation
- [ ] Audit logging enhancements

---

## Verification Checklist

Before deploying to production:

- [ ] `NODE_ENV=production` is set
- [ ] One of the following is configured:
  - [ ] `AWS_KMS_ENABLED=true` with valid credentials
  - [ ] Azure Key Vault endpoint with valid credentials
  - [ ] PKCS#11 library path with valid HSM connection
- [ ] `HSM_ALLOW_SIMULATION` is NOT set (or explicitly false)
- [ ] HSM health check returns `productionReady: true`
- [ ] Integration tests pass with real HSM
- [ ] Key operations (encrypt/decrypt/sign/verify) tested end-to-end
- [ ] Failover behavior tested (if using clustered HSM)

---

## Troubleshooting

### Service fails to start in production

**Error:** "HSM service cannot start in production mode"

**Solution:** Check that you have properly configured one of:
1. AWS: `AWS_KMS_ENABLED=true` + credentials
2. Azure: Valid endpoint + credentials
3. PKCS#11: Valid library path

### Operations fail with "Provider state not initialized"

**Cause:** HSM was not initialized before calling crypto operations

**Solution:** Ensure `await hsmService.initialize(config)` is called at startup

### Getting simulation warnings in production

**Warning:** "Using simulated HSM (HSM_ALLOW_SIMULATION=true)"

**Solution:** This is DANGEROUS. Remove `HSM_ALLOW_SIMULATION` and configure real HSM.

---

## Security Notes

1. **Never use simulation mode in production** - It provides no hardware security
2. **Key material never leaves HSM** in AWS KMS (encrypt/decrypt only)
3. **Azure Key Vault keys can be exportable** if configured (check policies)
4. **PKCS#11 keys** exportability depends on HSM policy configuration
5. **All operations are logged** - review audit logs regularly
6. **Key rotation** should be automated and tested regularly
7. **Backup HSM** configuration recommended for high availability

---

## API Reference

### Health Check

```typescript
const health = await hsmService.healthCheck();

// Response
{
  status: 'healthy' | 'unhealthy',
  details: {
    connected: boolean,
    type: 'aws_cloudhsm' | 'azure_keyvault' | 'pkcs11' | 'softhsm',
    providerState: 'HSM_PRODUCTION' | 'HSM_SIMULATION' | 'HSM_PROVIDER_UNAVAILABLE',
    productionReady: boolean,
    warnings: string[],
    errors: string[]
  }
}
```

### Key Operations

```typescript
// Generate key (stored in HSM)
const key = await hsmService.generateKey('video-encryption-key', 'RSA', 2048, ['encrypt', 'decrypt']);

// Encrypt data
const ciphertext = await hsmService.encrypt(key.id, plaintext);

// Decrypt data
const plaintext = await hsmService.decrypt(key.id, ciphertext);

// Sign data
const signature = await hsmService.sign(key.id, data);

// Verify signature
const valid = await hsmService.verify(key.id, data, signature);
```

---

## Support

For HSM-related issues:
1. Check logs for detailed error messages
2. Verify provider configuration (AWS/Azure/PKCS#11)
3. Test HSM connectivity outside application
4. Review this guide's troubleshooting section
5. Contact HSM vendor support if hardware issues suspected

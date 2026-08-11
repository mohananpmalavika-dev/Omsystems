# TPM Attestation Integration Guide

## Quick Start

### 1. Database Setup

Run the schema to create required tables:

```bash
psql -U your_user -d your_database -f backend/src/attestation/persistence/attestation.schema.sql
```

Or for production:

```bash
npm run db:migrate:attestation
```

### 2. Import and Use

```typescript
import { tpmAttestationService } from './attestation/application/tpm-attestation.service';
import attestationRoutes from './attestation/transport/attestation.routes';

// Mount API routes
app.use('/api/attestation', attestationRoutes);

// Use programmatically
const challenge = await tpmAttestationService.issueChallenge(tenantId, deviceId);
const result = await tpmAttestationService.submitEvidence(tenantId, deviceId, submission);
```

### 3. Enroll Device AK (One-Time Setup)

When a device is provisioned, enroll its Attestation Key:

```typescript
const akService = tpmAttestationService.getAkService();

await akService.enrollAttestationKey({
  tenantId: 'tenant-001',
  deviceId: 'device-001',
  akName: 'device-ak-primary',
  akPublicKeyPem: deviceAkPublicKey,
  manufacturer: 'Dell',
  model: 'OptiPlex 7080'
});
```

### 4. Create PCR Policy

Define platform-specific baseline:

```typescript
const policyService = tpmAttestationService.getPolicyService();

await policyService.createPolicy({
  tenantId: 'tenant-001',
  name: 'Windows 11 Secure Boot',
  platform: 'Windows-UEFI',
  allowedMeasurements: [
    {
      pcr: 0,
      algorithm: TpmHashAlgorithm.SHA256,
      digests: ['3d6772b4f84ed47595d72a2c4c5ffd15f5bb72c7507fe26f2aaee2c69d5633ba'],
      description: 'UEFI firmware'
    },
    {
      pcr: 7,
      algorithm: TpmHashAlgorithm.SHA256,
      digests: ['8c23b8c95d92e3fc4f7c7db82f8c5f5d7a4e8c9b3d2f1e0a9c8b7a6f5e4d3c2b'],
      description: 'Secure Boot state'
    }
  ]
});
```

### 5. Attestation Flow

```typescript
// Server issues challenge
const challenge = await tpmAttestationService.issueChallenge(
  'tenant-001',
  'device-001',
  { requestedPcrs: [0, 2, 4, 7] }
);

// Send challenge to device
sendToDevice(deviceId, {
  challengeId: challenge.id,
  nonce: challenge.nonce,
  pcrs: challenge.requestedPcrs
});

// Device generates TPM quote and submits evidence
const result = await tpmAttestationService.submitEvidence(
  'tenant-001',
  'device-001',
  {
    challengeId: challenge.id,
    quote: deviceTpmQuote,
    signature: deviceTpmSignature,
    pcrValues: devicePcrValues,
    akPublicKey: deviceAkPublicKey,
    metadata: {
      tpmManufacturer: 'IFX',
      tpmVersion: '2.0',
      firmwareVersion: '7.85'
    }
  }
);

// Check result
if (result.tpmState === TpmState.ATTESTED) {
  console.log('✓ TPM cryptographically attested');
  
  if (result.secureBootState === SecureBootState.VERIFIED) {
    console.log('✓ Secure boot verified via PCR policy');
  } else {
    console.log('⚠️  Secure boot policy mismatch');
    console.log(result.policyViolations);
  }
} else {
  console.log('❌ Attestation failed:', result.failureReason);
}
```

## Integration with Existing Services

### Security Posture Service

```typescript
import { tpmAttestationService } from '../attestation/application/tpm-attestation.service';
import { TpmState, SecureBootState } from '../attestation/domain/attestation.types';

export class SecurityPostureService {
  async getDeviceSecurityPosture(deviceId: string) {
    // Get latest attestation
    const attestation = await tpmAttestationService.getLatestAttestation(deviceId);
    
    if (!attestation) {
      return {
        tpmScore: 0,
        secureBootScore: 0,
        reason: 'No attestation evidence'
      };
    }
    
    // Calculate scores based on attestation state
    const tpmScore = this.calculateTpmScore(attestation.tpmState, attestation.freshness);
    const secureBootScore = this.calculateSecureBootScore(attestation.secureBootState);
    
    return {
      tpmScore,
      secureBootScore,
      attestedAt: attestation.verifiedAt,
      freshness: attestation.freshness
    };
  }
  
  private calculateTpmScore(state: TpmState, freshness: string): number {
    if (state !== TpmState.ATTESTED) return 0;
    
    // Degrade score based on freshness
    switch (freshness) {
      case 'FRESH': return 100;
      case 'ACCEPTABLE': return 80;
      case 'STALE': return 50;
      default: return 0;
    }
  }
  
  private calculateSecureBootScore(state: SecureBootState): number {
    switch (state) {
      case SecureBootState.VERIFIED: return 100;
      case SecureBootState.ENABLED_REPORTED: return 50;
      case SecureBootState.FAILED: return 0;
      default: return 0;
    }
  }
}
```

### Device Health Service

```typescript
export class DeviceHealthService {
  async getDeviceHealth(deviceId: string) {
    // Get AK status
    const akService = tpmAttestationService.getAkService();
    const identity = await akService.getDeviceIdentity(deviceId);
    
    // Get latest attestation
    const attestation = await tpmAttestationService.getLatestAttestation(deviceId);
    
    return {
      tpm: {
        present: identity !== null,
        enrolled: identity?.revokedAt === null,
        attested: attestation?.tpmState === TpmState.ATTESTED,
        lastAttestation: attestation?.verifiedAt,
        freshness: attestation?.freshness
      },
      secureBoot: {
        verified: attestation?.secureBootState === SecureBootState.VERIFIED,
        policyMatched: attestation?.policyMatched
      }
    };
  }
}
```

### Zero Trust Service

```typescript
export class ZeroTrustService {
  async evaluateDeviceTrust(deviceId: string): Promise<TrustLevel> {
    const attestation = await tpmAttestationService.getLatestAttestation(deviceId);
    
    if (!attestation) {
      return TrustLevel.UNKNOWN;
    }
    
    // TPM must be cryptographically attested
    if (attestation.tpmState !== TpmState.ATTESTED) {
      return TrustLevel.LOW;
    }
    
    // Secure boot must be verified
    if (attestation.secureBootState !== SecureBootState.VERIFIED) {
      return TrustLevel.MEDIUM;
    }
    
    // Check freshness
    if (attestation.freshness === 'EXPIRED' || attestation.freshness === 'STALE') {
      return TrustLevel.MEDIUM;
    }
    
    // All checks passed
    return TrustLevel.HIGH;
  }
  
  async shouldAllowAccess(deviceId: string, resource: string): Promise<boolean> {
    const trustLevel = await this.evaluateDeviceTrust(deviceId);
    
    // High-security resources require HIGH trust
    if (resource.startsWith('/admin') || resource.startsWith('/api/security')) {
      return trustLevel === TrustLevel.HIGH;
    }
    
    // Standard resources require at least MEDIUM trust
    return trustLevel >= TrustLevel.MEDIUM;
  }
}
```

### Compliance Service

```typescript
export class ComplianceService {
  async generateAttestationReport(tenantId: string, startDate: Date, endDate: Date) {
    const akService = tpmAttestationService.getAkService();
    const identities = await akService.listIdentities({ tenantId });
    
    const report = {
      period: { start: startDate, end: endDate },
      totalDevices: identities.length,
      enrolledDevices: identities.filter(i => i.revokedAt === null).length,
      attestations: {
        successful: 0,
        failed: 0,
        policyViolations: 0
      },
      devices: []
    };
    
    for (const identity of identities) {
      const attestation = await tpmAttestationService.getLatestAttestation(identity.deviceId);
      
      if (attestation) {
        if (attestation.tpmState === TpmState.ATTESTED) {
          report.attestations.successful++;
        } else {
          report.attestations.failed++;
        }
        
        if (attestation.secureBootState === SecureBootState.FAILED) {
          report.attestations.policyViolations++;
        }
      }
      
      report.devices.push({
        deviceId: identity.deviceId,
        manufacturer: identity.manufacturer,
        model: identity.model,
        attestationState: attestation?.tpmState ?? 'NEVER_ATTESTED',
        secureBootState: attestation?.secureBootState ?? 'UNKNOWN',
        lastVerified: attestation?.verifiedAt
      });
    }
    
    return report;
  }
}
```

## Edge Agent Integration

### Device-Side TPM Interaction

The edge agent needs to interact with the device TPM to generate quotes:

```typescript
// Example using tpm2-tools wrapper
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class EdgeTpmAgent {
  /**
   * Generate TPM quote in response to server challenge
   */
  async generateQuote(challenge: {
    nonce: string;
    pcrs: number[];
    hashAlgorithm: string;
  }): Promise<{
    quote: string;
    signature: string;
    pcrValues: Array<{ index: number; algorithm: string; value: string }>;
  }> {
    // 1. Read PCR values
    const pcrValues = await this.readPcrs(challenge.pcrs);
    
    // 2. Generate TPM quote with nonce
    const { quote, signature } = await this.tpmQuote(
      challenge.nonce,
      challenge.pcrs,
      challenge.hashAlgorithm
    );
    
    return { quote, signature, pcrValues };
  }
  
  /**
   * Read PCR values from TPM
   */
  private async readPcrs(indices: number[]): Promise<Array<{
    index: number;
    algorithm: string;
    value: string;
  }>> {
    const pcrValues = [];
    
    for (const index of indices) {
      const { stdout } = await execAsync(
        `tpm2_pcrread sha256:${index} -o /dev/null`
      );
      
      // Parse output to get PCR value
      const match = stdout.match(/sha256:\s*([0-9a-fA-F]+)/);
      if (match) {
        pcrValues.push({
          index,
          algorithm: 'sha256',
          value: match[1].toLowerCase()
        });
      }
    }
    
    return pcrValues;
  }
  
  /**
   * Generate TPM quote using Attestation Key
   */
  private async tpmQuote(
    nonce: string,
    pcrSelection: number[],
    hashAlgorithm: string
  ): Promise<{ quote: string; signature: string }> {
    // Prepare PCR selection string (e.g., "sha256:0,2,4,7")
    const pcrSelectStr = `${hashAlgorithm}:${pcrSelection.join(',')}`;
    
    // Generate quote
    const { stdout } = await execAsync(
      `tpm2_quote -c ak.ctx -l ${pcrSelectStr} -q ${nonce} -m quote.msg -s quote.sig -o quote.pcr -g ${hashAlgorithm}`
    );
    
    // Read quote and signature
    const quote = await fs.readFile('quote.msg', 'base64');
    const signature = await fs.readFile('quote.sig', 'base64');
    
    return { quote, signature };
  }
  
  /**
   * Get AK public key for enrollment
   */
  async getAkPublicKey(): Promise<string> {
    // Export AK public key in PEM format
    const { stdout } = await execAsync(
      'tpm2_readpublic -c ak.ctx -o ak.pub -f pem'
    );
    
    return await fs.readFile('ak.pub', 'utf8');
  }
}
```

### Edge Agent Attestation Loop

```typescript
export class EdgeAttestationAgent {
  private tpmAgent = new EdgeTpmAgent();
  private apiClient = new AttestationApiClient();
  
  /**
   * Continuous attestation loop
   */
  async startAttestationLoop(deviceId: string) {
    while (true) {
      try {
        await this.performAttestation(deviceId);
        
        // Wait before next attestation (e.g., 5 minutes)
        await this.sleep(5 * 60 * 1000);
      } catch (error) {
        console.error('Attestation failed:', error);
        await this.sleep(60 * 1000); // Retry after 1 minute
      }
    }
  }
  
  /**
   * Perform single attestation
   */
  private async performAttestation(deviceId: string) {
    // 1. Request challenge from server
    const challenge = await this.apiClient.requestChallenge(deviceId);
    
    console.log(`Received challenge: ${challenge.challengeId}`);
    
    // 2. Generate TPM quote
    const evidence = await this.tpmAgent.generateQuote({
      nonce: challenge.nonce,
      pcrs: challenge.pcrs,
      hashAlgorithm: challenge.hashAlgorithm
    });
    
    // 3. Get AK public key
    const akPublicKey = await this.tpmAgent.getAkPublicKey();
    
    // 4. Submit evidence
    const result = await this.apiClient.submitEvidence(deviceId, {
      challengeId: challenge.challengeId,
      quote: evidence.quote,
      signature: evidence.signature,
      pcrValues: evidence.pcrValues,
      akPublicKey,
      metadata: {
        tpmManufacturer: await this.getTpmManufacturer(),
        tpmVersion: '2.0',
        firmwareVersion: await this.getFirmwareVersion()
      }
    });
    
    // 5. Log result
    if (result.success) {
      console.log(`✓ Attestation successful: ${result.attestation.tpmState}`);
      console.log(`  Secure boot: ${result.attestation.secureBootState}`);
    } else {
      console.error(`❌ Attestation failed: ${result.error}`);
    }
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

## Monitoring and Alerts

### Prometheus Metrics

```typescript
import { Counter, Histogram, Gauge } from 'prom-client';

export class AttestationMetrics {
  private challengesIssued = new Counter({
    name: 'attestation_challenges_issued_total',
    help: 'Total number of attestation challenges issued',
    labelNames: ['tenant_id']
  });
  
  private evidenceSubmitted = new Counter({
    name: 'attestation_evidence_submitted_total',
    help: 'Total number of evidence submissions',
    labelNames: ['tenant_id', 'status']
  });
  
  private verificationDuration = new Histogram({
    name: 'attestation_verification_duration_seconds',
    help: 'Duration of attestation verification',
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
  });
  
  private attestationFailures = new Counter({
    name: 'attestation_failures_total',
    help: 'Total number of attestation failures',
    labelNames: ['reason']
  });
  
  private enrolledDevices = new Gauge({
    name: 'attestation_enrolled_devices',
    help: 'Number of devices with enrolled AKs',
    labelNames: ['tenant_id']
  });
  
  recordChallengeIssued(tenantId: string) {
    this.challengesIssued.inc({ tenant_id: tenantId });
  }
  
  recordEvidenceSubmitted(tenantId: string, success: boolean) {
    this.evidenceSubmitted.inc({
      tenant_id: tenantId,
      status: success ? 'success' : 'failure'
    });
  }
  
  recordVerificationDuration(durationSeconds: number) {
    this.verificationDuration.observe(durationSeconds);
  }
  
  recordFailure(reason: string) {
    this.attestationFailures.inc({ reason });
  }
}
```

### Alert Rules

```yaml
# alerting-rules.yml
groups:
  - name: tpm_attestation
    rules:
      - alert: HighAttestationFailureRate
        expr: |
          rate(attestation_failures_total[5m]) > 0.1
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: High attestation failure rate detected
          
      - alert: PolicyViolationSpike
        expr: |
          increase(attestation_failures_total{reason="POLICY_MISMATCH"}[1h]) > 10
        labels:
          severity: critical
        annotations:
          summary: Multiple secure boot policy violations detected
          
      - alert: StaleAttestations
        expr: |
          attestation_freshness_gauge{freshness="STALE"} > 0.3 * attestation_enrolled_devices
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: High number of stale attestations
```

## Testing

Run the test suite:

```bash
# Unit tests
npm test backend/src/attestation/__tests__/tpm-attestation.test.ts

# Integration tests with database
npm run test:integration:attestation

# Security tests
npm run test:security:attestation
```

## Troubleshooting

### Challenge Expired
**Symptom**: `CHALLENGE_EXPIRED` error  
**Solution**: Reduce network latency or increase expiration time in configuration

### AK Not Enrolled
**Symptom**: `AK_NOT_ENROLLED` error  
**Solution**: Enroll device AK via `/api/attestation/devices/:deviceId/enroll`

### Quote Signature Invalid
**Symptom**: `QUOTE_SIGNATURE_INVALID` error  
**Solution**: Verify AK public key matches enrolled key, check TPM signature format

### PCR Digest Mismatch
**Symptom**: `PCR_DIGEST_MISMATCH` error  
**Solution**: Verify PCR values are correctly read and formatted (hex, lowercase)

### Policy Mismatch
**Symptom**: `POLICY_MISMATCH` error  
**Solution**: Update PCR policy or investigate platform state change

## Summary

This integration guide provides everything needed to:
1. Set up the database
2. Integrate with existing services
3. Implement edge agent TPM interaction
4. Monitor attestation health
5. Troubleshoot common issues

For more details, see:
- [README.md](./README.md) - Architecture and API documentation
- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - Implementation details

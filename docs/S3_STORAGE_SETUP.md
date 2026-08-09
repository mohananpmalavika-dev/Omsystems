# S3 Storage Adapter Setup Guide

## Overview

The S3StorageAdapter provides production-ready cloud object storage for video recordings with support for:

- **AWS S3** (Simple Storage Service)
- **MinIO** (Self-hosted S3-compatible)
- **Wasabi** (Cost-effective S3-compatible)
- **Backblaze B2** (S3-compatible API)
- **DigitalOcean Spaces**
- Any S3-compatible storage

## Features

✅ **Multipart uploads** - Automatic for files > 100MB (configurable)  
✅ **Server-side encryption** - SSE-S3, SSE-KMS, SSE-C  
✅ **Storage classes** - Standard, IA, Intelligent-Tiering, Glacier, Deep Archive  
✅ **Lifecycle policies** - Automatic tiering and expiration  
✅ **Transfer acceleration** - Optional for global deployments  
✅ **Versioning support** - Track object versions  
✅ **Cross-region replication** - Ready for multi-region  
✅ **Retry logic** - Automatic retry with exponential backoff  
✅ **Parallel uploads** - 4 concurrent parts for multipart  

---

## Quick Start

### AWS S3

```typescript
import { createStorageAdapter } from './storage-adapter';

const adapter = createStorageAdapter({
  recordingRoot: 'recordings', // Not used for S3, but required
  supportedTiers: ['hot', 'warm', 'cold'],
  storageType: 's3',
  supportedProtocols: ['https', 's3'],
  location: 'us-east-1',
  s3Config: {
    bucket: 'my-video-recordings',
    prefix: 'surveillance',
    region: 'us-east-1',
    storageClass: 'INTELLIGENT_TIERING',
    encryption: 'AES256',
    multipartThresholdMB: 100,
    multipartChunkSizeMB: 10
  }
});

// Upload recording segment
await adapter.uploadFile(
  '/tmp/camera-1/segment-001.mp4',
  'surveillance/camera-1/2026/08/09/14/segment-001.mp4'
);
```

---

## Configuration Options

### Basic Configuration

```typescript
interface S3Config {
  // Required
  bucket: string;                    // S3 bucket name
  
  // Optional
  prefix?: string;                   // Object key prefix (default: 'recordings')
  region?: string;                   // AWS region (default: us-east-1)
  endpoint?: string;                 // Custom endpoint for MinIO/Wasabi
  accessKeyId?: string;              // Explicit credentials
  secretAccessKey?: string;          // Explicit credentials
  
  // Storage class
  storageClass?: 
    | 'STANDARD'                     // Default, frequently accessed
    | 'STANDARD_IA'                  // Infrequent access
    | 'ONEZONE_IA'                   // Single AZ infrequent access
    | 'INTELLIGENT_TIERING'          // Automatic tiering (recommended)
    | 'GLACIER'                      // Archive (minutes-hours retrieval)
    | 'GLACIER_IR'                   // Instant retrieval archive
    | 'DEEP_ARCHIVE';                // Deepest archive (12+ hours)
  
  // Encryption
  encryption?: 'AES256' | 'aws:kms'; // Server-side encryption
  kmsKeyId?: string;                 // KMS key ID for SSE-KMS
  
  // Performance
  useAccelerateEndpoint?: boolean;   // S3 Transfer Acceleration
  multipartThresholdMB?: number;     // Threshold for multipart (default: 100)
  multipartChunkSizeMB?: number;     // Part size (default: 10)
  
  // Staging
  localStagingDir?: string;          // Optional local staging directory
}
```

---

## Provider-Specific Setups

### 1. AWS S3 (Recommended for AWS)

```typescript
// Using IAM role (recommended for EC2/ECS/Lambda)
const adapter = createStorageAdapter({
  recordingRoot: 'recordings',
  supportedTiers: ['hot', 'warm', 'cold'],
  storageType: 's3',
  supportedProtocols: ['https'],
  s3Config: {
    bucket: 'sentinel-recordings-prod',
    prefix: 'recordings',
    region: 'us-east-1',
    storageClass: 'INTELLIGENT_TIERING',
    encryption: 'aws:kms',
    kmsKeyId: 'arn:aws:kms:us-east-1:123456789:key/abcd-1234',
    useAccelerateEndpoint: true // For global deployments
  }
});

// Using explicit credentials (not recommended for production)
const adapter = createStorageAdapter({
  // ... other config ...
  s3Config: {
    bucket: 'sentinel-recordings-prod',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: 'us-east-1'
  }
});
```

**IAM Policy Required:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "s3:PutObjectAcl",
        "s3:GetObjectVersion",
        "s3:DeleteObjectVersion"
      ],
      "Resource": [
        "arn:aws:s3:::sentinel-recordings-prod",
        "arn:aws:s3:::sentinel-recordings-prod/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt",
        "kms:Encrypt",
        "kms:GenerateDataKey"
      ],
      "Resource": "arn:aws:kms:us-east-1:123456789:key/abcd-1234"
    }
  ]
}
```

---

### 2. MinIO (Self-Hosted S3)

```typescript
const adapter = createStorageAdapter({
  recordingRoot: 'recordings',
  supportedTiers: ['hot'],
  storageType: 's3',
  supportedProtocols: ['https'],
  s3Config: {
    bucket: 'video-recordings',
    prefix: 'cctv',
    endpoint: 'https://minio.company.com',
    region: 'us-east-1', // MinIO accepts any region
    accessKeyId: process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.MINIO_SECRET_KEY,
    storageClass: 'STANDARD'
  }
});
```

**MinIO Server Setup:**
```bash
# Docker
docker run -p 9000:9000 -p 9001:9001 \
  -e "MINIO_ROOT_USER=admin" \
  -e "MINIO_ROOT_PASSWORD=strongpassword" \
  -v /mnt/data:/data \
  minio/minio server /data --console-address ":9001"

# Create bucket
mc alias set myminio http://localhost:9000 admin strongpassword
mc mb myminio/video-recordings
mc policy set download myminio/video-recordings
```

---

### 3. Wasabi (Cost-Effective Cloud Storage)

```typescript
const adapter = createStorageAdapter({
  recordingRoot: 'recordings',
  supportedTiers: ['hot'],
  storageType: 's3',
  supportedProtocols: ['https'],
  s3Config: {
    bucket: 'my-video-archive',
    prefix: 'recordings',
    endpoint: 'https://s3.us-east-1.wasabisys.com',
    region: 'us-east-1',
    accessKeyId: process.env.WASABI_ACCESS_KEY,
    secretAccessKey: process.env.WASABI_SECRET_KEY,
    storageClass: 'STANDARD'
  }
});
```

**Wasabi Regions:**
- `us-east-1` → s3.us-east-1.wasabisys.com
- `us-east-2` → s3.us-east-2.wasabisys.com
- `us-west-1` → s3.us-west-1.wasabisys.com
- `eu-central-1` → s3.eu-central-1.wasabisys.com
- `ap-northeast-1` → s3.ap-northeast-1.wasabisys.com

---

### 4. Backblaze B2

```typescript
const adapter = createStorageAdapter({
  recordingRoot: 'recordings',
  supportedTiers: ['hot'],
  storageType: 's3',
  supportedProtocols: ['https'],
  s3Config: {
    bucket: 'my-video-bucket',
    prefix: 'recordings',
    endpoint: 'https://s3.us-west-004.backblazeb2.com',
    region: 'us-west-004',
    accessKeyId: process.env.B2_KEY_ID,
    secretAccessKey: process.env.B2_APPLICATION_KEY,
    storageClass: 'STANDARD'
  }
});
```

---

### 5. DigitalOcean Spaces

```typescript
const adapter = createStorageAdapter({
  recordingRoot: 'recordings',
  supportedTiers: ['hot'],
  storageType: 's3',
  supportedProtocols: ['https'],
  s3Config: {
    bucket: 'my-video-space',
    prefix: 'recordings',
    endpoint: 'https://nyc3.digitaloceanspaces.com',
    region: 'nyc3',
    accessKeyId: process.env.DO_SPACES_KEY,
    secretAccessKey: process.env.DO_SPACES_SECRET,
    storageClass: 'STANDARD'
  }
});
```

---

## Storage Classes & Costs

### AWS S3 Storage Classes

| Class | Retrieval | Cost/GB/Month | Use Case |
|-------|-----------|---------------|----------|
| STANDARD | Instant | $0.023 | Active recordings (< 30 days) |
| INTELLIGENT_TIERING | Instant | $0.0125-0.023 | **Recommended** - Auto-optimizes |
| STANDARD_IA | Instant | $0.0125 | Recordings 30-90 days old |
| ONEZONE_IA | Instant | $0.01 | Non-critical, single AZ |
| GLACIER_IR | Instant | $0.004 | Archive, instant retrieval |
| GLACIER | Minutes-hours | $0.0036 | Archive, rarely accessed |
| DEEP_ARCHIVE | 12+ hours | $0.00099 | Long-term compliance |

**Recommendation:** Use `INTELLIGENT_TIERING` - automatically moves objects between access tiers based on usage patterns.

---

## Lifecycle Policy Example

Automatically transition recordings to cheaper storage over time:

```typescript
await adapter.setLifecyclePolicy([
  {
    id: 'tiered-storage',
    prefix: 'recordings/',
    transitionDays: [
      { storageClass: 'STANDARD_IA', days: 30 },      // Move to IA after 30 days
      { storageClass: 'GLACIER_IR', days: 90 },       // Archive after 90 days
      { storageClass: 'DEEP_ARCHIVE', days: 365 }     // Deep archive after 1 year
    ],
    expirationDays: 2555 // Delete after 7 years (compliance requirement)
  },
  {
    id: 'delete-staging',
    prefix: 'recordings/.staging/',
    expirationDays: 1 // Delete staging files after 1 day
  }
]);
```

**Cost Savings Example:**
- 10 TB recordings, 30 days retention
- STANDARD: $230/month
- With lifecycle (30d STANDARD, 60d IA, 270d Glacier): **$85/month** (63% savings)

---

## Performance Tuning

### Multipart Upload Configuration

```typescript
s3Config: {
  // ... other config ...
  
  // Small files (< 100MB): single-part upload
  multipartThresholdMB: 100,
  
  // Large files: 10MB parts (good balance)
  multipartChunkSizeMB: 10,
  
  // Enable for global deployments
  useAccelerateEndpoint: true
}
```

**Upload Performance:**
- Single-part: Good for files < 100MB
- Multipart: 4 concurrent parts = ~4x faster for large files
- Transfer Acceleration: 2-6x faster for international uploads

---

## Encryption Options

### 1. SSE-S3 (AWS-Managed Keys)

```typescript
s3Config: {
  encryption: 'AES256'
}
```

- ✅ Free
- ✅ Automatic key rotation
- ✅ No configuration needed
- ❌ No audit trail

### 2. SSE-KMS (Customer-Managed Keys)

```typescript
s3Config: {
  encryption: 'aws:kms',
  kmsKeyId: 'arn:aws:kms:us-east-1:123456789:key/abcd-1234'
}
```

- ✅ Audit trail in CloudTrail
- ✅ Fine-grained access control
- ✅ Key rotation control
- ❌ Additional cost (~$1/month + $0.03 per 10K requests)

---

## Monitoring & Operations

### Health Check

```typescript
// Check storage health
const metrics = await adapter.getMetrics();

console.log({
  status: metrics.status,           // 'healthy' | 'warning' | 'critical'
  usedGB: metrics.usedBytes / 1024 / 1024 / 1024,
  location: metrics.location        // 's3://bucket-name/prefix'
});
```

### Write Probe

```typescript
// Test S3 write/read/delete
const probe = await adapter.runWriteProbe();

console.log({
  status: probe.status,             // 'passed' | 'failed'
  latencyMs: probe.latencyMs,
  error: probe.error
});
```

---

## High Availability Setup

### Cross-Region Replication

```bash
# Enable versioning (required for replication)
aws s3api put-bucket-versioning \
  --bucket sentinel-recordings-prod \
  --versioning-configuration Status=Enabled

# Create replication configuration
aws s3api put-bucket-replication \
  --bucket sentinel-recordings-prod \
  --replication-configuration file://replication.json
```

**replication.json:**
```json
{
  "Role": "arn:aws:iam::123456789:role/s3-replication-role",
  "Rules": [{
    "ID": "ReplicateAll",
    "Priority": 1,
    "Status": "Enabled",
    "Filter": { "Prefix": "recordings/" },
    "Destination": {
      "Bucket": "arn:aws:s3:::sentinel-recordings-backup",
      "ReplicationTime": {
        "Status": "Enabled",
        "Time": { "Minutes": 15 }
      }
    }
  }]
}
```

---

## Security Best Practices

### 1. Bucket Policy (Deny Public Access)

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Deny",
    "Principal": "*",
    "Action": "s3:*",
    "Resource": [
      "arn:aws:s3:::sentinel-recordings-prod",
      "arn:aws:s3:::sentinel-recordings-prod/*"
    ],
    "Condition": {
      "Bool": { "aws:SecureTransport": "false" }
    }
  }]
}
```

### 2. Enable Versioning

```bash
aws s3api put-bucket-versioning \
  --bucket sentinel-recordings-prod \
  --versioning-configuration Status=Enabled
```

### 3. Enable Object Lock (WORM)

```bash
aws s3api put-object-lock-configuration \
  --bucket sentinel-recordings-prod \
  --object-lock-configuration \
    "ObjectLockEnabled=Enabled,Rule={DefaultRetention={Mode=GOVERNANCE,Years=7}}"
```

---

## Troubleshooting

### Error: "Bucket does not exist"

**Solution:**
```bash
# Create bucket
aws s3 mb s3://my-bucket --region us-east-1

# Verify
aws s3 ls s3://my-bucket
```

### Error: "Access Denied"

**Solution:** Check IAM policy has required permissions (see IAM Policy section)

### Error: "Multipart upload failed"

**Causes:**
- Network timeout (increase `httpOptions.timeout`)
- Insufficient permissions (add `s3:AbortMultipartUpload`)
- Disk space (ensure staging directory has space)

### Slow Uploads

**Solutions:**
1. Enable Transfer Acceleration: `useAccelerateEndpoint: true`
2. Increase chunk size: `multipartChunkSizeMB: 20`
3. Use VPC endpoint (if on AWS)
4. Check network bandwidth

---

## Cost Optimization

### 1. Use Intelligent-Tiering

```typescript
storageClass: 'INTELLIGENT_TIERING'
```

- Automatic optimization
- No retrieval fees
- Small monthly monitoring cost

### 2. Implement Lifecycle Policies

```typescript
await adapter.setLifecyclePolicy([...]);
```

- Transition to IA after 30 days (50% savings)
- Archive to Glacier after 90 days (80% savings)

### 3. Enable Compression

```typescript
// Before uploading, compress video if not already compressed
// H.264/H.265 already compressed, but consider:
// - Reducing bitrate for archive tiers
// - Using more efficient codecs
```

### 4. Use Requester Pays (Optional)

```bash
aws s3api put-bucket-request-payment \
  --bucket sentinel-recordings-prod \
  --request-payment-configuration Payer=Requester
```

---

## Migration from Local Storage

```typescript
// Step 1: Set up S3 adapter
const s3Adapter = createStorageAdapter({
  storageType: 's3',
  s3Config: { /* ... */ }
});

// Step 2: Migrate existing recordings
const localPath = '/mnt/recordings';
const files = await fs.readdir(localPath, { recursive: true });

for (const file of files) {
  const localFilePath = path.join(localPath, file);
  const s3Key = `recordings/${file}`;
  
  console.log(`Migrating: ${file}`);
  await s3Adapter.uploadFile(localFilePath, s3Key);
}

// Step 3: Switch configuration to use S3
```

---

## API Reference

### Core Methods

```typescript
// Get storage metrics
await adapter.getMetrics(): Promise<StorageMetrics>

// Test storage health
await adapter.runWriteProbe(): Promise<StorageProbeResult>

// Get staging path for camera
await adapter.getStagingPath(cameraId: string): Promise<string>

// Resolve target path for segment
adapter.resolveSegmentTargetPath(
  cameraId: string, 
  startedAt: Date, 
  fileName: string
): string

// Delete segment
await adapter.deleteSegmentFile(storagePath: string): Promise<void>
```

### Extended Methods

```typescript
// Upload file with automatic multipart
await adapter.uploadFile(
  localPath: string, 
  s3Key: string
): Promise<{ etag: string; versionId?: string }>

// Download file
await adapter.downloadFile(
  s3Key: string, 
  localPath: string
): Promise<void>

// Check existence
await adapter.exists(s3Key: string): Promise<boolean>

// Get metadata
await adapter.getObjectMetadata(s3Key: string): Promise<{
  size: number;
  lastModified: Date;
  etag: string;
  storageClass: string;
}>

// Set lifecycle policy
await adapter.setLifecyclePolicy(rules: LifecycleRule[]): Promise<void>
```

---

## Support

For S3-related issues:
1. Check AWS credentials and permissions
2. Verify bucket exists and is accessible
3. Review CloudWatch S3 metrics
4. Enable S3 access logging for debugging
5. Test with `aws s3 ls s3://your-bucket` command

**Useful Commands:**
```bash
# Test credentials
aws sts get-caller-identity

# List buckets
aws s3 ls

# Check bucket location
aws s3api get-bucket-location --bucket my-bucket

# Monitor metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/S3 \
  --metric-name NumberOfObjects \
  --dimensions Name=BucketName,Value=my-bucket
```

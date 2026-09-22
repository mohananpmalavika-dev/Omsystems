# Automatic Cloud Storage Failover

## Overview

When local storage (memory card or HDD) is full, unavailable, or missing, the system automatically fails over to cloud storage to ensure continuous recording and data preservation.

## Features

### 1. Automatic Failover
- **Primary Storage**: Local HDD/NVR storage
- **Secondary Storage**: SD Card/Memory Card
- **Tertiary Storage**: Cloud Storage (AWS S3, Azure Blob, Google Cloud Storage)

### 2. Configurable Cloud Storage Options
- **Always Cloud**: Store all recordings directly to cloud
- **Hybrid Mode**: Store locally with automatic cloud backup
- **Failover Only**: Use cloud only when local storage fails
- **Manual Upload**: Allow operators to manually upload clips to cloud

### 3. Intelligent Failover Logic
```
1. Check Primary Storage (HDD) → If available, record here
2. If Primary Full/Failed → Check Secondary Storage (SD Card)
3. If Secondary Full/Failed → Failover to Cloud Storage
4. If Cloud Unavailable → Buffer to edge device temporary storage
5. When storage recovers → Sync buffered data back
```

## Architecture

### Storage Tiers

```
┌─────────────────────────────────────────────────────────────┐
│                     Storage Hierarchy                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Tier 1: Local HDD/NVR Storage (Primary)                    │
│  ├─ Capacity: 2TB - 100TB                                   │
│  ├─ Retention: 30-90 days                                   │
│  └─ Performance: Fastest access                              │
│                                                               │
│  Tier 2: SD Card/Memory Card (Secondary)                    │
│  ├─ Capacity: 32GB - 512GB                                  │
│  ├─ Retention: 7-14 days                                    │
│  └─ Performance: Fast local access                          │
│                                                               │
│  Tier 3: Cloud Storage (Tertiary/Failover)                 │
│  ├─ Capacity: Unlimited                                      │
│  ├─ Retention: Configurable (1-365+ days)                  │
│  └─ Performance: Network-dependent access                   │
│                                                               │
│  Tier 4: Edge Buffer (Emergency)                            │
│  ├─ Capacity: 1GB - 10GB                                    │
│  ├─ Retention: Hours to days                                │
│  └─ Performance: Temporary only                             │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Failover Flow

```mermaid
graph TD
    A[New Recording Segment] --> B{Primary Storage<br/>Available?}
    B -->|Yes| C[Write to Primary HDD]
    B -->|No| D{Secondary Storage<br/>Available?}
    
    D -->|Yes| E[Write to SD Card]
    D -->|No| F{Cloud Storage<br/>Configured?}
    
    F -->|Yes| G[Upload to Cloud]
    F -->|No| H{Edge Buffer<br/>Available?}
    
    H -->|Yes| I[Buffer on Edge Device]
    H -->|No| J[Alert: Recording Lost]
    
    C --> K[Update Storage Metrics]
    E --> K
    G --> K
    I --> L[Queue for Sync]
    
    L --> M{Storage Recovered?}
    M -->|Yes| N[Sync Buffer to Storage]
    M -->|No| L
```

## Configuration

### Global Cloud Storage Settings

**File**: `database/migrations/130_cloud_storage_failover.sql`

```sql
-- Cloud storage configuration table
CREATE TABLE cloud_storage_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('aws-s3', 'azure-blob', 'google-cloud', 'wasabi', 'backblaze-b2', 'custom-s3')),
  
  -- Connection details
  bucket_name TEXT NOT NULL,
  region TEXT,
  endpoint_url TEXT,
  access_key_id TEXT,
  secret_access_key_encrypted TEXT,
  
  -- Failover configuration
  failover_enabled BOOLEAN DEFAULT true,
  failover_mode TEXT DEFAULT 'automatic' CHECK (failover_mode IN ('automatic', 'manual', 'disabled')),
  
  -- Storage policy
  storage_class TEXT DEFAULT 'STANDARD',
  retention_days INTEGER DEFAULT 90,
  lifecycle_enabled BOOLEAN DEFAULT true,
  
  -- Upload settings
  max_upload_bandwidth_mbps INTEGER DEFAULT 100,
  concurrent_uploads INTEGER DEFAULT 5,
  chunk_size_mb INTEGER DEFAULT 100,
  
  -- Cost optimization
  compress_before_upload BOOLEAN DEFAULT true,
  deduplicate BOOLEAN DEFAULT false,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  last_health_check_at TIMESTAMPTZ,
  health_status TEXT DEFAULT 'unknown',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(tenant_id, provider, bucket_name)
);

-- Per-camera cloud storage preferences
CREATE TABLE camera_storage_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  
  -- Storage tier preferences (priority order)
  primary_storage_tier TEXT DEFAULT 'local-hdd' 
    CHECK (primary_storage_tier IN ('local-hdd', 'sd-card', 'cloud', 'edge-buffer')),
  secondary_storage_tier TEXT DEFAULT 'sd-card',
  tertiary_storage_tier TEXT DEFAULT 'cloud',
  
  -- Cloud storage options
  cloud_storage_mode TEXT DEFAULT 'failover-only' 
    CHECK (cloud_storage_mode IN ('always', 'hybrid', 'failover-only', 'manual', 'disabled')),
  cloud_config_id UUID REFERENCES cloud_storage_configs(id),
  
  -- Recording quality for cloud (to save bandwidth/cost)
  cloud_stream_profile TEXT DEFAULT 'main' CHECK (cloud_stream_profile IN ('main', 'sub', 'mobile')),
  cloud_fps_limit INTEGER,
  cloud_resolution_limit TEXT,
  
  -- Sync settings
  auto_sync_to_cloud BOOLEAN DEFAULT false,
  sync_delay_minutes INTEGER DEFAULT 60,
  sync_only_critical_events BOOLEAN DEFAULT false,
  
  -- Cost control
  cloud_retention_override_days INTEGER,
  max_daily_cloud_upload_gb NUMERIC(10,2),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(tenant_id, camera_id)
);

-- Cloud upload queue
CREATE TABLE cloud_upload_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  camera_id UUID NOT NULL,
  segment_id UUID NOT NULL,
  
  -- Segment details
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_seconds INTEGER NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  file_path TEXT NOT NULL,
  
  -- Upload tracking
  cloud_config_id UUID NOT NULL REFERENCES cloud_storage_configs(id),
  upload_status TEXT DEFAULT 'pending' 
    CHECK (upload_status IN ('pending', 'uploading', 'completed', 'failed', 'cancelled')),
  upload_started_at TIMESTAMPTZ,
  upload_completed_at TIMESTAMPTZ,
  upload_progress_percent NUMERIC(5,2) DEFAULT 0,
  
  -- Cloud storage location
  cloud_storage_key TEXT,
  cloud_storage_url TEXT,
  storage_class TEXT,
  
  -- Error handling
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  last_error TEXT,
  
  -- Priority
  priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  is_critical BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cloud_upload_queue_status ON cloud_upload_queue(tenant_id, upload_status, created_at);
CREATE INDEX idx_cloud_upload_queue_camera ON cloud_upload_queue(camera_id, upload_status);
CREATE INDEX idx_cloud_upload_queue_priority ON cloud_upload_queue(priority DESC, created_at);

-- Cloud storage audit log
CREATE TABLE cloud_storage_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  camera_id UUID,
  
  event_type TEXT NOT NULL CHECK (event_type IN (
    'failover_triggered', 'manual_upload', 'auto_sync', 
    'storage_recovered', 'upload_completed', 'upload_failed',
    'config_changed', 'health_check_failed'
  )),
  
  -- Event details
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  message TEXT NOT NULL,
  details JSONB,
  
  -- Storage metrics
  local_storage_available_gb NUMERIC(10,2),
  cloud_storage_used_gb NUMERIC(10,2),
  bytes_uploaded BIGINT,
  
  -- Trigger reason
  trigger_reason TEXT,
  triggered_by TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cloud_storage_audit_camera ON cloud_storage_audit(camera_id, created_at DESC);
CREATE INDEX idx_cloud_storage_audit_type ON cloud_storage_audit(event_type, created_at DESC);
```

## API Endpoints

### Configure Cloud Storage

**POST** `/v1/storage/cloud/config`

```typescript
{
  "provider": "aws-s3",
  "bucketName": "surveillance-recordings",
  "region": "us-east-1",
  "accessKeyId": "AKIAIOSFODNN7EXAMPLE",
  "secretAccessKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  
  "failoverEnabled": true,
  "failoverMode": "automatic",
  
  "storageClass": "STANDARD",
  "retentionDays": 90,
  "lifecycleEnabled": true,
  
  "maxUploadBandwidthMbps": 100,
  "compressBeforeUpload": true
}
```

### Configure Camera Storage Preferences

**PUT** `/v1/cameras/{cameraId}/storage-config`

```typescript
{
  "primaryStorageTier": "local-hdd",
  "secondaryStorageTier": "sd-card",
  "tertiaryStorageTier": "cloud",
  
  "cloudStorageMode": "failover-only", // or "always", "hybrid", "manual", "disabled"
  "cloudConfigId": "550e8400-e29b-41d4-a716-446655440000",
  
  "cloudStreamProfile": "sub", // Use sub-stream for cloud to save bandwidth
  "cloudFpsLimit": 15,
  "cloudResolutionLimit": "1080p",
  
  "autoSyncToCloud": false,
  "syncDelayMinutes": 60,
  "syncOnlyCriticalEvents": true,
  
  "maxDailyCloudUploadGb": 50
}
```

### Manual Upload to Cloud

**POST** `/v1/recordings/upload-to-cloud`

```typescript
{
  "cameraId": "550e8400-e29b-41d4-a716-446655440000",
  "startTime": "2024-01-15T10:00:00Z",
  "endTime": "2024-01-15T11:00:00Z",
  "priority": 10,
  "isCritical": true,
  "reason": "Evidence for incident #12345"
}
```

### Check Cloud Storage Status

**GET** `/v1/storage/cloud/status`

```typescript
{
  "success": true,
  "data": {
    "cloudConfigured": true,
    "provider": "aws-s3",
    "bucketName": "surveillance-recordings",
    "healthStatus": "healthy",
    "lastHealthCheckAt": "2024-01-15T10:30:00Z",
    
    "statistics": {
      "totalStoredGb": 1250.5,
      "totalSegments": 45230,
      "camerasUsingCloud": 12,
      "uploadQueueSize": 5,
      "uploadingNow": 2,
      "failedUploads": 1,
      "monthlyCostEstimateUsd": 125.50
    },
    
    "failoverStatus": {
      "activeFailovers": 2,
      "cameras": [
        {
          "cameraId": "cam-001",
          "cameraName": "Entrance Camera",
          "reason": "Local HDD full",
          "failedOverAt": "2024-01-15T09:15:00Z"
        }
      ]
    }
  }
}
```

## Implementation

### Backend Service

**File**: `src/services/cloud-storage-failover.service.ts`

```typescript
import { S3Client, PutObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { BlobServiceClient } from '@azure/storage-blob';
import { Storage as GoogleCloudStorage } from '@google-cloud/storage';
import type { ControlPlaneStore } from '../control-plane-store.js';

export interface CloudStorageConfig {
  id: string;
  tenantId: string;
  provider: 'aws-s3' | 'azure-blob' | 'google-cloud' | 'wasabi' | 'backblaze-b2' | 'custom-s3';
  bucketName: string;
  region?: string;
  endpointUrl?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  failoverEnabled: boolean;
  failoverMode: 'automatic' | 'manual' | 'disabled';
  storageClass: string;
  retentionDays: number;
  maxUploadBandwidthMbps: number;
  compressBeforeUpload: boolean;
}

export interface CameraStorageConfig {
  cameraId: string;
  primaryStorageTier: 'local-hdd' | 'sd-card' | 'cloud' | 'edge-buffer';
  secondaryStorageTier?: string;
  tertiaryStorageTier?: string;
  cloudStorageMode: 'always' | 'hybrid' | 'failover-only' | 'manual' | 'disabled';
  cloudConfigId?: string;
  cloudStreamProfile: 'main' | 'sub' | 'mobile';
  autoSyncToCloud: boolean;
  maxDailyCloudUploadGb?: number;
}

export interface UploadJob {
  id: string;
  cameraId: string;
  segmentId: string;
  filePath: string;
  fileSize: number;
  priority: number;
  isCritical: boolean;
  uploadStatus: 'pending' | 'uploading' | 'completed' | 'failed' | 'cancelled';
}

export class CloudStorageFailoverService {
  private s3Clients = new Map<string, S3Client>();
  private azureClients = new Map<string, BlobServiceClient>();
  private gcpClients = new Map<string, GoogleCloudStorage>();
  private uploadWorkers = new Map<string, boolean>();

  constructor(
    private store: ControlPlaneStore,
    private maxConcurrentUploads = 5
  ) {
    this.startUploadWorkers();
  }

  /**
   * Check if storage tier is available and has capacity
   */
  async checkStorageAvailability(
    tenantId: string,
    cameraId: string,
    tier: string
  ): Promise<{ available: boolean; reason?: string; capacityGb?: number }> {
    // Query operational telemetry for storage health
    const telemetry = await this.store.listLatestOperationalTelemetry(tenantId, [cameraId]);
    
    if (tier === 'local-hdd') {
      const disk = telemetry.find(t => t.deviceType === 'disk' && t.metrics.tier === 'primary');
      if (!disk) return { available: false, reason: 'No HDD configured' };
      
      const freeGb = (disk.metrics.freeBytes as number || 0) / 1e9;
      const minFreeGb = 10; // Require at least 10GB free
      
      return {
        available: freeGb > minFreeGb,
        reason: freeGb <= minFreeGb ? 'HDD full' : undefined,
        capacityGb: freeGb
      };
    }
    
    if (tier === 'sd-card') {
      const sdCard = telemetry.find(t => t.deviceType === 'disk' && t.metrics.tier === 'secondary');
      if (!sdCard) return { available: false, reason: 'No SD card configured' };
      
      const freeGb = (sdCard.metrics.freeBytes as number || 0) / 1e9;
      const minFreeGb = 1;
      
      return {
        available: freeGb > minFreeGb,
        reason: freeGb <= minFreeGb ? 'SD card full' : undefined,
        capacityGb: freeGb
      };
    }
    
    if (tier === 'cloud') {
      const config = await this.getCloudConfig(tenantId);
      if (!config) return { available: false, reason: 'Cloud storage not configured' };
      
      const health = await this.checkCloudHealth(config);
      return {
        available: health.healthy,
        reason: health.healthy ? undefined : health.error,
        capacityGb: Number.MAX_SAFE_INTEGER // Cloud = unlimited
      };
    }
    
    return { available: false, reason: 'Unknown storage tier' };
  }

  /**
   * Determine which storage tier to use based on configuration and availability
   */
  async selectStorageTier(
    tenantId: string,
    cameraId: string
  ): Promise<{ tier: string; reason: string; failover: boolean }> {
    const config = await this.getCameraStorageConfig(tenantId, cameraId);
    
    // If cloud storage mode is "always", use cloud directly
    if (config.cloudStorageMode === 'always') {
      return { tier: 'cloud', reason: 'Configured for cloud-first storage', failover: false };
    }
    
    // Check storage tiers in priority order
    const tiers = [
      config.primaryStorageTier,
      config.secondaryStorageTier,
      config.tertiaryStorageTier
    ].filter(Boolean);
    
    for (const tier of tiers) {
      const check = await this.checkStorageAvailability(tenantId, cameraId, tier!);
      if (check.available) {
        return { tier: tier!, reason: 'Storage available', failover: false };
      }
    }
    
    // All configured storage failed - log critical alert
    await this.logFailoverEvent(tenantId, cameraId, {
      eventType: 'failover_triggered',
      severity: 'critical',
      message: 'All configured storage tiers unavailable',
      triggerReason: 'Storage exhaustion'
    });
    
    // Return cloud as last resort if configured
    if (config.cloudConfigId && config.cloudStorageMode !== 'disabled') {
      return { tier: 'cloud', reason: 'Failover to cloud (all local storage full)', failover: true };
    }
    
    // No storage available
    throw new Error('No storage available for recording');
  }

  /**
   * Queue segment for cloud upload
   */
  async queueCloudUpload(
    tenantId: string,
    cameraId: string,
    segment: {
      id: string;
      startTime: Date;
      endTime: Date;
      durationSeconds: number;
      filePath: string;
      fileSize: number;
    },
    options: {
      priority?: number;
      isCritical?: boolean;
      reason?: string;
    } = {}
  ): Promise<UploadJob> {
    const config = await this.getCameraStorageConfig(tenantId, cameraId);
    if (!config.cloudConfigId) {
      throw new Error('Cloud storage not configured for this camera');
    }
    
    const db = this.store as any;
    const result = await db.query(`
      INSERT INTO cloud_upload_queue (
        tenant_id, camera_id, segment_id,
        start_time, end_time, duration_seconds, file_size_bytes, file_path,
        cloud_config_id, priority, is_critical
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      tenantId, cameraId, segment.id,
      segment.startTime, segment.endTime, segment.durationSeconds,
      segment.fileSize, segment.filePath,
      config.cloudConfigId, options.priority || 5, options.isCritical || false
    ]);
    
    await this.logFailoverEvent(tenantId, cameraId, {
      eventType: 'manual_upload',
      severity: 'info',
      message: `Queued segment for cloud upload: ${segment.id}`,
      details: { segmentId: segment.id, fileSize: segment.fileSize, reason: options.reason }
    });
    
    return result.rows[0];
  }

  /**
   * Process upload queue
   */
  private async startUploadWorkers() {
    for (let i = 0; i < this.maxConcurrentUploads; i++) {
      const workerId = `worker-${i}`;
      this.uploadWorkers.set(workerId, true);
      this.processUploadQueue(workerId).catch(console.error);
    }
  }

  private async processUploadQueue(workerId: string) {
    while (this.uploadWorkers.get(workerId)) {
      try {
        const job = await this.getNextUploadJob();
        if (!job) {
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s
          continue;
        }
        
        await this.uploadSegment(job);
      } catch (error) {
        console.error(`[${workerId}] Upload error:`, error);
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10s on error
      }
    }
  }

  private async getNextUploadJob(): Promise<UploadJob | null> {
    const db = this.store as any;
    const result = await db.query(`
      UPDATE cloud_upload_queue
      SET upload_status = 'uploading', upload_started_at = NOW()
      WHERE id = (
        SELECT id FROM cloud_upload_queue
        WHERE upload_status = 'pending'
          AND retry_count < max_retries
        ORDER BY priority DESC, created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `);
    
    return result.rows[0] || null;
  }

  private async uploadSegment(job: UploadJob): Promise<void> {
    const fs = await import('fs/promises');
    const cloudConfig = await this.getCloudConfigById(job.cloudConfigId);
    
    try {
      // Read file
      const fileBuffer = await fs.readFile(job.filePath);
      
      // Compress if enabled
      const dataToUpload = cloudConfig.compressBeforeUpload
        ? await this.compressData(fileBuffer)
        : fileBuffer;
      
      // Upload based on provider
      const storageKey = this.generateStorageKey(job);
      let uploadResult: { url: string; storageClass: string };
      
      if (cloudConfig.provider === 'aws-s3') {
        uploadResult = await this.uploadToS3(cloudConfig, storageKey, dataToUpload);
      } else if (cloudConfig.provider === 'azure-blob') {
        uploadResult = await this.uploadToAzure(cloudConfig, storageKey, dataToUpload);
      } else if (cloudConfig.provider === 'google-cloud') {
        uploadResult = await this.uploadToGCP(cloudConfig, storageKey, dataToUpload);
      } else {
        throw new Error(`Unsupported cloud provider: ${cloudConfig.provider}`);
      }
      
      // Update job status
      await this.markUploadComplete(job.id, uploadResult);
      
      // Log success
      await this.logFailoverEvent(job.tenantId, job.cameraId, {
        eventType: 'upload_completed',
        severity: 'info',
        message: `Uploaded segment ${job.segmentId} to cloud`,
        details: { storageKey, bytesUploaded: dataToUpload.byteLength }
      });
      
    } catch (error) {
      await this.handleUploadFailure(job, error);
    }
  }

  private async uploadToS3(
    config: CloudStorageConfig,
    key: string,
    data: Buffer
  ): Promise<{ url: string; storageClass: string }> {
    const client = this.getS3Client(config);
    
    await client.send(new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      Body: data,
      StorageClass: config.storageClass,
      ServerSideEncryption: 'AES256',
      Metadata: {
        'uploaded-at': new Date().toISOString(),
        'retention-days': config.retentionDays.toString()
      }
    }));
    
    return {
      url: `s3://${config.bucketName}/${key}`,
      storageClass: config.storageClass
    };
  }

  private getS3Client(config: CloudStorageConfig): S3Client {
    const clientKey = `${config.id}`;
    if (!this.s3Clients.has(clientKey)) {
      this.s3Clients.set(clientKey, new S3Client({
        region: config.region,
        endpoint: config.endpointUrl,
        credentials: config.accessKeyId && config.secretAccessKey ? {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey
        } : undefined
      }));
    }
    return this.s3Clients.get(clientKey)!;
  }

  private async checkCloudHealth(config: CloudStorageConfig): Promise<{ healthy: boolean; error?: string }> {
    try {
      if (config.provider === 'aws-s3') {
        const client = this.getS3Client(config);
        await client.send(new HeadBucketCommand({ Bucket: config.bucketName }));
      }
      // Add Azure/GCP health checks
      
      return { healthy: true };
    } catch (error) {
      return { healthy: false, error: (error as Error).message };
    }
  }

  // Placeholder methods - implement as needed
  private async getCameraStorageConfig(tenantId: string, cameraId: string): Promise<CameraStorageConfig> {
    // Implementation
    return {} as CameraStorageConfig;
  }

  private async getCloudConfig(tenantId: string): Promise<CloudStorageConfig | null> {
    // Implementation
    return null;
  }

  private async getCloudConfigById(id: string): Promise<CloudStorageConfig> {
    // Implementation
    return {} as CloudStorageConfig;
  }

  private async logFailoverEvent(tenantId: string, cameraId: string, event: any) {
    // Implementation
  }

  private generateStorageKey(job: UploadJob): string {
    const date = new Date();
    return `recordings/${job.cameraId}/${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}/${job.segmentId}.mp4`;
  }

  private async compressData(buffer: Buffer): Promise<Buffer> {
    // Implementation - use zlib or similar
    return buffer;
  }

  private async markUploadComplete(jobId: string, result: { url: string; storageClass: string }) {
    // Implementation
  }

  private async handleUploadFailure(job: UploadJob, error: any) {
    // Implementation
  }

  private async uploadToAzure(config: CloudStorageConfig, key: string, data: Buffer) {
    // Implementation
    return { url: '', storageClass: '' };
  }

  private async uploadToGCP(config: CloudStorageConfig, key: string, data: Buffer) {
    // Implementation
    return { url: '', storageClass: '' };
  }
}
```

## User Interface

### Storage Configuration Screen

**File**: `dashboard/app/settings/storage/page.tsx`

Add a new settings page for cloud storage configuration:

```typescript
'use client';

import { useState } from 'react';
import { CloudIcon, ServerIcon, SdCardIcon, ShieldCheckIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export default function StorageSettingsPage() {
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [provider, setProvider] = useState('aws-s3');
  const [failoverMode, setFailoverMode] = useState('automatic');

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Storage Configuration</h1>
        <p className="text-muted-foreground mt-2">
          Configure storage tiers and automatic cloud failover
        </p>
      </div>

      {/* Storage Tiers */}
      <Card>
        <CardHeader>
          <CardTitle>Storage Tier Configuration</CardTitle>
          <CardDescription>
            Define the priority order for storage. System will automatically failover if a tier is unavailable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 p-4 border rounded-lg">
            <ServerIcon className="h-8 w-8 text-blue-500" />
            <div className="flex-1">
              <h3 className="font-semibold">Primary: Local HDD/NVR</h3>
              <p className="text-sm text-muted-foreground">Main recording storage</p>
            </div>
            <span className="text-sm text-green-600">✓ Active</span>
          </div>

          <div className="flex items-center gap-4 p-4 border rounded-lg">
            <SdCardIcon className="h-8 w-8 text-orange-500" />
            <div className="flex-1">
              <h3 className="font-semibold">Secondary: SD Card</h3>
              <p className="text-sm text-muted-foreground">Backup local storage</p>
            </div>
            <span className="text-sm text-yellow-600">○ Standby</span>
          </div>

          <div className="flex items-center gap-4 p-4 border rounded-lg bg-slate-50 dark:bg-slate-900">
            <CloudIcon className="h-8 w-8 text-purple-500" />
            <div className="flex-1">
              <h3 className="font-semibold">Tertiary: Cloud Storage</h3>
              <p className="text-sm text-muted-foreground">Automatic failover and backup</p>
            </div>
            <Switch checked={cloudEnabled} onCheckedChange={setCloudEnabled} />
          </div>
        </CardContent>
      </Card>

      {/* Cloud Storage Configuration */}
      {cloudEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CloudIcon className="h-5 w-5" />
              Cloud Storage Configuration
            </CardTitle>
            <CardDescription>
              Configure cloud storage provider and automatic failover settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Cloud Provider</label>
              <Select value={provider} onValueChange={setProvider}>
                <option value="aws-s3">AWS S3</option>
                <option value="azure-blob">Azure Blob Storage</option>
                <option value="google-cloud">Google Cloud Storage</option>
                <option value="wasabi">Wasabi Hot Cloud Storage</option>
                <option value="backblaze-b2">Backblaze B2</option>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Bucket/Container Name</label>
                <Input placeholder="surveillance-recordings" />
              </div>
              <div>
                <label className="text-sm font-medium">Region</label>
                <Input placeholder="us-east-1" />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Failover Mode</label>
              <Select value={failoverMode} onValueChange={setFailoverMode}>
                <option value="automatic">Automatic (recommended)</option>
                <option value="manual">Manual Approval Required</option>
                <option value="disabled">Disabled</option>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Automatic mode will upload to cloud when local storage is full or unavailable
              </p>
            </div>

            <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <div className="flex items-center gap-3">
                <ShieldCheckIcon className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="font-medium text-sm">Encryption</p>
                  <p className="text-xs text-muted-foreground">
                    All uploads are encrypted with AES-256
                  </p>
                </div>
              </div>
              <span className="text-xs text-green-600">✓ Enabled</span>
            </div>

            <div className="flex gap-2">
              <Button>Save Configuration</Button>
              <Button variant="outline">Test Connection</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-Camera Override */}
      <Card>
        <CardHeader>
          <CardTitle>Per-Camera Storage Settings</CardTitle>
          <CardDescription>
            Override storage preferences for specific cameras
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline">Configure Camera Storage</Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

## Deployment

1. **Run Database Migration**
   ```bash
   psql < database/migrations/130_cloud_storage_failover.sql
   ```

2. **Configure Cloud Storage**
   - Navigate to Settings → Storage
   - Enable cloud storage
   - Enter cloud provider credentials
   - Set failover mode to "Automatic"

3. **Test Failover**
   - Simulate local storage full condition
   - Verify automatic upload to cloud
   - Check cloud storage audit logs

## Cost Optimization

### Storage Class Tiers
- **Hot/Standard**: Frequently accessed (first 30 days)
- **Warm/Infrequent Access**: Monthly review (30-90 days)
- **Cold/Archive**: Long-term retention (90+ days)

### Lifecycle Policies
```typescript
{
  "rules": [
    {
      "action": "transition",
      "days": 30,
      "storageClass": "STANDARD_IA"
    },
    {
      "action": "transition",
      "days": 90,
      "storageClass": "GLACIER"
    },
    {
      "action": "delete",
      "days": 365
    }
  ]
}
```

## Monitoring

- Track cloud upload success/failure rates
- Monitor monthly cloud storage costs
- Alert on repeated failovers (may indicate hardware issues)
- Dashboard showing storage tier usage distribution

---

**Status**: Ready for Implementation
**Priority**: P1 (Critical Infrastructure)
**Estimated Effort**: 2-3 weeks

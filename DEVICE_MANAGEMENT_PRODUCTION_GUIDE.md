# Device Management Page - Production Readiness Guide

## Executive Summary

The Device Management page is currently in **early implementation** stage. It provides basic forms for credential rotation, IP assignment, and template creation, but **is not production-ready**. This guide outlines the requirements to transform it into an enterprise-grade device provisioning and maintenance system suitable for managing hundreds of branches with thousands of cameras/NVRs.

---

## Current State Analysis

### What the Page Currently Does

The page exposes three administrative functions:

1. **Password/Credential Rotation** - Change device passwords for cameras/NVRs
2. **IP Address Assignment** - Assign/reserve static IP addresses for devices  
3. **Device Template Creation** - Define reusable configuration templates

### Critical Gaps (P0 Blockers)

#### 1. **Direct Browser-to-Device Configuration**
- ❌ Current: Browser directly configures devices
- ✅ Required: All changes must route through Branch Edge Agent
- **Why**: Many branch cameras are behind NAT/private networks and unreachable from central server

#### 2. **No Device Registry Integration**
- ❌ Current: Free-text Device ID input (`cam-001`)
- ✅ Required: Select from authenticated device registry with capability awareness
- **Why**: Prevents typos, unauthorized access, and attempting unsupported operations

#### 3. **Insecure Credential Management**
- ❌ Current: Operator types passwords into plain form
- ✅ Required: Auto-generated cryptographically secure passwords, encrypted storage
- **Why**: Banking/compliance requirements, audit requirements, security policy

#### 4. **No Job State Machine**
- ❌ Current: Synchronous HTTP requests that block browser
- ✅ Required: Async job queue with states (QUEUED, APPLYING, VERIFYING, COMPLETED)
- **Why**: 30+ second operations, needs to survive page refreshes and restarts

#### 5. **No Verification Workflow**
- ❌ Current: Assumes success if API returns 200
- ✅ Required: Verify device actually accepted changes and still works
- **Why**: Configuration can fail silently; must verify ONVIF/RTSP/video after change

#### 6. **Missing RBAC and Audit**
- ❌ Current: Anyone with page access can change any device
- ✅ Required: Permission checks, MFA for sensitive ops, immutable audit log
- **Why**: Banking compliance, security policy, accountability


---

## Production Architecture

### Required System Flow

```
Sentinel Grid UI
      ↓
Device Management API (RBAC + Validation)
      ↓
Device Configuration Service
      ↓
Job Queue (PostgreSQL + Background Worker)
      ↓
Branch Edge Agent
      ↓
CP PLUS / ONVIF / Vendor Adapter
      ↓
Camera / DVR / NVR
      ↓
Verification (ONVIF health + RTSP reconnect + video keyframe)
      ↓
Update Device Registry + Audit Log
```

### Backend Services Architecture

```
src/services/
├── device-management-service.ts          # Orchestrates device operations
├── device-credential-service.ts          # Secure credential management
├── device-configuration-service.ts       # Configuration state management
├── ipam-service.ts                       # IP Address Management
├── device-template-service.ts            # Template lifecycle
└── device-verification-service.ts        # Post-change verification

src/workers/
├── device-job-worker.ts                  # Processes async device jobs
└── device-drift-detector-worker.ts       # Monitors configuration drift
```

---

## P0 Implementation Requirements

### 1. Device Selector with Registry Integration

**Current:**
```tsx
<input
  placeholder="cam-001"
  onChange={(e) => setDeviceId(e.target.value)}
/>
```

**Required:**
```tsx
<DeviceSelector
  branchId={selectedBranch}
  onSelect={(device) => {
    // device includes:
    // - id, name, type, status
    // - capabilities (supports credential rotation, IP change, etc.)
    // - connection status (online/offline)
    // - current configuration version
    // - edge agent availability
  }}
/>
```


**Implementation:**

```typescript
// src/routes/device-management.routes.ts
app.get('/v1/device-management/devices', async (request) => {
  const { branchId, deviceType, status } = request.query;
  
  // Get accessible devices from registry
  const devices = await store.listDeviceInventory(
    request.currentUser.tenantId,
    branchId
  );
  
  // Enrich with capabilities
  const enrichedDevices = await Promise.all(
    devices.map(async (device) => ({
      ...device,
      capabilities: await getDeviceCapabilities(device),
      status: await getDeviceOnlineStatus(device),
      edgeAgent: await getDeviceEdgeAgent(device),
      configVersion: await getDeviceConfigVersion(device)
    }))
  );
  
  return { data: enrichedDevices };
});

async function getDeviceCapabilities(device: DeviceInventoryRecord) {
  // Check what operations this device supports
  const vendor = device.manufacturer;
  const model = device.model;
  const onvifVersion = device.onvifVersion;
  
  return {
    credentialRotation: vendor === 'CP PLUS' || onvifVersion >= '2.0',
    setStaticIp: vendor === 'CP PLUS',
    ntpConfiguration: onvifVersion >= '2.0',
    firmwareUpgrade: vendor === 'CP PLUS',
    reboot: true
  };
}
```

### 2. Secure Credential Rotation Service

**Database Schema:**

```sql
-- backend/migrations/0XX_device_credentials.sql
CREATE TABLE device_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  device_id UUID NOT NULL REFERENCES device_inventory(id),
  credential_version INTEGER NOT NULL DEFAULT 1,
  username TEXT NOT NULL,
  encrypted_secret TEXT NOT NULL,  -- AES-256-GCM encrypted
  encryption_key_version INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rotated_at TIMESTAMPTZ,
  replaces_credential_id UUID REFERENCES device_credentials(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'rotating', 'superseded', 'revoked')),
  UNIQUE(device_id, credential_version)
);

CREATE INDEX idx_device_credentials_device ON device_credentials(device_id, status);
CREATE INDEX idx_device_credentials_tenant ON device_credentials(tenant_id);
```


**Service Implementation:**

```typescript
// src/services/device-credential-service.ts
import crypto from 'crypto';

export class DeviceCredentialService {
  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly KEY_VERSION = 1;
  
  async rotateCredential(input: {
    tenantId: string;
    deviceId: string;
    reason: string;
    requestedBy: string;
    rotationMode: 'scheduled' | 'emergency';
  }): Promise<DeviceCredentialRotationJob> {
    // 1. Generate cryptographically secure password
    const newPassword = this.generateSecurePassword(24);
    
    // 2. Encrypt password
    const encryptedSecret = await this.encryptSecret(newPassword);
    
    // 3. Create credential record
    const credential = await this.store.createDeviceCredential({
      tenantId: input.tenantId,
      deviceId: input.deviceId,
      username: 'admin', // or device-specific username
      encryptedSecret: encryptedSecret.ciphertext,
      encryptionKeyVersion: this.KEY_VERSION,
      status: 'rotating'
    });
    
    // 4. Create async job
    const job = await this.store.createDeviceConfigurationJob({
      tenantId: input.tenantId,
      deviceId: input.deviceId,
      jobType: 'credential-rotation',
      requestedBy: input.requestedBy,
      reason: input.reason,
      priority: input.rotationMode === 'emergency' ? 'high' : 'normal',
      payload: {
        credentialId: credential.id,
        rotationMode: input.rotationMode
      },
      status: 'queued'
    });
    
    // 5. Audit
    await this.store.writeAudit({
      tenantId: input.tenantId,
      action: 'device.credential.rotation-initiated',
      actorUserId: input.requestedBy,
      resourceType: 'device',
      resourceId: input.deviceId,
      metadata: {
        jobId: job.id,
        credentialVersion: credential.credentialVersion,
        reason: input.reason,
        mode: input.rotationMode
      }
    });
    
    return job;
  }
  
  private generateSecurePassword(length: number): string {
    // Generate password that meets device requirements
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*';
    
    const allChars = uppercase + lowercase + numbers + symbols;
    
    let password = '';
    password += this.randomChar(uppercase);
    password += this.randomChar(lowercase);
    password += this.randomChar(numbers);
    password += this.randomChar(symbols);
    
    for (let i = 4; i < length; i++) {
      password += this.randomChar(allChars);
    }
    
    return this.shuffleString(password);
  }
  
  private async encryptSecret(plaintext: string) {
    const key = await this.getEncryptionKey(this.KEY_VERSION);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);
    
    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      ciphertext: `${this.KEY_VERSION}:${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`,
      keyVersion: this.KEY_VERSION
    };
  }
  
  async decryptSecret(encrypted: string): Promise<string> {
    const [versionStr, ivHex, authTagHex, ciphertext] = encrypted.split(':');
    const version = parseInt(versionStr, 10);
    
    const key = await this.getEncryptionKey(version);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
    plaintext += decipher.final('utf8');
    
    return plaintext;
  }
  
  private async getEncryptionKey(version: number): Promise<Buffer> {
    // In production, retrieve from secure key management service
    // For now, use environment variable
    const keyMaterial = process.env.DEVICE_CREDENTIAL_ENCRYPTION_KEY;
    if (!keyMaterial) {
      throw new Error('DEVICE_CREDENTIAL_ENCRYPTION_KEY not configured');
    }
    return crypto.scryptSync(keyMaterial, 'salt', 32);
  }
  
  private randomChar(chars: string): string {
    return chars[crypto.randomInt(0, chars.length)];
  }
  
  private shuffleString(str: string): string {
    const arr = str.split('');
    for (let i = arr.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.join('');
  }
}
```


### 3. Job State Machine and Worker

**Database Schema:**

```sql
-- backend/migrations/0XX_device_jobs.sql
CREATE TABLE device_configuration_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  device_id UUID NOT NULL REFERENCES device_inventory(id),
  edge_agent_id UUID REFERENCES edge_agents(id),
  job_type TEXT NOT NULL CHECK (job_type IN ('credential-rotation', 'ip-change', 'template-apply', 'firmware-upgrade', 'reboot')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'claimed', 'precheck', 'connecting', 'applying', 
    'waiting-reboot', 'verifying', 'completed', 'failed', 'rolling-back', 
    'manual-intervention'
  )),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  requested_by UUID NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  payload JSONB NOT NULL,
  result JSONB,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_attempt_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_device_jobs_device ON device_configuration_jobs(device_id);
CREATE INDEX idx_device_jobs_status ON device_configuration_jobs(status, next_attempt_at) 
  WHERE status IN ('queued', 'failed');
CREATE INDEX idx_device_jobs_edge_agent ON device_configuration_jobs(edge_agent_id, status);

CREATE TABLE device_job_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES device_configuration_jobs(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  result JSONB,
  error TEXT,
  UNIQUE(job_id, step_number)
);
```


**Worker Implementation:**

```typescript
// src/workers/device-job-worker.ts
export class DeviceJobWorker {
  private running = false;
  
  async start() {
    this.running = true;
    while (this.running) {
      await this.processJobs();
      await this.sleep(5000); // Poll every 5 seconds
    }
  }
  
  async processJobs() {
    const jobs = await this.store.claimDeviceConfigurationJobs({
      limit: 10,
      now: new Date().toISOString()
    });
    
    await Promise.all(jobs.map(job => this.executeJob(job)));
  }
  
  async executeJob(job: DeviceConfigurationJob) {
    try {
      switch (job.jobType) {
        case 'credential-rotation':
          await this.executeCredentialRotation(job);
          break;
        case 'ip-change':
          await this.executeIpChange(job);
          break;
        case 'template-apply':
          await this.executeTemplateApply(job);
          break;
        default:
          throw new Error(`Unknown job type: ${job.jobType}`);
      }
    } catch (error) {
      await this.handleJobFailure(job, error);
    }
  }
  
  async executeCredentialRotation(job: DeviceConfigurationJob) {
    const steps = [
      { name: 'precheck', fn: this.precheckCredentialRotation },
      { name: 'connect-device', fn: this.connectToDevice },
      { name: 'change-password', fn: this.changeDevicePassword },
      { name: 'verify-login', fn: this.verifyNewCredential },
      { name: 'update-secret-store', fn: this.updateCredentialStore },
      { name: 'reconnect-rtsp', fn: this.reconnectRtspStream },
      { name: 'verify-video', fn: this.verifyVideoStream }
    ];
    
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      
      await this.store.createJobStep({
        jobId: job.id,
        stepNumber: i + 1,
        stepName: step.name,
        status: 'running'
      });
      
      await this.store.updateJobStatus(job.id, step.name);
      
      try {
        const result = await step.fn.call(this, job);
        
        await this.store.completeJobStep({
          jobId: job.id,
          stepNumber: i + 1,
          status: 'completed',
          result
        });
      } catch (error) {
        await this.store.completeJobStep({
          jobId: job.id,
          stepNumber: i + 1,
          status: 'failed',
          error: error.message
        });
        
        // Attempt rollback
        if (i >= 2) { // Password was already changed
          await this.rollbackCredentialRotation(job);
        }
        
        throw error;
      }
    }
    
    await this.store.updateJobStatus(job.id, 'completed');
    await this.store.writeAudit({
      tenantId: job.tenantId,
      action: 'device.credential.rotation-completed',
      actorUserId: job.requestedBy,
      resourceType: 'device',
      resourceId: job.deviceId,
      metadata: {
        jobId: job.id,
        durationMs: Date.now() - new Date(job.startedAt).getTime()
      }
    });
  }
  
  async precheckCredentialRotation(job: DeviceConfigurationJob) {
    // Verify device is online
    const device = await this.store.getDeviceInventory(job.deviceId);
    if (device.healthStatus === 'offline') {
      throw new Error('Device is offline');
    }
    
    // Verify edge agent is available
    const edgeAgent = await this.getDeviceEdgeAgent(device);
    if (!edgeAgent || edgeAgent.status !== 'active') {
      throw new Error('Edge agent unavailable');
    }
    
    // Verify current credential exists
    const currentCredential = await this.store.getCurrentDeviceCredential(job.deviceId);
    if (!currentCredential) {
      throw new Error('No current credential found');
    }
    
    return { passed: true };
  }
  
  async changeDevicePassword(job: DeviceConfigurationJob) {
    const credential = await this.store.getDeviceCredential(job.payload.credentialId);
    const newPassword = await this.credentialService.decryptSecret(credential.encryptedSecret);
    
    const device = await this.store.getDeviceInventory(job.deviceId);
    const adapter = this.getVendorAdapter(device.manufacturer);
    
    // Send command to device via edge agent or direct
    await adapter.changePassword({
      ipAddress: device.ipAddress,
      currentUsername: credential.username,
      currentPassword: await this.getCurrentPassword(device),
      newPassword
    });
    
    return { changed: true };
  }
  
  async verifyNewCredential(job: DeviceConfigurationJob) {
    const credential = await this.store.getDeviceCredential(job.payload.credentialId);
    const newPassword = await this.credentialService.decryptSecret(credential.encryptedSecret);
    
    const device = await this.store.getDeviceInventory(job.deviceId);
    const adapter = this.getVendorAdapter(device.manufacturer);
    
    // Test ONVIF authentication
    const authenticated = await adapter.testAuthentication({
      ipAddress: device.ipAddress,
      username: credential.username,
      password: newPassword
    });
    
    if (!authenticated) {
      throw new Error('New credential authentication failed');
    }
    
    return { verified: true };
  }
  
  async updateCredentialStore(job: DeviceConfigurationJob) {
    // Mark old credential as superseded
    await this.store.supersedePreviousCredentials(job.deviceId, job.payload.credentialId);
    
    // Activate new credential
    await this.store.activateDeviceCredential(job.payload.credentialId);
    
    return { updated: true };
  }
  
  async reconnectRtspStream(job: DeviceConfigurationJob) {
    const camera = await this.store.getCameraByDeviceId(job.deviceId);
    if (!camera) {
      return { skipped: true, reason: 'Not a camera device' };
    }
    
    // Update camera connection secret
    const credential = await this.store.getDeviceCredential(job.payload.credentialId);
    await this.store.updateCameraConnectionSecret(camera.id, credential.id);
    
    // Trigger stream reconnection
    await this.streamService.reconnectCamera(camera.id);
    
    return { reconnected: true };
  }
  
  async verifyVideoStream(job: DeviceConfigurationJob) {
    const camera = await this.store.getCameraByDeviceId(job.deviceId);
    if (!camera) {
      return { skipped: true };
    }
    
    // Wait for first keyframe
    const stream = await this.streamService.waitForHealthyStream(camera.id, 30000);
    
    if (!stream.healthy) {
      throw new Error('Video stream unhealthy after credential rotation');
    }
    
    return { verified: true, fps: stream.fps, bitrate: stream.bitrate };
  }
  
  async rollbackCredentialRotation(job: DeviceConfigurationJob) {
    await this.store.updateJobStatus(job.id, 'rolling-back');
    
    try {
      const device = await this.store.getDeviceInventory(job.deviceId);
      const previousCredential = await this.store.getPreviousDeviceCredential(job.deviceId);
      
      if (!previousCredential) {
        throw new Error('No previous credential for rollback');
      }
      
      const oldPassword = await this.credentialService.decryptSecret(previousCredential.encryptedSecret);
      const adapter = this.getVendorAdapter(device.manufacturer);
      
      // Attempt to restore old password
      await adapter.changePassword({
        ipAddress: device.ipAddress,
        currentUsername: previousCredential.username,
        currentPassword: await this.credentialService.decryptSecret(
          (await this.store.getDeviceCredential(job.payload.credentialId)).encryptedSecret
        ),
        newPassword: oldPassword
      });
      
      await this.store.updateJobResult(job.id, {
        rollback: 'succeeded',
        restoredCredentialId: previousCredential.id
      });
      
      await this.store.writeAudit({
        tenantId: job.tenantId,
        action: 'device.credential.rotation-rolled-back',
        actorUserId: 'system',
        resourceType: 'device',
        resourceId: job.deviceId,
        metadata: { jobId: job.id, reason: 'Verification failed' }
      });
    } catch (error) {
      await this.store.updateJobStatus(job.id, 'manual-intervention');
      await this.store.updateJobResult(job.id, {
        rollback: 'failed',
        error: error.message,
        requiresManualIntervention: true
      });
      
      // Create incident
      await this.incidentService.createIncident({
        tenantId: job.tenantId,
        title: `Device credential rotation failed - Manual intervention required`,
        incidentType: 'device-configuration-failure',
        severity: 'high',
        description: `Credential rotation for device ${job.deviceId} failed and rollback also failed. Device may be inaccessible.`,
        metadata: { jobId: job.id, deviceId: job.deviceId }
      });
    }
  }
  
  async handleJobFailure(job: DeviceConfigurationJob, error: Error) {
    const newAttempts = job.attempts + 1;
    
    if (newAttempts < job.maxAttempts) {
      // Exponential backoff
      const delayMinutes = Math.pow(2, newAttempts) * 5;
      const nextAttemptAt = new Date(Date.now() + delayMinutes * 60 * 1000);
      
      await this.store.updateJobFailure(job.id, {
        status: 'failed',
        attempts: newAttempts,
        error: error.message,
        nextAttemptAt: nextAttemptAt.toISOString()
      });
    } else {
      await this.store.updateJobFailure(job.id, {
        status: 'manual-intervention',
        attempts: newAttempts,
        error: error.message
      });
      
      // Notify operations team
      await this.notificationService.sendAlert({
        severity: 'critical',
        title: 'Device configuration job failed',
        message: `Job ${job.id} for device ${job.deviceId} failed after ${newAttempts} attempts`,
        recipients: ['operations@example.com']
      });
    }
  }
  
  stop() {
    this.running = false;
  }
}
```


### 4. IP Address Management (IPAM) Service

**Database Schema:**

```sql
-- backend/migrations/0XX_ipam.sql
CREATE TABLE branch_networks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  branch_id UUID NOT NULL REFERENCES resource_nodes(id),
  network_cidr CIDR NOT NULL,
  gateway INET NOT NULL,
  dns_servers TEXT[],
  vlan_id INTEGER,
  dhcp_range_start INET,
  dhcp_range_end INET,
  reserved_range_start INET,
  reserved_range_end INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(branch_id, network_cidr)
);

CREATE TABLE ip_address_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  branch_id UUID NOT NULL REFERENCES resource_nodes(id),
  device_id UUID NOT NULL REFERENCES device_inventory(id),
  ip_address INET NOT NULL,
  mac_address MACADDR,
  subnet_cidr CIDR NOT NULL,
  reservation_type TEXT NOT NULL CHECK (reservation_type IN ('static', 'dhcp-reservation', 'dynamic')),
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'pending', 'conflict', 'released')),
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  UNIQUE(branch_id, ip_address)
);

CREATE INDEX idx_ip_assignments_device ON ip_address_assignments(device_id);
CREATE INDEX idx_ip_assignments_branch ON ip_address_assignments(branch_id, status);
```


**Service Implementation:**

```typescript
// src/services/ipam-service.ts
import { Address4 } from 'ip-address';

export class IpamService {
  async assignIpAddress(input: {
    tenantId: string;
    branchId: string;
    deviceId: string;
    ipAddress: string;
    subnet: string;
    reservationType: 'static' | 'dhcp-reservation';
    assignedBy: string;
  }): Promise<DeviceConfigurationJob> {
    // 1. Validate IP is in valid range
    await this.validateIpAddress(input.branchId, input.ipAddress, input.subnet);
    
    // 2. Check for conflicts
    const conflicts = await this.checkIpConflicts(input.branchId, input.ipAddress);
    if (conflicts.length > 0) {
      throw new Error(`IP ${input.ipAddress} is already assigned to ${conflicts[0].deviceId}`);
    }
    
    // 3. Create assignment record
    const assignment = await this.store.createIpAssignment({
      ...input,
      status: 'pending'
    });
    
    // 4. Create job for edge agent
    const job = await this.store.createDeviceConfigurationJob({
      tenantId: input.tenantId,
      deviceId: input.deviceId,
      jobType: 'ip-change',
      requestedBy: input.assignedBy,
      reason: 'IP address assignment',
      priority: 'normal',
      payload: {
        assignmentId: assignment.id,
        oldIpAddress: await this.getCurrentDeviceIp(input.deviceId),
        newIpAddress: input.ipAddress,
        subnet: input.subnet,
        gateway: await this.getBranchGateway(input.branchId)
      },
      status: 'queued'
    });
    
    return job;
  }
  
  async validateIpAddress(branchId: string, ipAddress: string, subnet: string) {
    const network = await this.store.getBranchNetwork(branchId);
    
    if (!network) {
      throw new Error(`No network configuration found for branch ${branchId}`);
    }
    
    // Check IP is in subnet
    const addr = new Address4(ipAddress);
    const subnetObj = new Address4(subnet);
    
    if (!subnetObj.isInSubnet(addr)) {
      throw new Error(`IP ${ipAddress} is not in subnet ${subnet}`);
    }
    
    // Check IP is not gateway
    if (ipAddress === network.gateway) {
      throw new Error(`IP ${ipAddress} is the gateway address`);
    }
    
    // Check IP is not broadcast
    if (addr.endAddress().address === ipAddress) {
      throw new Error(`IP ${ipAddress} is the broadcast address`);
    }
    
    // Check IP is in allowed range
    const reserved = await this.store.getBranchReservedRange(branchId);
    const addrNum = this.ipToNumber(ipAddress);
    
    if (reserved) {
      const startNum = this.ipToNumber(reserved.start);
      const endNum = this.ipToNumber(reserved.end);
      
      if (addrNum < startNum || addrNum > endNum) {
        throw new Error(`IP ${ipAddress} is outside reserved range ${reserved.start}-${reserved.end}`);
      }
    }
    
    return { valid: true };
  }
  
  async checkIpConflicts(branchId: string, ipAddress: string) {
    // Check database
    const dbConflicts = await this.store.getIpAssignmentsByIp(branchId, ipAddress);
    
    if (dbConflicts.length > 0) {
      return dbConflicts;
    }
    
    // Ask edge agent to probe network
    const edgeAgent = await this.store.getBranchEdgeAgent(branchId);
    if (edgeAgent) {
      const probe = await this.edgeService.probeIpAddress(edgeAgent.id, ipAddress);
      if (probe.exists) {
        return [{
          deviceId: 'unknown',
          macAddress: probe.macAddress,
          detected: true
        }];
      }
    }
    
    return [];
  }
  
  private ipToNumber(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);
  }
}
```


### 5. Device Configuration Templates

**Database Schema:**

```sql
-- backend/migrations/0XX_device_templates.sql
CREATE TABLE device_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  template_type TEXT NOT NULL CHECK (template_type IN (
    'camera-configuration', 'recording', 'analytics', 'privacy', 
    'network', 'security-hardening', 'location'
  )),
  category TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  settings JSONB NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'deprecated')),
  UNIQUE(tenant_id, name, version)
);

CREATE TABLE device_template_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  device_id UUID NOT NULL REFERENCES device_inventory(id),
  template_id UUID NOT NULL REFERENCES device_templates(id),
  template_version INTEGER NOT NULL,
  applied_by UUID REFERENCES users(id),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN (
    'pending', 'verified', 'drifted', 'failed'
  )),
  verified_at TIMESTAMPTZ,
  UNIQUE(device_id, template_id)
);

CREATE TABLE device_configuration_drift (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  device_id UUID NOT NULL REFERENCES device_inventory(id),
  template_id UUID REFERENCES device_templates(id),
  drift_type TEXT NOT NULL,
  desired_value JSONB,
  actual_value JSONB,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged_by UUID REFERENCES users(id),
  acknowledged_at TIMESTAMPTZ
);

CREATE INDEX idx_drift_device ON device_configuration_drift(device_id, acknowledged);
```

**Template Example:**

```json
{
  "name": "CPPLUS-Branch-Indoor-V7",
  "templateType": "camera-configuration",
  "category": "standard",
  "version": 7,
  "settings": {
    "video": {
      "mainStream": {
        "codec": "H.265",
        "resolution": "1920x1080",
        "fps": 20,
        "bitrate": 2048,
        "bitrateControl": "VBR",
        "quality": "highest"
      },
      "subStream": {
        "codec": "H.264",
        "resolution": "640x360",
        "fps": 8,
        "bitrate": 384
      }
    },
    "time": {
      "ntp": {
        "enabled": true,
        "server": "{{branch-gateway}}",
        "timezone": "Asia/Kolkata"
      }
    },
    "network": {
      "dhcp": false,
      "ipAddress": "{{assigned}}",
      "subnet": "{{branch-subnet}}",
      "gateway": "{{branch-gateway}}",
      "dns": ["{{branch-dns}}"]
    },
    "security": {
      "onvif": {
        "enabled": true,
        "authentication": "digest"
      },
      "rtsp": {
        "anonymousAccess": false,
        "httpsPreferred": true
      }
    },
    "recording": {
      "mode": "continuous",
      "preRecordSeconds": 5
    },
    "analytics": {
      "motionDetection": true,
      "motionSensitivity": "medium",
      "intrusionDetection": false
    }
  }
}
```


### 6. RBAC and Permissions

**Required Permissions:**

```typescript
// src/domain/permissions.ts
export const DEVICE_MANAGEMENT_PERMISSIONS = {
  // Read permissions
  'device:view': 'View device details',
  'device:list': 'List devices',
  
  // Configuration permissions
  'device:credentials:rotate': 'Rotate device credentials',
  'device:network:change': 'Change device network settings',
  'device:template:create': 'Create configuration templates',
  'device:template:publish': 'Publish templates for use',
  'device:template:apply': 'Apply templates to devices',
  'device:configuration:apply': 'Apply configuration changes',
  'device:configuration:rollback': 'Rollback configuration',
  
  // Bulk operations
  'device:bulk:configure': 'Perform bulk configuration operations',
  
  // Sensitive operations requiring MFA
  'device:firmware:upgrade': 'Upgrade device firmware',
  'device:factory-reset': 'Factory reset device'
} as const;

export const SENSITIVE_OPERATIONS = [
  'device:credentials:rotate',
  'device:network:change',
  'device:bulk:configure',
  'device:factory-reset'
];
```

**Permission Check Implementation:**

```typescript
// src/routes/device-management.routes.ts
app.post('/v1/device-management/password-rotation', async (request, reply) => {
  // 1. Check permission
  const hasPermission = await authService.checkPermission(
    request.currentUser,
    'device:credentials:rotate'
  );
  
  if (!hasPermission) {
    return reply.code(403).send({
      error: 'Forbidden',
      message: 'You do not have permission to rotate device credentials'
    });
  }
  
  const body = z.object({
    deviceId: z.string().uuid(),
    reason: z.string().min(10),
    rotationMode: z.enum(['scheduled', 'emergency'])
  }).parse(request.body);
  
  // 2. Verify device exists and user has access
  const device = await store.getDeviceInventory(body.deviceId);
  if (!device || device.tenantId !== request.currentUser.tenantId) {
    return reply.code(404).send({ error: 'Device not found' });
  }
  
  // 3. Check if MFA is required
  const requiresMfa = await authService.requiresMfa(
    request.currentUser,
    'device:credentials:rotate'
  );
  
  if (requiresMfa && !request.headers['x-mfa-token']) {
    return reply.code(428).send({
      error: 'MFA Required',
      message: 'This operation requires multi-factor authentication',
      challenge: await authService.createMfaChallenge(request.currentUser.id)
    });
  }
  
  if (requiresMfa) {
    const mfaValid = await authService.verifyMfaToken(
      request.currentUser.id,
      request.headers['x-mfa-token']
    );
    
    if (!mfaValid) {
      return reply.code(401).send({
        error: 'Invalid MFA Token'
      });
    }
  }
  
  // 4. Execute operation
  const job = await deviceCredentialService.rotateCredential({
    tenantId: request.currentUser.tenantId,
    deviceId: body.deviceId,
    reason: body.reason,
    requestedBy: request.currentUser.id,
    rotationMode: body.rotationMode
  });
  
  return reply.code(202).send({
    jobId: job.id,
    status: job.status,
    message: 'Credential rotation job queued'
  });
});
```


---

## Updated UI Implementation

### Modern Device Management Page

```typescript
// dashboard/app/maintenance/device-management/page.tsx
"use client";

import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DeviceSelector } from "@/components/device-management/device-selector";
import { CredentialRotationForm } from "@/components/device-management/credential-rotation-form";
import { IpAssignmentForm } from "@/components/device-management/ip-assignment-form";
import { TemplateManagement } from "@/components/device-management/template-management";
import { JobMonitor } from "@/components/device-management/job-monitor";
import { ConfigurationDrift } from "@/components/device-management/configuration-drift";

export default function DeviceManagementPage() {
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);

  return (
    <div className="device-management-page">
      <header>
        <h1>Device Management</h1>
        <p>Secure device configuration, credential rotation, and template management</p>
      </header>

      <div className="branch-device-selector">
        <BranchSelector value={selectedBranch} onChange={setSelectedBranch} />
        
        {selectedBranch && (
          <DeviceSelector
            branchId={selectedBranch}
            value={selectedDevice}
            onChange={setSelectedDevice}
          />
        )}
      </div>

      {selectedDevice && (
        <>
          <DeviceStatus device={selectedDevice} />

          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="credentials">Credentials</TabsTrigger>
              <TabsTrigger value="network">Network</TabsTrigger>
              <TabsTrigger value="configuration">Configuration</TabsTrigger>
              <TabsTrigger value="templates">Templates</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <DeviceOverview device={selectedDevice} />
            </TabsContent>

            <TabsContent value="credentials">
              <CredentialRotationForm device={selectedDevice} />
            </TabsContent>

            <TabsContent value="network">
              <IpAssignmentForm device={selectedDevice} />
            </TabsContent>

            <TabsContent value="configuration">
              <DeviceConfiguration device={selectedDevice} />
              <ConfigurationDrift deviceId={selectedDevice.id} />
            </TabsContent>

            <TabsContent value="templates">
              <TemplateManagement device={selectedDevice} />
            </TabsContent>

            <TabsContent value="history">
              <DeviceChangeHistory deviceId={selectedDevice.id} />
            </TabsContent>
          </Tabs>
        </>
      )}

      <JobMonitor tenantId={selectedDevice?.tenantId} />
    </div>
  );
}
```


### Device Selector Component

```typescript
// dashboard/components/device-management/device-selector.tsx
"use client";

import React, { useEffect, useState } from "react";
import { deviceManagementApi } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Device {
  id: string;
  name: string;
  deviceType: string;
  manufacturer: string;
  model: string;
  ipAddress: string;
  status: 'online' | 'offline' | 'degraded';
  capabilities: {
    credentialRotation: boolean;
    setStaticIp: boolean;
    ntpConfiguration: boolean;
    firmwareUpgrade: boolean;
  };
  configVersion?: number;
  edgeAgent?: {
    id: string;
    name: string;
    status: string;
  };
}

export function DeviceSelector({
  branchId,
  value,
  onChange
}: {
  branchId: string;
  value: Device | null;
  onChange: (device: Device | null) => void;
}) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!branchId) return;
    
    setLoading(true);
    deviceManagementApi.listDevices(branchId)
      .then(res => setDevices(res.data))
      .finally(() => setLoading(false));
  }, [branchId]);

  const filteredDevices = devices.filter(d =>
    d.name.toLowerCase().includes(filter.toLowerCase()) ||
    d.ipAddress.includes(filter)
  );

  return (
    <div className="device-selector">
      <input
        type="text"
        placeholder="Search devices..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="search-input"
      />

      {loading ? (
        <div>Loading devices...</div>
      ) : (
        <div className="device-list">
          {filteredDevices.map(device => (
            <div
              key={device.id}
              className={cn(
                "device-item",
                value?.id === device.id && "selected"
              )}
              onClick={() => onChange(device)}
            >
              <div className="device-info">
                <div className="device-name">
                  {device.name}
                  <Badge variant={device.status === 'online' ? 'success' : 'destructive'}>
                    {device.status}
                  </Badge>
                </div>
                <div className="device-details">
                  {device.manufacturer} {device.model} • {device.ipAddress}
                </div>
              </div>

              <div className="device-capabilities">
                {device.edgeAgent && (
                  <Badge variant="outline">
                    Edge: {device.edgeAgent.name}
                  </Badge>
                )}
                {device.configVersion && (
                  <Badge variant="outline">
                    Config v{device.configVersion}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Credential Rotation Form

```typescript
// dashboard/components/device-management/credential-rotation-form.tsx
"use client";

import React, { useState } from "react";
import { deviceManagementApi } from "@/lib/api-client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export function CredentialRotationForm({ device }: { device: Device }) {
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'scheduled' | 'emergency'>('scheduled');
  const [result, setResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (reason.length < 10) {
      alert('Please provide a detailed reason (minimum 10 characters)');
      return;
    }

    setSubmitting(true);
    setResult(null);

    try {
      const response = await deviceManagementApi.startPasswordRotation({
        deviceId: device.id,
        reason,
        rotationMode: mode
      });

      setResult({
        success: true,
        jobId: response.jobId,
        message: response.message
      });

      setReason('');
    } catch (error: any) {
      setResult({
        success: false,
        error: error.message || 'Failed to initiate credential rotation'
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!device.capabilities?.credentialRotation) {
    return (
      <Alert variant="warning">
        <AlertDescription>
          This device does not support automated credential rotation.
          Please contact support for manual credential updates.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="credential-rotation-form">
      <Alert>
        <AlertDescription>
          <strong>Important:</strong> A secure password will be generated automatically.
          The device will be updated remotely, and all connections will be reconfigured.
          This process typically takes 1-2 minutes.
        </AlertDescription>
      </Alert>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <Label htmlFor="reason">Reason for Rotation *</Label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g., Quarterly security rotation, suspected compromise, employee termination"
            rows={3}
            required
            minLength={10}
          />
          <p className="form-hint">Minimum 10 characters. This will be recorded in audit logs.</p>
        </div>

        <div className="form-group">
          <Label>Rotation Mode</Label>
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as any)}>
            <div className="radio-option">
              <RadioGroupItem value="scheduled" id="scheduled" />
              <Label htmlFor="scheduled">
                Scheduled Rotation
                <span className="option-description">
                  Normal priority. Will be processed in maintenance window.
                </span>
              </Label>
            </div>
            <div className="radio-option">
              <RadioGroupItem value="emergency" id="emergency" />
              <Label htmlFor="emergency">
                Emergency Rotation
                <span className="option-description">
                  High priority. Executes immediately. Use for security incidents.
                </span>
              </Label>
            </div>
          </RadioGroup>
        </div>

        <div className="device-impact-summary">
          <h4>Expected Impact</h4>
          <ul>
            <li>RTSP stream will reconnect (~5-15 seconds)</li>
            <li>ONVIF connections will re-authenticate</li>
            <li>Recording may pause briefly during reconnection</li>
            <li>Current live viewers will need to reconnect</li>
          </ul>
        </div>

        <Button type="submit" disabled={submitting || reason.length < 10}>
          {submitting ? 'Initiating Rotation...' : 'Rotate Credentials'}
        </Button>
      </form>

      {result && (
        <Alert variant={result.success ? 'success' : 'destructive'}>
          <AlertDescription>
            {result.success ? (
              <>
                <strong>Rotation Initiated</strong>
                <p>Job ID: {result.jobId}</p>
                <p>{result.message}</p>
                <Button
                  variant="link"
                  onClick={() => window.location.href = `/maintenance/device-management/jobs/${result.jobId}`}
                >
                  Monitor Progress →
                </Button>
              </>
            ) : (
              <>
                <strong>Failed</strong>
                <p>{result.error}</p>
              </>
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
```


### Job Monitor Component

```typescript
// dashboard/components/device-management/job-monitor.tsx
"use client";

import React, { useEffect, useState } from "react";
import { deviceManagementApi } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface DeviceJob {
  id: string;
  deviceId: string;
  deviceName: string;
  jobType: string;
  status: string;
  progress: number;
  currentStep?: string;
  createdAt: string;
  completedAt?: string;
}

export function JobMonitor({ tenantId }: { tenantId?: string }) {
  const [jobs, setJobs] = useState<DeviceJob[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    if (!tenantId) return;

    const fetchJobs = () => {
      deviceManagementApi.listJobs(tenantId, { status: ['queued', 'running', 'verifying'] })
        .then(res => setJobs(res.data));
    };

    fetchJobs();

    if (autoRefresh) {
      const interval = setInterval(fetchJobs, 5000);
      return () => clearInterval(interval);
    }
  }, [tenantId, autoRefresh]);

  if (jobs.length === 0) {
    return null;
  }

  return (
    <div className="job-monitor">
      <div className="job-monitor-header">
        <h3>Active Configuration Jobs</h3>
        <label>
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto-refresh
        </label>
      </div>

      <div className="job-list">
        {jobs.map(job => (
          <div key={job.id} className="job-item">
            <div className="job-info">
              <div className="job-device">{job.deviceName}</div>
              <div className="job-type">{formatJobType(job.jobType)}</div>
            </div>

            <div className="job-status">
              <Badge variant={getStatusVariant(job.status)}>
                {job.status}
              </Badge>
              {job.currentStep && (
                <span className="job-step">{job.currentStep}</span>
              )}
            </div>

            <div className="job-progress">
              <Progress value={job.progress} />
              <span>{job.progress}%</span>
            </div>

            <div className="job-actions">
              <button onClick={() => viewJobDetails(job.id)}>
                View Details
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatJobType(type: string): string {
  return type
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function getStatusVariant(status: string) {
  switch (status) {
    case 'completed': return 'success';
    case 'failed': case 'manual-intervention': return 'destructive';
    case 'running': case 'verifying': return 'default';
    default: return 'secondary';
  }
}
```


---

## Implementation Roadmap

### Phase 1: Foundation (P0 - 2 weeks)

**Week 1:**
- [ ] Database migrations for device jobs, credentials, IPAM
- [ ] Device Credential Service with encryption
- [ ] Device Registry integration in UI
- [ ] RBAC permission checks
- [ ] Basic job queue implementation

**Week 2:**
- [ ] Device Job Worker with state machine
- [ ] Credential rotation workflow end-to-end
- [ ] Job monitoring UI
- [ ] Audit logging for all operations
- [ ] Integration testing

### Phase 2: IP Management (P0 - 1 week)

- [ ] IPAM service implementation
- [ ] Branch network configuration
- [ ] IP conflict detection
- [ ] IP assignment workflow
- [ ] Network verification

### Phase 3: Templates & Drift Detection (P1 - 2 weeks)

- [ ] Template management service
- [ ] Template versioning
- [ ] Template application workflow
- [ ] Configuration drift detection worker
- [ ] Drift visualization UI

### Phase 4: Advanced Features (P1 - 2 weeks)

- [ ] Bulk operations
- [ ] Canary deployments
- [ ] Rollback capability
- [ ] Approval workflows
- [ ] Maintenance windows

### Phase 5: Production Hardening (P0 - 1 week)

- [ ] Error handling and recovery
- [ ] Monitoring and alerting
- [ ] Performance optimization
- [ ] Security audit
- [ ] Load testing

---

## Testing Strategy

### Unit Tests

```typescript
// src/services/device-credential-service.test.ts
describe('DeviceCredentialService', () => {
  describe('generateSecurePassword', () => {
    it('should generate password with required complexity', () => {
      const password = service.generateSecurePassword(24);
      
      expect(password).toHaveLength(24);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[!@#$%^&*]/);
    });

    it('should generate unique passwords', () => {
      const passwords = new Set();
      for (let i = 0; i < 100; i++) {
        passwords.add(service.generateSecurePassword(24));
      }
      expect(passwords.size).toBe(100);
    });
  });

  describe('encryptSecret', () => {
    it('should encrypt and decrypt correctly', async () => {
      const plaintext = 'test-password-123';
      const encrypted = await service.encryptSecret(plaintext);
      const decrypted = await service.decryptSecret(encrypted.ciphertext);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertexts for same plaintext', async () => {
      const plaintext = 'test-password';
      const encrypted1 = await service.encryptSecret(plaintext);
      const encrypted2 = await service.encryptSecret(plaintext);
      
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
    });
  });
});
```

### Integration Tests

```typescript
// test/device-management-integration.test.ts
describe('Device Management Integration', () => {
  let testDevice: Device;
  let testUser: User;

  beforeEach(async () => {
    testDevice = await createTestDevice();
    testUser = await createTestUser({ permissions: ['device:credentials:rotate'] });
  });

  it('should complete credential rotation end-to-end', async () => {
    // 1. Initiate rotation
    const response = await request(app)
      .post('/v1/device-management/password-rotation')
      .set('Authorization', `Bearer ${testUser.token}`)
      .send({
        deviceId: testDevice.id,
        reason: 'Integration test rotation',
        rotationMode: 'scheduled'
      });

    expect(response.status).toBe(202);
    const { jobId } = response.body;

    // 2. Process job
    await deviceJobWorker.processJobs();

    // 3. Verify job completed
    const job = await store.getDeviceConfigurationJob(jobId);
    expect(job.status).toBe('completed');

    // 4. Verify credential updated
    const credential = await store.getCurrentDeviceCredential(testDevice.id);
    expect(credential.status).toBe('active');

    // 5. Verify audit log
    const auditLog = await store.getAuditLog({
      resourceType: 'device',
      resourceId: testDevice.id,
      action: 'device.credential.rotation-completed'
    });
    expect(auditLog).toBeDefined();
  });

  it('should rollback on verification failure', async () => {
    // Mock device verification to fail
    mockDeviceAdapter.verifyCredential = jest.fn().mockRejectedValue(
      new Error('Authentication failed')
    );

    const response = await request(app)
      .post('/v1/device-management/password-rotation')
      .set('Authorization', `Bearer ${testUser.token}`)
      .send({
        deviceId: testDevice.id,
        reason: 'Test rollback',
        rotationMode: 'emergency'
      });

    const { jobId } = response.body;
    await deviceJobWorker.processJobs();

    const job = await store.getDeviceConfigurationJob(jobId);
    expect(job.status).toBe('manual-intervention');
    expect(job.result.rollback).toBe('failed');
  });
});
```


---

## Security Considerations

### 1. Credential Storage

**Requirements:**
- ✅ AES-256-GCM encryption for all stored secrets
- ✅ Key rotation capability
- ✅ Secrets never logged or echoed
- ✅ Minimum password complexity enforced
- ✅ Vendor-specific password rules respected

**Environment Variables:**
```bash
# .env
DEVICE_CREDENTIAL_ENCRYPTION_KEY=<generate with: openssl rand -base64 32>
DEVICE_CREDENTIAL_KEY_VERSION=1
```

### 2. Network Security

**Requirements:**
- ✅ All device configuration via branch Edge Agent
- ✅ Never expose device management IPs publicly
- ✅ TLS for all Edge Agent ↔ Control Plane communication
- ✅ Certificate pinning for Edge Agent authentication

### 3. Access Control

**Requirements:**
- ✅ RBAC for all operations
- ✅ MFA for sensitive operations (credential rotation, IP change, bulk operations)
- ✅ Rate limiting on configuration endpoints
- ✅ IP allowlisting for admin operations

### 4. Audit Requirements

**Minimum audit fields for each operation:**
```typescript
{
  timestamp: '2024-03-15T10:30:00Z',
  tenantId: 'tenant-123',
  action: 'device.credential.rotation-initiated',
  actorUserId: 'user-456',
  actorUsername: 'admin@example.com',
  actorIpAddress: '10.20.30.40',
  resourceType: 'device',
  resourceId: 'device-789',
  metadata: {
    jobId: 'job-abc',
    reason: 'Quarterly security rotation',
    rotationMode: 'scheduled',
    deviceType: 'camera',
    deviceManufacturer: 'CP PLUS'
  },
  result: 'initiated',
  sessionId: 'session-xyz'
}
```

**Audit retention:**
- Banking/compliance: Minimum 7 years
- Non-regulated: Minimum 1 year

---

## Monitoring and Alerting

### Key Metrics

```typescript
// Prometheus metrics
device_configuration_jobs_total{status, job_type}
device_configuration_job_duration_seconds{job_type}
device_configuration_job_failures_total{job_type, reason}
device_credential_rotations_total{mode}
device_ip_assignments_total
device_template_applications_total
device_configuration_drift_detected_total
```

### Critical Alerts

**1. Job Failure Rate**
```yaml
- alert: HighDeviceJobFailureRate
  expr: |
    rate(device_configuration_job_failures_total[5m]) > 0.1
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "High device configuration job failure rate"
    description: "{{ $value }} device jobs failing per second"
```

**2. Manual Intervention Required**
```yaml
- alert: DeviceJobRequiresManualIntervention
  expr: |
    device_configuration_jobs_total{status="manual-intervention"} > 0
  for: 1m
  labels:
    severity: high
  annotations:
    summary: "Device configuration job requires manual intervention"
```

**3. Credential Rotation Stuck**
```yaml
- alert: CredentialRotationStuck
  expr: |
    (time() - device_credential_rotation_started_timestamp) > 300
    and device_credential_rotation_status != "completed"
  labels:
    severity: high
  annotations:
    summary: "Credential rotation stuck for >5 minutes"
```

### Health Checks

```typescript
// src/routes/health.ts
app.get('/health/device-management', async (request, reply) => {
  const checks = {
    jobWorker: await checkJobWorker(),
    database: await checkDatabase(),
    edgeAgents: await checkEdgeAgentConnectivity(),
    encryptionKeys: await checkEncryptionKeys()
  };

  const healthy = Object.values(checks).every(c => c.healthy);

  return reply.code(healthy ? 200 : 503).send({
    healthy,
    checks,
    timestamp: new Date().toISOString()
  });
});
```

---

## Migration from Current Implementation

### Step-by-Step Migration

**1. Deploy New Schema (No Downtime)**
```bash
npm run migrate:device-management
```

**2. Deploy Services (Blue-Green)**
```bash
# Deploy new services without removing old routes
npm run deploy:device-management-v2
```

**3. Feature Flag New UI**
```typescript
// dashboard/app/maintenance/device-management/page.tsx
const useNewDeviceManagement = useFeatureFlag('device-management-v2');

if (useNewDeviceManagement) {
  return <DeviceManagementV2 />;
}

return <DeviceManagementV1 />;  // Current implementation
```

**4. Gradual Rollout**
```
Week 1: Internal testing (10% of ops team)
Week 2: Single branch pilot (1 branch)
Week 3: Regional pilot (5 branches)
Week 4: Full rollout (all branches)
```

**5. Deprecation**
```typescript
// After 2 weeks of successful operation
// Remove old routes
// Remove feature flag
// Remove old UI components
```

---

## Production Checklist

### Before Go-Live

**Infrastructure:**
- [ ] PostgreSQL configured with appropriate connection pool
- [ ] Background worker deployed and monitored
- [ ] Encryption keys generated and secured
- [ ] Backup and restore tested
- [ ] High availability configured

**Security:**
- [ ] Security audit completed
- [ ] Penetration testing performed
- [ ] RBAC rules reviewed and approved
- [ ] MFA enforced for sensitive operations
- [ ] Audit logging verified

**Operations:**
- [ ] Runbooks created for common scenarios
- [ ] Alerting configured and tested
- [ ] On-call rotation established
- [ ] Escalation procedures documented
- [ ] Disaster recovery plan tested

**Testing:**
- [ ] Unit tests >80% coverage
- [ ] Integration tests pass
- [ ] End-to-end tests pass
- [ ] Load testing completed (1000+ jobs)
- [ ] Failure scenario testing completed

**Documentation:**
- [ ] User manual created
- [ ] API documentation complete
- [ ] Architecture diagrams updated
- [ ] Security documentation complete
- [ ] Compliance documentation ready

---

## Success Criteria

### Functional Requirements
✅ Device configuration changes execute reliably  
✅ Credentials rotated without service interruption  
✅ IP changes completed with verification  
✅ Templates applied consistently  
✅ Configuration drift detected and reported  
✅ Jobs recover from failures automatically  

### Non-Functional Requirements
✅ 99.9% success rate for configuration jobs  
✅ <2 minute average completion time for credential rotation  
✅ Zero credential exposure in logs or audit trails  
✅ 100% audit coverage for all operations  
✅ RBAC enforced for all endpoints  
✅ MFA required for sensitive operations  

### Operational Requirements
✅ Monitoring dashboards available  
✅ Alerting functional and tested  
✅ Runbooks complete  
✅ On-call procedures established  
✅ Support team trained  

---

## Conclusion

This production-ready implementation transforms the Device Management page from a simple form-based interface into an enterprise-grade device provisioning and maintenance system capable of managing thousands of devices across hundreds of branches with the reliability, security, and auditability required for banking deployments.

The key improvements are:

1. **Asynchronous job-based architecture** - No more blocking operations
2. **Comprehensive verification** - Prove changes worked
3. **Secure credential management** - Encrypted storage, auto-generated passwords
4. **Device Registry integration** - No more free-text IDs
5. **RBAC and audit** - Full accountability
6. **Recovery mechanisms** - Rollback and manual intervention workflows
7. **Configuration drift detection** - Know when devices deviate
8. **Production monitoring** - Visibility into operations

Implementation timeline: **6-8 weeks** for full production readiness.


/**
 * Distributed Camera Lease Manager
 * 
 * Implements distributed camera ownership using Redis with:
 * - Atomic lease acquisition/renewal
 * - Fencing tokens (epochs) to prevent split-brain
 * - Automatic lease expiry and transfer
 * - Graceful rebalancing
 * 
 * This is the core mechanism for automatic media gateway failover.
 */

import IORedis from "ioredis";
import type { CameraLease, CameraLeaseTransfer } from "../domain/ha-telemetry.types.js";

interface CameraLeaseConfig {
  redisClient: any;
  leaseTimeoutSeconds: number;
  renewalIntervalSeconds: number;
  heartbeatIntervalSeconds: number;
}

interface LeaseAcquisitionResult {
  acquired: boolean;
  lease?: CameraLease;
  reason?: string;
  existingOwner?: string;
}

export class CameraLeaseManager {
  private redis: any;
  private leaseTimeoutSeconds: number;
  private renewalIntervalSeconds: number;
  private heartbeatIntervalSeconds: number;

  constructor(config: CameraLeaseConfig) {
    this.redis = config.redisClient;
    this.leaseTimeoutSeconds = config.leaseTimeoutSeconds;
    this.renewalIntervalSeconds = config.renewalIntervalSeconds;
    this.heartbeatIntervalSeconds = config.heartbeatIntervalSeconds;
  }

  /**
   * Attempt to acquire ownership of a camera
   * Uses Redis SET NX with expiry for atomic acquisition
   */
  async acquireCameraLease(
    cameraId: string,
    gatewayId: string,
  ): Promise<LeaseAcquisitionResult> {
    const leaseKey = this.getLeaseKey(cameraId);
    const epochKey = this.getEpochKey(cameraId);
    const now = new Date().toISOString();

    try {
      // Use Lua script for atomic acquisition with epoch increment
      const script = `
        local lease_key = KEYS[1]
        local epoch_key = KEYS[2]
        local gateway_id = ARGV[1]
        local now = ARGV[2]
        local ttl_seconds = tonumber(ARGV[3])
        
        -- Check if lease exists
        local existing_lease = redis.call('GET', lease_key)
        
        if not existing_lease then
          -- Increment epoch for new lease
          local new_epoch = redis.call('INCR', epoch_key)
          
          -- Create lease
          local lease_data = cjson.encode({
            cameraId = ARGV[4],
            ownerId = gateway_id,
            acquiredAt = now,
            renewedAt = now,
            epoch = new_epoch
          })
          
          redis.call('SETEX', lease_key, ttl_seconds, lease_data)
          return {1, lease_data}
        else
          -- Lease already exists
          return {0, existing_lease}
        end
      `;

      const result = await this.redis.eval(
        script,
        2, // Number of keys
        leaseKey,
        epochKey,
        gatewayId,
        now,
        this.leaseTimeoutSeconds,
        cameraId,
      );

      if (Array.isArray(result) && result[0] === 1) {
        const leaseData = JSON.parse(result[1] as string);
        const expiresAt = new Date(
          Date.now() + this.leaseTimeoutSeconds * 1000,
        ).toISOString();

        const lease: CameraLease = {
          cameraId,
          ownerId: gatewayId,
          leaseKey,
          acquiredAt: leaseData.acquiredAt,
          expiresAt,
          renewedAt: leaseData.renewedAt,
          epoch: leaseData.epoch,
          heartbeatIntervalMs: this.heartbeatIntervalSeconds * 1000,
        };

        return { acquired: true, lease };
      } else {
        const existingLeaseData = JSON.parse((result as [number, string])[1]);
        return {
          acquired: false,
          reason: "Camera already owned",
          existingOwner: existingLeaseData.ownerId,
        };
      }
    } catch (error) {
      console.error(`Failed to acquire lease for camera ${cameraId}:`, error);
      return {
        acquired: false,
        reason: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Renew an existing lease
   * Validates epoch to prevent stale renewals
   */
  async renewCameraLease(
    cameraId: string,
    gatewayId: string,
    currentEpoch: number,
  ): Promise<{ renewed: boolean; lease?: CameraLease; reason?: string }> {
    const leaseKey = this.getLeaseKey(cameraId);
    const now = new Date().toISOString();

    try {
      // Lua script for atomic renewal with epoch validation
      const script = `
        local lease_key = KEYS[1]
        local gateway_id = ARGV[1]
        local current_epoch = tonumber(ARGV[2])
        local now = ARGV[3]
        local ttl_seconds = tonumber(ARGV[4])
        
        local existing_lease = redis.call('GET', lease_key)
        
        if not existing_lease then
          return {0, 'lease_expired'}
        end
        
        local lease_data = cjson.decode(existing_lease)
        
        -- Validate ownership and epoch
        if lease_data.ownerId ~= gateway_id then
          return {0, 'wrong_owner'}
        end
        
        if lease_data.epoch ~= current_epoch then
          return {0, 'epoch_mismatch'}
        end
        
        -- Renew lease
        lease_data.renewedAt = now
        redis.call('SETEX', lease_key, ttl_seconds, cjson.encode(lease_data))
        
        return {1, cjson.encode(lease_data)}
      `;

      const result = await this.redis.eval(
        script,
        1,
        leaseKey,
        gatewayId,
        currentEpoch,
        now,
        this.leaseTimeoutSeconds,
      );

      if (Array.isArray(result) && result[0] === 1) {
        const leaseData = JSON.parse(result[1] as string);
        const expiresAt = new Date(
          Date.now() + this.leaseTimeoutSeconds * 1000,
        ).toISOString();

        const lease: CameraLease = {
          cameraId,
          ownerId: gatewayId,
          leaseKey,
          acquiredAt: leaseData.acquiredAt,
          expiresAt,
          renewedAt: now,
          epoch: leaseData.epoch,
          heartbeatIntervalMs: this.heartbeatIntervalSeconds * 1000,
        };

        return { renewed: true, lease };
      } else {
        return {
          renewed: false,
          reason: (result as [number, string])[1],
        };
      }
    } catch (error) {
      console.error(`Failed to renew lease for camera ${cameraId}:`, error);
      return {
        renewed: false,
        reason: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Release a camera lease
   * Uses epoch to ensure only the rightful owner can release
   */
  async releaseCameraLease(
    cameraId: string,
    gatewayId: string,
    epoch: number,
  ): Promise<{ released: boolean; reason?: string }> {
    const leaseKey = this.getLeaseKey(cameraId);

    try {
      const script = `
        local lease_key = KEYS[1]
        local gateway_id = ARGV[1]
        local epoch = tonumber(ARGV[2])
        
        local existing_lease = redis.call('GET', lease_key)
        
        if not existing_lease then
          return {1, 'already_released'}
        end
        
        local lease_data = cjson.decode(existing_lease)
        
        if lease_data.ownerId ~= gateway_id or lease_data.epoch ~= epoch then
          return {0, 'unauthorized'}
        end
        
        redis.call('DEL', lease_key)
        return {1, 'released'}
      `;

      const result = await this.redis.eval(
        script,
        1,
        leaseKey,
        gatewayId,
        epoch,
      );

      return {
        released: Array.isArray(result) && result[0] === 1,
        reason: Array.isArray(result) ? (result[1] as string) : undefined,
      };
    } catch (error) {
      console.error(`Failed to release lease for camera ${cameraId}:`, error);
      return {
        released: false,
        reason: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Force acquire a camera lease (for failover scenarios)
   * Increments epoch to invalidate any stale lease holders
   */
  async forceAcquireCameraLease(
    cameraId: string,
    newGatewayId: string,
    reason: string,
  ): Promise<{ acquired: boolean; lease?: CameraLease; previousOwner?: string }> {
    const leaseKey = this.getLeaseKey(cameraId);
    const epochKey = this.getEpochKey(cameraId);
    const transferKey = this.getTransferKey(cameraId);
    const now = new Date().toISOString();

    try {
      const script = `
        local lease_key = KEYS[1]
        local epoch_key = KEYS[2]
        local transfer_key = KEYS[3]
        local new_gateway_id = ARGV[1]
        local now = ARGV[2]
        local ttl_seconds = tonumber(ARGV[3])
        local reason = ARGV[4]
        local camera_id = ARGV[5]
        
        local previous_owner = 'none'
        local existing_lease = redis.call('GET', lease_key)
        
        if existing_lease then
          local lease_data = cjson.decode(existing_lease)
          previous_owner = lease_data.ownerId
          
          -- Record transfer for audit
          local transfer_data = cjson.encode({
            cameraId = camera_id,
            previousOwner = previous_owner,
            newOwner = new_gateway_id,
            reason = reason,
            initiatedAt = now
          })
          redis.call('SETEX', transfer_key, 3600, transfer_data) -- Keep for 1 hour
        end
        
        -- Increment epoch for fencing
        local new_epoch = redis.call('INCR', epoch_key)
        
        local lease_data = cjson.encode({
          cameraId = camera_id,
          ownerId = new_gateway_id,
          acquiredAt = now,
          renewedAt = now,
          epoch = new_epoch
        })
        
        redis.call('SETEX', lease_key, ttl_seconds, lease_data)
        
        return {1, lease_data, previous_owner}
      `;

      const result = await this.redis.eval(
        script,
        3,
        leaseKey,
        epochKey,
        transferKey,
        newGatewayId,
        now,
        this.leaseTimeoutSeconds,
        reason,
        cameraId,
      );

      if (Array.isArray(result) && result[0] === 1) {
        const leaseData = JSON.parse(result[1] as string);
        const previousOwner = result[2] as string;
        const expiresAt = new Date(
          Date.now() + this.leaseTimeoutSeconds * 1000,
        ).toISOString();

        const lease: CameraLease = {
          cameraId,
          ownerId: newGatewayId,
          leaseKey,
          acquiredAt: leaseData.acquiredAt,
          expiresAt,
          renewedAt: leaseData.renewedAt,
          epoch: leaseData.epoch,
          heartbeatIntervalMs: this.heartbeatIntervalSeconds * 1000,
        };

        return {
          acquired: true,
          lease,
          previousOwner: previousOwner !== "none" ? previousOwner : undefined,
        };
      }

      return { acquired: false };
    } catch (error) {
      console.error(`Failed to force acquire lease for camera ${cameraId}:`, error);
      return { acquired: false };
    }
  }

  /**
   * Get current lease information for a camera
   */
  async getCameraLease(cameraId: string): Promise<CameraLease | null> {
    const leaseKey = this.getLeaseKey(cameraId);

    try {
      const leaseData = await this.redis.get(leaseKey);

      if (!leaseData) {
        return null;
      }

      const parsed = JSON.parse(leaseData);
      const ttl = await this.redis.ttl(leaseKey);
      const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

      return {
        cameraId,
        ownerId: parsed.ownerId,
        leaseKey,
        acquiredAt: parsed.acquiredAt,
        expiresAt,
        renewedAt: parsed.renewedAt,
        epoch: parsed.epoch,
        heartbeatIntervalMs: this.heartbeatIntervalSeconds * 1000,
      };
    } catch (error) {
      console.error(`Failed to get lease for camera ${cameraId}:`, error);
      return null;
    }
  }

  /**
   * List all cameras owned by a specific gateway
   */
  async getCamerasByGateway(gatewayId: string): Promise<string[]> {
    try {
      const pattern = "sentinel:camera:lease:*";
      const keys = await this.scanKeys(pattern);
      const cameraIds: string[] = [];

      for (const key of keys) {
        const leaseData = await this.redis.get(key);
        if (leaseData) {
          const parsed = JSON.parse(leaseData);
          if (parsed.ownerId === gatewayId) {
            cameraIds.push(parsed.cameraId);
          }
        }
      }

      return cameraIds;
    } catch (error) {
      console.error(`Failed to get cameras for gateway ${gatewayId}:`, error);
      return [];
    }
  }

  /**
   * List all expired or orphaned leases that can be claimed
   */
  async getExpiredLeases(): Promise<string[]> {
    try {
      const pattern = "sentinel:camera:lease:*";
      const keys = await this.scanKeys(pattern);
      const expiredCameraIds: string[] = [];

      for (const key of keys) {
        const ttl = await this.redis.ttl(key);
        // Consider lease expired if TTL is very low (< 5 seconds)
        if (ttl > 0 && ttl < 5) {
          const cameraId = key.replace("sentinel:camera:lease:", "");
          expiredCameraIds.push(cameraId);
        }
      }

      return expiredCameraIds;
    } catch (error) {
      console.error("Failed to get expired leases:", error);
      return [];
    }
  }

  /**
   * Get recent lease transfers for audit/monitoring
   */
  async getRecentTransfers(limit: number = 50): Promise<CameraLeaseTransfer[]> {
    try {
      const pattern = "sentinel:camera:transfer:*";
      const keys = await this.scanKeys(pattern);
      const transfers: CameraLeaseTransfer[] = [];

      for (const key of keys.slice(0, limit)) {
        const transferData = await this.redis.get(key);
        if (transferData) {
          const parsed = JSON.parse(transferData);
          transfers.push({
            cameraId: parsed.cameraId,
            previousOwner: parsed.previousOwner,
            newOwner: parsed.newOwner,
            reason: parsed.reason,
            initiatedAt: parsed.initiatedAt,
            completedAt: parsed.completedAt,
            reconnectAttempts: parsed.reconnectAttempts || 0,
            status: parsed.status || "completed",
          });
        }
      }

      // Sort by most recent
      transfers.sort((a, b) =>
        new Date(b.initiatedAt).getTime() - new Date(a.initiatedAt).getTime(),
      );

      return transfers.slice(0, limit);
    } catch (error) {
      console.error("Failed to get recent transfers:", error);
      return [];
    }
  }

  /**
   * Health check: validate lease consistency
   */
  async validateLeaseConsistency(): Promise<{
    healthy: boolean;
    totalLeases: number;
    expiringLeases: number;
    conflicts: number;
    issues: string[];
  }> {
    const issues: string[] = [];
    let totalLeases = 0;
    let expiringLeases = 0;
    let conflicts = 0;

    try {
      const pattern = "sentinel:camera:lease:*";
      const keys = await this.scanKeys(pattern);
      totalLeases = keys.length;

      for (const key of keys) {
        const ttl = await this.redis.ttl(key);

        // Check for expiring leases (< 10 seconds)
        if (ttl > 0 && ttl < 10) {
          expiringLeases++;
        }

        // Check for negative TTL (should not happen with SETEX)
        if (ttl < 0) {
          conflicts++;
          issues.push(`Lease ${key} has no expiry set`);
        }
      }

      return {
        healthy: conflicts === 0,
        totalLeases,
        expiringLeases,
        conflicts,
        issues,
      };
    } catch (error) {
      return {
        healthy: false,
        totalLeases: 0,
        expiringLeases: 0,
        conflicts: 0,
        issues: [error instanceof Error ? error.message : "Unknown error"],
      };
    }
  }

  private getLeaseKey(cameraId: string): string {
    return `sentinel:camera:lease:${cameraId}`;
  }

  private getEpochKey(cameraId: string): string {
    return `sentinel:camera:epoch:${cameraId}`;
  }

  private getTransferKey(cameraId: string): string {
    return `sentinel:camera:transfer:${cameraId}:${Date.now()}`;
  }

  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = "0";

    do {
      const result = await this.redis.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        100,
      );
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== "0");

    return keys;
  }
}

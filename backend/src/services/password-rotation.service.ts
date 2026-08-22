/**
 * Password Rotation Service
 * Automatic password rotation for cameras, recorders, switches, servers, and credentials
 */

import {
  PasswordRotationJob,
  RotationTargetType,
  RotationStatus,
  VerificationStatus
} from '../types/security.types';
import { SecretVaultService } from './secret-vault.service';
import crypto from 'crypto';

export class PasswordRotationService {
  private jobs: Map<string, PasswordRotationJob> = new Map();
  private rotationInterval: NodeJS.Timeout | null = null;
  private vaultService?: SecretVaultService;

  constructor(vaultService?: SecretVaultService) {
    this.vaultService = vaultService;
  }

  /**
   * Schedule password rotation
   */
  async scheduleRotation(
    targetType: RotationTargetType,
    targetId: string,
    targetName: string,
    scheduledAt: Date = new Date()
  ): Promise<PasswordRotationJob> {
    const jobId = crypto.randomBytes(16).toString('hex');

    const job: PasswordRotationJob = {
      id: jobId,
      targetType,
      targetId,
      targetName,
      status: RotationStatus.SCHEDULED,
      scheduledAt,
      verificationStatus: VerificationStatus.NOT_VERIFIED,
      retryCount: 0,
      maxRetries: 3
    };

    this.jobs.set(jobId, job);

    console.log(`📅 Scheduled password rotation: ${targetName} (${targetType}) at ${scheduledAt}`);

    return job;
  }

  /**
   * Execute password rotation
   */
  async executeRotation(jobId: string): Promise<PasswordRotationJob> {
    const job = this.jobs.get(jobId);

    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    console.log(`🔄 Executing password rotation: ${job.targetName}`);

    job.status = RotationStatus.IN_PROGRESS;
    job.startedAt = new Date();

    try {
      // Step 1: Generate new password
      const newPassword = this.generateSecurePassword(job.targetType);
      job.newPassword = newPassword;

      // Step 2: Backup old password
      const oldPassword = await this.getCurrentPassword(job.targetType, job.targetId);
      if (oldPassword) {
        job.oldPasswordBackup = await this.encryptPassword(oldPassword);
      }

      // Step 3: Update password on target device/system
      const updateSuccess = await this.updatePassword(job.targetType, job.targetId, newPassword);

      if (!updateSuccess) {
        throw new Error('Failed to update password on target');
      }

      // Step 4: Verify new password works
      job.status = RotationStatus.VERIFYING;
      const verifySuccess = await this.verifyPassword(job.targetType, job.targetId, newPassword);

      if (!verifySuccess) {
        // Rollback to old password
        if (oldPassword) {
          console.log('⚠️ Verification failed, rolling back...');
          await this.updatePassword(job.targetType, job.targetId, oldPassword);
          job.status = RotationStatus.ROLLED_BACK;
          job.verificationStatus = VerificationStatus.FAILED;
          throw new Error('Password verification failed, rolled back to old password');
        }
      }

      // Step 5: Store new password in vault
      if (this.vaultService) {
        await this.vaultService.storeSecret(
          this.getVaultPath(job.targetType),
          job.targetId,
          newPassword,
          {
            targetType: job.targetType,
            targetName: job.targetName,
            rotatedAt: new Date().toISOString(),
            jobId: job.id
          }
        );
      }

      // Step 6: Mark as completed
      job.status = RotationStatus.COMPLETED;
      job.verificationStatus = VerificationStatus.VERIFIED;
      job.completedAt = new Date();
      
      // Clear password from memory
      job.newPassword = undefined;
      job.oldPasswordBackup = undefined;

      console.log(`✓ Password rotation completed: ${job.targetName}`);

      return job;
    } catch (error: any) {
      console.error(`❌ Password rotation failed: ${job.targetName}`, error);

      job.status = RotationStatus.FAILED;
      job.error = error.message;
      job.completedAt = new Date();

      // Retry if not exceeded max retries
      if (job.retryCount < job.maxRetries) {
        job.retryCount++;
        console.log(`🔄 Retrying rotation (${job.retryCount}/${job.maxRetries})`);
        
        // Schedule retry in 5 minutes
        setTimeout(() => {
          this.executeRotation(jobId);
        }, 5 * 60 * 1000);
      }

      return job;
    }
  }

  /**
   * Rotate all passwords for a target type
   */
  async rotateAllByType(targetType: RotationTargetType): Promise<PasswordRotationJob[]> {
    console.log(`🔄 Starting bulk rotation for type: ${targetType}`);

    const targets = await this.getTargetsByType(targetType);
    const jobs: PasswordRotationJob[] = [];

    for (const target of targets) {
      const job = await this.scheduleRotation(
        targetType,
        target.id,
        target.name
      );
      jobs.push(job);
    }

    // Execute rotations with delay to avoid overload
    for (const job of jobs) {
      await this.executeRotation(job.id);
      await this.delay(2000); // 2 second delay between rotations
    }

    return jobs;
  }

  /**
   * Get rotation job status
   */
  async getJob(jobId: string): Promise<PasswordRotationJob | null> {
    return this.jobs.get(jobId) || null;
  }

  /**
   * List rotation jobs
   */
  async listJobs(filter?: {
    status?: RotationStatus;
    targetType?: RotationTargetType;
  }): Promise<PasswordRotationJob[]> {
    let jobs = Array.from(this.jobs.values());

    if (filter?.status) {
      jobs = jobs.filter(j => j.status === filter.status);
    }

    if (filter?.targetType) {
      jobs = jobs.filter(j => j.targetType === filter.targetType);
    }

    return jobs.sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime());
  }

  /**
   * Get rotation statistics
   */
  async getStatistics(): Promise<{
    total: number;
    completed: number;
    failed: number;
    inProgress: number;
    scheduled: number;
  }> {
    const jobs = Array.from(this.jobs.values());

    return {
      total: jobs.length,
      completed: jobs.filter(j => j.status === RotationStatus.COMPLETED).length,
      failed: jobs.filter(j => j.status === RotationStatus.FAILED).length,
      inProgress: jobs.filter(j => j.status === RotationStatus.IN_PROGRESS).length,
      scheduled: jobs.filter(j => j.status === RotationStatus.SCHEDULED).length
    };
  }

  /**
   * Start automatic rotation schedule
   */
  startAutomaticRotation(intervalDays: number = 90): void {
    const intervalMs = intervalDays * 24 * 60 * 60 * 1000;

    this.rotationInterval = setInterval(async () => {
      console.log('🔄 Starting scheduled password rotation...');

      // Rotate all target types
      const types = [
        RotationTargetType.CAMERA,
        RotationTargetType.RECORDER,
        RotationTargetType.SWITCH,
        RotationTargetType.DATABASE
      ];

      for (const type of types) {
        try {
          await this.rotateAllByType(type);
        } catch (error) {
          console.error(`Failed to rotate ${type}:`, error);
        }
      }
    }, intervalMs);

    console.log(`✓ Automatic password rotation started (every ${intervalDays} days)`);
  }

  /**
   * Stop automatic rotation
   */
  stopAutomaticRotation(): void {
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
      this.rotationInterval = null;
      console.log('Automatic password rotation stopped');
    }
  }

  // ============================================================================
  // Password operations
  // ============================================================================

  private generateSecurePassword(targetType: RotationTargetType): string {
    // Generate cryptographically secure password
    const length = this.getPasswordLength(targetType);
    const charset = this.getPasswordCharset(targetType);

    let password = '';
    const randomBytes = crypto.randomBytes(length * 2);

    for (let i = 0; i < length; i++) {
      const randomIndex = randomBytes[i] % charset.length;
      password += charset[randomIndex];
    }

    // Ensure password meets complexity requirements
    return this.ensureComplexity(password, targetType);
  }

  private getPasswordLength(targetType: RotationTargetType): number {
    switch (targetType) {
      case RotationTargetType.CAMERA:
      case RotationTargetType.RECORDER:
        return 16;
      case RotationTargetType.SWITCH:
      case RotationTargetType.FIREWALL:
        return 20;
      case RotationTargetType.DATABASE:
        return 32;
      default:
        return 16;
    }
  }

  private getPasswordCharset(targetType: RotationTargetType): string {
    // Some devices have restrictions on special characters
    const alphanumeric = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';

    switch (targetType) {
      case RotationTargetType.CAMERA:
      case RotationTargetType.RECORDER:
        // Some cameras don't support all special characters
        return alphanumeric + '!@#$%';
      default:
        return alphanumeric + special;
    }
  }

  private ensureComplexity(password: string, targetType: RotationTargetType): string {
    // Ensure at least one uppercase, lowercase, number, and special char
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password);

    if (hasUpper && hasLower && hasNumber && hasSpecial) {
      return password;
    }

    // Regenerate if doesn't meet complexity
    return this.generateSecurePassword(targetType);
  }

  private async encryptPassword(password: string): Promise<string> {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(password, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  private async decryptPassword(encryptedPassword: string): Promise<string> {
    const parts = encryptedPassword.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const key = this.getEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  private getEncryptionKey(): Buffer {
    const secret = process.env.PASSWORD_ENCRYPTION_KEY || 'default-key-change-in-production';
    return crypto.scryptSync(secret, 'salt', 32);
  }

  // ============================================================================
  // Target-specific operations
  // ============================================================================

  private async getCurrentPassword(targetType: RotationTargetType, targetId: string): Promise<string | null> {
    if (this.vaultService) {
      const secret = await this.vaultService.getSecret(
        this.getVaultPath(targetType),
        targetId
      );
      return secret?.value || null;
    }
    return null;
  }

  private async updatePassword(targetType: RotationTargetType, targetId: string, newPassword: string): Promise<boolean> {
    console.log(`⚙️ Updating password on ${targetType}: ${targetId}`);

    try {
      switch (targetType) {
        case RotationTargetType.CAMERA:
          return await this.updateCameraPassword(targetId, newPassword);
        
        case RotationTargetType.RECORDER:
          return await this.updateRecorderPassword(targetId, newPassword);
        
        case RotationTargetType.SWITCH:
          return await this.updateSwitchPassword(targetId, newPassword);
        
        case RotationTargetType.FIREWALL:
          return await this.updateFirewallPassword(targetId, newPassword);
        
        case RotationTargetType.LINUX_HOST:
          return await this.updateLinuxPassword(targetId, newPassword);
        
        case RotationTargetType.WINDOWS_HOST:
          return await this.updateWindowsPassword(targetId, newPassword);
        
        case RotationTargetType.DATABASE:
          return await this.updateDatabasePassword(targetId, newPassword);
        
        default:
          return false;
      }
    } catch (error) {
      console.error(`Failed to update password:`, error);
      return false;
    }
  }

  private async verifyPassword(targetType: RotationTargetType, targetId: string, password: string): Promise<boolean> {
    console.log(`✓ Verifying password on ${targetType}: ${targetId}`);

    try {
      switch (targetType) {
        case RotationTargetType.CAMERA:
          return await this.verifyCameraPassword(targetId, password);
        
        case RotationTargetType.RECORDER:
          return await this.verifyRecorderPassword(targetId, password);
        
        default:
          // Simulated verification
          return true;
      }
    } catch (error) {
      console.error(`Password verification failed:`, error);
      return false;
    }
  }

  private async updateCameraPassword(cameraId: string, password: string): Promise<boolean> {
    // In production: use ONVIF SetUser command
    // await onvifDevice.deviceManagement.setUser({
    //   User: { Username: 'admin', Password: password, UserLevel: 'Administrator' }
    // });
    return true;
  }

  private async verifyCameraPassword(cameraId: string, password: string): Promise<boolean> {
    // In production: attempt ONVIF connection with new password
    return true;
  }

  private async updateRecorderPassword(recorderId: string, password: string): Promise<boolean> {
    // In production: use recorder API to update password
    return true;
  }

  private async verifyRecorderPassword(recorderId: string, password: string): Promise<boolean> {
    // In production: attempt login with new password
    return true;
  }

  private async updateSwitchPassword(switchId: string, password: string): Promise<boolean> {
    // In production: use SSH/SNMP to update password
    return true;
  }

  private async updateFirewallPassword(firewallId: string, password: string): Promise<boolean> {
    // In production: use firewall API to update password
    return true;
  }

  private async updateLinuxPassword(hostId: string, password: string): Promise<boolean> {
    // In production: use SSH to run passwd command
    return true;
  }

  private async updateWindowsPassword(hostId: string, password: string): Promise<boolean> {
    // In production: use WinRM or PowerShell remoting
    return true;
  }

  private async updateDatabasePassword(dbId: string, password: string): Promise<boolean> {
    // In production: execute ALTER USER command
    return true;
  }

  private async getTargetsByType(targetType: RotationTargetType): Promise<Array<{ id: string; name: string }>> {
    // In production: query database for targets of this type
    // For now, return empty array
    return [];
  }

  private getVaultPath(targetType: RotationTargetType): string {
    return `credentials/${targetType.toLowerCase()}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Singleton instance
// ============================================================================

export const passwordRotationService = new PasswordRotationService();

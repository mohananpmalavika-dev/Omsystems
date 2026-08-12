/**
 * Password Rotation Service
 * Automated credential rotation for devices and services
 */

import { IPasswordRotationService, TargetFilters } from '../interfaces.js';
import {
  PasswordRotationTarget,
  PasswordRotationJob,
  PasswordPolicy,
  RotationStatus
} from '../types.js';
import { getDatabase } from '../../config/database.js';
import { EventEmitter } from 'events';
import { SecretVaultService } from './secret-vault.service.js';
import * as crypto from 'crypto';
import axios from 'axios';

export class PasswordRotationService extends EventEmitter implements IPasswordRotationService {
  private secretVault: SecretVaultService;
  private schedulerInterval: NodeJS.Timeout | null = null;

  constructor(secretVault: SecretVaultService) {
    super();
    this.secretVault = secretVault;
    this.startScheduler();
  }

  /**
   * Add rotation target
   */
  async addTarget(target: Omit<PasswordRotationTarget, 'id'>): Promise<PasswordRotationTarget> {
    const db = getDatabase();

    const rotationTarget: PasswordRotationTarget = {
      id: this.generateId(),
      ...target,
      nextRotation: this.calculateNextRotation(target.rotationPolicy)
    };

    await db.collection('password_rotation_targets').insertOne(rotationTarget);

    this.emit('target:added', { targetId: rotationTarget.id, type: target.type, name: target.name });

    return rotationTarget;
  }

  /**
   * Get target by ID
   */
  async getTarget(id: string): Promise<PasswordRotationTarget> {
    const db = getDatabase();
    
    const target = await db.collection('password_rotation_targets').findOne({ id });
    
    if (!target) {
      throw new Error('Rotation target not found');
    }
    
    return target;
  }

  /**
   * List targets with filters
   */
  async listTargets(filters: TargetFilters = {}): Promise<PasswordRotationTarget[]> {
    const db = getDatabase();
    
    const query: any = {};
    
    if (filters.type) {
      query.type = filters.type;
    }
    
    if (filters.enabled !== undefined) {
      query.enabled = filters.enabled;
    }
    
    if (filters.needsRotation) {
      query.nextRotation = { $lte: new Date() };
    }
    
    if (filters.overdue) {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      query.nextRotation = { $lte: threeDaysAgo };
    }
    
    const targets = await db.collection('password_rotation_targets')
      .find(query)
      .sort({ nextRotation: 1 })
      .toArray();
    
    return targets;
  }

  /**
   * Update target
   */
  async updateTarget(id: string, updates: Partial<PasswordRotationTarget>): Promise<PasswordRotationTarget> {
    const db = getDatabase();
    
    const result = await db.collection('password_rotation_targets').findOneAndUpdate(
      { id },
      { $set: { ...updates, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    
    if (!result.value) {
      throw new Error('Target not found');
    }
    
    this.emit('target:updated', { targetId: id });
    
    return result.value;
  }

  /**
   * Delete target
   */
  async deleteTarget(id: string): Promise<void> {
    const db = getDatabase();
    
    await db.collection('password_rotation_targets').deleteOne({ id });
    
    this.emit('target:deleted', { targetId: id });
  }

  /**
   * Rotate password for a target
   */
  async rotatePassword(targetId: string, force: boolean = false): Promise<PasswordRotationJob> {
    const db = getDatabase();
    const target = await this.getTarget(targetId);

    if (!target.enabled && !force) {
      throw new Error('Target is disabled. Use force=true to rotate anyway.');
    }

    // Create job
    const job: PasswordRotationJob = {
      id: this.generateId(),
      targetId,
      status: RotationStatus.PENDING,
      scheduledAt: new Date(),
      oldPasswordHash: '',
      newPasswordHash: '',
      attempts: 0,
      rollbackAvailable: true
    };

    await db.collection('password_rotation_jobs').insertOne(job);

    // Execute rotation asynchronously
    this.executeRotation(job.id, target).catch(error => {
      console.error(`Rotation job ${job.id} failed:`, error);
    });

    return job;
  }

  /**
   * Rotate all passwords matching filters
   */
  async rotateAll(filters: TargetFilters = {}): Promise<PasswordRotationJob[]> {
    const targets = await this.listTargets({ ...filters, enabled: true });
    
    const jobs: PasswordRotationJob[] = [];
    
    for (const target of targets) {
      try {
        const job = await this.rotatePassword(target.id);
        jobs.push(job);
      } catch (error) {
        console.error(`Failed to rotate target ${target.id}:`, error);
      }
    }
    
    return jobs;
  }

  /**
   * Schedule rotation
   */
  async scheduleRotation(targetId: string, scheduledAt: Date): Promise<PasswordRotationJob> {
    const db = getDatabase();
    const target = await this.getTarget(targetId);

    const job: PasswordRotationJob = {
      id: this.generateId(),
      targetId,
      status: RotationStatus.PENDING,
      scheduledAt,
      oldPasswordHash: '',
      newPasswordHash: '',
      attempts: 0,
      rollbackAvailable: true
    };

    await db.collection('password_rotation_jobs').insertOne(job);

    this.emit('job:scheduled', { jobId: job.id, targetId, scheduledAt });

    return job;
  }

  /**
   * Get job by ID
   */
  async getJob(id: string): Promise<PasswordRotationJob> {
    const db = getDatabase();
    
    const job = await db.collection('password_rotation_jobs').findOne({ id });
    
    if (!job) {
      throw new Error('Job not found');
    }
    
    return job;
  }

  /**
   * List jobs
   */
  async listJobs(targetId?: string, status?: string): Promise<PasswordRotationJob[]> {
    const db = getDatabase();
    
    const query: any = {};
    
    if (targetId) {
      query.targetId = targetId;
    }
    
    if (status) {
      query.status = status;
    }
    
    const jobs = await db.collection('password_rotation_jobs')
      .find(query)
      .sort({ scheduledAt: -1 })
      .limit(100)
      .toArray();
    
    return jobs;
  }

  /**
   * Retry failed job
   */
  async retryJob(jobId: string): Promise<PasswordRotationJob> {
    const db = getDatabase();
    const job = await this.getJob(jobId);

    if (job.status !== RotationStatus.FAILED) {
      throw new Error('Can only retry failed jobs');
    }

    // Reset job status
    await db.collection('password_rotation_jobs').updateOne(
      { id: jobId },
      {
        $set: {
          status: RotationStatus.PENDING,
          error: undefined
        },
        $inc: { attempts: 1 }
      }
    );

    const target = await this.getTarget(job.targetId);
    
    // Execute rotation
    this.executeRotation(jobId, target).catch(error => {
      console.error(`Retry of job ${jobId} failed:`, error);
    });

    return await this.getJob(jobId);
  }

  /**
   * Rollback job (restore old password)
   */
  async rollbackJob(jobId: string): Promise<void> {
    const db = getDatabase();
    const job = await this.getJob(jobId);

    if (!job.rollbackAvailable) {
      throw new Error('Rollback not available for this job');
    }

    if (job.status !== RotationStatus.SUCCESS) {
      throw new Error('Can only rollback successful jobs');
    }

    const target = await this.getTarget(job.targetId);
    
    // Get old password from vault
    const oldSecret = await this.secretVault.getSecret(target.secretId, job.oldPasswordHash as any);
    const oldPassword = await this.secretVault.decrypt(oldSecret.value);

    // Apply old password to device
    try {
      await this.applyPasswordToDevice(target, oldPassword);
      
      // Update job
      await db.collection('password_rotation_jobs').updateOne(
        { id: jobId },
        {
          $set: {
            status: RotationStatus.SKIPPED,
            error: 'Rolled back by user'
          }
        }
      );
      
      this.emit('job:rolled-back', { jobId, targetId: target.id });
    } catch (error: unknown) {
      throw new Error(`Rollback failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate password according to policy
   */
  async generatePassword(policy: PasswordPolicy): Promise<string> {
    const charset = this.buildCharset(policy);
    
    let password = '';
    const randomBytes = crypto.randomBytes(policy.maxLength);
    
    // Generate random password
    for (let i = 0; i < policy.minLength; i++) {
      const randomIndex = randomBytes[i] % charset.length;
      password += charset[randomIndex];
    }
    
    // Ensure policy requirements are met
    if (policy.requireUppercase && !/[A-Z]/.test(password)) {
      password = this.replaceRandomChar(password, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    }
    
    if (policy.requireLowercase && !/[a-z]/.test(password)) {
      password = this.replaceRandomChar(password, 'abcdefghijklmnopqrstuvwxyz');
    }
    
    if (policy.requireNumbers && !/[0-9]/.test(password)) {
      password = this.replaceRandomChar(password, '0123456789');
    }
    
    if (policy.requireSpecialChars && !new RegExp(`[${policy.specialChars}]`).test(password)) {
      password = this.replaceRandomChar(password, policy.specialChars);
    }
    
    // Check against forbidden passwords
    if (policy.forbiddenPasswords.includes(password)) {
      return this.generatePassword(policy); // Regenerate
    }
    
    return password;
  }

  /**
   * Validate password against policy
   */
  async validatePassword(password: string, policy: PasswordPolicy): Promise<boolean> {
    if (password.length < policy.minLength || password.length > policy.maxLength) {
      return false;
    }
    
    if (policy.requireUppercase && !/[A-Z]/.test(password)) {
      return false;
    }
    
    if (policy.requireLowercase && !/[a-z]/.test(password)) {
      return false;
    }
    
    if (policy.requireNumbers && !/[0-9]/.test(password)) {
      return false;
    }
    
    if (policy.requireSpecialChars && !new RegExp(`[${policy.specialChars}]`).test(password)) {
      return false;
    }
    
    if (policy.forbiddenPasswords.includes(password)) {
      return false;
    }
    
    return true;
  }

  /**
   * Execute password rotation
   */
  private async executeRotation(jobId: string, target: PasswordRotationTarget): Promise<void> {
    const db = getDatabase();

    try {
      // Update job status
      await db.collection('password_rotation_jobs').updateOne(
        { id: jobId },
        {
          $set: {
            status: RotationStatus.IN_PROGRESS,
            startedAt: new Date()
          }
        }
      );

      // Get current password
      const currentSecret = await this.secretVault.getSecret(target.secretId);
      const currentPassword = await this.secretVault.decrypt(currentSecret.value);

      // Generate new password
      const defaultPolicy: PasswordPolicy = {
        minLength: 16,
        maxLength: 32,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        specialChars: '!@#$%^&*',
        forbiddenPasswords: [],
        preventReuse: 5
      };
      
      const newPassword = await this.generatePassword(defaultPolicy);

      // Apply new password to device
      await this.applyPasswordToDevice(target, newPassword);

      // Verify new password works
      await this.verifyPassword(target, newPassword);

      // Update secret in vault
      await this.secretVault.updateSecret(target.secretId, newPassword);

      // Update target
      await db.collection('password_rotation_targets').updateOne(
        { id: target.id },
        {
          $set: {
            lastRotation: new Date(),
            nextRotation: this.calculateNextRotation(target.rotationPolicy)
          }
        }
      );

      // Complete job
      await db.collection('password_rotation_jobs').updateOne(
        { id: jobId },
        {
          $set: {
            status: RotationStatus.SUCCESS,
            completedAt: new Date(),
            oldPasswordHash: this.hashPassword(currentPassword),
            newPasswordHash: this.hashPassword(newPassword)
          }
        }
      );

      this.emit('rotation:success', { jobId, targetId: target.id });
    } catch (error: unknown) {
      await db.collection('password_rotation_jobs').updateOne(
        { id: jobId },
        {
          $set: {
            status: RotationStatus.FAILED,
            completedAt: new Date(),
            error: error instanceof Error ? error.message : String(error)
          }
        }
      );

      this.emit('rotation:failed', { jobId, targetId: target.id, error: error instanceof Error ? error.message : String(error) });
      
      throw error;
    }
  }

  /**
   * Apply password to device based on protocol
   */
  private async applyPasswordToDevice(target: PasswordRotationTarget, password: string): Promise<void> {
    switch (target.protocol) {
      case 'onvif':
        await this.applyONVIFPassword(target, password);
        break;
      
      case 'ssh':
        await this.applySSHPassword(target, password);
        break;
      
      case 'http':
        await this.applyHTTPPassword(target, password);
        break;
      
      case 'snmp':
        await this.applySNMPPassword(target, password);
        break;
      
      case 'custom':
        await this.applyCustomPassword(target, password);
        break;
      
      default:
        throw new Error(`Unsupported protocol: ${target.protocol}`);
    }
  }

  /**
   * Apply ONVIF password
   */
  private async applyONVIFPassword(target: PasswordRotationTarget, password: string): Promise<void> {
    // ONVIF SOAP request to change password
    const soapEnvelope = `
      <?xml version="1.0" encoding="UTF-8"?>
      <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
                  xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
        <s:Body>
          <tds:SetUser>
            <tds:User>
              <tds:Username>${target.username}</tds:Username>
              <tds:Password>${password}</tds:Password>
            </tds:User>
          </tds:SetUser>
        </s:Body>
      </s:Envelope>
    `;

    try {
      await axios.post(`http://${target.host}:${target.port || 80}/onvif/device_service`, soapEnvelope, {
        headers: { 'Content-Type': 'application/soap+xml' },
        timeout: 10000
      });
    } catch (error: unknown) {
      throw new Error(`Failed to apply ONVIF password: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Apply SSH password
   */
  private async applySSHPassword(target: PasswordRotationTarget, password: string): Promise<void> {
    // Use SSH client to change password
    // This is a placeholder - actual implementation would use node-ssh or similar
    throw new Error('SSH password rotation not yet implemented');
  }

  /**
   * Apply HTTP password
   */
  private async applyHTTPPassword(target: PasswordRotationTarget, password: string): Promise<void> {
    // Make HTTP request to change password
    const endpoint = target.metadata?.passwordChangeEndpoint || '/api/change-password';
    
    try {
      await axios.post(`http://${target.host}:${target.port || 80}${endpoint}`, {
        username: target.username,
        newPassword: password
      }, {
        timeout: 10000
      });
    } catch (error: unknown) {
      throw new Error(`Failed to apply HTTP password: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Apply SNMP password
   */
  private async applySNMPPassword(target: PasswordRotationTarget, password: string): Promise<void> {
    // Use SNMP library to update community string or USM credentials
    throw new Error('SNMP password rotation not yet implemented');
  }

  /**
   * Apply custom password
   */
  private async applyCustomPassword(target: PasswordRotationTarget, password: string): Promise<void> {
    // Execute custom script from metadata
    if (target.metadata?.rotationScript) {
      // Execute script with target and password
      throw new Error('Custom rotation scripts not yet implemented');
    } else {
      throw new Error('Custom rotation requires rotationScript in metadata');
    }
  }

  /**
   * Verify password works
   */
  private async verifyPassword(target: PasswordRotationTarget, password: string): Promise<void> {
    // Attempt to authenticate with new password
    // Implementation depends on protocol
    // For now, assume success if no error during application
  }

  /**
   * Helper: Build character set from policy
   */
  private buildCharset(policy: PasswordPolicy): string {
    let charset = '';
    
    if (policy.requireUppercase) {
      charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    }
    
    if (policy.requireLowercase) {
      charset += 'abcdefghijklmnopqrstuvwxyz';
    }
    
    if (policy.requireNumbers) {
      charset += '0123456789';
    }
    
    if (policy.requireSpecialChars) {
      charset += policy.specialChars;
    }
    
    return charset || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  }

  /**
   * Helper: Replace random character
   */
  private replaceRandomChar(str: string, charset: string): string {
    const index = Math.floor(Math.random() * str.length);
    const char = charset[Math.floor(Math.random() * charset.length)];
    return str.substring(0, index) + char + str.substring(index + 1);
  }

  /**
   * Helper: Calculate next rotation date
   */
  private calculateNextRotation(policy: any): Date {
    const now = new Date();
    now.setDate(now.getDate() + (policy?.intervalDays || 90));
    return now;
  }

  /**
   * Helper: Hash password for tracking
   */
  private hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  /**
   * Start rotation scheduler
   */
  private startScheduler(): void {
    // Check for pending rotations every hour
    this.schedulerInterval = setInterval(async () => {
      try {
        const targetsNeedingRotation = await this.listTargets({ needsRotation: true, enabled: true });
        
        for (const target of targetsNeedingRotation) {
          if (target.rotationPolicy.autoRotate) {
            await this.rotatePassword(target.id);
          } else {
            this.emit('rotation:due', { targetId: target.id, name: target.name });
          }
        }
      } catch (error) {
        console.error('Scheduler error:', error);
      }
    }, 60 * 60 * 1000);
  }

  /**
   * Stop scheduler
   */
  stopScheduler(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `rotation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      const db = getDatabase();
      
      const totalTargets = await db.collection('password_rotation_targets').countDocuments();
      const enabledTargets = await db.collection('password_rotation_targets').countDocuments({ enabled: true });
      const needsRotation = (await this.listTargets({ needsRotation: true })).length;
      const overdueTargets = (await this.listTargets({ overdue: true })).length;
      
      return {
        status: 'healthy',
        details: {
          totalTargets,
          enabledTargets,
          needsRotation,
          overdueTargets,
          schedulerActive: this.schedulerInterval !== null
        }
      };
    } catch (error: unknown) {
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }
}

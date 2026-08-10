/**
 * Zero-Touch Provisioning Orchestrator
 * Coordinates the entire provisioning workflow with structured results
 */

import { Pool } from 'pg';
import {
  ProvisioningContext,
  DEFAULT_PROVISIONING_CONFIG,
  BranchProvisioningConfig,
} from './models/provisioning-context';
import { ProvisioningJobService } from './services/provisioning-job.service';
import { ProvisioningStepRunner } from './services/provisioning-step-runner.service';
import { NetworkProvisionerService } from './network/network-provisioner.service';
import { CameraDiscoveryService } from './discovery/camera-discovery.service';
import { StorageProvisionerService } from './storage/storage-provisioner.service';
import { RecordingVerifierService } from './recording/recording-verifier.service';
import { ProvisioningHealthService } from './health/provisioning-health.service';
import { HealthPolicyService } from './health/health-policy.service';
import { BranchActivationService } from './activation/branch-activation.service';
import { BranchActivationBlockedError } from './models/provisioning-job';

export class ZeroTouchOrchestrator {
  private jobService: ProvisioningJobService;
  private stepRunner: ProvisioningStepRunner;
  private networkProvisioner: NetworkProvisionerService;
  private cameraDiscovery: CameraDiscoveryService;
  private storageProvisioner: StorageProvisionerService;
  private recordingVerifier: RecordingVerifierService;
  private healthService: ProvisioningHealthService;
  private activationService: BranchActivationService;

  constructor(private pool: Pool) {
    this.jobService = new ProvisioningJobService(pool);
    this.stepRunner = new ProvisioningStepRunner(this.jobService);
    
    this.networkProvisioner = new NetworkProvisionerService();
    this.cameraDiscovery = new CameraDiscoveryService(pool);
    this.storageProvisioner = new StorageProvisionerService();
    this.recordingVerifier = new RecordingVerifierService(pool);
    
    const policyService = new HealthPolicyService();
    this.healthService = new ProvisioningHealthService(policyService);
    this.activationService = new BranchActivationService(pool, policyService);
  }

  /**
   * Execute complete provisioning workflow
   */
  async execute(
    branchId: string,
    tenantId: string,
    config?: Partial<BranchProvisioningConfig>,
    requestedBy?: string
  ): Promise<ProvisioningContext> {
    // Step 1: Create provisioning job
    const job = await this.jobService.createJob({
      branchId,
      tenantId,
      config: { ...DEFAULT_PROVISIONING_CONFIG, ...config },
      createdBy: requestedBy,
    });

    // Step 2: Initialize context
    let context: ProvisioningContext = {
      jobId: job.id,
      tenantId,
      branchId,
      requestedBy,
      config: { ...DEFAULT_PROVISIONING_CONFIG, ...config },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      // Step 3: Network provisioning
      context = await this.provisionNetwork(context);

      // Step 4: Camera discovery and import
      context = await this.discoverCameras(context);

      // Step 5: Storage provisioning
      context = await this.provisionStorage(context);

      // Step 6: Recording verification
      if (context.config.recording.enabled) {
        context = await this.verifyRecording(context);
      }

      // Step 7: Health check
      context = await this.performHealthCheck(context);

      // Step 8: Activation (if health passes)
      if (context.health?.data?.healthy) {
        context = await this.activateBranch(context);
        await this.jobService.complete(job.id);
      } else {
        // Health check failed - block activation
        await this.jobService.block(
          job.id,
          context.health?.data?.blockingIssues || []
        );
      }

      return context;
    } catch (error) {
      await this.jobService.fail(job.id, error);
      throw error;
    }
  }

  /**
   * Provision network infrastructure
   */
  private async provisionNetwork(
    context: ProvisioningContext
  ): Promise<ProvisioningContext> {
    context.network = await this.stepRunner.execute(
      context,
      'network_configuration',
      async () => {
        return await this.networkProvisioner.provision(context);
      }
    );

    await this.jobService.saveContext(context.jobId, context);
    return context;
  }

  /**
   * Discover and import cameras
   */
  private async discoverCameras(
    context: ProvisioningContext
  ): Promise<ProvisioningContext> {
    context.cameras = await this.stepRunner.execute(
      context,
      'camera_discovery',
      async () => {
        return await this.cameraDiscovery.discoverAndImport(context);
      }
    );

    await this.jobService.saveContext(context.jobId, context);
    return context;
  }

  /**
   * Provision storage
   */
  private async provisionStorage(
    context: ProvisioningContext
  ): Promise<ProvisioningContext> {
    context.storage = await this.stepRunner.execute(
      context,
      'storage_configuration',
      async () => {
        return await this.storageProvisioner.provision(context);
      }
    );

    await this.jobService.saveContext(context.jobId, context);
    return context;
  }

  /**
   * Verify recording capability
   */
  private async verifyRecording(
    context: ProvisioningContext
  ): Promise<ProvisioningContext> {
    context.recording = await this.stepRunner.execute(
      context,
      'recording_verification',
      async () => {
        return await this.recordingVerifier.verify(context);
      }
    );

    await this.jobService.saveContext(context.jobId, context);
    return context;
  }

  /**
   * Perform comprehensive health check
   */
  private async performHealthCheck(
    context: ProvisioningContext
  ): Promise<ProvisioningContext> {
    context.health = await this.stepRunner.execute(
      context,
      'health_check',
      async () => {
        return await this.healthService.evaluate(context);
      }
    );

    await this.jobService.saveContext(context.jobId, context);
    return context;
  }

  /**
   * Activate branch with health gate enforcement
   */
  private async activateBranch(
    context: ProvisioningContext
  ): Promise<ProvisioningContext> {
    try {
      context.activation = await this.stepRunner.execute(
        context,
        'activation',
        async () => {
          return await this.activationService.activate(context);
        }
      );

      await this.jobService.saveContext(context.jobId, context);
      return context;
    } catch (error) {
      if (error instanceof BranchActivationBlockedError) {
        // Re-throw blocking errors to be handled by caller
        throw error;
      }
      throw error;
    }
  }

  /**
   * Resume interrupted provisioning job
   */
  async resume(jobId: string): Promise<ProvisioningContext> {
    const job = await this.jobService.getJob(jobId);

    if (!job) {
      throw new Error(`Provisioning job ${jobId} not found`);
    }

    const context = await this.jobService.loadContext(jobId);

    if (!context) {
      throw new Error(`Context not found for job ${jobId}`);
    }

    // Determine where to resume based on job status
    const lastCompletedStep = job.steps
      .filter(s => s.status === 'completed')
      .sort((a, b) => (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0))[0];

    console.log(`Resuming job ${jobId} from step: ${lastCompletedStep?.name || 'beginning'}`);

    // Resume from the next step
    try {
      if (!context.network?.success) {
        return await this.execute(
          context.branchId,
          context.tenantId,
          context.config,
          context.requestedBy
        );
      }

      if (!context.cameras?.success) {
        context = await this.discoverCameras(context);
      }

      if (!context.storage?.success) {
        context = await this.provisionStorage(context);
      }

      if (context.config.recording.enabled && !context.recording?.success) {
        context = await this.verifyRecording(context);
      }

      if (!context.health?.success) {
        context = await this.performHealthCheck(context);
      }

      if (!context.activation?.success && context.health?.data?.healthy) {
        context = await this.activateBranch(context);
        await this.jobService.complete(jobId);
      }

      return context;
    } catch (error) {
      await this.jobService.fail(jobId, error);
      throw error;
    }
  }

  /**
   * Get provisioning status
   */
  async getStatus(jobId: string): Promise<{
    job: any;
    context: ProvisioningContext | null;
  }> {
    const job = await this.jobService.getJob(jobId);
    const context = await this.jobService.loadContext(jobId);

    return { job, context };
  }

  /**
   * Cancel provisioning job
   */
  async cancel(jobId: string, reason: string): Promise<void> {
    await this.jobService.updateJob(jobId, {
      status: 'failed',
      errorCode: 'CANCELLED',
      errorMessage: reason,
    });
  }

  /**
   * Retry failed provisioning job
   */
  async retry(jobId: string): Promise<ProvisioningContext> {
    const job = await this.jobService.getJob(jobId);

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (job.status !== 'failed' && job.status !== 'blocked') {
      throw new Error(`Job ${jobId} is not in a retryable state (${job.status})`);
    }

    // Increment retry count
    await this.jobService.incrementRetry(jobId);

    // Reset job status
    await this.jobService.updateJob(jobId, {
      status: 'queued',
      errorCode: undefined,
      errorMessage: undefined,
    });

    // Resume from last successful step
    return await this.resume(jobId);
  }
}

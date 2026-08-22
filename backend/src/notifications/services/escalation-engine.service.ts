/**
 * Escalation Engine Service
 * 
 * Manages multi-step escalation workflows:
 * - Creates escalation jobs from policies
 * - Processes escalation steps
 * - Handles acknowledgement cancellation
 * - Monitors escalation status
 */

import type {
  EscalationPolicy,
  EscalationJob,
  EscalationStep,
  NotificationContext,
  AlertSeverity,
  EscalationStatus,
  RecipientGroup,
} from '../domain/notification.types.js';
import { logger } from '../../utils/logger.js';

export class EscalationEngine {
  private repository: any; // Will be injected
  private notificationService: any; // Will be injected

  constructor(repository: any, notificationService: any) {
    this.repository = repository;
    this.notificationService = notificationService;
  }

  /**
   * Create an escalation job for an incident
   */
  async createEscalationJob(
    context: NotificationContext,
    policyId: string,
    escalationPolicy: EscalationPolicy
  ): Promise<EscalationJob | null> {
    if (!escalationPolicy.steps || escalationPolicy.steps.length === 0) {
      logger.debug('No escalation steps defined', { policyId });
      return null;
    }

    const firstStep = escalationPolicy.steps[0];
    const nextEscalationAt = this.calculateNextEscalationTime(
      firstStep.afterSeconds,
      new Date()
    );

    const job: EscalationJob = {
      id: '', // Will be set by repository
      tenantId: context.tenantId,
      incidentId: context.incidentId!,
      policyId,
      severity: context.severity,
      currentStep: 0,
      totalSteps: escalationPolicy.steps.length,
      status: 'ACTIVE',
      nextEscalationAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const created = await this.repository.createEscalationJob(job);

    logger.info('Escalation job created', {
      jobId: created.id,
      incidentId: context.incidentId,
      severity: context.severity,
      totalSteps: escalationPolicy.steps.length,
      firstEscalationAt: nextEscalationAt,
    });

    return created;
  }

  /**
   * Process due escalation jobs
   */
  async processDueEscalations(): Promise<number> {
    const dueJobs = await this.repository.findDueEscalationJobs();

    if (dueJobs.length === 0) {
      return 0;
    }

    logger.info('Processing due escalations', {
      count: dueJobs.length,
    });

    let processed = 0;

    for (const job of dueJobs) {
      try {
        await this.processEscalationStep(job);
        processed++;
      } catch (error) {
        logger.error('Failed to process escalation', {
          jobId: job.id,
          error: error instanceof Error ? error.message : String(error),
        });

        // Mark job as failed
        await this.repository.updateEscalationJob(job.id, {
          status: 'FAILED',
          updatedAt: new Date(),
        });
      }
    }

    return processed;
  }

  /**
   * Process a single escalation step
   */
  private async processEscalationStep(job: EscalationJob): Promise<void> {
    // Get policy and escalation configuration
    const policy = await this.repository.getNotificationPolicy(job.policyId);
    if (!policy) {
      throw new Error(`Policy not found: ${job.policyId}`);
    }

    const escalationPolicy = this.getEscalationPolicyForSeverity(policy, job.severity);
    if (!escalationPolicy || !escalationPolicy.steps) {
      throw new Error('Escalation policy not found');
    }

    const step = escalationPolicy.steps[job.currentStep];
    if (!step) {
      throw new Error(`Escalation step ${job.currentStep} not found`);
    }

    logger.info('Processing escalation step', {
      jobId: job.id,
      incidentId: job.incidentId,
      severity: job.severity,
      currentStep: job.currentStep,
      totalSteps: job.totalSteps,
    });

    // Get incident context
    const incident = await this.repository.getIncident(job.incidentId);
    if (!incident) {
      throw new Error(`Incident not found: ${job.incidentId}`);
    }

    // Build notification context
    const context: NotificationContext = {
      tenantId: job.tenantId,
      severity: job.severity,
      incidentId: job.incidentId,
      alertId: incident.alertId,
      alertType: incident.alertType,
      branchId: incident.branchId,
      regionId: incident.regionId,
      deviceId: incident.deviceId,
      cameraId: incident.cameraId,
      occurredAt: incident.occurredAt,
      variables: {
        severity: job.severity,
        incident: {
          id: job.incidentId,
          occurredAt: incident.occurredAt.toISOString(),
          title: incident.title,
          description: incident.description,
        },
        branch: incident.branch ? {
          id: incident.branchId,
          name: incident.branch.name,
        } : undefined,
        camera: incident.camera ? {
          id: incident.cameraId,
          name: incident.camera.name,
        } : undefined,
      },
    };

    // Get recipient groups for this step
    const recipientGroups = await this.repository.getRecipientGroups(
      step.recipientGroupIds
    );

    // Send notifications for this escalation step
    await this.notificationService.sendNotifications(
      context,
      step.channels,
      recipientGroups,
      {
        escalationStep: job.currentStep + 1,
        totalEscalationSteps: job.totalSteps,
        customMessage: step.customMessage,
      }
    );

    // Determine next action
    const nextStep = job.currentStep + 1;

    if (nextStep >= job.totalSteps) {
      // All escalation steps completed
      await this.repository.updateEscalationJob(job.id, {
        status: 'COMPLETED',
        completedAt: new Date(),
        updatedAt: new Date(),
      });

      logger.info('Escalation completed', {
        jobId: job.id,
        incidentId: job.incidentId,
      });
    } else {
      // Schedule next escalation step
      const nextStepConfig = escalationPolicy.steps[nextStep];
      const nextEscalationAt = this.calculateNextEscalationTime(
        nextStepConfig.afterSeconds,
        new Date()
      );

      await this.repository.updateEscalationJob(job.id, {
        currentStep: nextStep,
        nextEscalationAt,
        updatedAt: new Date(),
      });

      logger.info('Next escalation step scheduled', {
        jobId: job.id,
        incidentId: job.incidentId,
        nextStep,
        nextEscalationAt,
      });
    }
  }

  /**
   * Cancel escalation for an incident (called on acknowledgement)
   */
  async cancelEscalation(incidentId: string, acknowledgedBy: string): Promise<void> {
    const activeJobs = await this.repository.findActiveEscalationJobs(incidentId);

    if (activeJobs.length === 0) {
      logger.debug('No active escalation jobs to cancel', { incidentId });
      return;
    }

    logger.info('Cancelling escalation jobs', {
      incidentId,
      count: activeJobs.length,
      acknowledgedBy,
    });

    for (const job of activeJobs) {
      await this.repository.updateEscalationJob(job.id, {
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date(),
        acknowledgedBy,
        cancelledAt: new Date(),
        cancelledReason: 'Incident acknowledged',
        updatedAt: new Date(),
      });
    }

    // Also cancel pending notifications in the outbox
    await this.repository.cancelPendingNotifications(incidentId);

    logger.info('Escalation cancelled successfully', {
      incidentId,
      acknowledgedBy,
    });
  }

  /**
   * Check if incident should bypass escalation cancellation
   * (for testing or critical scenarios)
   */
  async shouldBypassCancellation(
    incidentId: string,
    severity: AlertSeverity
  ): Promise<boolean> {
    // P1 incidents might need all notifications sent regardless
    // This is configurable based on policy
    return false;
  }

  /**
   * Calculate next escalation time
   */
  private calculateNextEscalationTime(afterSeconds: number, baseTime: Date): Date {
    return new Date(baseTime.getTime() + afterSeconds * 1000);
  }

  /**
   * Get escalation policy for severity
   */
  private getEscalationPolicyForSeverity(
    policy: any,
    severity: AlertSeverity
  ): EscalationPolicy | undefined {
    switch (severity) {
      case 'P1':
        return policy.p1Escalation;
      case 'P2':
        return policy.p2Escalation;
      case 'P3':
        return policy.p3Escalation;
      case 'P4':
        return policy.p4Escalation;
      case 'P5':
        return policy.p5Escalation;
      default:
        return undefined;
    }
  }

  /**
   * Get escalation status for an incident
   */
  async getEscalationStatus(incidentId: string): Promise<{
    hasEscalation: boolean;
    status?: EscalationStatus;
    currentStep?: number;
    totalSteps?: number;
    nextEscalationAt?: Date;
  }> {
    const job = await this.repository.findEscalationJobByIncident(incidentId);

    if (!job) {
      return { hasEscalation: false };
    }

    return {
      hasEscalation: true,
      status: job.status,
      currentStep: job.currentStep,
      totalSteps: job.totalSteps,
      nextEscalationAt: job.nextEscalationAt,
    };
  }

  /**
   * Manually trigger next escalation step (for testing)
   */
  async triggerNextStep(jobId: string): Promise<void> {
    const job = await this.repository.getEscalationJob(jobId);

    if (!job) {
      throw new Error(`Escalation job not found: ${jobId}`);
    }

    if (job.status !== 'ACTIVE') {
      throw new Error(`Escalation job is not active: ${job.status}`);
    }

    await this.processEscalationStep(job);
  }

  /**
   * Get escalation statistics
   */
  async getEscalationStats(tenantId: string, period: 'day' | 'week' | 'month'): Promise<{
    totalEscalations: number;
    activeEscalations: number;
    completedEscalations: number;
    acknowledgedEscalations: number;
    cancelledEscalations: number;
    averageStepsBeforeAcknowledgement: number;
    bySevertiy: Record<AlertSeverity, number>;
  }> {
    const stats = await this.repository.getEscalationStats(tenantId, period);
    return stats;
  }
}

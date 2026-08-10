/**
 * Provisioning Step Runner
 * Executes provisioning steps with structured result tracking
 */

import { ProvisioningStepResult } from '../models/provisioning-result';
import { ProvisioningContext } from '../models/provisioning-context';
import { ProvisioningJobService } from './provisioning-job.service';

export class ProvisioningStepRunner {
  constructor(private jobService: ProvisioningJobService) {}

  /**
   * Execute a provisioning step with result tracking
   */
  async execute<T>(
    context: ProvisioningContext,
    stepName: string,
    handler: () => Promise<T>
  ): Promise<ProvisioningStepResult<T>> {
    const startedAt = new Date();

    // Mark step as started
    await this.jobService.startStep(context.jobId, stepName);

    try {
      // Execute the actual operation
      const data = await handler();

      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();

      // Create success result
      const result: ProvisioningStepResult<T> = {
        success: true,
        status: 'completed',
        startedAt,
        completedAt,
        durationMs,
        data,
        warnings: [],
        errors: [],
      };

      // Mark step as completed
      await this.jobService.completeStep(context.jobId, stepName, {
        status: 'completed',
        result: result as any,
        progressPercent: 100,
      });

      return result;
    } catch (error) {
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();

      // Create failure result
      const result: ProvisioningStepResult<T> = {
        success: false,
        status: 'failed',
        startedAt,
        completedAt,
        durationMs,
        warnings: [],
        errors: [
          {
            code: error.name || 'STEP_EXECUTION_ERROR',
            message: error.message || 'Step execution failed',
            retryable: this.isRetryable(error),
            cause: error.cause,
            technicalDetails: error.stack,
          },
        ],
      };

      // Mark step as failed
      await this.jobService.completeStep(context.jobId, stepName, {
        status: 'failed',
        error: {
          code: error.name || 'STEP_EXECUTION_ERROR',
          message: error.message || 'Step execution failed',
          retryable: this.isRetryable(error),
          technicalDetails: error.stack,
        },
      });

      throw error;
    }
  }

  /**
   * Run a step handler and return structured result without throwing
   */
  async run<T>(
    stepName: string,
    handler: () => Promise<T>
  ): Promise<ProvisioningStepResult<T>> {
    const startedAt = new Date();

    try {
      const data = await handler();

      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();

      return {
        success: true,
        status: 'completed',
        startedAt,
        completedAt,
        durationMs,
        data,
        warnings: [],
        errors: [],
      };
    } catch (error) {
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();

      return {
        success: false,
        status: 'failed',
        startedAt,
        completedAt,
        durationMs,
        warnings: [],
        errors: [
          {
            code: error.name || 'EXECUTION_ERROR',
            message: error.message || 'Execution failed',
            retryable: this.isRetryable(error),
            cause: error.cause,
            technicalDetails: error.stack,
          },
        ],
      };
    }
  }

  /**
   * Determine if an error is retryable
   */
  private isRetryable(error: any): boolean {
    // Network/timeout errors are retryable
    if (
      error.code === 'ETIMEDOUT' ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ENETUNREACH'
    ) {
      return true;
    }

    // Authentication errors are not retryable
    if (
      error.name === 'AuthenticationError' ||
      error.code === 'AUTHENTICATION_FAILED'
    ) {
      return false;
    }

    // Configuration errors are not retryable
    if (
      error.name === 'ConfigurationError' ||
      error.code === 'INVALID_CONFIGURATION'
    ) {
      return false;
    }

    // Default: assume retryable for temporary failures
    return true;
  }
}

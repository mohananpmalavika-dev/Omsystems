/**
 * Preventive Action Executor
 * 
 * Executes preventive actions automatically or queues for approval
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type { Recommendation, PreventiveAction } from './types';

export class PreventiveActionExecutor extends EventEmitter {
  /**
   * Create preventive action from recommendation
   */
  async createAction(recommendation: Recommendation): Promise<PreventiveAction> {
    const actionType = this.determineActionType(recommendation.title);

    const action: PreventiveAction = {
      id: `action_${randomUUID()}`,
      recommendationId: recommendation.id,
      actionType,
      description: recommendation.title,
      payload: {
        recommendation: recommendation.title,
        category: recommendation.category,
        priority: recommendation.priority,
      },
      requiresApproval: recommendation.requiresApproval,
      status: 'pending',
      rollbackAvailable: this.isRollbackAvailable(actionType),
      createdAt: new Date(),
      createdBy: 'system',
    };

    return action;
  }

  /**
   * Execute preventive action
   */
  async executeAction(action: PreventiveAction): Promise<void> {
    console.log(`[PreventiveAction] Executing: ${action.description}`);

    action.status = 'executing';
    action.executedAt = new Date();

    try {
      // Simulate action execution
      await this.performAction(action);

      action.status = 'completed';
      action.completedAt = new Date();
      action.outcome = 'success';
      action.impactDescription = `Successfully executed: ${action.description}`;

      this.emit('action-completed', action, {
        description: action.impactDescription,
        lessonsLearned: [],
      });

      console.log(`[PreventiveAction] ✅ Completed: ${action.description}`);
    } catch (error: any) {
      action.status = 'failed';
      action.completedAt = new Date();
      action.outcome = 'failure';
      action.impactDescription = `Failed: ${error.message}`;

      this.emit('action-failed', action, error);

      console.error(`[PreventiveAction] ❌ Failed: ${action.description}`, error);
      throw error;
    }
  }

  /**
   * Perform actual action (simulated for now)
   */
  private async performAction(action: PreventiveAction): Promise<void> {
    // Simulate execution time
    await new Promise((resolve) => setTimeout(resolve, 100));

    // In production, this would call actual APIs:
    switch (action.actionType) {
      case 'alert-rule':
        // Create alert rule via alert manager API
        console.log(`  → Creating alert rule`);
        break;

      case 'threshold-adjustment':
        // Update monitoring thresholds
        console.log(`  → Adjusting threshold`);
        break;

      case 'maintenance-schedule':
        // Create maintenance ticket
        console.log(`  → Scheduling maintenance`);
        break;

      case 'config-change':
        // Update configuration
        console.log(`  → Updating configuration`);
        break;

      case 'notification-route':
        // Update notification routing
        console.log(`  → Updating notification routes`);
        break;

      case 'monitoring-enhancement':
        // Add monitoring
        console.log(`  → Enhancing monitoring`);
        break;

      default:
        console.log(`  → Executing ${action.actionType}`);
    }
  }

  /**
   * Queue action for approval
   */
  async queueForApproval(recommendation: Recommendation): Promise<PreventiveAction> {
    const action = await this.createAction(recommendation);
    action.status = 'pending';

    console.log(`[PreventiveAction] Queued for approval: ${action.description}`);
    this.emit('action-queued', action);

    return action;
  }

  /**
   * Rollback action
   */
  async rollbackAction(action: PreventiveAction, reason: string): Promise<void> {
    if (!action.rollbackAvailable) {
      throw new Error('Action cannot be rolled back');
    }

    console.log(`[PreventiveAction] Rolling back: ${action.description}`);

    action.status = 'rolled-back';
    action.rolledBackAt = new Date();
    action.rollbackReason = reason;

    // Simulate rollback
    await new Promise((resolve) => setTimeout(resolve, 100));

    this.emit('action-rolled-back', action, reason);
  }

  /**
   * Determine action type from recommendation
   */
  private determineActionType(
    title: string
  ):
    | 'alert-rule'
    | 'threshold-adjustment'
    | 'maintenance-schedule'
    | 'config-change'
    | 'notification-route'
    | 'monitoring-enhancement'
    | 'purchase-order'
    | 'policy-update' {
    const titleLower = title.toLowerCase();

    if (titleLower.includes('alert') || titleLower.includes('rule')) {
      return 'alert-rule';
    }
    if (titleLower.includes('threshold') || titleLower.includes('adjust')) {
      return 'threshold-adjustment';
    }
    if (titleLower.includes('schedule') || titleLower.includes('maintenance')) {
      return 'maintenance-schedule';
    }
    if (titleLower.includes('backup') || titleLower.includes('archive')) {
      return 'config-change';
    }
    if (titleLower.includes('notification') || titleLower.includes('notify')) {
      return 'notification-route';
    }
    if (titleLower.includes('monitor') || titleLower.includes('enhance')) {
      return 'monitoring-enhancement';
    }
    if (titleLower.includes('purchase') || titleLower.includes('order')) {
      return 'purchase-order';
    }
    if (titleLower.includes('policy') || titleLower.includes('protocol')) {
      return 'policy-update';
    }

    return 'config-change';
  }

  /**
   * Check if action can be rolled back
   */
  private isRollbackAvailable(actionType: string): boolean {
    const rollbackableActions = [
      'alert-rule',
      'threshold-adjustment',
      'config-change',
      'notification-route',
      'monitoring-enhancement',
    ];

    return rollbackableActions.includes(actionType);
  }
}

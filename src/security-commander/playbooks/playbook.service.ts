/**
 * Playbook Service
 * 
 * Manages playbook execution and tracking.
 */

import { randomUUID } from 'node:crypto';
import type { Playbook, PlaybookAction, PlaybookExecution } from './playbook.types.js';
import { getPlaybookForIncident, getActivePlaybooks, getPlaybook } from './playbook.registry.js';
import type { Incident } from '../types/index.js';

export class PlaybookService {
  private executions = new Map<string, PlaybookExecution>();

  /**
   * Get recommended playbook for incident
   */
  getPlaybookForIncident(incident: Incident): Playbook | undefined {
    return getPlaybookForIncident(incident.type, incident.severity);
  }

  /**
   * Start playbook execution
   */
  startPlaybook(
    playbookId: string,
    investigationId: string,
    incidentId: string
  ): PlaybookExecution | null {
    const playbook = getPlaybook(playbookId);
    
    if (!playbook) {
      return null;
    }

    const execution: PlaybookExecution = {
      id: randomUUID(),
      playbookId,
      investigationId,
      incidentId,
      status: 'in_progress',
      startedAt: new Date(),
      actionStatuses: new Map(),
      slaCompliance: {
        acknowledgedAt: new Date(),
        acknowledgedWithinSLA: true,
        respondedWithinSLA: false,
        resolvedWithinSLA: false,
      },
    };

    // Initialize action statuses
    for (const action of playbook.actions) {
      execution.actionStatuses.set(action.id, {
        status: 'pending',
      });
    }

    this.executions.set(execution.id, execution);

    return execution;
  }

  /**
   * Update action status
   */
  updateActionStatus(
    executionId: string,
    actionId: string,
    status: 'in_progress' | 'completed' | 'skipped' | 'failed',
    options: {
      completedBy?: string;
      notes?: string;
      error?: string;
    } = {}
  ): boolean {
    const execution = this.executions.get(executionId);
    
    if (!execution) {
      return false;
    }

    const actionStatus = execution.actionStatuses.get(actionId);
    
    if (!actionStatus) {
      return false;
    }

    const now = new Date();

    if (status === 'in_progress' && actionStatus.status === 'pending') {
      actionStatus.status = 'in_progress';
      actionStatus.startedAt = now;
      
      // Check if this is first response action
      if (!execution.slaCompliance?.respondedAt) {
        execution.slaCompliance = execution.slaCompliance || {
          acknowledgedAt: execution.startedAt,
          acknowledgedWithinSLA: true,
          respondedWithinSLA: false,
          resolvedWithinSLA: false,
        };
        execution.slaCompliance.respondedAt = now;
      }
    }

    if (status === 'completed' || status === 'skipped' || status === 'failed') {
      actionStatus.status = status;
      actionStatus.completedAt = now;
      actionStatus.completedBy = options.completedBy;
      actionStatus.notes = options.notes;
      actionStatus.error = options.error;
    }

    // Check if all actions completed
    const allCompleted = Array.from(execution.actionStatuses.values()).every(
      s => s.status === 'completed' || s.status === 'skipped'
    );

    if (allCompleted) {
      execution.status = 'completed';
      execution.completedAt = now;
      
      if (execution.slaCompliance) {
        execution.slaCompliance.resolvedAt = now;
      }

      // Calculate SLA compliance
      this.calculateSLACompliance(execution);
    }

    return true;
  }

  /**
   * Get playbook execution
   */
  getExecution(executionId: string): PlaybookExecution | undefined {
    return this.executions.get(executionId);
  }

  /**
   * Get pending actions
   */
  getPendingActions(executionId: string): PlaybookAction[] {
    const execution = this.executions.get(executionId);
    
    if (!execution) {
      return [];
    }

    const playbook = getPlaybook(execution.playbookId);
    
    if (!playbook) {
      return [];
    }

    return playbook.actions.filter(action => {
      const status = execution.actionStatuses.get(action.id);
      return status?.status === 'pending';
    });
  }

  /**
   * Get next recommended action
   */
  getNextAction(executionId: string): PlaybookAction | undefined {
    const execution = this.executions.get(executionId);
    
    if (!execution) {
      return undefined;
    }

    const playbook = getPlaybook(execution.playbookId);
    
    if (!playbook) {
      return undefined;
    }

    // Find first pending action whose dependencies are met
    for (const action of playbook.actions.sort((a, b) => a.order - b.order)) {
      const status = execution.actionStatuses.get(action.id);
      
      if (status?.status !== 'pending') {
        continue;
      }

      // Check dependencies
      if (action.dependsOn && action.dependsOn.length > 0) {
        const dependenciesMet = action.dependsOn.every(depId => {
          const depStatus = execution.actionStatuses.get(depId);
          return depStatus?.status === 'completed';
        });

        if (!dependenciesMet) {
          continue;
        }
      }

      return action;
    }

    return undefined;
  }

  /**
   * Abort playbook execution
   */
  abortExecution(executionId: string, reason: string): boolean {
    const execution = this.executions.get(executionId);
    
    if (!execution) {
      return false;
    }

    execution.status = 'aborted';
    execution.completedAt = new Date();

    return true;
  }

  /**
   * Calculate SLA compliance
   */
  private calculateSLACompliance(execution: PlaybookExecution): void {
    const playbook = getPlaybook(execution.playbookId);
    
    if (!playbook?.sla || !execution.slaCompliance) {
      return;
    }

    const { sla } = playbook;
    const startTime = execution.startedAt.getTime();

    // Check acknowledgment SLA
    if (execution.slaCompliance.acknowledgedAt) {
      const acknowledgedMs = execution.slaCompliance.acknowledgedAt.getTime() - startTime;
      execution.slaCompliance.acknowledgedWithinSLA = 
        acknowledgedMs <= sla.acknowledgmentMinutes * 60 * 1000;
    }

    // Check response SLA
    if (execution.slaCompliance.respondedAt) {
      const respondedMs = execution.slaCompliance.respondedAt.getTime() - startTime;
      execution.slaCompliance.respondedWithinSLA = 
        respondedMs <= sla.responseMinutes * 60 * 1000;
    }

    // Check resolution SLA
    if (execution.slaCompliance.resolvedAt) {
      const resolvedMs = execution.slaCompliance.resolvedAt.getTime() - startTime;
      execution.slaCompliance.resolvedWithinSLA = 
        resolvedMs <= sla.resolutionMinutes * 60 * 1000;
    }
  }

  /**
   * Get execution progress
   */
  getProgress(executionId: string): {
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    skipped: number;
    failed: number;
    percentage: number;
  } | undefined {
    const execution = this.executions.get(executionId);
    
    if (!execution) {
      return undefined;
    }

    const statuses = Array.from(execution.actionStatuses.values());
    
    const completed = statuses.filter(s => s.status === 'completed').length;
    const inProgress = statuses.filter(s => s.status === 'in_progress').length;
    const pending = statuses.filter(s => s.status === 'pending').length;
    const skipped = statuses.filter(s => s.status === 'skipped').length;
    const failed = statuses.filter(s => s.status === 'failed').length;
    
    const total = statuses.length;
    const percentage = total > 0 ? (completed + skipped) / total * 100 : 0;

    return {
      total,
      completed,
      inProgress,
      pending,
      skipped,
      failed,
      percentage,
    };
  }

  /**
   * Get all active playbooks
   */
  getAllPlaybooks(): Playbook[] {
    return getActivePlaybooks();
  }
}

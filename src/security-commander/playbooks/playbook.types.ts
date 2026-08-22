/**
 * Playbook Types
 * 
 * Defines structured response workflows for security incidents.
 */

import type { IncidentType, SecuritySeverity } from '../types/index.js';

export interface PlaybookAction {
  /** Action ID */
  id: string;

  /** Order in workflow */
  order: number;

  /** Action title */
  title: string;

  /** Detailed description */
  description: string;

  /** Is this action required? */
  required: boolean;

  /** Category */
  category: 'investigation' | 'containment' | 'notification' | 'remediation' | 'documentation';

  /** Estimated time in minutes */
  estimatedMinutes?: number;

  /** Required permissions */
  requiredPermissions?: string[];

  /** Dependencies (must complete these actions first) */
  dependsOn?: string[];

  /** Automated action command (optional) */
  automatedAction?: {
    type: 'api' | 'script' | 'command';
    command: string;
    parameters?: Record<string, unknown>;
  };
}

export interface Playbook {
  /** Playbook ID */
  id: string;

  /** Playbook name */
  name: string;

  /** Description */
  description: string;

  /** Incident type this applies to */
  incidentType: IncidentType;

  /** Minimum severity to trigger */
  minSeverity?: SecuritySeverity;

  /** Version */
  version: string;

  /** Actions in workflow */
  actions: PlaybookAction[];

  /** Notification recipients */
  notifications?: {
    severity: SecuritySeverity;
    recipients: string[];
    channels: ('email' | 'sms' | 'push' | 'slack')[];
  }[];

  /** SLA timings */
  sla?: {
    acknowledgmentMinutes: number;
    responseMinutes: number;
    resolutionMinutes: number;
  };

  /** Created by */
  createdBy?: string;

  /** Created at */
  createdAt?: Date;

  /** Updated at */
  updatedAt?: Date;

  /** Active */
  active: boolean;
}

export interface PlaybookExecution {
  /** Execution ID */
  id: string;

  /** Playbook ID */
  playbookId: string;

  /** Investigation ID */
  investigationId: string;

  /** Incident ID */
  incidentId: string;

  /** Current status */
  status: 'pending' | 'in_progress' | 'completed' | 'aborted';

  /** Started at */
  startedAt: Date;

  /** Completed at */
  completedAt?: Date;

  /** Action statuses */
  actionStatuses: Map<string, {
    status: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'failed';
    startedAt?: Date;
    completedAt?: Date;
    completedBy?: string;
    notes?: string;
    error?: string;
  }>;

  /** SLA compliance */
  slaCompliance?: {
    acknowledgedAt?: Date;
    acknowledgedWithinSLA: boolean;
    respondedAt?: Date;
    respondedWithinSLA: boolean;
    resolvedAt?: Date;
    resolvedWithinSLA: boolean;
  };
}

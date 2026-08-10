/**
 * Provisioning Job Models
 * Persistent job tracking for long-running provisioning workflows
 */

/**
 * Provisioning job status
 */
export type ProvisioningJobStatus =
  | 'queued'
  | 'network_inspection'
  | 'network_configuration'
  | 'network_verification'
  | 'camera_discovery'
  | 'camera_authentication'
  | 'camera_import'
  | 'camera_stream_verification'
  | 'storage_discovery'
  | 'storage_sizing'
  | 'storage_configuration'
  | 'storage_verification'
  | 'recording_verification'
  | 'health_check'
  | 'ready_for_activation'
  | 'activating'
  | 'active'
  | 'partially_provisioned'
  | 'blocked'
  | 'failed'
  | 'rolling_back'
  | 'rolled_back';

/**
 * Provisioning job step status
 */
export type ProvisioningStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'skipped';

/**
 * Main provisioning job entity
 */
export interface ProvisioningJob {
  id: string;
  branchId: string;
  tenantId: string;
  organizationId?: string;
  
  status: ProvisioningJobStatus;
  currentStep?: string;
  progressPercent: number;
  
  config: Record<string, unknown>;
  context?: Record<string, unknown>;
  
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  updatedAt: Date;
  
  steps: ProvisioningJobStep[];
  
  errorCode?: string;
  errorMessage?: string;
  
  retryCount: number;
  maxRetries: number;
  
  createdBy?: string;
}

/**
 * Individual provisioning step
 */
export interface ProvisioningJobStep {
  id: string;
  jobId: string;
  name: string;
  displayName: string;
  status: ProvisioningStepStatus;
  
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  
  attempt: number;
  maxAttempts: number;
  
  result?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    technicalDetails?: string;
  };
  
  progressPercent: number;
  metadata?: Record<string, unknown>;
}

/**
 * Provisioning job creation request
 */
export interface CreateProvisioningJobRequest {
  branchId: string;
  tenantId: string;
  organizationId?: string;
  config: Record<string, unknown>;
  createdBy?: string;
}

/**
 * Provisioning job update
 */
export interface UpdateProvisioningJobRequest {
  status?: ProvisioningJobStatus;
  currentStep?: string;
  progressPercent?: number;
  context?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Step update request
 */
export interface UpdateStepRequest {
  status: ProvisioningStepStatus;
  result?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    technicalDetails?: string;
  };
  progressPercent?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Provisioning exception
 */
export class ProvisioningException extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ProvisioningException';
  }
}

/**
 * Branch activation blocked exception
 */
export class BranchActivationBlockedError extends Error {
  constructor(
    public readonly branchId: string,
    public readonly blockingIssues: Array<{
      code: string;
      message: string;
      component: string;
    }>
  ) {
    super(
      `Branch activation blocked: ${blockingIssues.map(i => i.message).join(', ')}`
    );
    this.name = 'BranchActivationBlockedError';
  }
}

/**
 * Provisioning step definition
 */
export interface ProvisioningStepDefinition {
  name: string;
  displayName: string;
  order: number;
  required: boolean;
  maxAttempts: number;
  estimatedDurationSeconds: number;
}

/**
 * Default step definitions
 */
export const PROVISIONING_STEPS: ProvisioningStepDefinition[] = [
  {
    name: 'network_inspection',
    displayName: 'Network Inspection',
    order: 1,
    required: true,
    maxAttempts: 3,
    estimatedDurationSeconds: 30,
  },
  {
    name: 'network_configuration',
    displayName: 'Network Configuration',
    order: 2,
    required: true,
    maxAttempts: 3,
    estimatedDurationSeconds: 60,
  },
  {
    name: 'network_verification',
    displayName: 'Network Verification',
    order: 3,
    required: true,
    maxAttempts: 3,
    estimatedDurationSeconds: 30,
  },
  {
    name: 'camera_discovery',
    displayName: 'Camera Discovery',
    order: 4,
    required: true,
    maxAttempts: 3,
    estimatedDurationSeconds: 180,
  },
  {
    name: 'camera_authentication',
    displayName: 'Camera Authentication',
    order: 5,
    required: true,
    maxAttempts: 3,
    estimatedDurationSeconds: 120,
  },
  {
    name: 'camera_import',
    displayName: 'Camera Import',
    order: 6,
    required: true,
    maxAttempts: 3,
    estimatedDurationSeconds: 60,
  },
  {
    name: 'camera_stream_verification',
    displayName: 'Stream Verification',
    order: 7,
    required: true,
    maxAttempts: 2,
    estimatedDurationSeconds: 90,
  },
  {
    name: 'storage_discovery',
    displayName: 'Storage Discovery',
    order: 8,
    required: true,
    maxAttempts: 3,
    estimatedDurationSeconds: 30,
  },
  {
    name: 'storage_sizing',
    displayName: 'Storage Sizing',
    order: 9,
    required: true,
    maxAttempts: 2,
    estimatedDurationSeconds: 15,
  },
  {
    name: 'storage_configuration',
    displayName: 'Storage Configuration',
    order: 10,
    required: true,
    maxAttempts: 3,
    estimatedDurationSeconds: 45,
  },
  {
    name: 'storage_verification',
    displayName: 'Storage Verification',
    order: 11,
    required: true,
    maxAttempts: 2,
    estimatedDurationSeconds: 30,
  },
  {
    name: 'recording_verification',
    displayName: 'Recording Verification',
    order: 12,
    required: true,
    maxAttempts: 2,
    estimatedDurationSeconds: 60,
  },
  {
    name: 'health_check',
    displayName: 'Health Check',
    order: 13,
    required: true,
    maxAttempts: 2,
    estimatedDurationSeconds: 45,
  },
  {
    name: 'activation',
    displayName: 'Branch Activation',
    order: 14,
    required: true,
    maxAttempts: 1,
    estimatedDurationSeconds: 15,
  },
];

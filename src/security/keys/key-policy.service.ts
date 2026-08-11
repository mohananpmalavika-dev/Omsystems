/**
 * Key Policy Service
 * 
 * Enforces key usage policies before operations reach the provider
 * Prevents unauthorized operations based on:
 * - Key purpose
 * - Allowed operations
 * - Service/tenant permissions
 * - Algorithm restrictions
 * 
 * Policy checks happen BEFORE cryptographic operations
 */

import {
  KeyReference,
  KeyPolicy,
  KeyOperation,
  OperationContext
} from './types.js';
import { KeyPolicyViolationError, PermissionDeniedError } from './errors.js';
import { KeyRegistryService } from './key-registry.service.js';

export class KeyPolicyService {
  constructor(private readonly registry: KeyRegistryService) {}

  /**
   * Assert that operation is allowed for key
   * Throws KeyPolicyViolationError if not allowed
   */
  async assertCanUseKey(request: {
    key: KeyReference;
    operation: KeyOperation;
    algorithm?: string;
    context?: OperationContext;
  }): Promise<void> {
    // Get key metadata with policy
    const keyMetadata = await this.registry.getKey(
      request.key.id,
      request.key.version
    );

    const policy = keyMetadata.policy;

    // Check 1: Operation allowed
    if (!policy.allowedOperations.includes(request.operation)) {
      throw new KeyPolicyViolationError(
        request.key.id,
        `Operation '${request.operation}' not allowed for key ${request.key.id}`,
        {
          allowedOperations: policy.allowedOperations,
          requestedOperation: request.operation
        }
      );
    }

    // Check 2: Algorithm allowed (if specified)
    if (request.algorithm && !policy.allowedAlgorithms.includes(request.algorithm)) {
      throw new KeyPolicyViolationError(
        request.key.id,
        `Algorithm '${request.algorithm}' not allowed for key ${request.key.id}`,
        {
          allowedAlgorithms: policy.allowedAlgorithms,
          requestedAlgorithm: request.algorithm
        }
      );
    }

    // Check 3: Service permissions
    if (policy.permittedServices && request.context?.service) {
      if (!policy.permittedServices.includes(request.context.service)) {
        throw new PermissionDeniedError(
          request.operation,
          request.key.id,
          `Service '${request.context.service}' not permitted to use key ${request.key.id}`
        );
      }
    }

    // Check 4: Tenant permissions
    if (policy.permittedTenants && request.context?.tenantId) {
      if (!policy.permittedTenants.includes(request.context.tenantId)) {
        throw new PermissionDeniedError(
          request.operation,
          request.key.id,
          `Tenant '${request.context.tenantId}' not permitted to use key ${request.key.id}`
        );
      }
    }

    // Check 5: Key status is ACTIVE
    if (keyMetadata.status !== 'ACTIVE') {
      throw new KeyPolicyViolationError(
        request.key.id,
        `Key ${request.key.id} is not active (status: ${keyMetadata.status})`,
        { status: keyMetadata.status }
      );
    }

    // Check 6: Export policy
    if (
      request.operation === 'GET_PUBLIC_KEY' &&
      policy.exportPolicy === 'NEVER'
    ) {
      throw new KeyPolicyViolationError(
        request.key.id,
        `Key ${request.key.id} has export policy NEVER`,
        { exportPolicy: policy.exportPolicy }
      );
    }

    // All checks passed
  }

  /**
   * Check if operation would be allowed (non-throwing)
   */
  async canUseKey(request: {
    key: KeyReference;
    operation: KeyOperation;
    algorithm?: string;
    context?: OperationContext;
  }): Promise<boolean> {
    try {
      await this.assertCanUseKey(request);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate policy configuration
   * Returns validation errors if policy is invalid
   */
  validatePolicy(policy: KeyPolicy): string[] {
    const errors: string[] = [];

    if (!policy.allowedOperations || policy.allowedOperations.length === 0) {
      errors.push('Policy must specify at least one allowed operation');
    }

    if (!policy.allowedAlgorithms || policy.allowedAlgorithms.length === 0) {
      errors.push('Policy must specify at least one allowed algorithm');
    }

    if (!['NEVER', 'PUBLIC_ONLY', 'WRAPPED_ONLY'].includes(policy.exportPolicy)) {
      errors.push('Invalid export policy');
    }

    if (policy.rotationPolicy) {
      if (policy.rotationPolicy.rotateEveryDays <= 0) {
        errors.push('Rotation period must be positive');
      }

      if (
        policy.rotationPolicy.gracePeriodDays !== undefined &&
        policy.rotationPolicy.gracePeriodDays < 0
      ) {
        errors.push('Grace period cannot be negative');
      }
    }

    if (policy.maxOperations !== undefined && policy.maxOperations <= 0) {
      errors.push('Max operations must be positive');
    }

    return errors;
  }

  /**
   * Create default policy for key purpose
   */
  static defaultPolicyForPurpose(purpose: string): KeyPolicy {
    const commonPolicy: KeyPolicy = {
      allowedOperations: ['SIGN', 'VERIFY', 'GET_PUBLIC_KEY'],
      allowedAlgorithms: ['RSA_PSS_SHA256', 'ECDSA_SHA256'],
      exportPolicy: 'PUBLIC_ONLY'
    };

    switch (purpose) {
      case 'ROOT_CA':
      case 'INTERMEDIATE_CA':
        return {
          ...commonPolicy,
          allowedOperations: ['SIGN', 'GET_PUBLIC_KEY'],
          rotationPolicy: {
            rotateEveryDays: 365 * 5, // 5 years for CAs
            autoRetirePrevious: false,
            gracePeriodDays: 90
          }
        };

      case 'DEVICE_CERTIFICATE':
        return {
          ...commonPolicy,
          allowedOperations: ['SIGN', 'VERIFY', 'GET_PUBLIC_KEY'],
          rotationPolicy: {
            rotateEveryDays: 365, // 1 year
            autoRetirePrevious: true,
            gracePeriodDays: 30
          }
        };

      case 'JWT_SIGNING':
      case 'API_TOKEN_SIGNING':
        return {
          ...commonPolicy,
          allowedOperations: ['SIGN', 'VERIFY', 'GET_PUBLIC_KEY'],
          rotationPolicy: {
            rotateEveryDays: 90, // 3 months
            autoRetirePrevious: false,
            gracePeriodDays: 7
          }
        };

      case 'RECORDING_KEK':
      case 'DATABASE_ENCRYPTION':
      case 'BACKUP_ENCRYPTION':
        return {
          allowedOperations: ['ENCRYPT', 'DECRYPT', 'WRAP_KEY', 'UNWRAP_KEY'],
          allowedAlgorithms: ['AES_256_GCM', 'RSA_OAEP_SHA256'],
          exportPolicy: 'NEVER',
          rotationPolicy: {
            rotateEveryDays: 365, // 1 year
            autoRetirePrevious: false,
            gracePeriodDays: 30
          }
        };

      case 'AUDIT_LOG_SIGNING':
        return {
          ...commonPolicy,
          allowedOperations: ['SIGN', 'GET_PUBLIC_KEY'],
          exportPolicy: 'PUBLIC_ONLY',
          rotationPolicy: {
            rotateEveryDays: 365,
            autoRetirePrevious: false,
            gracePeriodDays: 90
          }
        };

      case 'SECURE_BOOT_ATTESTATION':
        return {
          ...commonPolicy,
          allowedOperations: ['SIGN', 'VERIFY', 'GET_PUBLIC_KEY'],
          exportPolicy: 'PUBLIC_ONLY'
        };

      default:
        return commonPolicy;
    }
  }

  /**
   * Create strict policy (minimal permissions)
   */
  static strictPolicy(operations: KeyOperation[], algorithms: string[]): KeyPolicy {
    return {
      allowedOperations: operations,
      allowedAlgorithms: algorithms,
      exportPolicy: 'NEVER',
      requireHardwareBacked: true
    };
  }

  /**
   * Create permissive policy (for development)
   */
  static permissivePolicy(): KeyPolicy {
    return {
      allowedOperations: [
        'SIGN',
        'VERIFY',
        'ENCRYPT',
        'DECRYPT',
        'GENERATE_KEY',
        'GET_PUBLIC_KEY',
        'WRAP_KEY',
        'UNWRAP_KEY'
      ],
      allowedAlgorithms: [
        'RSA_PKCS1_SHA256',
        'RSA_PSS_SHA256',
        'ECDSA_SHA256',
        'RSA_OAEP_SHA256',
        'AES_256_GCM'
      ],
      exportPolicy: 'PUBLIC_ONLY',
      requireHardwareBacked: false
    };
  }
}

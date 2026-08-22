/**
 * Key Provider Startup Policy
 * 
 * Centralized validation of provider security requirements
 * Prevents application startup when cryptographic provider is inadequate
 * 
 * Design principle: Fail fast and explicitly rather than silently degrading security
 */

import {
  KeyProviderCapabilities,
  KeyProviderRequirements,
  KeyOperation,
  KeyProviderSecurityLevel
} from './types.js';
import { ProductionStartupError } from './errors.js';

export class KeyProviderStartupPolicy {
  /**
   * Validate provider capabilities against deployment requirements
   * 
   * Throws ProductionStartupError if requirements not met
   * This blocks application startup in production
   */
  validate(
    environment: string,
    capabilities: KeyProviderCapabilities,
    requirements: KeyProviderRequirements
  ): void {
    const violations: string[] = [];

    // CRITICAL: Block simulated providers in production
    if (environment === 'production' && capabilities.securityLevel === 'SIMULATED') {
      throw new ProductionStartupError(
        'SIMULATED key providers are forbidden in production',
        'Security level SIMULATED cannot be used in production environment',
        undefined,
        {
          environment,
          providerSecurityLevel: capabilities.securityLevel,
          reason: 'Simulated providers provide no cryptographic security guarantees'
        }
      );
    }

    // Validate hardware backing requirement
    if (requirements.hardwareBacked) {
      const hardwareBackedLevels: KeyProviderSecurityLevel[] = [
        'HARDWARE_BACKED',
        'REMOTE_HARDWARE_BACKED'
      ];

      if (!hardwareBackedLevels.includes(capabilities.securityLevel)) {
        violations.push(
          `Hardware-backed key storage required, but provider has security level: ${capabilities.securityLevel}`
        );
      }
    }

    // Validate private key exportability
    if (!requirements.privateKeyExportable && capabilities.privateKeyExportable) {
      // This is actually a WARNING, not a violation
      // Provider CAN export but policy says it shouldn't
      // We allow this but should log warning
      console.warn(
        '[KeyProviderStartupPolicy] ⚠️ Provider allows private key export, but policy requires non-exportable keys. ' +
        'Ensure key generation requests specify non-exportable policy.'
      );
    }

    if (requirements.privateKeyExportable && !capabilities.privateKeyExportable) {
      // Requirement wants exportable but provider doesn't support it
      // This is acceptable - we can always be more restrictive
      console.info(
        '[KeyProviderStartupPolicy] Provider does not support private key export (this is secure by default)'
      );
    }

    // Validate required operations
    for (const operation of requirements.requiredOperations) {
      if (!this.supportsOperation(capabilities, operation)) {
        violations.push(
          `Required operation '${operation}' not supported by provider`
        );
      }
    }

    // Validate required algorithms
    for (const algorithm of requirements.requiredAlgorithms) {
      if (!this.supportsAlgorithm(capabilities, algorithm)) {
        violations.push(
          `Required algorithm '${algorithm}' not supported by provider`
        );
      }
    }

    // Validate FIPS mode if required
    if (requirements.fipsMode && !capabilities.fipsMode) {
      violations.push(
        'FIPS 140-2/3 compliance required but provider is not in FIPS mode'
      );
    }

    // If any violations, fail startup
    if (violations.length > 0) {
      throw new ProductionStartupError(
        'Key provider does not meet deployment requirements',
        violations.join('; '),
        undefined,
        {
          environment,
          violations,
          providerCapabilities: capabilities,
          requirements
        }
      );
    }

    // Log successful validation
    console.log(
      `[KeyProviderStartupPolicy] ✓ Provider validation passed for environment: ${environment}`
    );
    console.log(
      `[KeyProviderStartupPolicy]   Security level: ${capabilities.securityLevel}`
    );
    console.log(
      `[KeyProviderStartupPolicy]   Hardware backed: ${this.isHardwareBacked(capabilities.securityLevel)}`
    );
    console.log(
      `[KeyProviderStartupPolicy]   Private key exportable: ${capabilities.privateKeyExportable}`
    );
    console.log(
      `[KeyProviderStartupPolicy]   FIPS mode: ${capabilities.fipsMode ?? 'N/A'}`
    );
  }

  /**
   * Check if provider supports required operation
   */
  private supportsOperation(
    capabilities: KeyProviderCapabilities,
    operation: KeyOperation
  ): boolean {
    switch (operation) {
      case 'SIGN':
        return capabilities.operations.sign;
      case 'VERIFY':
        return capabilities.operations.verify;
      case 'ENCRYPT':
        return capabilities.operations.encrypt;
      case 'DECRYPT':
        return capabilities.operations.decrypt;
      case 'GENERATE_KEY':
        return capabilities.operations.generateKey;
      case 'DESTROY_KEY':
        return capabilities.operations.destroyKey;
      case 'GET_PUBLIC_KEY':
        return capabilities.operations.getPublicKey;
      case 'WRAP_KEY':
        return capabilities.operations.wrapKey ?? false;
      case 'UNWRAP_KEY':
        return capabilities.operations.unwrapKey ?? false;
      default:
        return false;
    }
  }

  /**
   * Check if provider supports required algorithm
   */
  private supportsAlgorithm(
    capabilities: KeyProviderCapabilities,
    algorithm: string
  ): boolean {
    // Check signing algorithms
    if (capabilities.signingAlgorithms.includes(algorithm as any)) {
      return true;
    }

    // Check encryption algorithms
    if (capabilities.encryptionAlgorithms.includes(algorithm as any)) {
      return true;
    }

    return false;
  }

  /**
   * Check if security level represents hardware backing
   */
  private isHardwareBacked(level: KeyProviderSecurityLevel): boolean {
    return level === 'HARDWARE_BACKED' || level === 'REMOTE_HARDWARE_BACKED';
  }

  /**
   * Validate simulation mode is explicitly allowed
   * 
   * In development, simulation can be allowed with explicit flag
   * In production, simulation is never allowed regardless of flag
   */
  validateSimulationAllowed(
    environment: string,
    capabilities: KeyProviderCapabilities,
    explicitlyAllowed: boolean
  ): void {
    if (capabilities.securityLevel !== 'SIMULATED') {
      // Not a simulated provider, no validation needed
      return;
    }

    if (environment === 'production') {
      throw new ProductionStartupError(
        'Simulated key provider cannot be used in production',
        'SIMULATED security level is forbidden in production environment',
        undefined,
        {
          environment,
          securityLevel: capabilities.securityLevel,
          explicitlyAllowed
        }
      );
    }

    if (!explicitlyAllowed) {
      throw new ProductionStartupError(
        'Simulated key provider requires explicit permission',
        'Set HSM_ALLOW_SIMULATION=true to use simulated provider in development',
        undefined,
        {
          environment,
          securityLevel: capabilities.securityLevel,
          hint: 'Add HSM_ALLOW_SIMULATION=true to environment variables'
        }
      );
    }

    // Simulation allowed in non-production with explicit flag
    console.warn(
      '[KeyProviderStartupPolicy] ⚠️  USING SIMULATED KEY PROVIDER'
    );
    console.warn(
      '[KeyProviderStartupPolicy] ⚠️  This provides NO cryptographic security'
    );
    console.warn(
      '[KeyProviderStartupPolicy] ⚠️  For development/testing ONLY'
    );
  }

  /**
   * Generate deployment recommendations based on current configuration
   */
  generateRecommendations(
    environment: string,
    capabilities: KeyProviderCapabilities
  ): string[] {
    const recommendations: string[] = [];

    // Recommend hardware backing for production
    if (environment === 'production' && capabilities.securityLevel === 'SOFTWARE') {
      recommendations.push(
        'Consider using hardware-backed key storage (HSM, TPM, or cloud KMS) for production'
      );
    }

    // Recommend FIPS mode for regulated environments
    if (environment === 'production' && !capabilities.fipsMode) {
      recommendations.push(
        'Consider enabling FIPS 140-2/3 mode if required by compliance regulations'
      );
    }

    // Recommend non-exportable keys
    if (capabilities.privateKeyExportable) {
      recommendations.push(
        'Generate keys with non-exportable policy to prevent private key extraction'
      );
    }

    // Recommend attestation for critical keys
    if (capabilities.attestedHardware === false) {
      recommendations.push(
        'Consider using provider with hardware attestation support for critical keys'
      );
    }

    return recommendations;
  }

  /**
   * Create default requirements for environment
   */
  static defaultRequirements(environment: string): KeyProviderRequirements {
    if (environment === 'production') {
      return {
        hardwareBacked: false, // Made flexible for migration path
        privateKeyExportable: false,
        requiredOperations: ['SIGN', 'VERIFY', 'GET_PUBLIC_KEY'],
        requiredAlgorithms: ['RSA_PSS_SHA256', 'ECDSA_SHA256'],
        fipsMode: false // Can be enabled based on compliance needs
      };
    }

    // Development/staging
    return {
      hardwareBacked: false,
      privateKeyExportable: false,
      requiredOperations: ['SIGN', 'VERIFY', 'GET_PUBLIC_KEY'],
      requiredAlgorithms: ['RSA_PSS_SHA256', 'ECDSA_SHA256']
    };
  }

  /**
   * Create strict requirements for high-security deployments
   */
  static strictRequirements(): KeyProviderRequirements {
    return {
      hardwareBacked: true,
      privateKeyExportable: false,
      requiredOperations: [
        'SIGN',
        'VERIFY',
        'ENCRYPT',
        'DECRYPT',
        'GENERATE_KEY',
        'DESTROY_KEY',
        'GET_PUBLIC_KEY'
      ],
      requiredAlgorithms: [
        'RSA_PSS_SHA256',
        'ECDSA_SHA256',
        'RSA_OAEP_SHA256',
        'AES_256_GCM'
      ],
      fipsMode: true
    };
  }

  /**
   * Create minimal requirements for development
   */
  static developmentRequirements(): KeyProviderRequirements {
    return {
      hardwareBacked: false,
      privateKeyExportable: false,
      requiredOperations: ['SIGN', 'VERIFY'],
      requiredAlgorithms: ['RSA_PSS_SHA256']
    };
  }
}

/**
 * Validate provider at startup with environment-specific policy
 * 
 * Usage:
 * ```typescript
 * const policy = new KeyProviderStartupPolicy();
 * const requirements = KeyProviderStartupPolicy.defaultRequirements(process.env.NODE_ENV);
 * policy.validate(process.env.NODE_ENV, provider.getCapabilities(), requirements);
 * ```
 */
export function validateProviderStartup(
  environment: string,
  capabilities: KeyProviderCapabilities,
  requirements?: KeyProviderRequirements,
  simulationExplicitlyAllowed: boolean = false
): void {
  const policy = new KeyProviderStartupPolicy();

  // Use default requirements if not provided
  const effectiveRequirements = requirements ?? 
    KeyProviderStartupPolicy.defaultRequirements(environment);

  // Validate simulation is allowed (if provider is simulated)
  policy.validateSimulationAllowed(
    environment,
    capabilities,
    simulationExplicitlyAllowed
  );

  // Validate capabilities meet requirements
  policy.validate(environment, capabilities, effectiveRequirements);

  // Generate and log recommendations
  const recommendations = policy.generateRecommendations(environment, capabilities);
  if (recommendations.length > 0) {
    console.log('[KeyProviderStartupPolicy] Recommendations:');
    recommendations.forEach(rec => console.log(`  - ${rec}`));
  }
}

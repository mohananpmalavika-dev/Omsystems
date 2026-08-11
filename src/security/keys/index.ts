/**
 * Unified Key Management System
 * 
 * Consolidated cryptographic key management with:
 * - Provider abstraction (HSM, KMS, Software)
 * - Production safety policies
 * - Comprehensive audit trails
 * - Key lifecycle management
 * 
 * Usage:
 * ```typescript
 * import { KeyService, KeyProviderFactory, validateProviderStartup } from './keys';
 * 
 * // Create provider
 * const provider = await KeyProviderFactory.createProvider(config.keyProvider);
 * 
 * // Validate for production
 * validateProviderStartup(
 *   process.env.NODE_ENV,
 *   provider.getCapabilities(),
 *   requirements
 * );
 * 
 * // Create services
 * const registry = new KeyRegistryService();
 * const policy = new KeyPolicyService(registry);
 * const audit = new KeyAuditService();
 * const keyService = new KeyService(provider, registry, policy, audit);
 * 
 * await keyService.initialize();
 * 
 * // Use key service
 * const result = await keyService.sign({
 *   key: { id: 'device-ca', provider: 'pkcs11', purpose: 'DEVICE_CERTIFICATE', version: 1 },
 *   algorithm: 'ECDSA_SHA256',
 *   data: certificateData
 * });
 * ```
 */

// Core service
export { KeyService } from './key.service.js';

// Provider system
export { KeyProvider, KeyProviderAdvanced, KeyProviderWithAdvanced } from './key-provider.interface.js';
export { KeyProviderFactory } from './key-provider.factory.js';

// Providers
export { SoftwareDevelopmentProvider } from './providers/software-development.provider.js';
export { PKCS11Provider } from './providers/pkcs11.provider.js';

// Supporting services
export { KeyRegistryService } from './key-registry.service.js';
export { KeyPolicyService } from './key-policy.service.js';
export { KeyAuditService } from './key-audit.service.js';

// Policy and validation
export { KeyProviderStartupPolicy, validateProviderStartup } from './key-provider-startup-policy.js';

// Types
export * from './types.js';

// Errors
export * from './errors.js';

// Helper to create complete KeyService
export async function createKeyService(config: {
  providerConfig: import('./types.js').KeyProviderConfig;
  requirements?: import('./types.js').KeyProviderRequirements;
  environment?: string;
  simulationAllowed?: boolean;
}): Promise<KeyService> {
  const environment = config.environment ?? process.env.NODE_ENV ?? 'development';
  
  // Create provider
  const provider = await KeyProviderFactory.createProvider(config.providerConfig);
  
  // Validate against requirements
  if (config.requirements) {
    const { validateProviderStartup } = await import('./key-provider-startup-policy.js');
    validateProviderStartup(
      environment,
      provider.getCapabilities(),
      config.requirements,
      config.simulationAllowed ?? false
    );
  }
  
  // Create supporting services
  const { KeyRegistryService } = await import('./key-registry.service.js');
  const { KeyPolicyService } = await import('./key-policy.service.js');
  const { KeyAuditService } = await import('./key-audit.service.js');
  
  const registry = new KeyRegistryService();
  const policy = new KeyPolicyService(registry);
  const audit = new KeyAuditService();
  
  // Create and initialize key service
  const keyService = new KeyService(provider, registry, policy, audit);
  await keyService.initialize();
  
  return keyService;
}

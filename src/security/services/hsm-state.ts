/**
 * HSM Provider State Management
 * Explicit state tracking to prevent production deployment with placeholder crypto
 */

export enum HSMProviderState {
  /** No HSM provider configured - crypto operations will fail */
  HSM_PROVIDER_UNAVAILABLE = 'HSM_PROVIDER_UNAVAILABLE',
  
  /** Simulation mode - NOT FOR PRODUCTION - uses software crypto only */
  HSM_SIMULATION = 'HSM_SIMULATION',
  
  /** Production mode - real HSM or KMS integration active */
  HSM_PRODUCTION = 'HSM_PRODUCTION'
}

export interface HSMStateInfo {
  state: HSMProviderState;
  provider?: string;
  endpoint?: string;
  simulationAllowed: boolean;
  productionReady: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Determine HSM state based on configuration and environment
 */
export function determineHSMState(config: any, env: NodeJS.ProcessEnv): HSMStateInfo {
  const info: HSMStateInfo = {
    state: HSMProviderState.HSM_PROVIDER_UNAVAILABLE,
    simulationAllowed: env.HSM_ALLOW_SIMULATION === 'true',
    productionReady: false,
    warnings: [],
    errors: []
  };

  // Check if this is a production environment
  const isProduction = env.NODE_ENV === 'production' || env.ENVIRONMENT === 'production';

  // AWS CloudHSM / KMS
  if (config.type === 'aws_cloudhsm' && env.AWS_KMS_ENABLED === 'true') {
    if (!env.AWS_REGION) {
      info.errors.push('AWS_REGION not configured for AWS CloudHSM/KMS');
      return info;
    }
    
    info.state = HSMProviderState.HSM_PRODUCTION;
    info.provider = 'AWS CloudHSM / KMS';
    info.endpoint = `KMS in ${env.AWS_REGION}`;
    info.productionReady = true;
    return info;
  }

  // Azure Managed HSM / Key Vault
  if (config.type === 'azure_keyvault' && config.endpoint) {
    info.state = HSMProviderState.HSM_PRODUCTION;
    info.provider = 'Azure Key Vault / Managed HSM';
    info.endpoint = config.endpoint;
    info.productionReady = true;
    return info;
  }

  // PKCS#11 (Thales, Utimaco, etc.)
  if (config.type === 'pkcs11' && config.libraryPath) {
    info.state = HSMProviderState.HSM_PRODUCTION;
    info.provider = 'PKCS#11 HSM';
    info.endpoint = config.libraryPath;
    info.productionReady = true;
    return info;
  }

  // SoftHSM (testing/development only)
  if (config.type === 'softhsm') {
    if (isProduction && !info.simulationAllowed) {
      info.errors.push('SoftHSM is not allowed in production without HSM_ALLOW_SIMULATION=true');
      return info;
    }
    
    info.state = HSMProviderState.HSM_SIMULATION;
    info.provider = 'SoftHSM (Development Only)';
    info.warnings.push('SoftHSM provides software-only security - NOT for production');
    return info;
  }

  // Fallback to simulation if explicitly allowed
  if (info.simulationAllowed) {
    if (isProduction) {
      info.warnings.push('⚠️ CRITICAL: Simulation mode enabled in production environment');
      info.warnings.push('This provides NO actual hardware security - for testing only');
    }
    
    info.state = HSMProviderState.HSM_SIMULATION;
    info.provider = 'Software Simulation';
    info.warnings.push('Using simulated HSM with software crypto only');
    return info;
  }

  // No valid configuration
  info.errors.push('No valid HSM provider configured');
  info.errors.push('Set AWS_KMS_ENABLED=true for AWS, or provide Azure Key Vault endpoint, or PKCS#11 library path');
  
  return info;
}

/**
 * Validate HSM state on startup - fail fast in production with invalid config
 */
export function validateHSMStateOnStartup(stateInfo: HSMStateInfo): void {
  const isProduction = process.env.NODE_ENV === 'production' || process.env.ENVIRONMENT === 'production';

  // Log all warnings
  for (const warning of stateInfo.warnings) {
    console.warn(`[HSM] ${warning}`);
  }

  // Log all errors
  for (const error of stateInfo.errors) {
    console.error(`[HSM] ERROR: ${error}`);
  }

  // Fail fast in production with invalid configuration
  if (isProduction) {
    if (!stateInfo.productionReady) {
      throw new Error(
        `HSM service cannot start in production mode. State: ${stateInfo.state}. ` +
        `Production requires: AWS_KMS_ENABLED=true, Azure Key Vault endpoint, or PKCS#11 library path. ` +
        `Errors: ${stateInfo.errors.join(', ')}`
      );
    }

    if (stateInfo.state === HSMProviderState.HSM_SIMULATION) {
      throw new Error(
        `HSM service is in SIMULATION mode in production environment. ` +
        `This is not allowed unless you explicitly set HSM_ALLOW_SIMULATION=true ` +
        `and understand this provides NO hardware security.`
      );
    }
  }

  // In non-production, just log the state
  console.log(`[HSM] Provider State: ${stateInfo.state}`);
  console.log(`[HSM] Provider: ${stateInfo.provider || 'None'}`);
  console.log(`[HSM] Production Ready: ${stateInfo.productionReady}`);
}

/**
 * Key Provider Factory
 * 
 * Single point of provider instantiation
 * Ensures only one provider type is active per KeyService instance
 * 
 * Prevents multiple HSM implementations from coexisting
 */

import { KeyProvider } from './key-provider.interface.js';
import { SoftwareDevelopmentProvider } from './providers/software-development.provider.js';
import { PKCS11Provider } from './providers/pkcs11.provider.js';
import {
  KeyProviderConfig,
  SoftwareDevelopmentProviderConfig,
  PKCS11ProviderConfig,
  AWSKMSProviderConfig,
  AzureKeyVaultProviderConfig,
  GCPKMSProviderConfig
} from './types.js';
import { InitializationFailedError } from './errors.js';

export class KeyProviderFactory {
  /**
   * Create and initialize a key provider
   * 
   * Provider selection is explicit - no fallback chains
   * Initialization failures are fatal (throw immediately)
   */
  static async createProvider(config: KeyProviderConfig): Promise<KeyProvider> {
    console.log(`[KeyProviderFactory] Creating provider: ${config.type}`);
    
    let provider: KeyProvider;
    
    switch (config.type) {
      case 'software-development':
        provider = new SoftwareDevelopmentProvider(
          config as SoftwareDevelopmentProviderConfig
        );
        break;
      
      case 'pkcs11':
        provider = new PKCS11Provider(config as PKCS11ProviderConfig);
        break;
      
      case 'aws-kms':
        provider = await KeyProviderFactory.createAWSKMSProvider(
          config as AWSKMSProviderConfig
        );
        break;
      
      case 'azure-keyvault':
        provider = await KeyProviderFactory.createAzureKeyVaultProvider(
          config as AzureKeyVaultProviderConfig
        );
        break;
      
      case 'gcp-kms':
        provider = await KeyProviderFactory.createGCPKMSProvider(
          config as GCPKMSProviderConfig
        );
        break;
      
      default:
        throw new InitializationFailedError(
          'factory',
          `Unsupported provider type: ${(config as any).type}`
        );
    }
    
    // Initialize provider (this validates configuration and connectivity)
    await provider.initialize();
    
    console.log(`[KeyProviderFactory] ✓ Provider ready: ${provider.getName()}`);
    
    return provider;
  }

  /**
   * Create AWS KMS provider
   * 
   * TODO: Implement AWS KMS integration
   * Requires: aws-sdk or @aws-sdk/client-kms
   */
  private static async createAWSKMSProvider(
    config: AWSKMSProviderConfig
  ): Promise<KeyProvider> {
    throw new InitializationFailedError(
      'aws-kms',
      'AWS KMS provider not yet implemented. ' +
      'Implementation requires @aws-sdk/client-kms package and integration with AWS KMS API.'
    );
    
    // Future implementation:
    // import { AWSKMSProvider } from './providers/aws-kms.provider.js';
    // return new AWSKMSProvider(config);
  }

  /**
   * Create Azure Key Vault provider
   * 
   * TODO: Implement Azure Key Vault integration
   * Requires: @azure/keyvault-keys, @azure/identity
   */
  private static async createAzureKeyVaultProvider(
    config: AzureKeyVaultProviderConfig
  ): Promise<KeyProvider> {
    throw new InitializationFailedError(
      'azure-keyvault',
      'Azure Key Vault provider not yet implemented. ' +
      'Implementation requires @azure/keyvault-keys and @azure/identity packages.'
    );
    
    // Future implementation:
    // import { AzureKeyVaultProvider } from './providers/azure-keyvault.provider.js';
    // return new AzureKeyVaultProvider(config);
  }

  /**
   * Create GCP KMS provider
   * 
   * TODO: Implement GCP KMS integration
   * Requires: @google-cloud/kms
   */
  private static async createGCPKMSProvider(
    config: GCPKMSProviderConfig
  ): Promise<KeyProvider> {
    throw new InitializationFailedError(
      'gcp-kms',
      'GCP KMS provider not yet implemented. ' +
      'Implementation requires @google-cloud/kms package.'
    );
    
    // Future implementation:
    // import { GCPKMSProvider } from './providers/gcp-kms.provider.js';
    // return new GCPKMSProvider(config);
  }

  /**
   * Validate provider configuration
   */
  static validateConfig(config: KeyProviderConfig): string[] {
    const errors: string[] = [];
    
    if (!config.type) {
      errors.push('Provider type is required');
      return errors;
    }
    
    switch (config.type) {
      case 'pkcs11':
        const pkcs11 = config as PKCS11ProviderConfig;
        if (!pkcs11.libraryPath) {
          errors.push('PKCS#11 requires libraryPath');
        }
        if (!pkcs11.pinSource) {
          errors.push('PKCS#11 requires pinSource');
        }
        if (!pkcs11.sessionPoolSize || pkcs11.sessionPoolSize < 1) {
          errors.push('PKCS#11 requires sessionPoolSize >= 1');
        }
        break;
      
      case 'aws-kms':
        const aws = config as AWSKMSProviderConfig;
        if (!aws.region) {
          errors.push('AWS KMS requires region');
        }
        break;
      
      case 'azure-keyvault':
        const azure = config as AzureKeyVaultProviderConfig;
        if (!azure.vaultUrl) {
          errors.push('Azure Key Vault requires vaultUrl');
        }
        break;
      
      case 'gcp-kms':
        const gcp = config as GCPKMSProviderConfig;
        if (!gcp.projectId) {
          errors.push('GCP KMS requires projectId');
        }
        if (!gcp.locationId) {
          errors.push('GCP KMS requires locationId');
        }
        if (!gcp.keyRingId) {
          errors.push('GCP KMS requires keyRingId');
        }
        break;
    }
    
    return errors;
  }

  /**
   * Get recommended provider for environment
   */
  static getRecommendedProvider(environment: string): string {
    switch (environment) {
      case 'production':
        return 'Recommend hardware-backed provider: pkcs11, aws-kms, azure-keyvault, or gcp-kms';
      
      case 'staging':
        return 'Recommend pkcs11 with SoftHSM or cloud KMS';
      
      case 'development':
      case 'test':
        return 'Recommend software-development provider';
      
      default:
        return 'Unknown environment - recommend hardware-backed provider for production';
    }
  }
}

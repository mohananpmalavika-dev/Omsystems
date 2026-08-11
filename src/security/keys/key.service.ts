/**
 * Unified Key Service
 * 
 * Central orchestration layer for cryptographic key management
 * Coordinates: Provider → Policy → Audit → Registry
 * 
 * Architecture:
 * 
 *   Application Services
 *         ↓
 *     KeyService (this)
 *         ↓
 *   ┌─────┴─────┐
 *   ↓           ↓
 * Policy     Audit
 *   ↓           ↓
 * Provider → Registry
 * 
 * Flow for sign operation:
 * 1. KeyService.sign() called
 * 2. Resolve key from registry
 * 3. Check policy (KeyPolicyService)
 * 4. Execute via provider (KeyProvider)
 * 5. Record audit (KeyAuditService)
 * 6. Return result
 */

import { KeyProvider } from './key-provider.interface.js';
import { KeyRegistryService } from './key-registry.service.js';
import { KeyPolicyService } from './key-policy.service.js';
import { KeyAuditService } from './key-audit.service.js';
import {
  SignRequest,
  SignatureResult,
  VerifyRequest,
  VerificationResult,
  EncryptRequest,
  EncryptionResult,
  DecryptRequest,
  DecryptionResult,
  GenerateKeyRequest,
  KeyMetadata,
  PublicKeyResult,
  KeyReference,
  KeyPurpose,
  ProviderHealth,
  KeyProviderCapabilities
} from './types.js';
import { KeyProviderError } from './errors.js';

export class KeyService {
  constructor(
    private readonly provider: KeyProvider,
    private readonly registry: KeyRegistryService,
    private readonly policy: KeyPolicyService,
    private readonly audit: KeyAuditService
  ) {}

  /**
   * Initialize the key service
   */
  async initialize(): Promise<void> {
    console.log('[KeyService] Initializing...');
    
    // Initialize provider first
    await this.provider.initialize();
    
    // Initialize registry and audit
    await this.registry.initialize();
    await this.audit.initialize();
    
    console.log('[KeyService] ✓ Initialized');
    console.log(`[KeyService]   Provider: ${this.provider.getName()}`);
    console.log(`[KeyService]   Security level: ${this.provider.getCapabilities().securityLevel}`);
  }

  /**
   * Sign data with a key
   */
  async sign(request: SignRequest): Promise<SignatureResult> {
    const startTime = Date.now();
    
    try {
      // Check policy
      await this.policy.assertCanUseKey({
        key: request.key,
        operation: 'SIGN',
        algorithm: request.algorithm,
        context: request.context
      });
      
      // Execute signing via provider
      const result = await this.provider.sign(request);
      
      // Record successful audit
      await this.audit.recordOperation({
        operation: 'SIGN',
        keyId: request.key.id,
        keyVersion: request.key.version,
        provider: this.provider.getName(),
        tenantId: request.context?.tenantId,
        service: request.context?.service,
        actorId: request.context?.actorId,
        correlationId: request.context?.correlationId,
        success: true,
        durationMs: Date.now() - startTime,
        securityLevel: this.provider.getCapabilities().securityLevel
      });
      
      return result;
    } catch (error: any) {
      // Record failed audit
      await this.audit.recordOperation({
        operation: 'SIGN',
        keyId: request.key.id,
        keyVersion: request.key.version,
        provider: this.provider.getName(),
        tenantId: request.context?.tenantId,
        service: request.context?.service,
        actorId: request.context?.actorId,
        correlationId: request.context?.correlationId,
        success: false,
        errorCode: error.code,
        durationMs: Date.now() - startTime,
        securityLevel: this.provider.getCapabilities().securityLevel
      });
      
      throw error;
    }
  }

  /**
   * Verify signature
   */
  async verify(request: VerifyRequest): Promise<VerificationResult> {
    const startTime = Date.now();
    
    try {
      // Check policy
      await this.policy.assertCanUseKey({
        key: request.key,
        operation: 'VERIFY',
        algorithm: request.algorithm,
        context: request.context
      });
      
      // Execute verification via provider
      const result = await this.provider.verify(request);
      
      // Record audit
      await this.audit.recordOperation({
        operation: 'VERIFY',
        keyId: request.key.id,
        keyVersion: request.key.version,
        provider: this.provider.getName(),
        tenantId: request.context?.tenantId,
        service: request.context?.service,
        actorId: request.context?.actorId,
        correlationId: request.context?.correlationId,
        success: true,
        durationMs: Date.now() - startTime,
        securityLevel: this.provider.getCapabilities().securityLevel,
        metadata: { signatureValid: result.valid }
      });
      
      return result;
    } catch (error: any) {
      await this.audit.recordOperation({
        operation: 'VERIFY',
        keyId: request.key.id,
        keyVersion: request.key.version,
        provider: this.provider.getName(),
        tenantId: request.context?.tenantId,
        service: request.context?.service,
        actorId: request.context?.actorId,
        correlationId: request.context?.correlationId,
        success: false,
        errorCode: error.code,
        durationMs: Date.now() - startTime,
        securityLevel: this.provider.getCapabilities().securityLevel
      });
      
      throw error;
    }
  }

  /**
   * Encrypt data
   */
  async encrypt(request: EncryptRequest): Promise<EncryptionResult> {
    const startTime = Date.now();
    
    try {
      await this.policy.assertCanUseKey({
        key: request.key,
        operation: 'ENCRYPT',
        algorithm: request.algorithm,
        context: request.context
      });
      
      const result = await this.provider.encrypt(request);
      
      await this.audit.recordOperation({
        operation: 'ENCRYPT',
        keyId: request.key.id,
        keyVersion: request.key.version,
        provider: this.provider.getName(),
        tenantId: request.context?.tenantId,
        service: request.context?.service,
        actorId: request.context?.actorId,
        correlationId: request.context?.correlationId,
        success: true,
        durationMs: Date.now() - startTime,
        securityLevel: this.provider.getCapabilities().securityLevel
      });
      
      return result;
    } catch (error: any) {
      await this.audit.recordOperation({
        operation: 'ENCRYPT',
        keyId: request.key.id,
        keyVersion: request.key.version,
        provider: this.provider.getName(),
        tenantId: request.context?.tenantId,
        service: request.context?.service,
        actorId: request.context?.actorId,
        correlationId: request.context?.correlationId,
        success: false,
        errorCode: error.code,
        durationMs: Date.now() - startTime,
        securityLevel: this.provider.getCapabilities().securityLevel
      });
      
      throw error;
    }
  }

  /**
   * Decrypt data
   */
  async decrypt(request: DecryptRequest): Promise<DecryptionResult> {
    const startTime = Date.now();
    
    try {
      await this.policy.assertCanUseKey({
        key: request.key,
        operation: 'DECRYPT',
        algorithm: request.algorithm,
        context: request.context
      });
      
      const result = await this.provider.decrypt(request);
      
      await this.audit.recordOperation({
        operation: 'DECRYPT',
        keyId: request.key.id,
        keyVersion: request.key.version,
        provider: this.provider.getName(),
        tenantId: request.context?.tenantId,
        service: request.context?.service,
        actorId: request.context?.actorId,
        correlationId: request.context?.correlationId,
        success: true,
        durationMs: Date.now() - startTime,
        securityLevel: this.provider.getCapabilities().securityLevel
      });
      
      return result;
    } catch (error: any) {
      await this.audit.recordOperation({
        operation: 'DECRYPT',
        keyId: request.key.id,
        keyVersion: request.key.version,
        provider: this.provider.getName(),
        tenantId: request.context?.tenantId,
        service: request.context?.service,
        actorId: request.context?.actorId,
        correlationId: request.context?.correlationId,
        success: false,
        errorCode: error.code,
        durationMs: Date.now() - startTime,
        securityLevel: this.provider.getCapabilities().securityLevel
      });
      
      throw error;
    }
  }

  /**
   * Generate new cryptographic key
   */
  async generateKey(request: GenerateKeyRequest): Promise<KeyMetadata> {
    const startTime = Date.now();
    
    try {
      // Validate policy configuration
      const policyErrors = this.policy.validatePolicy(request.policy);
      if (policyErrors.length > 0) {
        throw new Error(`Invalid key policy: ${policyErrors.join(', ')}`);
      }
      
      // Generate key via provider
      const metadata = await this.provider.generateKey(request);
      
      // Register in registry
      await this.registry.registerKey(metadata);
      
      // Record audit
      await this.audit.recordOperation({
        operation: 'GENERATE_KEY',
        keyId: metadata.id,
        keyVersion: metadata.version,
        provider: this.provider.getName(),
        tenantId: request.tenantId,
        service: request.context?.service,
        actorId: request.context?.actorId,
        correlationId: request.context?.correlationId,
        success: true,
        durationMs: Date.now() - startTime,
        securityLevel: this.provider.getCapabilities().securityLevel,
        metadata: {
          purpose: request.purpose,
          algorithm: `${request.algorithm.type}${request.algorithm.keySize ? '-' + request.algorithm.keySize : ''}`
        }
      });
      
      return metadata;
    } catch (error: any) {
      await this.audit.recordOperation({
        operation: 'GENERATE_KEY',
        keyId: 'unknown',
        keyVersion: 0,
        provider: this.provider.getName(),
        tenantId: request.tenantId,
        service: request.context?.service,
        actorId: request.context?.actorId,
        correlationId: request.context?.correlationId,
        success: false,
        errorCode: error.code,
        durationMs: Date.now() - startTime,
        securityLevel: this.provider.getCapabilities().securityLevel
      });
      
      throw error;
    }
  }

  /**
   * Get public key
   */
  async getPublicKey(
    keyRef: KeyReference,
    format?: 'PEM' | 'DER' | 'JWK'
  ): Promise<PublicKeyResult> {
    const startTime = Date.now();
    
    try {
      await this.policy.assertCanUseKey({
        key: keyRef,
        operation: 'GET_PUBLIC_KEY'
      });
      
      const result = await this.provider.getPublicKey(keyRef, format);
      
      await this.audit.recordOperation({
        operation: 'GET_PUBLIC_KEY',
        keyId: keyRef.id,
        keyVersion: keyRef.version,
        provider: this.provider.getName(),
        tenantId: keyRef.tenantId,
        success: true,
        durationMs: Date.now() - startTime,
        securityLevel: this.provider.getCapabilities().securityLevel
      });
      
      return result;
    } catch (error: any) {
      await this.audit.recordOperation({
        operation: 'GET_PUBLIC_KEY',
        keyId: keyRef.id,
        keyVersion: keyRef.version,
        provider: this.provider.getName(),
        tenantId: keyRef.tenantId,
        success: false,
        errorCode: error.code,
        durationMs: Date.now() - startTime,
        securityLevel: this.provider.getCapabilities().securityLevel
      });
      
      throw error;
    }
  }

  /**
   * Destroy key
   */
  async destroyKey(keyRef: KeyReference): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Destroy in provider
      await this.provider.destroyKey(keyRef);
      
      // Update registry
      await this.registry.updateKeyStatus(keyRef.id, keyRef.version, 'DESTROYED');
      
      // Record audit
      await this.audit.recordOperation({
        operation: 'DESTROY_KEY',
        keyId: keyRef.id,
        keyVersion: keyRef.version,
        provider: this.provider.getName(),
        tenantId: keyRef.tenantId,
        success: true,
        durationMs: Date.now() - startTime,
        securityLevel: this.provider.getCapabilities().securityLevel
      });
    } catch (error: any) {
      await this.audit.recordOperation({
        operation: 'DESTROY_KEY',
        keyId: keyRef.id,
        keyVersion: keyRef.version,
        provider: this.provider.getName(),
        tenantId: keyRef.tenantId,
        success: false,
        errorCode: error.code,
        durationMs: Date.now() - startTime,
        securityLevel: this.provider.getCapabilities().securityLevel
      });
      
      throw error;
    }
  }

  /**
   * Get key metadata
   */
  async getKeyMetadata(id: string, version?: number): Promise<KeyMetadata> {
    return this.registry.getKey(id, version);
  }

  /**
   * List keys by purpose
   */
  async listKeysByPurpose(purpose: KeyPurpose): Promise<KeyMetadata[]> {
    return this.registry.listKeysByPurpose(purpose);
  }

  /**
   * Get provider capabilities
   */
  getCapabilities(): KeyProviderCapabilities {
    return this.provider.getCapabilities();
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<ProviderHealth> {
    return this.provider.healthCheck();
  }

  /**
   * Shutdown
   */
  async shutdown(): Promise<void> {
    await this.provider.shutdown();
  }
}

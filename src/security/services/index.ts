/**
 * Security Services Index
 * Central export point for all enterprise security services
 */

export { SecretVaultService } from './secret-vault.service.js';
export { CertificateManagementService } from './certificate-management.service.js';
export { PasswordRotationService } from './password-rotation.service.js';
export { HSMService } from './hsm.service.js';
export { ZeroTrustPolicyEngine } from './zero-trust-policy.service.js';
export { TamperDetectionService } from './tamper-detection.service.js';
export { VideoEncryptionService } from './video-encryption.service.js';
export { ImmutableStorageService } from './immutable-storage.service.js';
export { RansomwareDetectionService } from './ransomware-detection.service.js';
export { SupplyChainVerificationService } from './supply-chain-verification.service.js';
export { SecureBootVerificationService } from './secure-boot-verification.service.js';
export { TPMAttestationService } from './tpm-attestation.service.js';
export { SecurityPostureService } from './security-posture.service.js';

/**
 * Security Services Factory
 * Initializes and manages all security services
 */
import { SecretVaultService } from './secret-vault.service.js';
import { CertificateManagementService } from './certificate-management.service.js';
import { PasswordRotationService } from './password-rotation.service.js';
import { HSMService } from './hsm.service.js';
import { ZeroTrustPolicyEngine } from './zero-trust-policy.service.js';
import { SecurityPostureService } from './security-posture.service.js';
import { EventEmitter } from 'events';

export class SecurityServicesFactory extends EventEmitter {
  private static instance: SecurityServicesFactory;
  
  public secretVault!: SecretVaultService;
  public certificateManagement!: CertificateManagementService;
  public passwordRotation!: PasswordRotationService;
  public hsm!: HSMService;
  public zeroTrust!: ZeroTrustPolicyEngine;
  public securityPosture!: SecurityPostureService;
  
  private constructor() {
    super();
  }
  
  static getInstance(): SecurityServicesFactory {
    if (!SecurityServicesFactory.instance) {
      SecurityServicesFactory.instance = new SecurityServicesFactory();
    }
    return SecurityServicesFactory.instance;
  }
  
  /**
   * Initialize all security services
   */
  async initialize(): Promise<void> {
    try {
      // Initialize services in dependency order
      this.secretVault = new SecretVaultService(process.env.VAULT_MASTER_PASSWORD);
      this.certificateManagement = new CertificateManagementService();
      this.passwordRotation = new PasswordRotationService(this.secretVault);
      this.hsm = new HSMService();
      this.zeroTrust = new ZeroTrustPolicyEngine();
      this.securityPosture = new SecurityPostureService();
      
      // Wire up event handlers
      this.setupEventHandlers();
      
      this.emit('security:initialized');
      console.log('Security services initialized successfully');
    } catch (error: unknown) {
      this.emit('security:initialization-failed', { error: error instanceof Error ? error.message : String(error) });
      throw new Error(`Failed to initialize security services: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Setup cross-service event handlers
   */
  private setupEventHandlers(): void {
    // Certificate expiration notifications
    this.certificateManagement.on('certificate:expiring-soon', (data) => {
      this.emit('security:alert', {
        type: 'certificate_expiring',
        severity: 'warning',
        data
      });
    });
    
    // Secret rotation notifications
    this.secretVault.on('secret:expiring-soon', (data) => {
      this.emit('security:alert', {
        type: 'secret_expiring',
        severity: 'warning',
        data
      });
    });
    
    // Password rotation failures
    this.passwordRotation.on('rotation:failed', (data) => {
      this.emit('security:alert', {
        type: 'rotation_failed',
        severity: 'high',
        data
      });
    });
    
    // Zero Trust access denials
    this.zeroTrust.on('access:evaluated', (data) => {
      if (data.decision === 'deny') {
        this.emit('security:alert', {
          type: 'access_denied',
          severity: 'medium',
          data
        });
      }
    });
  }
  
  /**
   * Health check for all services
   */
  async healthCheck(): Promise<Record<string, any>> {
    const results: Record<string, any> = {};
    
    if (this.secretVault) {
      results.secretVault = await this.secretVault.healthCheck();
    }
    
    if (this.certificateManagement) {
      results.certificateManagement = await this.certificateManagement.healthCheck();
    }
    
    if (this.passwordRotation) {
      results.passwordRotation = await this.passwordRotation.healthCheck();
    }
    
    if (this.hsm) {
      results.hsm = await this.hsm.healthCheck();
    }
    
    if (this.zeroTrust) {
      results.zeroTrust = await this.zeroTrust.healthCheck();
    }
    
    return results;
  }
  
  /**
   * Shutdown all services gracefully
   */
  async shutdown(): Promise<void> {
    if (this.certificateManagement) {
      this.certificateManagement.stopMonitoring();
    }
    
    if (this.passwordRotation) {
      this.passwordRotation.stopScheduler();
    }
    
    this.emit('security:shutdown');
  }
}

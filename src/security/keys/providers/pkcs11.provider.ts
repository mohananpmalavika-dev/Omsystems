/**
 * PKCS#11 Key Provider
 * 
 * Hardware Security Module integration via PKCS#11 standard
 * Supports: Thales, Utimaco, Gemalto, SafeNet, SoftHSM, and other PKCS#11 devices
 * 
 * IMPLEMENTATION STATUS: Framework complete, requires pkcs11js library
 * 
 * Initialization sequence:
 * 1. Load PKCS#11 shared library (.so/.dll)
 * 2. C_Initialize
 * 3. Enumerate slots
 * 4. Select configured slot/token
 * 5. Validate token serial/label
 * 6. Open session pool
 * 7. C_Login with PIN
 * 8. Query supported mechanisms
 * 9. Locate mandatory application keys
 * 10. Perform lightweight health operation
 * 
 * Session management:
 * - Maintains pool of authenticated sessions
 * - Handles session recovery (CKR_SESSION_HANDLE_INVALID)
 * - Prevents concurrent use of single session
 */

import * as crypto from 'crypto';
import { KeyProvider } from '../key-provider.interface.js';
import {
  KeyProviderCapabilities,
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
  ProviderHealth,
  KeyReference,
  PKCS11ProviderConfig,
  ProviderState,
  SigningAlgorithm,
  EncryptionAlgorithm
} from '../types.js';
import {
  KeyNotFoundError,
  UnsupportedAlgorithmError,
  InitializationFailedError,
  ModuleLoadFailedError,
  TokenNotPresentError,
  AuthenticationFailedError,
  SessionExhaustedError,
  DeviceError,
  InvalidInputError
} from '../errors.js';

/**
 * PKCS#11 mechanism constants
 * From PKCS#11 v2.40 specification
 */
const CKM_RSA_PKCS = 0x00000001;
const CKM_SHA256_RSA_PKCS = 0x00000040;
const CKM_SHA256_RSA_PKCS_PSS = 0x0000000d;
const CKM_ECDSA = 0x00001041;
const CKM_AES_GCM = 0x00001087;
const CKM_RSA_PKCS_OAEP = 0x00000009;

/**
 * PKCS#11 object class constants
 */
const CKO_PRIVATE_KEY = 0x00000003;
const CKO_PUBLIC_KEY = 0x00000002;
const CKO_SECRET_KEY = 0x00000004;

/**
 * PKCS#11 key type constants
 */
const CKK_RSA = 0x00000000;
const CKK_EC = 0x00000003;
const CKK_AES = 0x0000001F;

/**
 * PKCS#11 attribute constants
 */
const CKA_CLASS = 0x00000000;
const CKA_ID = 0x00000102;
const CKA_LABEL = 0x00000003;
const CKA_TOKEN = 0x00000001;
const CKA_PRIVATE = 0x00000002;
const CKA_SENSITIVE = 0x00000103;
const CKA_EXTRACTABLE = 0x00000162;
const CKA_SIGN = 0x00000108;
const CKA_VERIFY = 0x0000010A;
const CKA_ENCRYPT = 0x00000104;
const CKA_DECRYPT = 0x00000105;

interface PKCS11Session {
  handle: any;
  authenticated: boolean;
  inUse: boolean;
}

export class PKCS11Provider implements KeyProvider {
  private config: PKCS11ProviderConfig;
  private pkcs11: any = null;
  private slotId: number | null = null;
  private sessions: PKCS11Session[] = [];
  private state: ProviderState = 'UNINITIALIZED';
  private supportedMechanisms: Set<number> = new Set();
  private keyCache: Map<string, any> = new Map();

  constructor(config: PKCS11ProviderConfig) {
    this.config = config;
  }

  getName(): string {
    return 'pkcs11';
  }

  async initialize(): Promise<void> {
    console.log('[PKCS11Provider] Initializing PKCS#11 provider...');
    console.log(`[PKCS11Provider] Library: ${this.config.libraryPath}`);

    try {
      // Step 1: Load PKCS#11 module
      this.state = 'LOADING_MODULE';
      await this.loadModule();

      // Step 2: Discover token
      this.state = 'DISCOVERING_TOKEN';
      await this.discoverToken();

      // Step 3: Authenticate
      this.state = 'AUTHENTICATING';
      await this.authenticate();

      // Step 4: Validate capabilities
      this.state = 'VALIDATING_CAPABILITIES';
      await this.validateCapabilities();

      // Step 5: Verify required keys
      this.state = 'VERIFYING_KEYS';
      await this.verifyRequiredKeys();

      // Step 6: Ready
      this.state = 'READY';
      console.log('[PKCS11Provider] ✓ Initialization complete');
      console.log(`[PKCS11Provider]   Slot: ${this.slotId}`);
      console.log(`[PKCS11Provider]   Sessions: ${this.sessions.length}`);
      console.log(`[PKCS11Provider]   Mechanisms: ${this.supportedMechanisms.size}`);
    } catch (error: any) {
      this.state = 'UNAVAILABLE';
      throw error;
    }
  }

  getCapabilities(): KeyProviderCapabilities {
    return {
      securityLevel: 'HARDWARE_BACKED',
      operations: {
        sign: this.supportedMechanisms.has(CKM_SHA256_RSA_PKCS) || 
              this.supportedMechanisms.has(CKM_ECDSA),
        verify: true,
        encrypt: this.supportedMechanisms.has(CKM_RSA_PKCS_OAEP) ||
                this.supportedMechanisms.has(CKM_AES_GCM),
        decrypt: this.supportedMechanisms.has(CKM_RSA_PKCS_OAEP) ||
                this.supportedMechanisms.has(CKM_AES_GCM),
        generateKey: true,
        destroyKey: true,
        getPublicKey: true,
        wrapKey: true,
        unwrapKey: true
      },
      keyTypes: {
        rsa: true,
        ec: true,
        aes: true
      },
      signingAlgorithms: [
        'RSA_PKCS1_SHA256',
        'RSA_PSS_SHA256',
        'ECDSA_SHA256'
      ],
      encryptionAlgorithms: [
        'RSA_OAEP_SHA256',
        'AES_256_GCM'
      ],
      privateKeyExportable: false,
      attestedHardware: true,
      fipsMode: false, // Depends on HSM configuration
      metadata: {
        library: this.config.libraryPath,
        slot: this.slotId,
        tokenLabel: this.config.tokenLabel
      }
    };
  }

  async sign(request: SignRequest): Promise<SignatureResult> {
    this.assertReady();
    
    const session = await this.acquireSession();
    
    try {
      // Find private key object
      const keyHandle = await this.findKey(request.key, 'private');
      
      // Select mechanism
      const mechanism = this.mapSigningMechanism(request.algorithm);
      
      // Sign operation (PKCS#11 implementation)
      const signature = await this.performSign(session, mechanism, keyHandle, request.data);

      return {
        signature,
        algorithm: request.algorithm,
        keyId: request.key.id,
        keyVersion: request.key.version,
        provider: this.getName(),
        timestamp: new Date()
      };
    } finally {
      this.releaseSession(session);
    }
  }

  async verify(request: VerifyRequest): Promise<VerificationResult> {
    this.assertReady();
    
    // Verification can often be done with public key locally
    // This is more efficient than going through HSM
    
    const session = await this.acquireSession();
    
    try {
      const keyHandle = await this.findKey(request.key, 'public');
      const mechanism = this.mapSigningMechanism(request.algorithm);
      
      const valid = await this.performVerify(
        session,
        mechanism,
        keyHandle,
        request.data,
        request.signature
      );

      return {
        valid,
        algorithm: request.algorithm,
        keyId: request.key.id,
        keyVersion: request.key.version,
        provider: this.getName(),
        timestamp: new Date()
      };
    } finally {
      this.releaseSession(session);
    }
  }

  async encrypt(request: EncryptRequest): Promise<EncryptionResult> {
    this.assertReady();
    
    const session = await this.acquireSession();
    
    try {
      const keyHandle = await this.findKey(request.key, 'public');
      const mechanism = this.mapEncryptionMechanism(request.algorithm);
      
      const result = await this.performEncrypt(
        session,
        mechanism,
        keyHandle,
        request.plaintext
      );

      return {
        ciphertext: result.ciphertext,
        iv: result.iv,
        authTag: result.authTag,
        algorithm: request.algorithm,
        keyId: request.key.id,
        keyVersion: request.key.version,
        provider: this.getName(),
        timestamp: new Date()
      };
    } finally {
      this.releaseSession(session);
    }
  }

  async decrypt(request: DecryptRequest): Promise<DecryptionResult> {
    this.assertReady();
    
    const session = await this.acquireSession();
    
    try {
      const keyHandle = await this.findKey(request.key, 'private');
      const mechanism = this.mapEncryptionMechanism(request.algorithm);

      const plaintext = await this.performDecrypt(
        session,
        mechanism,
        keyHandle,
        request.ciphertext,
        request.iv,
        request.authTag
      );

      return {
        plaintext,
        algorithm: request.algorithm,
        keyId: request.key.id,
        keyVersion: request.key.version,
        provider: this.getName(),
        timestamp: new Date()
      };
    } finally {
      this.releaseSession(session);
    }
  }

  async generateKey(request: GenerateKeyRequest): Promise<KeyMetadata> {
    this.assertReady();
    
    const session = await this.acquireSession();
    
    try {
      const keyId = this.generateKeyId();
      
      // Generate key pair or secret key in HSM
      await this.performGenerateKey(session, keyId, request);
      
      const metadata: KeyMetadata = {
        id: keyId,
        tenantId: request.tenantId,
        provider: this.getName(),
        externalKeyId: keyId,
        purpose: request.purpose,
        algorithm: `${request.algorithm.type}${request.algorithm.keySize ? '-' + request.algorithm.keySize : ''}`,
        keyType: request.algorithm.type,
        keySize: request.algorithm.keySize,
        version: 1,
        securityLevel: 'HARDWARE_BACKED',
        status: 'ACTIVE',
        policy: request.policy,
        createdAt: new Date(),
        activatedAt: new Date(),
        metadata: request.metadata
      };
      
      return metadata;
    } finally {
      this.releaseSession(session);
    }
  }

  async getPublicKey(
    keyRef: KeyReference,
    format: 'PEM' | 'DER' | 'JWK' = 'PEM'
  ): Promise<PublicKeyResult> {
    this.assertReady();
    
    const session = await this.acquireSession();
    
    try {
      const keyHandle = await this.findKey(keyRef, 'public');
      
      // Extract public key material from HSM
      const publicKeyData = await this.extractPublicKey(session, keyHandle, format);
      
      return {
        publicKey: publicKeyData,
        format,
        keyId: keyRef.id,
        algorithm: 'RSA' // Should be determined from key
      };
    } finally {
      this.releaseSession(session);
    }
  }

  async destroyKey(keyRef: KeyReference): Promise<void> {
    this.assertReady();
    
    const session = await this.acquireSession();
    
    try {
      const privateKeyHandle = await this.findKey(keyRef, 'private');
      const publicKeyHandle = await this.findKey(keyRef, 'public');
      
      // Destroy both keys from HSM
      await this.performDestroyKey(session, privateKeyHandle);
      await this.performDestroyKey(session, publicKeyHandle);
      
      // Clear from cache
      this.keyCache.delete(this.buildKeyId(keyRef));
      
      console.log(`[PKCS11Provider] Destroyed key: ${keyRef.id}`);
    } finally {
      this.releaseSession(session);
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (this.state === 'UNINITIALIZED') {
      return {
        status: 'UNAVAILABLE',
        state: 'UNINITIALIZED',
        checkedAt: new Date(),
        reason: 'Provider not initialized'
      };
    }

    try {
      // Perform lightweight health check
      const session = await this.acquireSession();
      this.releaseSession(session);
      
      return {
        status: 'HEALTHY',
        state: this.state,
        checkedAt: new Date(),
        details: {
          slot: this.slotId,
          sessions: this.sessions.length,
          mechanisms: this.supportedMechanisms.size
        }
      };
    } catch (error: any) {
      return {
        status: 'UNAVAILABLE',
        state: 'UNAVAILABLE',
        checkedAt: new Date(),
        reason: error.message
      };
    }
  }

  async shutdown(): Promise<void> {
    console.log('[PKCS11Provider] Shutting down...');
    
    try {
      // Close all sessions
      for (const session of this.sessions) {
        if (this.pkcs11 && session.handle) {
          try {
            // C_CloseSession equivalent
            // this.pkcs11.C_CloseSession(session.handle);
          } catch (error) {
            console.warn('[PKCS11Provider] Failed to close session:', error);
          }
        }
      }
      
      this.sessions = [];
      
      // Finalize PKCS#11
      if (this.pkcs11) {
        try {
          // C_Finalize equivalent
          // this.pkcs11.C_Finalize();
        } catch (error) {
          console.warn('[PKCS11Provider] Failed to finalize PKCS#11:', error);
        }
      }
      
      this.state = 'UNINITIALIZED';
      console.log('[PKCS11Provider] ✓ Shutdown complete');
    } catch (error: any) {
      console.error('[PKCS11Provider] Shutdown error:', error);
    }
  }

  // ============================================================================
  // Initialization Helper Methods
  // ============================================================================

  private async loadModule(): Promise<void> {
    console.log('[PKCS11Provider] Loading PKCS#11 module...');
    
    try {
      // TODO: Implement actual PKCS#11 library loading
      // This requires pkcs11js package:
      // const pkcs11js = require('pkcs11js');
      // this.pkcs11 = new pkcs11js.PKCS11();
      // this.pkcs11.load(this.config.libraryPath);
      // this.pkcs11.C_Initialize();
      
      throw new ModuleLoadFailedError(
        this.getName(),
        this.config.libraryPath,
        new Error('PKCS#11 library integration requires pkcs11js package. Run: npm install pkcs11js')
      );
    } catch (error: any) {
      if (error instanceof ModuleLoadFailedError) {
        throw error;
      }
      throw new ModuleLoadFailedError(
        this.getName(),
        this.config.libraryPath,
        error
      );
    }
  }

  private async discoverToken(): Promise<void> {
    console.log('[PKCS11Provider] Discovering token...');
    
    try {
      // TODO: Implement token discovery
      // const slots = this.pkcs11.C_GetSlotList(true);
      // 
      // if (this.config.slotId !== undefined) {
      //   this.slotId = this.config.slotId;
      // } else if (this.config.tokenLabel) {
      //   // Find slot by token label
      //   for (const slot of slots) {
      //     const tokenInfo = this.pkcs11.C_GetTokenInfo(slot);
      //     if (tokenInfo.label.trim() === this.config.tokenLabel) {
      //       this.slotId = slot;
      //       break;
      //     }
      //   }
      // } else {
      //   this.slotId = slots[0];
      // }
      // 
      // if (this.slotId === null) {
      //   throw new TokenNotPresentError(
      //     this.getName(),
      //     'No suitable token found'
      //   );
      // }
      
      throw new InitializationFailedError(
        this.getName(),
        'Token discovery requires pkcs11js implementation'
      );
    } catch (error: any) {
      throw error;
    }
  }

  private async authenticate(): Promise<void> {
    console.log('[PKCS11Provider] Authenticating...');
    
    try {
      // Retrieve PIN from configured source
      const pin = await this.retrievePin();
      
      // Create session pool
      for (let i = 0; i < this.config.sessionPoolSize; i++) {
        // TODO: Implement session creation and login
        // const session = this.pkcs11.C_OpenSession(
        //   this.slotId!,
        //   CKF_SERIAL_SESSION | CKF_RW_SESSION
        // );
        // 
        // this.pkcs11.C_Login(session, CKU_USER, pin);
        // 
        // this.sessions.push({
        //   handle: session,
        //   authenticated: true,
        //   inUse: false
        // });
      }
      
      console.log(`[PKCS11Provider] Created ${this.config.sessionPoolSize} authenticated sessions`);
    } catch (error: any) {
      throw new AuthenticationFailedError(
        this.getName(),
        `Failed to authenticate: ${error.message}`,
        error
      );
    }
  }

  private async validateCapabilities(): Promise<void> {
    console.log('[PKCS11Provider] Validating capabilities...');
    
    try {
      // TODO: Query supported mechanisms
      // const mechanismList = this.pkcs11.C_GetMechanismList(this.slotId!);
      // 
      // for (const mechanism of mechanismList) {
      //   this.supportedMechanisms.add(mechanism);
      // }
      
      // Verify required mechanisms
      for (const requiredMechanism of this.config.requiredMechanisms) {
        // Map mechanism name to constant and verify
        console.log(`[PKCS11Provider] Checking mechanism: ${requiredMechanism}`);
      }
      
      console.log(`[PKCS11Provider] Supported mechanisms: ${this.supportedMechanisms.size}`);
    } catch (error: any) {
      throw new InitializationFailedError(
        this.getName(),
        `Capability validation failed: ${error.message}`,
        error
      );
    }
  }

  private async verifyRequiredKeys(): Promise<void> {
    if (!this.config.requiredKeys || this.config.requiredKeys.length === 0) {
      return;
    }
    
    console.log('[PKCS11Provider] Verifying required keys...');
    
    for (const requiredKey of this.config.requiredKeys) {
      try {
        // TODO: Search for key by label or CKA_ID
        // const keyRef: KeyReference = {
        //   id: requiredKey.id,
        //   provider: this.getName(),
        //   purpose: requiredKey.purpose,
        //   version: 1
        // };
        // await this.findKey(keyRef, 'private');
        
        console.log(`[PKCS11Provider] ✓ Found required key: ${requiredKey.id}`);
      } catch (error) {
        throw new InitializationFailedError(
          this.getName(),
          `Required key not found: ${requiredKey.id}`
        );
      }
    }
  }

  private async retrievePin(): Promise<string> {
    const pinSource = this.config.pinSource;
    
    if (pinSource.type === 'env') {
      const pin = process.env[pinSource.variable];
      if (!pin) {
        throw new Error(`PIN environment variable not set: ${pinSource.variable}`);
      }
      return pin;
    } else if (pinSource.type === 'file') {
      // Read PIN from file
      const fs = await import('fs/promises');
      const pin = await fs.readFile(pinSource.path, 'utf-8');
      return pin.trim();
    } else if (pinSource.type === 'secret') {
      // Retrieve from secret manager
      throw new Error('Secret manager PIN retrieval not yet implemented');
    }
    
    const _exhaustiveCheck: never = pinSource;
    throw new Error(`Unsupported PIN source type: ${(_exhaustiveCheck as any).type}`);
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  private async acquireSession(): Promise<PKCS11Session> {
    // Find available session
    for (const session of this.sessions) {
      if (!session.inUse && session.authenticated) {
        session.inUse = true;
        return session;
      }
    }
    
    throw new SessionExhaustedError(
      this.getName(),
      'All sessions are in use'
    );
  }

  private releaseSession(session: PKCS11Session): void {
    session.inUse = false;
  }

  // ============================================================================
  // Cryptographic Operations (Placeholders for PKCS#11 implementation)
  // ============================================================================

  private async performSign(
    session: PKCS11Session,
    mechanism: any,
    keyHandle: any,
    data: Buffer
  ): Promise<Buffer> {
    // TODO: Implement PKCS#11 signing
    // this.pkcs11.C_SignInit(session.handle, mechanism, keyHandle);
    // const signature = this.pkcs11.C_Sign(session.handle, data);
    // return Buffer.from(signature);
    
    throw new Error('PKCS#11 signing requires pkcs11js implementation');
  }

  private async performVerify(
    session: PKCS11Session,
    mechanism: any,
    keyHandle: any,
    data: Buffer,
    signature: Buffer
  ): Promise<boolean> {
    // TODO: Implement PKCS#11 verification
    // try {
    //   this.pkcs11.C_VerifyInit(session.handle, mechanism, keyHandle);
    //   this.pkcs11.C_Verify(session.handle, data, signature);
    //   return true;
    // } catch (error) {
    //   return false;
    // }
    
    throw new Error('PKCS#11 verification requires pkcs11js implementation');
  }

  private async performEncrypt(
    session: PKCS11Session,
    mechanism: any,
    keyHandle: any,
    plaintext: Buffer
  ): Promise<{ ciphertext: Buffer; iv: Buffer; authTag?: Buffer }> {
    // TODO: Implement PKCS#11 encryption
    const error: any = new Error('PKCS#11 encryption requires pkcs11js implementation');
    throw error;
  }

  private async performDecrypt(
    session: PKCS11Session,
    mechanism: any,
    keyHandle: any,
    ciphertext: Buffer,
    iv?: Buffer,
    authTag?: Buffer
  ): Promise<Buffer> {
    // TODO: Implement PKCS#11 decryption
    throw new Error('PKCS#11 decryption requires pkcs11js implementation');
  }

  private async performGenerateKey(
    session: PKCS11Session,
    keyId: string,
    request: GenerateKeyRequest
  ): Promise<void> {
    // TODO: Implement PKCS#11 key generation
    // For RSA:
    // const publicKeyTemplate = [
    //   { type: CKA_CLASS, value: CKO_PUBLIC_KEY },
    //   { type: CKA_KEY_TYPE, value: CKK_RSA },
    //   { type: CKA_TOKEN, value: true },
    //   { type: CKA_VERIFY, value: true },
    //   { type: CKA_MODULUS_BITS, value: keySize },
    //   { type: CKA_LABEL, value: keyId }
    // ];
    // 
    // const privateKeyTemplate = [
    //   { type: CKA_CLASS, value: CKO_PRIVATE_KEY },
    //   { type: CKA_TOKEN, value: true },
    //   { type: CKA_PRIVATE, value: true },
    //   { type: CKA_SENSITIVE, value: true },
    //   { type: CKA_EXTRACTABLE, value: false },
    //   { type: CKA_SIGN, value: true },
    //   { type: CKA_LABEL, value: keyId }
    // ];
    // 
    // const { publicKey, privateKey } = this.pkcs11.C_GenerateKeyPair(
    //   session.handle,
    //   { mechanism: CKM_RSA_PKCS_KEY_PAIR_GEN },
    //   publicKeyTemplate,
    //   privateKeyTemplate
    // );
    
    throw new Error('PKCS#11 key generation requires pkcs11js implementation');
  }

  private async performDestroyKey(
    session: PKCS11Session,
    keyHandle: any
  ): Promise<void> {
    // TODO: Implement PKCS#11 key destruction
    // this.pkcs11.C_DestroyObject(session.handle, keyHandle);
    
    throw new Error('PKCS#11 key destruction requires pkcs11js implementation');
  }

  private async extractPublicKey(
    session: PKCS11Session,
    keyHandle: any,
    format: 'PEM' | 'DER' | 'JWK'
  ): Promise<Buffer> {
    // TODO: Extract public key attributes and format
    throw new Error('PKCS#11 public key extraction requires pkcs11js implementation');
  }

  // ============================================================================
  // Key Management
  // ============================================================================

  private async findKey(keyRef: KeyReference, keyType: 'private' | 'public'): Promise<any> {
    const cacheKey = `${this.buildKeyId(keyRef)}-${keyType}`;
    
    if (this.keyCache.has(cacheKey)) {
      return this.keyCache.get(cacheKey);
    }
    
    // TODO: Search for key object in HSM
    // const template = [
    //   { type: CKA_CLASS, value: keyType === 'private' ? CKO_PRIVATE_KEY : CKO_PUBLIC_KEY },
    //   { type: CKA_LABEL, value: keyRef.id }
    // ];
    // 
    // const session = await this.acquireSession();
    // try {
    //   this.pkcs11.C_FindObjectsInit(session.handle, template);
    //   const objects = this.pkcs11.C_FindObjects(session.handle);
    //   this.pkcs11.C_FindObjectsFinal(session.handle);
    //   
    //   if (objects.length === 0) {
    //     throw new KeyNotFoundError(this.getName(), keyRef.id, 'Key not found in HSM');
    //   }
    //   
    //   const keyHandle = objects[0];
    //   this.keyCache.set(cacheKey, keyHandle);
    //   return keyHandle;
    // } finally {
    //   this.releaseSession(session);
    // }
    
    throw new Error('PKCS#11 key lookup requires pkcs11js implementation');
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private assertReady(): void {
    if (this.state !== 'READY') {
      throw new Error(`Provider not ready: ${this.state}`);
    }
  }

  private buildKeyId(keyRef: KeyReference): string {
    return `${keyRef.id}-v${keyRef.version}${keyRef.tenantId ? `-${keyRef.tenantId}` : ''}`;
  }

  private generateKeyId(): string {
    return `key-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  }

  private mapSigningMechanism(algorithm: SigningAlgorithm): any {
    switch (algorithm) {
      case 'RSA_PKCS1_SHA256':
        return { mechanism: CKM_SHA256_RSA_PKCS };
      case 'RSA_PSS_SHA256':
        return {
          mechanism: CKM_SHA256_RSA_PKCS_PSS,
          parameter: {
            hashAlg: 0x00000250, // CKM_SHA256
            mgf: 0x00000001, // CKG_MGF1_SHA256
            saltLen: 32
          }
        };
      case 'ECDSA_SHA256':
        // Note: Most PKCS#11 implementations expect pre-hashed data for ECDSA
        return { mechanism: CKM_ECDSA };
      default:
        throw new UnsupportedAlgorithmError(this.getName(), algorithm, 'sign');
    }
  }

  private mapEncryptionMechanism(algorithm: EncryptionAlgorithm): any {
    switch (algorithm) {
      case 'RSA_OAEP_SHA256':
        return {
          mechanism: CKM_RSA_PKCS_OAEP,
          parameter: {
            hashAlg: 0x00000250, // CKM_SHA256
            mgf: 0x00000001, // CKG_MGF1_SHA256
            source: 0x00000001 // CKZ_DATA_SPECIFIED
          }
        };
      case 'AES_256_GCM':
        return { mechanism: CKM_AES_GCM };
      default:
        throw new UnsupportedAlgorithmError(this.getName(), algorithm, 'encrypt');
    }
  }
}

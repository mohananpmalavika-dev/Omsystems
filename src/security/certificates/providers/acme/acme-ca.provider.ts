/**
 * ACME Certificate Authority Provider
 * Implements Automatic Certificate Management Environment (RFC 8555)
 * Supports Let's Encrypt, ZeroSSL, and other ACME-compatible CAs
 */

import {
  CertificateAuthorityProvider,
  CertificateAuthorityProviderType,
  CertificateAuthorityCapabilities,
  CertificateAuthorityHealth,
  SubmitCertificateRequest,
  CertificateRequestSubmission,
  CertificateRequestStatusRequest,
  CertificateRequestStatus,
  RetrieveCertificateRequest,
  IssuedCertificate,
  RevokeCertificateRequest,
  RevocationResult,
  RevocationStatusRequest,
  RevocationStatusResult,
  CertificateAuthorityUnavailableError,
  CertificateRequestRejectedError
} from '../../ports/index.js';
import { AcmeChallengeProvider } from './challenge-provider.js';
import axios from 'axios';
import type { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import * as forge from 'node-forge';

export interface AcmeProviderConfig {
  directoryUrl: string;
  accountEmail: string;
  accountKeyPem?: string; // If not provided, generates new account
  eabKid?: string; // External Account Binding Key ID
  eabHmacKey?: string; // External Account Binding HMAC Key
  challengeProvider: AcmeChallengeProvider;
  timeout?: number;
  retryAttempts?: number;
}

interface AcmeDirectory {
  newNonce: string;
  newAccount: string;
  newOrder: string;
  revokeCert: string;
  keyChange?: string;
  meta?: {
    termsOfService?: string;
    website?: string;
    caaIdentities?: string[];
    externalAccountRequired?: boolean;
  };
}

interface AcmeAccount {
  status: string;
  contact: string[];
  orders?: string;
  kid: string; // Key ID for subsequent requests
}

interface AcmeOrder {
  status: 'pending' | 'ready' | 'processing' | 'valid' | 'invalid';
  expires: string;
  identifiers: Array<{
    type: 'dns' | 'ip';
    value: string;
  }>;
  authorizations: string[];
  finalize: string;
  certificate?: string;
}

interface AcmeAuthorization {
  status: 'pending' | 'valid' | 'invalid' | 'deactivated' | 'expired' | 'revoked';
  expires: string;
  identifier: {
    type: 'dns' | 'ip';
    value: string;
  };
  challenges: AcmeChallenge[];
}

export interface AcmeChallenge {
  type: 'http-01' | 'dns-01' | 'tls-alpn-01';
  status: 'pending' | 'processing' | 'valid' | 'invalid';
  url: string;
  token: string;
  validated?: string;
}

/**
 * ACME Certificate Authority Provider
 */
export class AcmeCertificateAuthorityProvider
  implements CertificateAuthorityProvider
{
  public readonly providerType: CertificateAuthorityProviderType = 'ACME';

  public readonly capabilities: CertificateAuthorityCapabilities = {
    automaticIssuance: true,
    automaticRenewal: true,
    automaticRevocation: true,
    supportsPolling: true,
    supportsWebhooks: false,
    supportsOCSP: true,
    supportsCRL: true,
    supportsDeviceIdentity: false,
    supportsSANWildcard: true,
    maxValidityDays: 90, // Let's Encrypt default
    requiresApproval: false
  };

  private config!: AcmeProviderConfig;
  private directory!: AcmeDirectory;
  private account!: AcmeAccount;
  private accountKeyPair!: { publicKey: any; privateKey: any };
  private httpClient: AxiosInstance;
  private nonceCache: string[] = [];
  private initialized = false;

  constructor() {
    this.httpClient = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/jose+json',
        'User-Agent': 'Sentinel-Certificate-Lifecycle/1.0'
      }
    });
  }

  async initialize(config: Record<string, any>): Promise<void> {
    this.config = config as AcmeProviderConfig;

    if (!this.config.directoryUrl) {
      throw new Error('ACME directory URL is required');
    }

    if (!this.config.accountEmail) {
      throw new Error('ACME account email is required');
    }

    if (!this.config.challengeProvider) {
      throw new Error('ACME challenge provider is required');
    }

    // Fetch ACME directory
    await this.fetchDirectory();

    // Initialize or load account
    await this.initializeAccount();

    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
    this.nonceCache = [];
  }

  async submitCertificateRequest(
    request: SubmitCertificateRequest
  ): Promise<CertificateRequestSubmission> {
    this.ensureInitialized();

    try {
      // Parse CSR to extract identifiers
      const identifiers = await this.extractIdentifiersFromCSR(request.csrPem);

      // Create ACME order
      const orderUrl = await this.createOrder(identifiers);
      const order = await this.getOrder(orderUrl);

      // Process authorizations
      const authorizationResults = await this.processAuthorizations(
        order.authorizations
      );

      // Check if all authorizations are valid
      const allValid = authorizationResults.every((result) => result.valid);

      if (!allValid) {
        const failedAuths = authorizationResults.filter((r) => !r.valid);
        return {
          state: 'REJECTED',
          providerRequestId: orderUrl,
          reason: `Authorization failed for: ${failedAuths
            .map((r) => r.identifier)
            .join(', ')}`,
          errorCode: 'AUTHORIZATION_FAILED'
        };
      }

      // Finalize order with CSR
      await this.finalizeOrder(order.finalize, request.csrPem);

      // Poll for certificate
      const finalOrder = await this.pollOrderCompletion(orderUrl);

      if (finalOrder.status === 'valid' && finalOrder.certificate) {
        // Download certificate
        const certificate = await this.downloadCertificate(
          finalOrder.certificate
        );

        return {
          state: 'ISSUED',
          providerRequestId: orderUrl,
          certificate
        };
      } else if (finalOrder.status === 'invalid') {
        return {
          state: 'REJECTED',
          providerRequestId: orderUrl,
          reason: 'Order marked as invalid by ACME server'
        };
      } else {
        return {
          state: 'PENDING',
          providerRequestId: orderUrl,
          retryAfter: new Date(Date.now() + 60000) // Retry in 1 minute
        };
      }
    } catch (error: any) {
      if (error.response?.status === 429) {
        // Rate limited
        const retryAfter = error.response.headers['retry-after'];
        return {
          state: 'REJECTED',
          reason: 'Rate limited by ACME server',
          errorCode: 'RATE_LIMITED'
        };
      }

      throw new CertificateAuthorityUnavailableError(
        `ACME submission failed: ${error.message}`,
        { originalError: error }
      );
    }
  }

  async getCertificateRequestStatus(
    request: CertificateRequestStatusRequest
  ): Promise<CertificateRequestStatus> {
    this.ensureInitialized();

    try {
      const order = await this.getOrder(request.providerRequestId);

      if (order.status === 'valid' && order.certificate) {
        const certificate = await this.downloadCertificate(order.certificate);
        return {
          state: 'ISSUED',
          certificate
        };
      } else if (order.status === 'invalid') {
        return {
          state: 'REJECTED',
          reason: 'Order marked as invalid by ACME server'
        };
      } else if (order.status === 'processing' || order.status === 'ready') {
        return {
          state: 'PENDING',
          retryAfter: new Date(Date.now() + 30000) // Retry in 30 seconds
        };
      } else {
        return {
          state: 'PENDING',
          retryAfter: new Date(Date.now() + 60000)
        };
      }
    } catch (error: any) {
      return {
        state: 'FAILED',
        reason: `Failed to check status: ${error.message}`,
        retryable: true
      };
    }
  }

  async retrieveIssuedCertificate(
    request: RetrieveCertificateRequest
  ): Promise<IssuedCertificate> {
    this.ensureInitialized();

    try {
      const order = await this.getOrder(request.providerRequestId);

      if (order.status !== 'valid' || !order.certificate) {
        throw new Error('Certificate not yet issued');
      }

      return await this.downloadCertificate(order.certificate);
    } catch (error: any) {
      throw new CertificateAuthorityUnavailableError(
        `Failed to retrieve certificate: ${error.message}`
      );
    }
  }

  async revokeCertificate(
    request: RevokeCertificateRequest
  ): Promise<RevocationResult> {
    this.ensureInitialized();

    try {
      // Get certificate PEM (would need to be passed in request or retrieved from store)
      // For now, assume it's in request metadata
      const certificatePem = (request as any).certificatePem;

      if (!certificatePem) {
        throw new Error('Certificate PEM required for ACME revocation');
      }

      const cert = forge.pki.certificateFromPem(certificatePem);
      const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert));
      const derBase64 = forge.util.encode64(der.getBytes());

      const reasonCode = this.mapRevocationReason(request.reason);

      const payload = {
        certificate: derBase64,
        reason: reasonCode
      };

      await this.signedRequest(
        this.directory.revokeCert,
        payload,
        this.account.kid
      );

      return {
        success: true,
        revokedAt: new Date(),
        reason: request.reason
      };
    } catch (error: any) {
      return {
        success: false,
        error: `ACME revocation failed: ${error.message}`
      };
    }
  }

  async healthCheck(): Promise<CertificateAuthorityHealth> {
    const startTime = Date.now();

    try {
      // Try to fetch directory and get a nonce
      await this.fetchDirectory();
      const nonce = await this.getNonce();

      const latencyMs = Date.now() - startTime;

      return {
        state: 'HEALTHY',
        reachable: true,
        authenticated: this.initialized && !!this.account,
        authorizationVerified: true,
        latencyMs,
        observedAt: new Date()
      };
    } catch (error: any) {
      return {
        state: 'UNAVAILABLE',
        reachable: false,
        authenticated: false,
        observedAt: new Date(),
        reason: `ACME server unreachable: ${error.message}`
      };
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('ACME provider not initialized');
    }
  }

  private async fetchDirectory(): Promise<void> {
    try {
      const response = await this.httpClient.get(this.config.directoryUrl);
      this.directory = response.data;
    } catch (error: any) {
      throw new CertificateAuthorityUnavailableError(
        `Failed to fetch ACME directory: ${error.message}`
      );
    }
  }

  private async initializeAccount(): Promise<void> {
    // Load or generate account key
    if (this.config.accountKeyPem) {
      const privateKey = forge.pki.privateKeyFromPem(
        this.config.accountKeyPem
      );
      const publicKey = forge.pki.setRsaPublicKey(
        (privateKey as any).n,
        (privateKey as any).e
      );
      this.accountKeyPair = { privateKey, publicKey };
    } else {
      // Generate new RSA key pair for account
      this.accountKeyPair = forge.pki.rsa.generateKeyPair({ bits: 2048 });
    }

    // Create or retrieve account
    await this.createAccount();
  }

  private async createAccount(): Promise<void> {
    const payload: any = {
      termsOfServiceAgreed: true,
      contact: [`mailto:${this.config.accountEmail}`]
    };

    // Add External Account Binding if required
    if (this.config.eabKid && this.config.eabHmacKey) {
      payload.externalAccountBinding = await this.createEAB();
    }

    try {
      const response = await this.signedRequest(
        this.directory.newAccount,
        payload
      );

      this.account = {
        ...response.data,
        kid: response.headers.location
      };
    } catch (error: any) {
      throw new Error(`Failed to create ACME account: ${error.message}`);
    }
  }

  private async createEAB(): Promise<any> {
    // External Account Binding for CAs that require it (e.g., ZeroSSL)
    const jwk = this.getJWK();
    const eabPayload = JSON.stringify(jwk);

    const hmac = crypto.createHmac('sha256', Buffer.from(this.config.eabHmacKey!, 'base64'));
    hmac.update(eabPayload);
    const signature = hmac.digest('base64url');

    return {
      protected: this.base64url({
        alg: 'HS256',
        kid: this.config.eabKid,
        url: this.directory.newAccount
      }),
      payload: Buffer.from(eabPayload).toString('base64url'),
      signature
    };
  }

  private async createOrder(
    identifiers: Array<{ type: 'dns' | 'ip'; value: string }>
  ): Promise<string> {
    const payload = {
      identifiers
    };

    const response = await this.signedRequest(
      this.directory.newOrder,
      payload,
      this.account.kid
    );

    return response.headers.location;
  }

  private async getOrder(orderUrl: string): Promise<AcmeOrder> {
    const response = await this.signedRequest(orderUrl, '', this.account.kid);
    return response.data;
  }

  private async processAuthorizations(
    authorizationUrls: string[]
  ): Promise<Array<{ identifier: string; valid: boolean; error?: string }>> {
    const results: Array<{
      identifier: string;
      valid: boolean;
      error?: string;
    }> = [];

    for (const authUrl of authorizationUrls) {
      try {
        const authResponse = await this.signedRequest(
          authUrl,
          '',
          this.account.kid
        );
        const authorization: AcmeAuthorization = authResponse.data;

        if (authorization.status === 'valid') {
          results.push({
            identifier: authorization.identifier.value,
            valid: true
          });
          continue;
        }

        // Find suitable challenge
        const challenge = await this.selectAndProcessChallenge(
          authorization.challenges,
          authorization.identifier.value
        );

        if (challenge.success) {
          results.push({
            identifier: authorization.identifier.value,
            valid: true
          });
        } else {
          results.push({
            identifier: authorization.identifier.value,
            valid: false,
            error: challenge.error
          });
        }
      } catch (error: any) {
        results.push({
          identifier: 'unknown',
          valid: false,
          error: error.message
        });
      }
    }

    return results;
  }

  private async selectAndProcessChallenge(
    challenges: AcmeChallenge[],
    identifier: string
  ): Promise<{ success: boolean; error?: string }> {
    // Prefer HTTP-01, then DNS-01
    const challenge =
      challenges.find((c) => c.type === 'http-01') ||
      challenges.find((c) => c.type === 'dns-01');

    if (!challenge) {
      return { success: false, error: 'No supported challenge type' };
    }

    try {
      // Compute key authorization
      const keyAuthorization = await this.computeKeyAuthorization(
        challenge.token
      );

      // Present challenge
      await this.config.challengeProvider.presentChallenge({
        type: challenge.type,
        identifier,
        token: challenge.token,
        keyAuthorization
      });

      // Notify ACME server
      await this.signedRequest(challenge.url, {}, this.account.kid);

      // Poll for validation
      const validated = await this.pollChallengeValidation(challenge.url);

      // Cleanup challenge
      await this.config.challengeProvider.cleanupChallenge({
        type: challenge.type,
        identifier,
        token: challenge.token,
        keyAuthorization
      });

      return { success: validated };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async pollChallengeValidation(
    challengeUrl: string,
    maxAttempts: number = 10
  ): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const response = await this.signedRequest(
        challengeUrl,
        '',
        this.account.kid
      );
      const challenge: AcmeChallenge = response.data;

      if (challenge.status === 'valid') {
        return true;
      } else if (challenge.status === 'invalid') {
        return false;
      }
    }

    return false;
  }

  private async finalizeOrder(
    finalizeUrl: string,
    csrPem: string
  ): Promise<void> {
    // Convert PEM CSR to DER base64url
    const csrDer = this.pemToDer(csrPem);
    const csrBase64 = Buffer.from(csrDer).toString('base64url');

    const payload = {
      csr: csrBase64
    };

    await this.signedRequest(finalizeUrl, payload, this.account.kid);
  }

  private async pollOrderCompletion(
    orderUrl: string,
    maxAttempts: number = 20
  ): Promise<AcmeOrder> {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const order = await this.getOrder(orderUrl);

      if (order.status === 'valid' || order.status === 'invalid') {
        return order;
      }
    }

    throw new Error('Order completion timeout');
  }

  private async downloadCertificate(
    certificateUrl: string
  ): Promise<IssuedCertificate> {
    const response = await this.signedRequest(
      certificateUrl,
      '',
      this.account.kid
    );

    const fullChainPem: string = response.data;

    // Split into certificate and chain
    const certs = this.splitPemChain(fullChainPem);
    const certificatePem = certs[0];
    const chainPem = certs.slice(1);

    if (!certificatePem) {
      throw new Error('No certificate found in response');
    }

    // Parse certificate
    const cert = forge.pki.certificateFromPem(certificatePem);

    const commonName = cert.issuer.getField('CN');
    
    return {
      certificatePem,
      chainPem: chainPem.join('\n'),
      serialNumber: cert.serialNumber,
      notBefore: cert.validity.notBefore,
      notAfter: cert.validity.notAfter,
      fingerprintSha256: this.computeFingerprint(certificatePem),
      issuer: commonName?.value?.toString() || 'Unknown',
      providerRequestId: certificateUrl,
      issuedAt: new Date()
    };
  }

  private async signedRequest(
    url: string,
    payload: any,
    kid?: string
  ): Promise<any> {
    const nonce = await this.getNonce();

    const protected_header: any = {
      alg: 'RS256',
      nonce,
      url
    };

    if (kid) {
      protected_header.kid = kid;
    } else {
      protected_header.jwk = this.getJWK();
    }

    const protectedBase64 = this.base64url(protected_header);
    const payloadBase64 =
      payload === '' ? '' : this.base64url(payload);

    const signature = this.sign(`${protectedBase64}.${payloadBase64}`);

    const body = {
      protected: protectedBase64,
      payload: payloadBase64,
      signature
    };

    return await this.httpClient.post(url, body);
  }

  private async getNonce(): Promise<string> {
    if (this.nonceCache.length > 0) {
      return this.nonceCache.pop()!;
    }

    const response = await this.httpClient.head(this.directory.newNonce);
    const nonce = response.headers['replay-nonce'];

    if (!nonce) {
      throw new Error('No nonce received from ACME server');
    }

    return nonce;
  }

  private getJWK(): any {
    const publicKey = this.accountKeyPair.publicKey as any;
    return {
      kty: 'RSA',
      n: Buffer.from(forge.util.encode64(publicKey.n.toByteArray())).toString(
        'base64url'
      ),
      e: Buffer.from(forge.util.encode64(publicKey.e.toByteArray())).toString(
        'base64url'
      )
    };
  }

  private sign(data: string): string {
    const md = forge.md.sha256.create();
    md.update(data, 'utf8');
    const signature = (this.accountKeyPair.privateKey as any).sign(md);
    return Buffer.from(signature, 'binary').toString('base64url');
  }

  private base64url(obj: any): string {
    const json = JSON.stringify(obj);
    return Buffer.from(json).toString('base64url');
  }

  private async computeKeyAuthorization(token: string): Promise<string> {
    const jwk = this.getJWK();
    const jwkJson = JSON.stringify(jwk);
    const thumbprint = crypto
      .createHash('sha256')
      .update(jwkJson)
      .digest('base64url');
    return `${token}.${thumbprint}`;
  }

  private async extractIdentifiersFromCSR(
    csrPem: string
  ): Promise<Array<{ type: 'dns'; value: string }>> {
    const csr = forge.pki.certificationRequestFromPem(csrPem);
    const identifiers: Array<{ type: 'dns'; value: string }> = [];

    // Get CN
    const cn = csr.subject.getField('CN')?.value;
    if (cn) {
      identifiers.push({ type: 'dns', value: cn });
    }

    // Get SANs
    const attributes = csr.getAttribute({ name: 'extensionRequest' }) as any;
    if (attributes?.extensions) {
      const sanExt = attributes.extensions.find(
        (ext: any) => ext.name === 'subjectAltName'
      );
      if (sanExt?.altNames) {
        sanExt.altNames.forEach((alt: any) => {
          if (alt.type === 2) {
            // DNS
            identifiers.push({ type: 'dns', value: alt.value });
          }
        });
      }
    }

    return identifiers;
  }

  private pemToDer(pem: string): Buffer {
    const lines = pem.split('\n').filter((line) => !line.startsWith('-----'));
    const base64 = lines.join('');
    return Buffer.from(base64, 'base64');
  }

  private splitPemChain(fullChainPem: string): string[] {
    const certs: string[] = [];
    const regex = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;
    let match;

    while ((match = regex.exec(fullChainPem)) !== null) {
      certs.push(match[0]);
    }

    return certs;
  }

  private computeFingerprint(certificatePem: string): string {
    const cert = forge.pki.certificateFromPem(certificatePem);
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const md = forge.md.sha256.create();
    md.update(der);
    return md
      .digest()
      .toHex()
      .toUpperCase()
      .match(/.{2}/g)!
      .join(':');
  }

  private mapRevocationReason(
    reason: string
  ): number {
    const reasonMap: Record<string, number> = {
      unspecified: 0,
      keyCompromise: 1,
      caCompromise: 2,
      affiliationChanged: 3,
      superseded: 4,
      cessationOfOperation: 5,
      certificateHold: 6,
      removeFromCRL: 8,
      privilegeWithdrawn: 9,
      aaCompromise: 10
    };

    return reasonMap[reason] || 0;
  }
}

/**
 * Zero Trust Orchestrator
 * Chains all security providers in the correct evaluation order
 */

import {
  ProviderContext,
  ZeroTrustDecision,
  SecurityVerdict,
  ProviderChain,
  ISecurityProvider
} from './types';
import { IdentityProvider } from './identity.provider';
import { MFAProvider } from './mfa.provider';
import { DeviceProvider } from './device.provider';
import { CertificateProvider } from './certificate.provider';
import { NetworkProvider } from './network.provider';
import { RiskEngine } from './risk.engine';
import { AuthorizationEngine } from './authorization.engine';

export class ZeroTrustOrchestrator {
  private identityProvider: IdentityProvider;
  private mfaProvider: MFAProvider;
  private deviceProvider: DeviceProvider;
  private certificateProvider: CertificateProvider;
  private networkProvider: NetworkProvider;
  private riskEngine: RiskEngine;
  private authorizationEngine: AuthorizationEngine;

  constructor() {
    // Initialize all providers
    this.identityProvider = new IdentityProvider();
    this.mfaProvider = new MFAProvider();
    this.deviceProvider = new DeviceProvider();
    this.certificateProvider = new CertificateProvider();
    this.networkProvider = new NetworkProvider();
    this.riskEngine = new RiskEngine();
    this.authorizationEngine = new AuthorizationEngine();

    console.log('✓ Zero Trust Orchestrator initialized with 7 security providers');
  }

  /**
   * Evaluate access request through all security layers
   * 
   * Evaluation order follows zero-trust principles:
   * 1. Identity → Verify who you are
   * 2. MFA → Prove you are who you say you are
   * 3. Device → Verify your device identity
   * 4. Certificate → Validate cryptographic identity
   * 5. Network → Assess network trust
   * 6. Risk Engine → Analyze behavior and detect anomalies
   * 7. Authorization → Check permissions and policies
   */
  async evaluate(context: ProviderContext): Promise<ZeroTrustDecision> {
    const startTime = Date.now();
    const blockers: string[] = [];
    const warnings: string[] = [];
    const requiredActions: string[] = [];
    let highestRiskScore = 0;

    console.log(`\n🔒 Zero Trust Evaluation Started for user ${context.userId}`);
    console.log(`   Resource: ${context.resource} | Action: ${context.action}`);

    // ========================================================================
    // Layer 1: Identity Verification
    // ========================================================================
    console.log('   ├─ 1/7 Identity Provider...');
    const identityResult = await this.identityProvider.verify(context);
    
    console.log(`   │  └─ Verdict: ${identityResult.verdict} | Score: ${identityResult.score}/100`);
    
    if (identityResult.verdict === SecurityVerdict.DENY) {
      blockers.push(`Identity: ${identityResult.reason}`);
    } else if (identityResult.verdict === SecurityVerdict.CHALLENGE) {
      warnings.push(`Identity: ${identityResult.reason}`);
    }
    
    if (identityResult.requiredActions) {
      requiredActions.push(...identityResult.requiredActions);
    }
    
    highestRiskScore = Math.max(highestRiskScore, identityResult.score);

    // ========================================================================
    // Layer 2: Multi-Factor Authentication
    // ========================================================================
    console.log('   ├─ 2/7 MFA Provider...');
    const mfaResult = await this.mfaProvider.verify(context);
    
    console.log(`   │  └─ Verdict: ${mfaResult.verdict} | Score: ${mfaResult.score}/100`);
    
    if (mfaResult.verdict === SecurityVerdict.DENY) {
      blockers.push(`MFA: ${mfaResult.reason}`);
    } else if (mfaResult.verdict === SecurityVerdict.CHALLENGE) {
      warnings.push(`MFA: ${mfaResult.reason}`);
    }
    
    if (mfaResult.requiredActions) {
      requiredActions.push(...mfaResult.requiredActions);
    }
    
    highestRiskScore = Math.max(highestRiskScore, mfaResult.score);

    // ========================================================================
    // Layer 3: Device Identity
    // ========================================================================
    console.log('   ├─ 3/7 Device Provider...');
    const deviceResult = await this.deviceProvider.verify(context);
    
    console.log(`   │  └─ Verdict: ${deviceResult.verdict} | Score: ${deviceResult.score}/100`);
    console.log(`   │     Known: ${deviceResult.deviceKnown} | Trusted: ${deviceResult.deviceTrusted} | Anomalies: ${deviceResult.anomalies.length}`);
    
    if (deviceResult.verdict === SecurityVerdict.DENY) {
      blockers.push(`Device: ${deviceResult.reason}`);
    } else if (deviceResult.verdict === SecurityVerdict.CHALLENGE) {
      warnings.push(`Device: ${deviceResult.reason}`);
    }
    
    if (deviceResult.requiredActions) {
      requiredActions.push(...deviceResult.requiredActions);
    }
    
    highestRiskScore = Math.max(highestRiskScore, deviceResult.score);

    // ========================================================================
    // Layer 4: Certificate Validation
    // ========================================================================
    console.log('   ├─ 4/7 Certificate Provider...');
    const certificateResult = await this.certificateProvider.verify(context);
    
    console.log(`   │  └─ Verdict: ${certificateResult.verdict} | Score: ${certificateResult.score}/100`);
    console.log(`   │     Present: ${certificateResult.certificatePresent} | Valid: ${certificateResult.certificateValid} | TPM: ${certificateResult.tpmAttested}`);
    
    if (certificateResult.verdict === SecurityVerdict.DENY) {
      blockers.push(`Certificate: ${certificateResult.reason}`);
    } else if (certificateResult.verdict === SecurityVerdict.CHALLENGE) {
      warnings.push(`Certificate: ${certificateResult.reason}`);
    }
    
    if (certificateResult.requiredActions) {
      requiredActions.push(...certificateResult.requiredActions);
    }
    
    highestRiskScore = Math.max(highestRiskScore, certificateResult.score);

    // ========================================================================
    // Layer 5: Network Trust
    // ========================================================================
    console.log('   ├─ 5/7 Network Provider...');
    const networkResult = await this.networkProvider.verify(context);
    
    console.log(`   │  └─ Verdict: ${networkResult.verdict} | Score: ${networkResult.score}/100`);
    console.log(`   │     IP Reputation: ${networkResult.ipReputation.score}/100 | Threats: ${networkResult.threats.length}`);
    console.log(`   │     VPN: ${networkResult.vpnDetected} | Proxy: ${networkResult.proxyDetected} | Tor: ${networkResult.torDetected}`);
    
    if (networkResult.verdict === SecurityVerdict.DENY) {
      blockers.push(`Network: ${networkResult.reason}`);
    } else if (networkResult.verdict === SecurityVerdict.CHALLENGE) {
      warnings.push(`Network: ${networkResult.reason}`);
    }
    
    if (networkResult.requiredActions) {
      requiredActions.push(...networkResult.requiredActions);
    }
    
    highestRiskScore = Math.max(highestRiskScore, networkResult.score);

    // ========================================================================
    // Layer 6: Risk Assessment
    // ========================================================================
    console.log('   ├─ 6/7 Risk Engine...');
    const riskResult = await this.riskEngine.verify(context);
    
    console.log(`   │  └─ Verdict: ${riskResult.verdict} | Score: ${riskResult.score}/100`);
    console.log(`   │     Risk Level: ${riskResult.riskLevel} | Factors: ${riskResult.riskFactors.length} | Anomalies: ${riskResult.anomalies.length}`);
    
    if (riskResult.verdict === SecurityVerdict.DENY) {
      blockers.push(`Risk: ${riskResult.reason}`);
    } else if (riskResult.verdict === SecurityVerdict.CHALLENGE) {
      warnings.push(`Risk: ${riskResult.reason}`);
    }
    
    if (riskResult.requiredActions) {
      requiredActions.push(...riskResult.requiredActions);
    }
    
    highestRiskScore = Math.max(highestRiskScore, riskResult.score);

    // ========================================================================
    // Layer 7: Authorization
    // ========================================================================
    console.log('   └─ 7/7 Authorization Engine...');
    const authorizationResult = await this.authorizationEngine.verify(context);
    
    console.log(`      └─ Verdict: ${authorizationResult.verdict} | Score: ${authorizationResult.score}/100`);
    console.log(`         Authorized: ${authorizationResult.authorized} | Policies: ${authorizationResult.matchedPolicies.length}`);
    
    if (authorizationResult.verdict === SecurityVerdict.DENY) {
      blockers.push(`Authorization: ${authorizationResult.reason}`);
    } else if (authorizationResult.verdict === SecurityVerdict.CHALLENGE) {
      warnings.push(`Authorization: ${authorizationResult.reason}`);
    }
    
    if (authorizationResult.requiredActions) {
      requiredActions.push(...authorizationResult.requiredActions);
    }
    
    highestRiskScore = Math.max(highestRiskScore, authorizationResult.score);

    // ========================================================================
    // Final Decision
    // ========================================================================
    const processingTimeMs = Date.now() - startTime;
    
    // Determine final verdict
    let finalVerdict: SecurityVerdict;
    
    if (blockers.length > 0) {
      finalVerdict = SecurityVerdict.DENY;
    } else if (warnings.length > 0) {
      finalVerdict = SecurityVerdict.CHALLENGE;
    } else if (highestRiskScore >= 40) {
      finalVerdict = SecurityVerdict.REVIEW;
    } else {
      finalVerdict = SecurityVerdict.ALLOW;
    }

    const decision: ZeroTrustDecision = {
      verdict: finalVerdict,
      riskScore: highestRiskScore,
      providerResults: {
        identity: identityResult,
        mfa: mfaResult,
        device: deviceResult,
        certificate: certificateResult,
        network: networkResult,
        risk: riskResult,
        authorization: authorizationResult
      },
      requiredActions: Array.from(new Set(requiredActions)),
      blockers,
      warnings,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      evaluatedAt: new Date(),
      processingTimeMs
    };

    console.log(`\n✓ Zero Trust Evaluation Complete: ${finalVerdict}`);
    console.log(`   Risk Score: ${highestRiskScore}/100 | Processing Time: ${processingTimeMs}ms`);
    console.log(`   Blockers: ${blockers.length} | Warnings: ${warnings.length} | Actions Required: ${requiredActions.length}\n`);

    return decision;
  }

  /**
   * Evaluate with custom provider chain
   */
  async evaluateWithChain(context: ProviderContext, chain: ProviderChain): Promise<ZeroTrustDecision> {
    const startTime = Date.now();
    const blockers: string[] = [];
    const warnings: string[] = [];
    const requiredActions: string[] = [];
    let highestRiskScore = 0;
    const providerResults: ZeroTrustDecision['providerResults'] = {};

    console.log(`\n🔒 Custom Chain Evaluation Started for user ${context.userId}`);

    for (const provider of chain.providers) {
      const result = await provider.verify(context);
      
      // Store result
      const providerKey = provider.name.toLowerCase().replace('provider', '').replace('engine', '') as keyof typeof providerResults;
      (providerResults as any)[providerKey] = result;

      console.log(`   ├─ ${provider.name}: ${result.verdict} (${result.score}/100)`);

      // Check verdict
      if (result.verdict === SecurityVerdict.DENY) {
        blockers.push(`${provider.name}: ${result.reason}`);
        
        if (chain.stopOnFailure) {
          console.log(`   └─ Stopped chain due to DENY verdict\n`);
          break;
        }
      } else if (result.verdict === SecurityVerdict.CHALLENGE) {
        warnings.push(`${provider.name}: ${result.reason}`);
      }

      // Collect required actions
      if (result.requiredActions) {
        requiredActions.push(...result.requiredActions);
      }

      highestRiskScore = Math.max(highestRiskScore, result.score);

      // Check minimum score threshold
      if (chain.minimumScore && result.score > chain.minimumScore) {
        blockers.push(`${provider.name}: Risk score ${result.score} exceeds threshold ${chain.minimumScore}`);
        
        if (chain.stopOnFailure) {
          break;
        }
      }
    }

    const processingTimeMs = Date.now() - startTime;

    // Determine final verdict
    let finalVerdict: SecurityVerdict;
    
    if (blockers.length > 0) {
      finalVerdict = SecurityVerdict.DENY;
    } else if (warnings.length > 0) {
      finalVerdict = SecurityVerdict.CHALLENGE;
    } else if (highestRiskScore >= 40) {
      finalVerdict = SecurityVerdict.REVIEW;
    } else {
      finalVerdict = SecurityVerdict.ALLOW;
    }

    const decision: ZeroTrustDecision = {
      verdict: finalVerdict,
      riskScore: highestRiskScore,
      providerResults,
      requiredActions: Array.from(new Set(requiredActions)),
      blockers,
      warnings,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      evaluatedAt: new Date(),
      processingTimeMs
    };

    console.log(`\n✓ Custom Chain Evaluation Complete: ${finalVerdict}\n`);

    return decision;
  }

  /**
   * Quick evaluation (skip optional providers)
   */
  async quickEvaluate(context: ProviderContext): Promise<ZeroTrustDecision> {
    // Only evaluate critical providers for low-risk operations
    const chain: ProviderChain = {
      providers: [
        this.identityProvider,
        this.mfaProvider,
        this.authorizationEngine
      ],
      stopOnFailure: true,
      minimumScore: 60
    };

    return this.evaluateWithChain(context, chain);
  }

  /**
   * High-security evaluation (all providers, strict thresholds)
   */
  async highSecurityEvaluate(context: ProviderContext): Promise<ZeroTrustDecision> {
    const decision = await this.evaluate(context);

    // Apply stricter thresholds for high-security
    if (decision.riskScore > 30) {
      decision.verdict = SecurityVerdict.DENY;
      decision.blockers.push('Risk score exceeds high-security threshold (30)');
    }

    // Require TPM attestation
    if (!decision.providerResults.certificate?.tpmAttested) {
      decision.verdict = SecurityVerdict.DENY;
      decision.blockers.push('TPM attestation required for high-security access');
    }

    // Require MFA verification
    if (!decision.providerResults.mfa?.mfaVerified) {
      decision.verdict = SecurityVerdict.DENY;
      decision.blockers.push('MFA verification required for high-security access');
    }

    return decision;
  }

  /**
   * Get all providers
   */
  getProviders() {
    return {
      identity: this.identityProvider,
      mfa: this.mfaProvider,
      device: this.deviceProvider,
      certificate: this.certificateProvider,
      network: this.networkProvider,
      risk: this.riskEngine,
      authorization: this.authorizationEngine
    };
  }

  /**
   * Health check all providers
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    providers: Record<string, boolean>;
  }> {
    const results = {
      healthy: true,
      providers: {} as Record<string, boolean>
    };

    const providers = this.getProviders();

    for (const [name, provider] of Object.entries(providers)) {
      try {
        const healthy = await provider.healthCheck();
        results.providers[name] = healthy;
        
        if (!healthy) {
          results.healthy = false;
        }
      } catch (error) {
        console.error(`Health check failed for ${name}:`, error);
        results.providers[name] = false;
        results.healthy = false;
      }
    }

    return results;
  }

  /**
   * Get system statistics
   */
  async getStatistics(): Promise<Record<string, any>> {
    const stats: Record<string, any> = {};

    try {
      // Identity stats
      stats.identity = await this.identityProvider.getSessionStats();
      
      // MFA stats
      stats.mfa = await this.mfaProvider.getMFAStats();
      
      // Device stats
      stats.device = await this.deviceProvider.getDeviceStats();
      
      // Certificate stats
      stats.certificate = await this.certificateProvider.getCertificateStats();
      
      // Network stats
      stats.network = await this.networkProvider.getNetworkStats();
      
      // Risk stats
      stats.risk = await this.riskEngine.getRiskStats();
      
      // Authorization stats
      stats.authorization = await this.authorizationEngine.getAuthorizationStats();
    } catch (error) {
      console.error('Error gathering statistics:', error);
    }

    return stats;
  }

  /**
   * Create a provider context from request data
   */
  static createContext(data: {
    requestId: string;
    userId: string;
    sessionId: string;
    deviceId: string;
    ipAddress: string;
    userAgent: string;
    resource: string;
    action: string;
    metadata?: Record<string, any>;
  }): ProviderContext {
    return {
      requestId: data.requestId,
      timestamp: new Date(),
      userId: data.userId,
      sessionId: data.sessionId,
      deviceId: data.deviceId,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      resource: data.resource,
      action: data.action,
      metadata: data.metadata || {}
    };
  }
}

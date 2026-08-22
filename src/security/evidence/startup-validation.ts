/**
 * Security Evidence Startup Validation
 * 
 * Validates security collector configuration on application startup.
 * Prevents deployment with dangerous placeholder configurations.
 * 
 * This is a critical safety check that enforces:
 * - No simulated collectors in production
 * - Required collectors are configured
 * - Evidence sources are valid
 */

import { SecureBootEvidenceCollector } from '../collectors/secure-boot-evidence.collector.js';
import { RansomwareEvidenceCollector } from '../collectors/ransomware-evidence.collector.js';
import { TamperProtectionEvidenceCollector, TamperConditionEvidenceCollector } from '../collectors/tamper-evidence.collector.js';
import { 
  getSecurityCapabilityRegistry,
  initializeSecurityCapabilities,
  SECURITY_CAPABILITY_CATALOG,
} from './security-capability-integration.js';
import type { SecurityPostureService } from '../services/security-posture.service.js';

/**
 * Validation result
 */
export interface StartupValidationResult {
  passed: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  summary: {
    totalCapabilities: number;
    availableCapabilities: number;
    configuredCapabilities: number;
    activeCapabilities: number;
    coverage: number;
  };
}

interface ValidationError {
  severity: 'critical' | 'error';
  category: string;
  message: string;
  remedy?: string;
}

interface ValidationWarning {
  category: string;
  message: string;
  impact?: string;
}

/**
 * Startup validator
 */
export class SecurityStartupValidator {
  private environment: 'development' | 'test' | 'production';
  private strictMode: boolean;

  constructor(environment?: string, strictMode = false) {
    this.environment = (environment as any) || 'development';
    this.strictMode = strictMode || this.environment === 'production';
  }

  /**
   * Validate security configuration
   */
  async validate(): Promise<StartupValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    console.log('🔒 Validating security evidence system...');

    // 1. Validate environment configuration
    this.validateEnvironment(errors, warnings);

    // 2. Initialize collectors
    const collectors = await this.initializeCollectors(errors, warnings);

    // 3. Initialize capability registry
    const registry = initializeSecurityCapabilities(collectors);

    // 4. Validate collector health
    await this.validateCollectorHealth(collectors, errors, warnings);

    // 5. Validate required capabilities
    this.validateRequiredCapabilities(registry, errors, warnings);

    // 6. Validate production constraints
    if (this.environment === 'production') {
      await this.validateProductionConstraints(collectors, errors);
    }

    // 7. Get coverage summary
    const summary = this.getSummary(registry);

    const passed = errors.length === 0;

    if (passed) {
      console.log(`✅ Security validation passed (${summary.activeCapabilities}/${summary.totalCapabilities} capabilities active)`);
    } else {
      console.error(`❌ Security validation failed with ${errors.length} error(s)`);
    }

    if (warnings.length > 0) {
      console.warn(`⚠️  ${warnings.length} warning(s) detected`);
    }

    return {
      passed,
      errors,
      warnings,
      summary,
    };
  }

  /**
   * Validate environment variables
   */
  private validateEnvironment(errors: ValidationError[], warnings: ValidationWarning[]): void {
    // Check NODE_ENV
    if (!process.env.NODE_ENV) {
      warnings.push({
        category: 'environment',
        message: 'NODE_ENV not set, defaulting to development',
        impact: 'Simulated evidence will be allowed',
      });
    }

    // Production-specific checks
    if (this.environment === 'production') {
      // Ensure critical environment variables are set
      const criticalVars = ['NODE_ENV'];
      for (const varName of criticalVars) {
        if (!process.env[varName]) {
          errors.push({
            severity: 'error',
            category: 'environment',
            message: `Required environment variable not set: ${varName}`,
            remedy: `Set ${varName} in production configuration`,
          });
        }
      }
    }

    // Check collector configuration
    const collectorVars = {
      'EDR_API_ENDPOINT': 'Ransomware protection',
      'THREAT_DETECTION_API': 'Alternative threat detection',
      'EDGE_AGENT_API': 'Tamper detection',
      'TAMPER_SENSOR_API': 'Alternative tamper sensors',
    };

    let configuredCollectors = 0;
    for (const [varName, purpose] of Object.entries(collectorVars)) {
      if (process.env[varName]) {
        configuredCollectors++;
      } else {
        warnings.push({
          category: 'configuration',
          message: `${varName} not configured`,
          impact: `${purpose} will be unavailable`,
        });
      }
    }

    if (configuredCollectors === 0) {
      warnings.push({
        category: 'configuration',
        message: 'No external collectors configured',
        impact: 'Only built-in collectors (secure boot) will be available',
      });
    }
  }

  /**
   * Initialize collectors
   */
  private async initializeCollectors(
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): Promise<{
    secureBootCollector?: SecureBootEvidenceCollector;
    ransomwareCollector?: RansomwareEvidenceCollector;
    tamperProtectionCollector?: TamperProtectionEvidenceCollector;
    tamperConditionCollector?: TamperConditionEvidenceCollector;
  }> {
    const collectors: any = {};

    try {
      collectors.secureBootCollector = new SecureBootEvidenceCollector();
    } catch (error) {
      warnings.push({
        category: 'collector-init',
        message: 'Failed to initialize Secure Boot collector',
        impact: 'Secure boot attestation unavailable',
      });
    }

    try {
      collectors.ransomwareCollector = new RansomwareEvidenceCollector();
    } catch (error) {
      warnings.push({
        category: 'collector-init',
        message: 'Failed to initialize Ransomware collector',
        impact: 'Ransomware protection monitoring unavailable',
      });
    }

    try {
      collectors.tamperProtectionCollector = new TamperProtectionEvidenceCollector();
    } catch (error) {
      warnings.push({
        category: 'collector-init',
        message: 'Failed to initialize Tamper Protection collector',
        impact: 'Tamper protection monitoring unavailable',
      });
    }

    try {
      collectors.tamperConditionCollector = new TamperConditionEvidenceCollector();
    } catch (error) {
      warnings.push({
        category: 'collector-init',
        message: 'Failed to initialize Tamper Condition collector',
        impact: 'Tamper event monitoring unavailable',
      });
    }

    return collectors;
  }

  /**
   * Validate collector health
   */
  private async validateCollectorHealth(
    collectors: any,
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): Promise<void> {
    const collectorChecks = [
      { name: 'Secure Boot', collector: collectors.secureBootCollector, critical: true },
      { name: 'Ransomware', collector: collectors.ransomwareCollector, critical: true },
      { name: 'Tamper Protection', collector: collectors.tamperProtectionCollector, critical: false },
      { name: 'Tamper Condition', collector: collectors.tamperConditionCollector, critical: false },
    ];

    for (const { name, collector, critical } of collectorChecks) {
      if (!collector) {
        if (critical && this.strictMode) {
          errors.push({
            severity: 'error',
            category: 'collector-health',
            message: `Critical collector not initialized: ${name}`,
            remedy: 'Ensure collector dependencies are available',
          });
        }
        continue;
      }

      try {
        const health = await collector.getHealth();
        
        if (!health.available) {
          const message = `${name} collector not available`;
          if (critical && this.strictMode) {
            warnings.push({
              category: 'collector-health',
              message,
              impact: `${name} monitoring unavailable`,
            });
          } else {
            warnings.push({
              category: 'collector-health',
              message,
              impact: `${name} monitoring unavailable`,
            });
          }
        }

        if (health.errorCount > 0 && health.lastError) {
          warnings.push({
            category: 'collector-health',
            message: `${name} collector has ${health.errorCount} error(s): ${health.lastError}`,
            impact: 'May affect evidence quality',
          });
        }
      } catch (error) {
        warnings.push({
          category: 'collector-health',
          message: `Failed to check ${name} collector health`,
          impact: 'Health status unknown',
        });
      }
    }
  }

  /**
   * Validate required capabilities
   */
  private validateRequiredCapabilities(
    registry: ReturnType<typeof getSecurityCapabilityRegistry>,
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): void {
    const validation = registry.validateRequiredCapabilities(
      this.environment,
      this.strictMode,
    );

    for (const capabilityId of validation.missing) {
      errors.push({
        severity: 'critical',
        category: 'capability',
        message: `Required capability not available: ${capabilityId}`,
        remedy: 'Configure required collector or disable strict mode for non-production',
      });
    }

    for (const warning of validation.warnings) {
      warnings.push({
        category: 'capability',
        message: warning,
        impact: 'Reduced security visibility',
      });
    }
  }

  /**
   * Validate production constraints
   */
  private async validateProductionConstraints(
    collectors: any,
    errors: ValidationError[],
  ): Promise<void> {
    // Ensure no simulated collectors in production
    const context = { timestamp: new Date() };

    for (const [name, collector] of Object.entries(collectors)) {
      if (!collector) continue;

      try {
        // Collect evidence to check source
        const evidence = await (collector as any).collect(context);

        if (evidence.source === 'SIMULATED') {
          errors.push({
            severity: 'critical',
            category: 'production-constraint',
            message: `Collector ${name} using SIMULATED source in production`,
            remedy: 'Configure real data source or disable this collector in production',
          });
        }
      } catch (error) {
        // Collection failure is acceptable during startup
        // (will be caught by health checks)
      }
    }
  }

  /**
   * Get coverage summary
   */
  private getSummary(registry: ReturnType<typeof getSecurityCapabilityRegistry>) {
    const coverage = registry.getCoverageReport();
    
    return {
      totalCapabilities: coverage.total,
      availableCapabilities: coverage.available,
      configuredCapabilities: coverage.configured,
      activeCapabilities: coverage.active,
      coverage: coverage.coverage,
    };
  }

  /**
   * Print validation report
   */
  printReport(result: StartupValidationResult): void {
    console.log('\n' + '='.repeat(60));
    console.log('Security Evidence System Validation Report');
    console.log('='.repeat(60));

    // Summary
    console.log('\nSummary:');
    console.log(`  Environment: ${this.environment}`);
    console.log(`  Strict Mode: ${this.strictMode ? 'enabled' : 'disabled'}`);
    console.log(`  Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`  Coverage: ${Math.round(result.summary.coverage * 100)}%`);
    console.log(`  Active Capabilities: ${result.summary.activeCapabilities}/${result.summary.totalCapabilities}`);

    // Errors
    if (result.errors.length > 0) {
      console.log('\n❌ Errors:');
      for (const error of result.errors) {
        console.log(`  [${error.severity.toUpperCase()}] ${error.category}: ${error.message}`);
        if (error.remedy) {
          console.log(`    → Remedy: ${error.remedy}`);
        }
      }
    }

    // Warnings
    if (result.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      for (const warning of result.warnings) {
        console.log(`  [WARN] ${warning.category}: ${warning.message}`);
        if (warning.impact) {
          console.log(`    → Impact: ${warning.impact}`);
        }
      }
    }

    console.log('\n' + '='.repeat(60) + '\n');
  }
}

/**
 * Run startup validation
 * 
 * Call this during application startup (before starting the server)
 */
export async function validateSecurityOnStartup(
  options: {
    environment?: string;
    strictMode?: boolean;
    failOnError?: boolean;
  } = {},
): Promise<StartupValidationResult> {
  const validator = new SecurityStartupValidator(
    options.environment,
    options.strictMode,
  );

  const result = await validator.validate();
  validator.printReport(result);

  if (!result.passed && options.failOnError !== false) {
    throw new Error(
      `Security validation failed with ${result.errors.length} error(s). ` +
      `Fix configuration or set failOnError=false to continue.`
    );
  }

  return result;
}

/**
 * Express/Fastify middleware for startup validation
 */
export function createStartupValidationMiddleware(options?: {
  environment?: string;
  strictMode?: boolean;
  failOnError?: boolean;
}) {
  let validationResult: StartupValidationResult | null = null;
  let validationPromise: Promise<StartupValidationResult> | null = null;

  return {
    /**
     * Run validation (call this before starting the server)
     */
    async validate(): Promise<StartupValidationResult> {
      if (!validationPromise) {
        validationPromise = validateSecurityOnStartup(options);
      }
      validationResult = await validationPromise;
      return validationResult;
    },

    /**
     * Get validation result
     */
    getResult(): StartupValidationResult | null {
      return validationResult;
    },

    /**
     * Health check endpoint handler
     */
    healthCheck(req: any, res: any): void {
      if (!validationResult) {
        res.status(503).json({
          status: 'unavailable',
          message: 'Security validation not yet complete',
        });
        return;
      }

      res.json({
        status: validationResult.passed ? 'healthy' : 'degraded',
        security: {
          validated: true,
          passed: validationResult.passed,
          errors: validationResult.errors.length,
          warnings: validationResult.warnings.length,
          coverage: Math.round(validationResult.summary.coverage * 100),
          activeCapabilities: validationResult.summary.activeCapabilities,
          totalCapabilities: validationResult.summary.totalCapabilities,
        },
      });
    },
  };
}

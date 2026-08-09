/**
 * Production Secret Validator
 * 
 * Enforces that production deployments MUST NOT use development defaults.
 * Instead of silently accepting unsafe defaults, production startup FAILS
 * if critical secrets are missing or insecure.
 * 
 * Philosophy:
 * NODE_ENV=production + missing secret → STARTUP FAILURE
 * NOT: missing secret → development default
 */

export interface SecretRequirement {
  name: string;
  envVar: string;
  envVarFile?: string; // Alternative _FILE variant
  required: 'always' | 'production' | 'conditional';
  condition?: () => boolean;
  minLength?: number;
  pattern?: RegExp;
  description: string;
}

export interface SecretValidationResult {
  valid: boolean;
  errors: Array<{
    secret: string;
    issue: string;
    severity: 'fatal' | 'warning';
  }>;
  warnings: Array<{
    secret: string;
    message: string;
  }>;
}

export class ProductionSecretValidator {
  private readonly isProduction: boolean;
  
  // Forbidden patterns that indicate development/test secrets
  private readonly FORBIDDEN_PATTERNS = [
    /development/i,
    /change-me/i,
    /test-secret/i,
    /demo-secret/i,
    /local-development/i,
    /placeholder/i,
    /example/i,
    /\b(abc|123|password|secret)\b/i,
  ];

  constructor(nodeEnv: string = process.env.NODE_ENV || 'development') {
    this.isProduction = nodeEnv === 'production';
  }

  /**
   * Define all critical secrets with their requirements
   */
  private getSecretRequirements(): SecretRequirement[] {
    return [
      // JWT & Authentication
      {
        name: 'JWT Secret',
        envVar: 'JWT_SECRET',
        envVarFile: 'JWT_SECRET_FILE',
        required: 'always',
        minLength: 64,
        description: 'JWT signing secret for authentication tokens',
      },
      
      // Database credentials
      {
        name: 'Database URL',
        envVar: 'DATABASE_URL',
        envVarFile: 'DATABASE_URL_FILE',
        required: 'production',
        description: 'PostgreSQL connection string with credentials',
      },
      
      // Redis (required for distributed state in production)
      {
        name: 'Redis URL',
        envVar: 'REDIS_URL',
        envVarFile: 'REDIS_URL_FILE',
        required: 'production',
        description: 'Redis connection URL for distributed state/rate limiting',
      },
      
      // Alert & notification secrets
      {
        name: 'Alert Voice Callback Secret',
        envVar: 'ALERT_VOICE_CALLBACK_SECRET',
        envVarFile: 'ALERT_VOICE_CALLBACK_SECRET_FILE',
        required: 'conditional',
        condition: () => {
          const voiceProvider = process.env.ALERT_VOICE_PROVIDER;
          const smsProvider = process.env.ALERT_SMS_PROVIDER;
          return !!(voiceProvider || smsProvider);
        },
        minLength: 32,
        description: 'Secret for voice/SMS callback token generation',
      },
      
      // Inter-service authentication
      {
        name: 'Media Gateway Shared Key',
        envVar: 'MEDIA_GATEWAY_SHARED_KEY',
        envVarFile: 'MEDIA_GATEWAY_SHARED_KEY_FILE',
        required: 'production',
        minLength: 32,
        description: 'Shared key for media gateway authentication',
      },
      
      {
        name: 'Edge Bridge Shared Key',
        envVar: 'EDGE_BRIDGE_SHARED_KEY',
        envVarFile: 'EDGE_BRIDGE_SHARED_KEY_FILE',
        required: 'conditional',
        condition: () => {
          const tunnelRequired = process.env.EDGE_MANAGED_TUNNEL_REQUIRED;
          return tunnelRequired === 'true';
        },
        minLength: 32,
        description: 'Shared key for edge bridge authentication',
      },
      
      {
        name: 'Recording Engine Shared Key',
        envVar: 'RECORDING_ENGINE_SHARED_KEY',
        envVarFile: 'RECORDING_ENGINE_SHARED_KEY_FILE',
        required: 'conditional',
        condition: () => !!process.env.RECORDING_ENGINE_URL,
        minLength: 32,
        description: 'Shared key for recording engine API authentication',
      },
      
      {
        name: 'Analytics Engine Shared Key',
        envVar: 'ANALYTICS_ENGINE_SHARED_KEY',
        envVarFile: 'ANALYTICS_ENGINE_SHARED_KEY_FILE',
        required: 'conditional',
        condition: () => !!process.env.ANALYTICS_ENGINE_URL,
        minLength: 32,
        description: 'Shared key for analytics engine API authentication',
      },
      
      {
        name: 'Analytics Source Shared Key',
        envVar: 'ANALYTICS_SOURCE_SHARED_KEY',
        envVarFile: 'ANALYTICS_SOURCE_SHARED_KEY_FILE',
        required: 'conditional',
        condition: () => !!process.env.ANALYTICS_ENGINE_URL,
        minLength: 32,
        description: 'Shared key for analytics source authentication',
      },
      
      {
        name: 'Federation Shared Key',
        envVar: 'FEDERATION_SHARED_KEY',
        envVarFile: 'FEDERATION_SHARED_KEY_FILE',
        required: 'conditional',
        condition: () => {
          const peers = process.env.FEDERATION_PEER_URLS;
          return !!(peers && peers.trim().length > 0);
        },
        minLength: 32,
        description: 'Shared key for federation peer authentication',
      },
      
      // Report system
      {
        name: 'Report Download Secret',
        envVar: 'REPORT_DOWNLOAD_SECRET',
        envVarFile: 'REPORT_DOWNLOAD_SECRET_FILE',
        required: 'production',
        minLength: 32,
        description: 'Secret for report download token generation',
      },
      
      {
        name: 'Report Worker Shared Key',
        envVar: 'REPORT_WORKER_SHARED_KEY',
        envVarFile: 'REPORT_WORKER_SHARED_KEY_FILE',
        required: 'conditional',
        condition: () => {
          const workerEnabled = process.env.REPORT_WORKER_ENABLED;
          return workerEnabled === 'true';
        },
        minLength: 32,
        description: 'Shared key for report worker authentication',
      },
      
      // Edge update signing
      {
        name: 'Edge Update Signing Private Key',
        envVar: 'EDGE_UPDATE_SIGNING_PRIVATE_KEY',
        envVarFile: 'EDGE_UPDATE_SIGNING_PRIVATE_KEY_FILE',
        required: 'conditional',
        condition: () => {
          const updateUrl = process.env.EDGE_UPDATE_MANIFEST_URL;
          return !!(updateUrl && updateUrl.trim().length > 0);
        },
        minLength: 64,
        description: 'Private key for signing edge agent updates',
      },
      
      // Cloudflare (when tunnel management required)
      {
        name: 'Cloudflare API Token',
        envVar: 'CLOUDFLARE_API_TOKEN',
        envVarFile: 'CLOUDFLARE_API_TOKEN_FILE',
        required: 'conditional',
        condition: () => process.env.EDGE_MANAGED_TUNNEL_REQUIRED === 'true',
        minLength: 20,
        description: 'Cloudflare API token for tunnel management',
      },
      
      // Encryption keys (if encryption enabled)
      {
        name: 'Encryption Master Key',
        envVar: 'ENCRYPTION_MASTER_KEY',
        envVarFile: 'ENCRYPTION_MASTER_KEY_FILE',
        required: 'conditional',
        condition: () => process.env.ENCRYPTION_ENABLED === 'true',
        minLength: 64,
        description: 'Master encryption key for data at rest',
      },
      
      // Object storage credentials
      {
        name: 'S3 Access Key',
        envVar: 'S3_ACCESS_KEY_ID',
        envVarFile: 'S3_ACCESS_KEY_ID_FILE',
        required: 'conditional',
        condition: () => {
          const backend = process.env.STORAGE_BACKEND;
          return backend === 's3' || backend === 'minio';
        },
        minLength: 16,
        description: 'S3/MinIO access key ID',
      },
      
      {
        name: 'S3 Secret Key',
        envVar: 'S3_SECRET_ACCESS_KEY',
        envVarFile: 'S3_SECRET_ACCESS_KEY_FILE',
        required: 'conditional',
        condition: () => {
          const backend = process.env.STORAGE_BACKEND;
          return backend === 's3' || backend === 'minio';
        },
        minLength: 32,
        description: 'S3/MinIO secret access key',
      },
    ];
  }

  /**
   * Validate all secrets
   */
  validate(): SecretValidationResult {
    const errors: SecretValidationResult['errors'] = [];
    const warnings: SecretValidationResult['warnings'] = [];
    
    const requirements = this.getSecretRequirements();
    
    for (const requirement of requirements) {
      // Check if this secret is required
      const isRequired = this.isSecretRequired(requirement);
      
      if (!isRequired) {
        continue;
      }
      
      // Get secret value (try both direct env var and _FILE variant)
      const value = this.getSecretValue(requirement);
      
      // Check if missing
      if (!value || value.trim().length === 0) {
        errors.push({
          secret: requirement.name,
          issue: `${requirement.envVar} is required but not configured. ${requirement.description}`,
          severity: 'fatal',
        });
        continue;
      }
      
      // Check minimum length
      if (requirement.minLength && value.length < requirement.minLength) {
        errors.push({
          secret: requirement.name,
          issue: `${requirement.envVar} must be at least ${requirement.minLength} characters (current: ${value.length})`,
          severity: 'fatal',
        });
      }
      
      // Check forbidden patterns (development defaults)
      for (const pattern of this.FORBIDDEN_PATTERNS) {
        if (pattern.test(value)) {
          errors.push({
            secret: requirement.name,
            issue: `${requirement.envVar} contains forbidden pattern "${pattern.source}". This appears to be a development/test secret.`,
            severity: 'fatal',
          });
          break;
        }
      }
      
      // Check custom pattern
      if (requirement.pattern && !requirement.pattern.test(value)) {
        errors.push({
          secret: requirement.name,
          issue: `${requirement.envVar} does not match required format`,
          severity: 'fatal',
        });
      }
      
      // Check entropy (basic check - no repeated characters)
      if (value.length >= 16 && this.hasLowEntropy(value)) {
        warnings.push({
          secret: requirement.name,
          message: `${requirement.envVar} appears to have low entropy (repeated characters). Consider using a cryptographically secure random generator.`,
        });
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Check if a secret is required in current environment
   */
  private isSecretRequired(requirement: SecretRequirement): boolean {
    if (requirement.required === 'always') {
      return true;
    }
    
    if (requirement.required === 'production') {
      return this.isProduction;
    }
    
    if (requirement.required === 'conditional') {
      return requirement.condition ? requirement.condition() : false;
    }
    
    return false;
  }

  /**
   * Get secret value from environment (try both direct and _FILE)
   */
  private getSecretValue(requirement: SecretRequirement): string | undefined {
    // Try direct env var
    const direct = process.env[requirement.envVar];
    if (direct) {
      return direct;
    }
    
    // Try _FILE variant (already handled by config loader in most cases)
    if (requirement.envVarFile) {
      const fromFile = process.env[requirement.envVarFile];
      if (fromFile) {
        return fromFile;
      }
    }
    
    return undefined;
  }

  /**
   * Basic entropy check - detect obviously weak secrets
   */
  private hasLowEntropy(value: string): boolean {
    // Check for repeated characters
    const uniqueChars = new Set(value).size;
    const ratio = uniqueChars / value.length;
    
    // If less than 40% unique characters, likely low entropy
    if (ratio < 0.4) {
      return true;
    }
    
    // Check for sequential patterns (aaa, 111, abc, 123, etc.)
    for (let i = 0; i < value.length - 2; i++) {
      const a = value.charCodeAt(i);
      const b = value.charCodeAt(i + 1);
      const c = value.charCodeAt(i + 2);
      
      // Same character repeated
      if (a === b && b === c) {
        return true;
      }
      
      // Sequential characters
      if (b === a + 1 && c === b + 1) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Validate and throw on error (for startup validation)
   */
  validateOrThrow(): void {
    const result = this.validate();
    
    if (!result.valid) {
      const errorMessage = this.formatErrors(result);
      throw new Error(errorMessage);
    }
    
    // Log warnings but don't fail
    if (result.warnings.length > 0) {
      console.warn('[ProductionSecretValidator] ⚠️  SECRET WARNINGS:');
      for (const warning of result.warnings) {
        console.warn(`  - ${warning.secret}: ${warning.message}`);
      }
    }
  }

  /**
   * Format errors for display
   */
  private formatErrors(result: SecretValidationResult): string {
    const lines = [
      '❌ PRODUCTION SECRET VALIDATION FAILED',
      '',
      'Sentinel Grid cannot start with missing or insecure secrets in production mode.',
      '',
      'Errors:',
    ];
    
    for (const error of result.errors) {
      lines.push(`  ❌ ${error.secret}: ${error.issue}`);
    }
    
    if (result.warnings.length > 0) {
      lines.push('');
      lines.push('Warnings:');
      for (const warning of result.warnings) {
        lines.push(`  ⚠️  ${warning.secret}: ${warning.message}`);
      }
    }
    
    lines.push('');
    lines.push('To fix:');
    lines.push('  1. Generate cryptographically secure secrets:');
    lines.push('     node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    lines.push('  2. Set required environment variables or use _FILE variants');
    lines.push('  3. Never use development defaults in production');
    lines.push('');
    lines.push('For more information, see: docs/security/secret-management.md');
    
    return lines.join('\n');
  }
}

/**
 * Singleton instance
 */
let instance: ProductionSecretValidator | null = null;

export function getProductionSecretValidator(): ProductionSecretValidator {
  if (!instance) {
    instance = new ProductionSecretValidator();
  }
  return instance;
}

/**
 * Convenience function for startup validation
 */
export function validateProductionSecrets(): void {
  const validator = getProductionSecretValidator();
  validator.validateOrThrow();
}

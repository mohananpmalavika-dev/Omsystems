"use strict";
/**
 * HSM Provider State Management
 * Explicit state tracking to prevent production deployment with placeholder crypto
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HSMProviderState = void 0;
exports.determineHSMState = determineHSMState;
exports.validateHSMStateOnStartup = validateHSMStateOnStartup;
var HSMProviderState;
(function (HSMProviderState) {
    /** No HSM provider configured - crypto operations will fail */
    HSMProviderState["HSM_PROVIDER_UNAVAILABLE"] = "HSM_PROVIDER_UNAVAILABLE";
    /** Simulation mode - NOT FOR PRODUCTION - uses software crypto only */
    HSMProviderState["HSM_SIMULATION"] = "HSM_SIMULATION";
    /** Production mode - real HSM or KMS integration active */
    HSMProviderState["HSM_PRODUCTION"] = "HSM_PRODUCTION";
})(HSMProviderState || (exports.HSMProviderState = HSMProviderState = {}));
/**
 * Determine HSM state based on configuration and environment
 */
function determineHSMState(config, env) {
    var info = {
        state: HSMProviderState.HSM_PROVIDER_UNAVAILABLE,
        simulationAllowed: env.HSM_ALLOW_SIMULATION === 'true',
        productionReady: false,
        warnings: [],
        errors: []
    };
    // Check if this is a production environment
    var isProduction = env.NODE_ENV === 'production' || env.ENVIRONMENT === 'production';
    // AWS CloudHSM / KMS
    if (config.type === 'aws_cloudhsm' && env.AWS_KMS_ENABLED === 'true') {
        if (!env.AWS_REGION) {
            info.errors.push('AWS_REGION not configured for AWS CloudHSM/KMS');
            return info;
        }
        info.state = HSMProviderState.HSM_PRODUCTION;
        info.provider = 'AWS CloudHSM / KMS';
        info.endpoint = "KMS in ".concat(env.AWS_REGION);
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
function validateHSMStateOnStartup(stateInfo) {
    var isProduction = process.env.NODE_ENV === 'production' || process.env.ENVIRONMENT === 'production';
    // Log all warnings
    for (var _i = 0, _a = stateInfo.warnings; _i < _a.length; _i++) {
        var warning = _a[_i];
        console.warn("[HSM] ".concat(warning));
    }
    // Log all errors
    for (var _b = 0, _c = stateInfo.errors; _b < _c.length; _b++) {
        var error = _c[_b];
        console.error("[HSM] ERROR: ".concat(error));
    }
    // Fail fast in production with invalid configuration
    if (isProduction) {
        if (!stateInfo.productionReady) {
            throw new Error("HSM service cannot start in production mode. State: ".concat(stateInfo.state, ". ") +
                "Production requires: AWS_KMS_ENABLED=true, Azure Key Vault endpoint, or PKCS#11 library path. " +
                "Errors: ".concat(stateInfo.errors.join(', ')));
        }
        if (stateInfo.state === HSMProviderState.HSM_SIMULATION) {
            throw new Error("HSM service is in SIMULATION mode in production environment. " +
                "This is not allowed unless you explicitly set HSM_ALLOW_SIMULATION=true " +
                "and understand this provides NO hardware security.");
        }
    }
    // In non-production, just log the state
    console.log("[HSM] Provider State: ".concat(stateInfo.state));
    console.log("[HSM] Provider: ".concat(stateInfo.provider || 'None'));
    console.log("[HSM] Production Ready: ".concat(stateInfo.productionReady));
}

// Minimal production secret validator (ESM)
// Mirrors key checks from the TypeScript validator to provide
// a runtime-safe implementation when the compiled TS module
// is not available at runtime.

export function validateProductionSecrets() {
  const isProduction = (process.env.NODE_ENV || 'development') === 'production';
  if (!isProduction) return;

  const errors = [];

  const jwt = process.env.JWT_SECRET;
  if (!jwt || jwt.length < 64) {
    errors.push('JWT_SECRET is required in production and must be at least 64 characters.');
  }

  const db = process.env.DATABASE_URL;
  if (!db) {
    errors.push('DATABASE_URL is required in production.');
  }

  const reportSecret = process.env.REPORT_DOWNLOAD_SECRET;
  if (!reportSecret || reportSecret.length < 32) {
    errors.push('REPORT_DOWNLOAD_SECRET is required in production and must be at least 32 characters.');
  }

  // Conditional secrets: check if related features are enabled
  if (process.env.REPORT_WORKER_ENABLED === 'true') {
    const rw = process.env.REPORT_WORKER_SHARED_KEY;
    if (!rw || rw.length < 32) {
      errors.push('REPORT_WORKER_SHARED_KEY is required when REPORT_WORKER_ENABLED=true and must be at least 32 characters.');
    }
  }

  if ((process.env.EDGE_MANAGED_TUNNEL_REQUIRED || '') === 'true') {
    const eb = process.env.EDGE_BRIDGE_SHARED_KEY;
    if (!eb || eb.length < 32) {
      errors.push('EDGE_BRIDGE_SHARED_KEY is required when EDGE_MANAGED_TUNNEL_REQUIRED=true and must be at least 32 characters.');
    }
  }

  if (errors.length > 0) {
    const message = ['PRODUCTION SECRET VALIDATION FAILED', '', ...errors, '', 'Set required environment variables or use _FILE variants.'].join('\n');
    throw new Error(message);
  }
}

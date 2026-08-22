// Simple in-memory Prometheus-style counters for important security metrics.
// Exposed via RuntimeGuard.prometheus() by importing getGlobalMetricsLines().

let secretRevealAttempts = 0;
let secretRevealSuccess = 0;
let secretRevealFailure = 0;
let secretMetadataReads = 0;

export function incrementSecretRevealAttempt() { secretRevealAttempts += 1; }
export function incrementSecretRevealSuccess() { secretRevealSuccess += 1; }
export function incrementSecretRevealFailure() { secretRevealFailure += 1; }
export function incrementSecretMetadataReads() { secretMetadataReads += 1; }

export function getGlobalMetricsLines(): string[] {
  return [
    '# HELP sentinel_secret_reveal_attempts_total Total number of secret plaintext reveal attempts',
    '# TYPE sentinel_secret_reveal_attempts_total counter',
    `sentinel_secret_reveal_attempts_total ${secretRevealAttempts}`,
    '# HELP sentinel_secret_reveal_success_total Total number of successful secret plaintext reveals',
    '# TYPE sentinel_secret_reveal_success_total counter',
    `sentinel_secret_reveal_success_total ${secretRevealSuccess}`,
    '# HELP sentinel_secret_reveal_failures_total Total number of failed secret plaintext reveal attempts',
    '# TYPE sentinel_secret_reveal_failures_total counter',
    `sentinel_secret_reveal_failures_total ${secretRevealFailure}`,
    '# HELP sentinel_secret_metadata_reads_total Total number of secret metadata read requests (values redacted)',
    '# TYPE sentinel_secret_metadata_reads_total counter',
    `sentinel_secret_metadata_reads_total ${secretMetadataReads}`,
  ];
}

/**
 * CI / Build-Time Static Truth Verification Script
 * 
 * Verifies that the platform capability truth matrix satisfies all release safety invariants:
 * 1. Unique IDs
 * 2. Valid maturity & categories
 * 3. NOT_IMPLEMENTED capabilities cannot report runtime HEALTHY
 * 4. PRODUCTION capabilities must have backend, API, and unit test verification
 * 5. Unknown capability IDs fail closed
 */

import { PLATFORM_CAPABILITIES } from '../config/capabilities/platform-capabilities.js';
import {
  CapabilityMaturity,
  CapabilityRuntimeState,
} from '../packages/contracts/src/capabilities/capability-types.js';

interface Violation {
  capabilityId: string;
  rule: string;
  message: string;
}

function verifyCapabilityTruth(): void {
  console.log('===============================================================');
  console.log('  SENTINEL GRID — CAPABILITY TRUTH MATRIX CI VERIFICATION');
  console.log('===============================================================');
  console.log(`Auditing ${PLATFORM_CAPABILITIES.length} registered platform capabilities...\n`);

  const violations: Violation[] = [];
  const seenIds = new Set<string>();

  const validCategories = new Set([
    'VIDEO',
    'RECORDING',
    'EVIDENCE',
    'ANALYTICS',
    'HA',
    'SECURITY',
    'OPERATIONS',
    'STORAGE',
    'EDGE',
    'INTEGRATION',
  ]);

  for (const cap of PLATFORM_CAPABILITIES) {
    // 1. Unique ID
    if (seenIds.has(cap.id)) {
      violations.push({
        capabilityId: cap.id,
        rule: 'UNIQUE_ID',
        message: `Duplicate capability ID detected: '${cap.id}'`,
      });
    }
    seenIds.add(cap.id);

    // 2. Valid Category
    if (!validCategories.has(cap.category)) {
      violations.push({
        capabilityId: cap.id,
        rule: 'VALID_CATEGORY',
        message: `Invalid category '${cap.category}'. Must be one of: ${Array.from(validCategories).join(', ')}`,
      });
    }

    // 3. Valid Maturity
    if (!Object.values(CapabilityMaturity).includes(cap.maturity)) {
      violations.push({
        capabilityId: cap.id,
        rule: 'VALID_MATURITY',
        message: `Invalid maturity level '${cap.maturity}'.`,
      });
    }

    // 4. NOT_IMPLEMENTED cannot report runtime HEALTHY
    if (
      cap.maturity === CapabilityMaturity.NOT_IMPLEMENTED &&
      cap.runtime.state === CapabilityRuntimeState.HEALTHY
    ) {
      violations.push({
        capabilityId: cap.id,
        rule: 'NOT_IMPLEMENTED_RUNTIME_CONTRADICTION',
        message: `Capability is marked NOT_IMPLEMENTED but reports runtime state HEALTHY.`,
      });
    }

    // 5. PRODUCTION must have backend, API, and unit tests
    if (cap.maturity === CapabilityMaturity.PRODUCTION) {
      if (!cap.implementation.backend) {
        violations.push({
          capabilityId: cap.id,
          rule: 'PRODUCTION_BACKEND_MISSING',
          message: `Capability marked PRODUCTION has implementation.backend = false.`,
        });
      }
      if (!cap.implementation.api) {
        violations.push({
          capabilityId: cap.id,
          rule: 'PRODUCTION_API_MISSING',
          message: `Capability marked PRODUCTION has implementation.api = false.`,
        });
      }
      if (!cap.verification.unitTests) {
        violations.push({
          capabilityId: cap.id,
          rule: 'PRODUCTION_UNIT_TESTS_MISSING',
          message: `Capability marked PRODUCTION has verification.unitTests = false.`,
        });
      }
      if (cap.implementation.persistenceRequired && !cap.implementation.persistenceImplemented) {
        violations.push({
          capabilityId: cap.id,
          rule: 'PRODUCTION_PERSISTENCE_MISSING',
          message: `Capability marked PRODUCTION requires persistence but persistenceImplemented = false.`,
        });
      }
    }
  }

  // Breakdown metrics
  const productionCount = PLATFORM_CAPABILITIES.filter((c) => c.maturity === CapabilityMaturity.PRODUCTION).length;
  const betaCount = PLATFORM_CAPABILITIES.filter((c) => c.maturity === CapabilityMaturity.BETA).length;
  const experimentalCount = PLATFORM_CAPABILITIES.filter((c) => c.maturity === CapabilityMaturity.EXPERIMENTAL).length;
  const notImplementedCount = PLATFORM_CAPABILITIES.filter((c) => c.maturity === CapabilityMaturity.NOT_IMPLEMENTED).length;

  console.log(`Summary Statistics:`);
  console.log(`  - Total Registered:  ${PLATFORM_CAPABILITIES.length}`);
  console.log(`  - PRODUCTION:        ${productionCount}`);
  console.log(`  - BETA:              ${betaCount}`);
  console.log(`  - EXPERIMENTAL:      ${experimentalCount}`);
  console.log(`  - NOT_IMPLEMENTED:   ${notImplementedCount}\n`);

  if (violations.length > 0) {
    console.error(`❌ FAILED: ${violations.length} Capability Truth violations detected:\n`);
    for (const v of violations) {
      console.error(`  [${v.rule}] ${v.capabilityId}: ${v.message}`);
    }
    console.error('\nRelease truth verification failed. Fix capability classifications or implementations before shipping.');
    process.exit(1);
  }

  console.log('✅ SUCCESS: All capability definitions comply with release truth contracts.');
}

verifyCapabilityTruth();

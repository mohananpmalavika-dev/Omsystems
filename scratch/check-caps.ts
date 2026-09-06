import { PLATFORM_CAPABILITIES } from '../config/capabilities/platform-capabilities.js';
import { CapabilityMaturity } from '../packages/contracts/src/capabilities/capability-types.js';

const prodCaps = PLATFORM_CAPABILITIES.filter(c => c.maturity === CapabilityMaturity.PRODUCTION);
console.log(`Total PRODUCTION: ${prodCaps.length}`);
for (const c of prodCaps) {
  console.log(`${c.id} | ${c.category} | ${c.name}`);
}

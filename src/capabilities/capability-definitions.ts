/**
 * Capability Definitions Adapter
 * 
 * Re-exports the authoritative platform capabilities from config/capabilities/platform-capabilities.ts
 */

import { PLATFORM_CAPABILITIES } from './platform-capabilities.js';
import type { PlatformCapability } from '../../packages/contracts/src/capabilities/capability-types.js';

export { PLATFORM_CAPABILITIES };

/**
 * @deprecated Use PLATFORM_CAPABILITIES instead
 */
export const SYSTEM_CAPABILITIES: PlatformCapability[] = PLATFORM_CAPABILITIES;

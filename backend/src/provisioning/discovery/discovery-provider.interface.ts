/**
 * Discovery Provider Interface
 * Common interface for camera/device discovery implementations
 */

import { DiscoveredCamera } from '../models/provisioning-result';
import { DiscoveryContext } from '../models/provisioning-context';

/**
 * Base interface for device discovery providers
 */
export interface DeviceDiscoveryProvider {
  /**
   * Provider name for identification
   */
  readonly name: string;

  /**
   * Discover devices on the network
   */
  discover(context: DiscoveryContext): Promise<DiscoveredCamera[]>;

  /**
   * Check if provider is available on the system
   */
  isAvailable(): Promise<boolean>;
}

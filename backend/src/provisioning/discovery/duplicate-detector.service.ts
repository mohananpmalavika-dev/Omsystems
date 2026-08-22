/**
 * Duplicate Detector Service
 * Identifies and removes duplicate camera discoveries
 */

import { DiscoveredCamera, DuplicateCamera } from '../models/provisioning-result';

export class DuplicateDetectorService {
  /**
   * Remove duplicates from discovered cameras
   */
  removeDuplicates(cameras: DiscoveredCamera[]): {
    unique: DiscoveredCamera[];
    duplicates: DuplicateCamera[];
  } {
    const seen = new Map<string, DiscoveredCamera>();
    const duplicates: DuplicateCamera[] = [];

    for (const camera of cameras) {
      const identity = this.getDeviceIdentity(camera);

      if (seen.has(identity)) {
        const existing = seen.get(identity)!;
        duplicates.push({
          ipAddress: camera.ipAddress,
          identity,
          reason: this.getDuplicateReason(existing, camera),
        });
      } else {
        seen.set(identity, camera);
      }
    }

    return {
      unique: Array.from(seen.values()),
      duplicates,
    };
  }

  /**
   * Get stable device identity
   */
  private getDeviceIdentity(camera: DiscoveredCamera): string {
    // Priority order for identity:
    // 1. ONVIF endpoint UUID (most stable)
    // 2. Serial number
    // 3. MAC address
    // 4. Vendor + model + serial combination
    // 5. IP address (least stable, last resort)

    if (camera.endpointReference) {
      return `onvif:${camera.endpointReference}`;
    }

    if (camera.serialNumber) {
      return `serial:${camera.serialNumber}`;
    }

    if (camera.macAddress) {
      return `mac:${this.normalizeMac(camera.macAddress)}`;
    }

    if (camera.vendor && camera.model && camera.serialNumber) {
      return `composite:${camera.vendor}:${camera.model}:${camera.serialNumber}`;
    }

    // Last resort: IP address
    return `ip:${camera.ipAddress}`;
  }

  /**
   * Get reason for duplicate detection
   */
  private getDuplicateReason(
    existing: DiscoveredCamera,
    duplicate: DiscoveredCamera
  ): string {
    if (
      existing.endpointReference &&
      existing.endpointReference === duplicate.endpointReference
    ) {
      return 'Same ONVIF endpoint reference';
    }

    if (
      existing.serialNumber &&
      existing.serialNumber === duplicate.serialNumber
    ) {
      return 'Same serial number';
    }

    if (
      existing.macAddress &&
      duplicate.macAddress &&
      this.normalizeMac(existing.macAddress) ===
        this.normalizeMac(duplicate.macAddress)
    ) {
      return 'Same MAC address';
    }

    if (existing.ipAddress === duplicate.ipAddress) {
      return 'Same IP address';
    }

    return 'Multiple discovery sources';
  }

  /**
   * Normalize MAC address format
   */
  private normalizeMac(mac: string): string {
    return mac
      .toUpperCase()
      .replace(/[:-]/g, '')
      .replace(/(.{2})/g, '$1:')
      .slice(0, -1);
  }

  /**
   * Merge information from duplicate discoveries
   */
  mergeDiscoveryInfo(cameras: DiscoveredCamera[]): DiscoveredCamera {
    if (cameras.length === 0) {
      throw new Error('Cannot merge empty camera list');
    }

    if (cameras.length === 1) {
      return cameras[0];
    }

    // Use first camera as base
    const merged = { ...cameras[0] };

    // Merge information from other discoveries
    for (let i = 1; i < cameras.length; i++) {
      const camera = cameras[i];

      // Prefer ONVIF discovery source
      if (camera.discoverySource === 'onvif' && merged.discoverySource !== 'onvif') {
        merged.discoverySource = 'onvif';
      }

      // Fill in missing fields
      if (!merged.vendor && camera.vendor) {
        merged.vendor = camera.vendor;
      }
      if (!merged.model && camera.model) {
        merged.model = camera.model;
      }
      if (!merged.serialNumber && camera.serialNumber) {
        merged.serialNumber = camera.serialNumber;
      }
      if (!merged.macAddress && camera.macAddress) {
        merged.macAddress = camera.macAddress;
      }
      if (!merged.firmwareVersion && camera.firmwareVersion) {
        merged.firmwareVersion = camera.firmwareVersion;
      }

      // Merge service URLs
      if (camera.serviceUrls) {
        merged.serviceUrls = [
          ...(merged.serviceUrls || []),
          ...camera.serviceUrls,
        ];
        // Remove duplicates
        merged.serviceUrls = Array.from(new Set(merged.serviceUrls));
      }

      // Merge scopes
      if (camera.scopes) {
        merged.scopes = [...(merged.scopes || []), ...camera.scopes];
        merged.scopes = Array.from(new Set(merged.scopes));
      }

      // Use best fingerprint (highest confidence)
      if (
        camera.fingerprint &&
        (!merged.fingerprint ||
          camera.fingerprint.confidence > merged.fingerprint.confidence)
      ) {
        merged.fingerprint = camera.fingerprint;
      }
    }

    return merged;
  }
}

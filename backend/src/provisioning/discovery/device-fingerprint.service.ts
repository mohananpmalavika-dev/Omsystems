/**
 * Device Fingerprint Service
 * Identifies device types and validates they are cameras
 */

import {
  DeviceFingerprint,
  FingerprintEvidence,
  DiscoveredCamera,
} from '../models/provisioning-result';

export class DeviceFingerprintService {
  /**
   * Fingerprint a single device
   */
  async fingerprint(device: DiscoveredCamera): Promise<DeviceFingerprint> {
    const evidence: FingerprintEvidence[] = [];
    let confidence = 0;
    let deviceType: DeviceFingerprint['type'] = 'unknown';
    let vendor = device.vendor;
    let model = device.model;

    // Evidence from ONVIF discovery
    if (device.discoverySource === 'onvif') {
      evidence.push({
        source: 'onvif',
        value: 'WS-Discovery response received',
      });
      confidence += 0.3;

      // Check scopes for device type
      if (device.scopes) {
        for (const scope of device.scopes) {
          if (
            scope.includes('NetworkVideoTransmitter') ||
            scope.includes('VideoEncoder')
          ) {
            evidence.push({
              source: 'onvif',
              value: 'NetworkVideoTransmitter scope',
            });
            deviceType = 'camera';
            confidence += 0.4;
          }

          if (scope.includes('NVR') || scope.includes('Recorder')) {
            evidence.push({
              source: 'onvif',
              value: 'NVR/Recorder scope',
            });
            deviceType = 'nvr';
            confidence += 0.3;
          }
        }
      }
    }

    // Evidence from service URLs
    if (device.serviceUrls) {
      const hasRtsp = device.serviceUrls.some(url => url.includes('rtsp://'));
      if (hasRtsp) {
        evidence.push({
          source: 'protocol',
          value: 'RTSP service available',
        });
        deviceType = deviceType === 'unknown' ? 'camera' : deviceType;
        confidence += 0.2;
      }

      const hasOnvifPath = device.serviceUrls.some(
        url => url.includes('/onvif/') || url.includes('onvif_device_service')
      );
      if (hasOnvifPath) {
        evidence.push({
          source: 'http',
          value: 'ONVIF device service path detected',
        });
        confidence += 0.15;
      }
    }

    // Evidence from vendor identification
    if (device.vendor) {
      const knownCameraVendors = [
        'Axis',
        'Hikvision',
        'Dahua',
        'Hanwha',
        'Bosch',
        'Sony',
        'Panasonic',
        'Uniview',
        'Vivotek',
        'Geovision',
      ];

      if (knownCameraVendors.includes(device.vendor)) {
        evidence.push({
          source: 'vendor',
          value: `Known camera vendor: ${device.vendor}`,
        });
        deviceType = deviceType === 'unknown' ? 'camera' : deviceType;
        confidence += 0.25;
      }
    }

    // Evidence from firmware version patterns
    if (device.firmwareVersion) {
      evidence.push({
        source: 'firmware',
        value: `Firmware: ${device.firmwareVersion}`,
      });
      confidence += 0.05;
    }

    // Evidence from serial number
    if (device.serialNumber) {
      evidence.push({
        source: 'serial',
        value: `Serial number present`,
      });
      confidence += 0.05;
    }

    // Evidence from MAC address (if available)
    if (device.macAddress) {
      const vendorFromMac = this.getVendorFromMac(device.macAddress);
      if (vendorFromMac && !vendor) {
        vendor = vendorFromMac;
        evidence.push({
          source: 'mac',
          value: `MAC OUI: ${vendorFromMac}`,
        });
        confidence += 0.1;
      }
    }

    // Determine protocols
    const protocols: string[] = [];
    if (device.discoverySource === 'onvif') {
      protocols.push('onvif');
    }
    if (device.serviceUrls?.some(url => url.includes('rtsp://'))) {
      protocols.push('rtsp');
    }
    if (device.serviceUrls?.some(url => url.includes('http'))) {
      protocols.push('http');
    }

    // Cap confidence at 1.0
    confidence = Math.min(confidence, 1.0);

    return {
      type: deviceType,
      vendor,
      model,
      serialNumber: device.serialNumber,
      protocols,
      confidence,
      evidence,
    };
  }

  /**
   * Fingerprint multiple devices
   */
  async fingerprintAll(
    devices: DiscoveredCamera[]
  ): Promise<DiscoveredCamera[]> {
    const results = await Promise.all(
      devices.map(async device => ({
        ...device,
        fingerprint: await this.fingerprint(device),
      }))
    );

    return results;
  }

  /**
   * Filter devices to only cameras with sufficient confidence
   */
  filterCameras(
    devices: DiscoveredCamera[],
    minimumConfidence = 0.7
  ): DiscoveredCamera[] {
    return devices.filter(
      device =>
        device.fingerprint &&
        device.fingerprint.type === 'camera' &&
        device.fingerprint.confidence >= minimumConfidence
    );
  }

  /**
   * Get vendor from MAC address OUI
   */
  private getVendorFromMac(mac: string): string | undefined {
    const oui = mac.substring(0, 8).toUpperCase().replace(/:/g, '-');

    // Common camera vendor OUIs
    const ouiMap: Record<string, string> = {
      '00-40-8C': 'Axis',
      'AC-CC-8E': 'Axis',
      'B8-A4-4F': 'Axis',
      '4C-0B-BE': 'Hikvision',
      '44-19-B6': 'Hikvision',
      'BC-AD-28': 'Hikvision',
      'C0-56-E3': 'Dahua',
      '08-57-00': 'Dahua',
      '6C-4A-8E': 'Dahua',
      '00-11-32': 'Sony',
      '94-1B-0A': 'Hanwha',
      '00-0F-7C': 'Bosch',
    };

    return ouiMap[oui];
  }
}

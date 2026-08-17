import type {
  BranchConfiguration,
  ChangeRisk,
  ConfigurationDifference,
} from '../domain/signed-config.types.js';

export interface ValidationIssue {
  field: string;
  message: string;
  severity: 'ERROR' | 'WARNING';
}

export interface ValidationResult {
  valid: boolean;
  riskLevel: ChangeRisk;
  issues: ValidationIssue[];
  estimatedBandwidthMbps: number;
  estimatedStorageDailyGb: number;
  requiresDualApproval: boolean;
}

export class ConfigValidatorService {
  /**
   * Run full static and semantic validation and classify change risk.
   */
  validate(
    config: BranchConfiguration,
    parentConfig?: BranchConfiguration
  ): ValidationResult {
    const issues: ValidationIssue[] = [];

    // 1. Static Constraints Validation
    // A. Network
    if (!config.network.dnsServers || config.network.dnsServers.length === 0) {
      issues.push({ field: 'network.dnsServers', message: 'At least one DNS server is required', severity: 'ERROR' });
    }
    if (!config.network.ntpServers || config.network.ntpServers.length === 0) {
      issues.push({ field: 'network.ntpServers', message: 'At least one NTP server is required for timestamp integrity', severity: 'ERROR' });
    }
    if (!config.network.gatewayIp) {
      issues.push({ field: 'network.gatewayIp', message: 'Gateway IP is required', severity: 'ERROR' });
    }

    // B. Cameras
    const seenIps = new Set<string>();
    const seenChannels = new Set<number>();

    for (const cam of config.cameras) {
      if (cam.bitrateKbps < 128 || cam.bitrateKbps > 16384) {
        issues.push({
          field: `cameras.${cam.id}.bitrateKbps`,
          message: `Camera ${cam.name} bitrate ${cam.bitrateKbps} kbps is outside valid range (128 - 16384)`,
          severity: 'ERROR',
        });
      }
      if (cam.fps < 1 || cam.fps > 60) {
        issues.push({
          field: `cameras.${cam.id}.fps`,
          message: `Camera ${cam.name} framerate ${cam.fps} FPS is outside valid range (1 - 60)`,
          severity: 'ERROR',
        });
      }
      if (seenIps.has(cam.ip)) {
        issues.push({
          field: `cameras.${cam.id}.ip`,
          message: `Duplicate camera IP address detected: ${cam.ip}`,
          severity: 'ERROR',
        });
      }
      seenIps.add(cam.ip);

      if (seenChannels.has(cam.channel)) {
        issues.push({
          field: `cameras.${cam.id}.channel`,
          message: `Duplicate channel number detected: ${cam.channel}`,
          severity: 'ERROR',
        });
      }
      seenChannels.add(cam.channel);

      // Secret Reference Integrity (Must be opaque URI, never plaintext password)
      if (!cam.credentialRef || !cam.credentialRef.startsWith('secret://')) {
        issues.push({
          field: `cameras.${cam.id}.credentialRef`,
          message: `Camera ${cam.name} credential must be an opaque secret URI (secret://...), plaintext passwords forbidden in signed packages`,
          severity: 'ERROR',
        });
      }
    }

    // C. Retention Banking Standards
    if (config.retention.continuousDays < 30) {
      issues.push({
        field: 'retention.continuousDays',
        message: 'Continuous retention must meet bank policy minimum of 30 days (default 90 days)',
        severity: 'ERROR',
      });
    }

    // D. Security
    if (!config.security.enforceSignedConfig) {
      issues.push({
        field: 'security.enforceSignedConfig',
        message: 'Enforce signed configuration must remain enabled in production',
        severity: 'WARNING',
      });
    }

    // 2. Semantic Capacity Validation
    // Calculate total streaming bandwidth (Mbps)
    const totalCameraKbps = config.cameras
      .filter((c) => c.enabled)
      .reduce((sum, c) => sum + c.bitrateKbps, 0);
    const estimatedBandwidthMbps = Number((totalCameraKbps / 1000).toFixed(2));

    if (config.network.uplinkBandwidthMbps && estimatedBandwidthMbps > config.network.uplinkBandwidthMbps) {
      issues.push({
        field: 'network.uplinkBandwidthMbps',
        message: `Estimated aggregate camera bandwidth (${estimatedBandwidthMbps} Mbps) exceeds branch uplink capacity (${config.network.uplinkBandwidthMbps} Mbps)`,
        severity: 'WARNING',
      });
    }

    // Calculate daily storage requirement in GB (Mbps * 3600 * 24 / 8 / 1024)
    const dailyStorageGb = Number(((estimatedBandwidthMbps * 86400) / 8 / 1024).toFixed(2));

    // 3. Risk Classification Scoring
    const riskLevel = this.classifyChangeRisk(config, parentConfig);
    const requiresDualApproval = riskLevel === 'CRITICAL';

    const hasErrors = issues.some((i) => i.severity === 'ERROR');

    return {
      valid: !hasErrors,
      riskLevel,
      issues,
      estimatedBandwidthMbps,
      estimatedStorageDailyGb: dailyStorageGb,
      requiresDualApproval,
    };
  }

  /**
   * Classify risk level based on differences from previous version.
   */
  classifyChangeRisk(
    newConfig: BranchConfiguration,
    parentConfig?: BranchConfiguration
  ): ChangeRisk {
    if (!parentConfig) {
      return 'HIGH'; // Initial baseline configuration
    }

    // Critical checks: Retention reduction, disabling recording, security downgrade
    if (newConfig.retention.continuousDays < parentConfig.retention.continuousDays) {
      return 'CRITICAL'; // Evidence retention reduction is highest risk
    }
    if (newConfig.recorder.recordingMode === 'DISABLED' && parentConfig.recorder.recordingMode !== 'DISABLED') {
      return 'CRITICAL';
    }
    if (newConfig.security.minTlsVersion !== parentConfig.security.minTlsVersion && newConfig.security.minTlsVersion === 'TLS1.2') {
      return 'CRITICAL';
    }

    // High checks: NTP server change, Network subnet/gateway, Recorder IP
    if (newConfig.recorder.ntpServer !== parentConfig.recorder.ntpServer) {
      return 'HIGH';
    }
    if (newConfig.network.gatewayIp !== parentConfig.network.gatewayIp) {
      return 'HIGH';
    }
    if (newConfig.recorder.managementIp !== parentConfig.recorder.managementIp) {
      return 'HIGH';
    }

    // Medium checks: Camera bitrates, FPS, codecs, analytics thresholds
    const hasCameraDiff = newConfig.cameras.some((cam, idx) => {
      const parentCam = parentConfig.cameras[idx];
      if (!parentCam) return true;
      return (
        cam.bitrateKbps !== parentCam.bitrateKbps ||
        cam.fps !== parentCam.fps ||
        cam.codec !== parentCam.codec ||
        cam.enabled !== parentCam.enabled
      );
    });
    if (hasCameraDiff) return 'MEDIUM';

    // Low checks: Names, labels, non-functional adjustments
    return 'LOW';
  }
}

export const configValidatorService = new ConfigValidatorService();

/**
 * Provisioning Health Service
 * Evaluates overall branch health based on all provisioning components
 */

import {
  BranchHealthResult,
  ComponentHealth,
  HealthIssue,
} from '../models/provisioning-result';
import { ProvisioningContext } from '../models/provisioning-context';
import { HealthPolicyService } from './health-policy.service';

export class ProvisioningHealthService {
  constructor(private policyService: HealthPolicyService) {}

  /**
   * Evaluate overall branch health
   */
  async evaluate(context: ProvisioningContext): Promise<BranchHealthResult> {
    // Evaluate each component
    const network = this.evaluateNetwork(context);
    const cameras = this.evaluateCameras(context);
    const storage = this.evaluateStorage(context);
    const recording = this.evaluateRecording(context);
    const timeSync = this.evaluateTimeSync(context);

    const components = {
      network,
      cameras,
      storage,
      recording,
      timeSync,
    };

    // Collect all issues
    const allIssues = [
      ...network.issues,
      ...cameras.issues,
      ...storage.issues,
      ...recording.issues,
      ...timeSync.issues,
    ];

    // Separate blocking issues from warnings
    const blockingIssues = allIssues.filter(issue => issue.blocking);
    const warnings = allIssues.filter(issue => !issue.blocking);

    // Calculate overall health score
    const score = this.calculateHealthScore(components);

    // Determine if healthy (no blocking issues)
    const healthy = blockingIssues.length === 0;

    return {
      healthy,
      score,
      blockingIssues,
      warnings,
      components,
    };
  }

  /**
   * Evaluate network component health
   */
  private evaluateNetwork(context: ProvisioningContext): ComponentHealth {
    const issues: HealthIssue[] = [];
    const networkResult = context.network?.data;
    const policy = context.config.health.network;

    if (!networkResult) {
      issues.push({
        code: 'NETWORK_NOT_PROVISIONED',
        severity: 'critical',
        component: 'network',
        message: 'Network has not been provisioned',
        blocking: true,
        remediation: 'Complete network provisioning step',
      });

      return {
        healthy: false,
        score: 0,
        status: 'fail',
        issues,
      };
    }

    // Check gateway reachability
    if (policy.gatewayRequired && !networkResult.gatewayReachable) {
      issues.push({
        code: 'GATEWAY_UNREACHABLE',
        severity: 'critical',
        component: 'network',
        message: 'Default gateway is not reachable',
        blocking: true,
        remediation: 'Verify network configuration and gateway settings',
      });
    }

    // Check DNS
    if (policy.dnsRequired && !networkResult.dnsWorking) {
      issues.push({
        code: 'DNS_NOT_WORKING',
        severity: 'critical',
        component: 'network',
        message: 'DNS resolution is not working',
        blocking: true,
        remediation: 'Verify DNS server configuration',
      });
    }

    // Check NTP
    if (policy.ntpRequired && !networkResult.ntpWorking) {
      issues.push({
        code: 'NTP_NOT_WORKING',
        severity: 'high',
        component: 'network',
        message: 'NTP time synchronization is not working',
        blocking: true,
        remediation: 'Verify NTP server configuration and firewall rules',
      });
    }

    // Check camera subnet
    if (!networkResult.cameraSubnetReachable) {
      issues.push({
        code: 'CAMERA_SUBNET_UNREACHABLE',
        severity: 'medium',
        component: 'network',
        message: 'Camera subnet may not be reachable',
        blocking: false,
        remediation: 'Verify VLAN and routing configuration',
      });
    }

    // Check management address
    if (!networkResult.managementAddress) {
      issues.push({
        code: 'NO_MANAGEMENT_ADDRESS',
        severity: 'medium',
        component: 'network',
        message: 'No management IP address assigned',
        blocking: false,
      });
    }

    const score = this.scoreComponent(issues);
    const healthy = issues.filter(i => i.blocking).length === 0;

    return {
      healthy,
      score,
      status: healthy ? 'pass' : issues.some(i => i.severity === 'critical') ? 'fail' : 'degraded',
      issues,
      metadata: {
        gatewayReachable: networkResult.gatewayReachable,
        dnsWorking: networkResult.dnsWorking,
        ntpWorking: networkResult.ntpWorking,
        managementAddress: networkResult.managementAddress,
      },
    };
  }

  /**
   * Evaluate cameras component health
   */
  private evaluateCameras(context: ProvisioningContext): ComponentHealth {
    const issues: HealthIssue[] = [];
    const cameraResult = context.cameras?.data;
    const policy = context.config.health.cameras;

    if (!cameraResult) {
      issues.push({
        code: 'CAMERAS_NOT_DISCOVERED',
        severity: 'critical',
        component: 'cameras',
        message: 'Camera discovery has not been completed',
        blocking: true,
        remediation: 'Complete camera discovery step',
      });

      return {
        healthy: false,
        score: 0,
        status: 'fail',
        issues,
      };
    }

    // Check if any cameras were discovered
    if (cameraResult.totalDiscovered === 0) {
      issues.push({
        code: 'NO_CAMERAS_DISCOVERED',
        severity: 'critical',
        component: 'cameras',
        message: 'No cameras were discovered on the network',
        blocking: true,
        remediation: 'Verify cameras are powered on and network connectivity',
      });
    }

    // Check success rate
    if (cameraResult.totalDiscovered > 0) {
      const operationalPercent = cameraResult.successRate;

      if (operationalPercent < policy.minimumOperationalPercent) {
        issues.push({
          code: 'INSUFFICIENT_OPERATIONAL_CAMERAS',
          severity: 'high',
          component: 'cameras',
          message: `Only ${operationalPercent.toFixed(1)}% of cameras operational (minimum: ${policy.minimumOperationalPercent}%)`,
          blocking: true,
          remediation: 'Resolve authentication failures and unreachable cameras',
        });
      }
    }

    // Check authentication failures
    if (cameraResult.authenticationFailures.length > 0) {
      issues.push({
        code: 'CAMERA_AUTHENTICATION_FAILURES',
        severity: 'high',
        component: 'cameras',
        message: `${cameraResult.authenticationFailures.length} cameras failed authentication`,
        blocking: false,
        remediation: 'Verify camera credentials and update credential vault',
      });
    }

    // Check unreachable cameras
    if (cameraResult.unreachable.length > 0) {
      issues.push({
        code: 'CAMERAS_UNREACHABLE',
        severity: 'medium',
        component: 'cameras',
        message: `${cameraResult.unreachable.length} cameras are unreachable`,
        blocking: false,
        remediation: 'Verify network connectivity and camera power',
      });
    }

    // Check for default credentials (if policy enforces)
    if (policy.blockOnDefaultCredentials) {
      const camerasWithDefaults = cameraResult.imported.filter(
        c => c.defaultCredentialRemaining
      );

      if (camerasWithDefaults.length > 0) {
        issues.push({
          code: 'DEFAULT_CREDENTIALS_DETECTED',
          severity: 'critical',
          component: 'cameras',
          message: `${camerasWithDefaults.length} cameras still using default credentials`,
          blocking: true,
          remediation: 'Rotate camera credentials to secure passwords',
        });
      }
    }

    // Check stream validation
    if (policy.requireStreamValidation) {
      const unvalidatedStreams = cameraResult.imported.filter(
        c => !c.streamValidated
      );

      if (unvalidatedStreams.length > 0) {
        issues.push({
          code: 'STREAMS_NOT_VALIDATED',
          severity: 'high',
          component: 'cameras',
          message: `${unvalidatedStreams.length} camera streams not validated`,
          blocking: true,
          remediation: 'Validate RTSP streams are accessible',
        });
      }
    }

    const score = this.scoreComponent(issues);
    const healthy = issues.filter(i => i.blocking).length === 0;

    return {
      healthy,
      score,
      status: healthy ? 'pass' : issues.some(i => i.severity === 'critical') ? 'fail' : 'degraded',
      issues,
      metadata: {
        totalDiscovered: cameraResult.totalDiscovered,
        totalImported: cameraResult.totalImported,
        successRate: cameraResult.successRate,
        authFailures: cameraResult.authenticationFailures.length,
        unreachable: cameraResult.unreachable.length,
      },
    };
  }

  /**
   * Evaluate storage component health
   */
  private evaluateStorage(context: ProvisioningContext): ComponentHealth {
    const issues: HealthIssue[] = [];
    const storageResult = context.storage?.data;
    const policy = context.config.health.storage;

    if (!storageResult) {
      issues.push({
        code: 'STORAGE_NOT_PROVISIONED',
        severity: 'critical',
        component: 'storage',
        message: 'Storage has not been provisioned',
        blocking: true,
        remediation: 'Complete storage provisioning step',
      });

      return {
        healthy: false,
        score: 0,
        status: 'fail',
        issues,
      };
    }

    // Check if writable
    if (policy.writableRequired && !storageResult.writeVerified) {
      issues.push({
        code: 'STORAGE_NOT_WRITABLE',
        severity: 'critical',
        component: 'storage',
        message: 'Storage is not writable',
        blocking: true,
        remediation: 'Verify storage mount permissions and disk health',
      });
    }

    // Check retention achievability
    if (storageResult.retentionDays < policy.minimumRetentionDays) {
      issues.push({
        code: 'INSUFFICIENT_RETENTION',
        severity: 'high',
        component: 'storage',
        message: `Storage supports only ${storageResult.retentionDays} days retention (minimum: ${policy.minimumRetentionDays} days)`,
        blocking: true,
        remediation: 'Increase storage capacity or reduce retention requirement',
      });
    }

    if (!storageResult.retentionAchievable) {
      issues.push({
        code: 'RETENTION_NOT_ACHIEVABLE',
        severity: 'critical',
        component: 'storage',
        message: 'Configured retention period cannot be achieved with available storage',
        blocking: true,
        remediation: 'Add storage capacity or reduce retention days',
      });
    }

    // Check performance
    if (policy.requirePerformanceTest) {
      if (storageResult.writeMbps && storageResult.writeMbps < context.config.storage.minimumWriteMbps) {
        issues.push({
          code: 'INSUFFICIENT_WRITE_PERFORMANCE',
          severity: 'high',
          component: 'storage',
          message: `Write performance ${storageResult.writeMbps.toFixed(1)} Mbps below minimum ${context.config.storage.minimumWriteMbps} Mbps`,
          blocking: false,
          remediation: 'Upgrade storage hardware or optimize I/O configuration',
        });
      }

      if (storageResult.readMbps && storageResult.readMbps < context.config.storage.minimumReadMbps) {
        issues.push({
          code: 'INSUFFICIENT_READ_PERFORMANCE',
          severity: 'medium',
          component: 'storage',
          message: `Read performance ${storageResult.readMbps.toFixed(1)} Mbps below minimum ${context.config.storage.minimumReadMbps} Mbps`,
          blocking: false,
          remediation: 'Upgrade storage hardware or optimize I/O configuration',
        });
      }
    }

    // Check checksum validation
    if (!storageResult.checksumValid) {
      issues.push({
        code: 'STORAGE_INTEGRITY_FAILURE',
        severity: 'critical',
        component: 'storage',
        message: 'Storage integrity check failed (checksum mismatch)',
        blocking: true,
        remediation: 'Check disk health and filesystem integrity',
      });
    }

    const score = this.scoreComponent(issues);
    const healthy = issues.filter(i => i.blocking).length === 0;

    return {
      healthy,
      score,
      status: healthy ? 'pass' : issues.some(i => i.severity === 'critical') ? 'fail' : 'degraded',
      issues,
      metadata: {
        availableBytes: storageResult.availableBytes,
        requiredBytes: storageResult.requiredBytes,
        retentionDays: storageResult.retentionDays,
        retentionAchievable: storageResult.retentionAchievable,
        writeMbps: storageResult.writeMbps,
        readMbps: storageResult.readMbps,
      },
    };
  }

  /**
   * Evaluate recording component health
   */
  private evaluateRecording(context: ProvisioningContext): ComponentHealth {
    const issues: HealthIssue[] = [];
    const recordingResult = context.recording?.data;
    const policy = context.config.health.recording;

    if (!recordingResult) {
      if (policy.verifiedRequired) {
        issues.push({
          code: 'RECORDING_NOT_VERIFIED',
          severity: 'critical',
          component: 'recording',
          message: 'Recording has not been verified',
          blocking: true,
          remediation: 'Complete recording verification step',
        });

        return {
          healthy: false,
          score: 0,
          status: 'fail',
          issues,
        };
      }

      // Recording verification not required
      return {
        healthy: true,
        score: 100,
        status: 'pass',
        issues: [],
      };
    }

    // Check success rate
    if (recordingResult.successRate < policy.minimumSuccessPercent) {
      issues.push({
        code: 'RECORDING_VERIFICATION_FAILED',
        severity: 'critical',
        component: 'recording',
        message: `Recording success rate ${recordingResult.successRate.toFixed(1)}% below minimum ${policy.minimumSuccessPercent}%`,
        blocking: true,
        remediation: 'Investigate recording failures and verify storage paths',
      });
    }

    // Check for critical recording failures
    if (!recordingResult.allCriticalPassed) {
      issues.push({
        code: 'CRITICAL_RECORDING_FAILURE',
        severity: 'critical',
        component: 'recording',
        message: 'One or more critical recording tests failed',
        blocking: true,
        remediation: 'Review recording probe results and resolve failures',
      });
    }

    // Check individual probe failures
    const failedProbes = recordingResult.probes.filter(
      p => !p.recordingPersisted || !p.playbackReadable
    );

    if (failedProbes.length > 0) {
      for (const probe of failedProbes.slice(0, 3)) { // Show first 3
        issues.push({
          code: 'CAMERA_RECORDING_FAILED',
          severity: 'high',
          component: 'recording',
          message: `Recording failed for camera ${probe.cameraName}: ${probe.error || 'Unknown error'}`,
          resourceId: probe.cameraId,
          blocking: false,
          remediation: 'Verify stream URL and recording service configuration',
        });
      }
    }

    const score = this.scoreComponent(issues);
    const healthy = issues.filter(i => i.blocking).length === 0;

    return {
      healthy,
      score,
      status: healthy ? 'pass' : issues.some(i => i.severity === 'critical') ? 'fail' : 'degraded',
      issues,
      metadata: {
        totalTested: recordingResult.totalTested,
        totalPassed: recordingResult.totalPassed,
        successRate: recordingResult.successRate,
        allCriticalPassed: recordingResult.allCriticalPassed,
      },
    };
  }

  /**
   * Evaluate time synchronization health
   */
  private evaluateTimeSync(context: ProvisioningContext): ComponentHealth {
    const issues: HealthIssue[] = [];
    const cameraResult = context.cameras?.data;
    const policy = context.config.health.network;

    if (!cameraResult) {
      return {
        healthy: true,
        score: 100,
        status: 'pass',
        issues: [],
      };
    }

    // Check camera clock drift
    const camerasWithDrift = cameraResult.imported.filter(
      c => c.clockDriftSeconds !== undefined &&
           Math.abs(c.clockDriftSeconds) > policy.maximumClockDriftSeconds
    );

    if (camerasWithDrift.length > 0) {
      for (const camera of camerasWithDrift.slice(0, 3)) { // Show first 3
        issues.push({
          code: 'CAMERA_CLOCK_DRIFT',
          severity: 'high',
          component: 'timeSync',
          message: `Camera ${camera.name} has ${Math.abs(camera.clockDriftSeconds!)} seconds clock drift (maximum: ${policy.maximumClockDriftSeconds}s)`,
          resourceId: camera.cameraId,
          blocking: true,
          remediation: 'Synchronize camera time with NTP server',
        });
      }

      if (camerasWithDrift.length > 3) {
        issues.push({
          code: 'MULTIPLE_CAMERAS_CLOCK_DRIFT',
          severity: 'high',
          component: 'timeSync',
          message: `${camerasWithDrift.length} cameras have excessive clock drift`,
          blocking: true,
          remediation: 'Configure NTP on all cameras',
        });
      }
    }

    // Check NTP synchronization
    const unsynchronizedCameras = cameraResult.imported.filter(
      c => !c.ntpSynchronized
    );

    if (unsynchronizedCameras.length > 0) {
      issues.push({
        code: 'CAMERAS_NOT_NTP_SYNCHRONIZED',
        severity: 'medium',
        component: 'timeSync',
        message: `${unsynchronizedCameras.length} cameras not NTP synchronized`,
        blocking: false,
        remediation: 'Enable NTP synchronization on cameras',
      });
    }

    const score = this.scoreComponent(issues);
    const healthy = issues.filter(i => i.blocking).length === 0;

    return {
      healthy,
      score,
      status: healthy ? 'pass' : issues.some(i => i.severity === 'critical') ? 'fail' : 'degraded',
      issues,
      metadata: {
        camerasWithDrift: camerasWithDrift.length,
        unsynchronized: unsynchronizedCameras.length,
      },
    };
  }

  /**
   * Calculate overall health score
   */
  private calculateHealthScore(components: Record<string, ComponentHealth>): number {
    const weights = {
      network: 0.25,
      cameras: 0.25,
      storage: 0.25,
      recording: 0.15,
      timeSync: 0.10,
    };

    let totalScore = 0;
    let totalWeight = 0;

    for (const [key, component] of Object.entries(components)) {
      const weight = weights[key as keyof typeof weights] || 0;
      totalScore += component.score * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
  }

  /**
   * Score a component based on its issues
   */
  private scoreComponent(issues: HealthIssue[]): number {
    if (issues.length === 0) {
      return 100;
    }

    let deductions = 0;

    for (const issue of issues) {
      switch (issue.severity) {
        case 'critical':
          deductions += 40;
          break;
        case 'high':
          deductions += 20;
          break;
        case 'medium':
          deductions += 10;
          break;
        case 'low':
          deductions += 5;
          break;
      }
    }

    return Math.max(0, 100 - deductions);
  }
}

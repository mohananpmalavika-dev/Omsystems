import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { AuditRepository } from "../database/audit-repository.js";

/**
 * Audit Service - Handles health monitoring, recording verification, and audit trails
 */
export class AuditService {
  private auditRepo: AuditRepository;

  constructor(private readonly pool: Pool) {
    this.auditRepo = new AuditRepository(pool);
  }

  // ============================================================================
  // CAMERA HEALTH MONITORING
  // ============================================================================

  /**
   * Perform comprehensive camera health check
   */
  async performCameraHealthCheck(input: {
    tenantId: string;
    cameraId: string;
    branchNodeId?: string;
  }) {
    // This would integrate with actual camera monitoring
    // For now, creating a placeholder that would be called by monitoring agents

    const healthData = await this.checkCameraHealth(input.cameraId);

    // Calculate overall health status
    const overallStatus = this.calculateHealthStatus(healthData);
    const healthScore = this.calculateHealthScore(healthData);

    // Detect issues
    const issues: string[] = [];
    if (!healthData.isOnline) issues.push('Camera offline');
    if (!healthData.isRecording) issues.push('Not recording');
    if (healthData.videoLoss) issues.push('Video loss detected');
    if (healthData.frozenImage) issues.push('Frozen image detected');
    if (healthData.tamperingDetected) issues.push('Tampering detected');

    // Create health check record
    const healthCheck = await this.auditRepo.createCameraHealthCheck({
      tenantId: input.tenantId,
      cameraId: input.cameraId,
      branchNodeId: input.branchNodeId,
      checkTimestamp: new Date().toISOString(),
      ...healthData,
      overallStatus,
      healthScore,
      issuesDetected: issues,
      alertGenerated: overallStatus === 'critical' || overallStatus === 'offline',
    });

    // Refresh materialized view periodically (not on every check)
    if (Math.random() < 0.1) {
      // 10% chance to refresh
      await this.auditRepo.refreshCameraHealthLatest().catch(() => {
        // Ignore errors during concurrent refresh
      });
    }

    return healthCheck;
  }

  /**
   * Check camera health (would integrate with actual camera systems)
   */
  private async checkCameraHealth(cameraId: string) {
    // In production, this would query actual camera status via ONVIF/RTSP
    // Placeholder implementation
    return {
      isOnline: true,
      rtspAvailable: true,
      onvifAvailable: true,
      latencyMs: 45,
      packetLossPercentage: 0.2,
      currentFps: 25.0,
      currentBitrateKbps: 4096,
      resolutionWidth: 1920,
      resolutionHeight: 1080,
      videoLoss: false,
      frozenImage: false,
      blackImage: false,
      blurredImage: false,
      obstructed: false,
      tamperingDetected: false,
      cameraTime: new Date().toISOString(),
      timeOffsetSeconds: 0,
      ntpSynced: true,
      isRecording: true,
      recordingDestination: '/recordings',
      lastRecordingTime: new Date().toISOString(),
      firmwareVersion: '2.4.1',
      temperatureCelsius: 42.5,
      powerStatus: 'PoE',
    };
  }

  /**
   * Calculate overall health status from health data
   */
  private calculateHealthStatus(healthData: any): 'healthy' | 'warning' | 'degraded' | 'critical' | 'offline' | 'maintenance' {
    if (!healthData.isOnline) return 'offline';
    if (healthData.tamperingDetected || healthData.videoLoss) return 'critical';
    if (!healthData.isRecording || healthData.frozenImage || healthData.blackImage) return 'critical';
    if (healthData.blurredImage || healthData.obstructed) return 'degraded';
    if (healthData.packetLossPercentage > 5 || healthData.latencyMs > 200) return 'warning';
    if (!healthData.ntpSynced || Math.abs(healthData.timeOffsetSeconds) > 5) return 'warning';
    return 'healthy';
  }

  /**
   * Calculate numerical health score (0-100)
   */
  private calculateHealthScore(healthData: any): number {
    let score = 100;

    if (!healthData.isOnline) return 0;
    if (!healthData.isRecording) score -= 30;
    if (healthData.videoLoss) score -= 40;
    if (healthData.tamperingDetected) score -= 50;
    if (healthData.frozenImage) score -= 25;
    if (healthData.blackImage) score -= 25;
    if (healthData.blurredImage) score -= 15;
    if (healthData.obstructed) score -= 20;
    
    // Network quality
    if (healthData.packetLossPercentage > 5) score -= 10;
    if (healthData.latencyMs > 200) score -= 10;
    
    // Time sync
    if (!healthData.ntpSynced || Math.abs(healthData.timeOffsetSeconds) > 5) score -= 5;

    return Math.max(0, score);
  }

  /**
   * Perform camera quality check
   */
  async performCameraQualityCheck(input: {
    tenantId: string;
    cameraId: string;
    branchNodeId?: string;
    checkedBy: string;
    expectedResolution?: string;
    expectedFps?: number;
    expectedBitrateKbps?: number;
  }) {
    // Get actual camera quality metrics
    const qualityMetrics = await this.checkCameraQuality(input.cameraId);

    // Compare with expected values
    const resolutionCompliant = input.expectedResolution 
      ? qualityMetrics.resolutionActual === input.expectedResolution
      : true;
    
    const fpsCompliant = input.expectedFps
      ? Math.abs(qualityMetrics.fpsActual - input.expectedFps) < 2
      : true;
    
    const bitrateCompliant = input.expectedBitrateKbps
      ? Math.abs(qualityMetrics.bitrateActualKbps - input.expectedBitrateKbps) / input.expectedBitrateKbps < 0.2
      : true;

    // Calculate overall quality score
    const qualityScore = this.calculateQualityScore(qualityMetrics);
    const qualityRating = this.getQualityRating(qualityScore);

    // Identify deficiencies
    const deficiencies: string[] = [];
    if (!resolutionCompliant) deficiencies.push('Resolution does not meet requirements');
    if (!fpsCompliant) deficiencies.push('Frame rate below expected');
    if (!bitrateCompliant) deficiencies.push('Bitrate significantly different from expected');
    if (!qualityMetrics.timestampVisible) deficiencies.push('Timestamp not visible');
    if (!qualityMetrics.playbackSuccessful) deficiencies.push('Playback verification failed');
    if (qualityMetrics.compressionArtifactsDetected) deficiencies.push('Compression artifacts detected');

    const qualityCheck = await this.auditRepo.createCameraQualityCheck({
      tenantId: input.tenantId,
      cameraId: input.cameraId,
      branchNodeId: input.branchNodeId,
      checkDate: new Date().toISOString().split('T')[0],
      checkTime: new Date().toISOString(),
      resolutionActual: qualityMetrics.resolutionActual,
      resolutionExpected: input.expectedResolution,
      resolutionCompliant,
      fpsActual: qualityMetrics.fpsActual,
      fpsExpected: input.expectedFps,
      fpsCompliant,
      bitrateActualKbps: qualityMetrics.bitrateActualKbps,
      bitrateExpectedKbps: input.expectedBitrateKbps,
      bitrateCompliant,
      clarityScore: qualityMetrics.clarityScore,
      lightingAdequate: qualityMetrics.lightingAdequate,
      focusQuality: qualityMetrics.focusQuality,
      colorAccuracy: qualityMetrics.colorAccuracy,
      viewingAngleAdequate: qualityMetrics.viewingAngleAdequate,
      coverageAreaCompliant: qualityMetrics.coverageAreaCompliant,
      noBlindSpots: qualityMetrics.noBlindSpots,
      timestampVisible: qualityMetrics.timestampVisible,
      cameraIdVisible: qualityMetrics.cameraIdVisible,
      codecCompliant: qualityMetrics.codecCompliant,
      compressionArtifactsDetected: qualityMetrics.compressionArtifactsDetected,
      audioEnabled: qualityMetrics.audioEnabled,
      audioQualityAdequate: qualityMetrics.audioQualityAdequate,
      playbackSuccessful: qualityMetrics.playbackSuccessful,
      frameContinuity: qualityMetrics.frameContinuity,
      noCorruption: qualityMetrics.noCorruption,
      overallQualityScore: qualityScore,
      qualityRating,
      deficienciesFound: deficiencies,
      recommendations: this.generateQualityRecommendations(deficiencies),
      checkedBy: input.checkedBy,
    });

    return qualityCheck;
  }

  /**
   * Check camera quality metrics (would integrate with actual camera systems)
   */
  private async checkCameraQuality(cameraId: string) {
    // In production, analyze actual video samples
    return {
      resolutionActual: '1920x1080',
      fpsActual: 25.0,
      bitrateActualKbps: 4096,
      clarityScore: 8,
      lightingAdequate: true,
      focusQuality: 9,
      colorAccuracy: true,
      viewingAngleAdequate: true,
      coverageAreaCompliant: true,
      noBlindSpots: true,
      timestampVisible: true,
      cameraIdVisible: true,
      codecCompliant: true,
      compressionArtifactsDetected: false,
      audioEnabled: false,
      audioQualityAdequate: null,
      playbackSuccessful: true,
      frameContinuity: true,
      noCorruption: true,
    };
  }

  private calculateQualityScore(metrics: any): number {
    let score = 0;
    const weights = {
      clarityScore: 15,
      focusQuality: 15,
      lightingAdequate: 10,
      colorAccuracy: 5,
      viewingAngleAdequate: 10,
      coverageAreaCompliant: 15,
      noBlindSpots: 10,
      timestampVisible: 5,
      codecCompliant: 5,
      playbackSuccessful: 10,
    };

    score += (metrics.clarityScore / 10) * weights.clarityScore;
    score += (metrics.focusQuality / 10) * weights.focusQuality;
    score += metrics.lightingAdequate ? weights.lightingAdequate : 0;
    score += metrics.colorAccuracy ? weights.colorAccuracy : 0;
    score += metrics.viewingAngleAdequate ? weights.viewingAngleAdequate : 0;
    score += metrics.coverageAreaCompliant ? weights.coverageAreaCompliant : 0;
    score += metrics.noBlindSpots ? weights.noBlindSpots : 0;
    score += metrics.timestampVisible ? weights.timestampVisible : 0;
    score += metrics.codecCompliant ? weights.codecCompliant : 0;
    score += metrics.playbackSuccessful ? weights.playbackSuccessful : 0;

    return Math.round(score);
  }

  private getQualityRating(score: number): 'excellent' | 'good' | 'fair' | 'poor' | 'fail' {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'fair';
    if (score >= 40) return 'poor';
    return 'fail';
  }

  private generateQualityRecommendations(deficiencies: string[]): string {
    if (deficiencies.length === 0) {
      return 'Camera quality meets all requirements. Continue regular monitoring.';
    }

    const recommendations: string[] = [];
    
    deficiencies.forEach(deficiency => {
      if (deficiency.includes('Resolution')) {
        recommendations.push('Check camera configuration and network bandwidth');
      } else if (deficiency.includes('Frame rate')) {
        recommendations.push('Verify network capacity and adjust camera settings');
      } else if (deficiency.includes('Timestamp')) {
        recommendations.push('Enable timestamp overlay in camera settings');
      } else if (deficiency.includes('Playback')) {
        recommendations.push('Check recording storage and codec compatibility');
      } else if (deficiency.includes('Compression')) {
        recommendations.push('Adjust compression settings or increase bitrate');
      }
    });

    return [...new Set(recommendations)].join('; ');
  }
}

/**
 * Analog Camera AI Analytics API Routes
 * Comprehensive endpoints for analog camera AI features
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AnalyticsPipeline } from "../analytics-pipeline.js";

export async function registerAnalogCameraApiRoutes(
  app: FastifyInstance,
  pipeline: AnalyticsPipeline
) {
  // ============================================================================
  // ANALOG VIDEO QUALITY ENDPOINTS
  // ============================================================================

  /**
   * Get analog video quality status for a camera
   */
  app.get("/v1/analog/quality/:cameraId", async (request, reply) => {
    const { cameraId } = z.object({ cameraId: z.string() }).parse(request.params);
    
    const qualityDetector = pipeline.getAnalogVideoQualityDetector();
    const status = qualityDetector?.getCameraQualityStatus(cameraId);
    
    if (!status) {
      return reply.code(404).send({ error: "camera_not_found" });
    }
    
    return status;
  });

  /**
   * Get all cameras with quality issues
   */
  app.get("/v1/analog/quality/issues", async (request, reply) => {
    const qualityDetector = pipeline.getAnalogVideoQualityDetector();
    const camerasWithIssues = qualityDetector?.getCamerasWithIssues() || [];
    
    return {
      count: camerasWithIssues.length,
      cameras: camerasWithIssues,
    };
  });

  // ============================================================================
  // CAMERA AGING & HEALTH PREDICTION ENDPOINTS
  // ============================================================================

  /**
   * Get camera aging metrics
   */
  app.get("/v1/analog/aging/:cameraId", async (request, reply) => {
    const { cameraId } = z.object({ cameraId: z.string() }).parse(request.params);
    
    const agingDetector = pipeline.getCameraAgingDetector();
    const metrics = agingDetector?.getCameraAgingMetrics(cameraId);
    
    if (!metrics) {
      return reply.code(404).send({ error: "camera_not_found" });
    }
    
    return metrics;
  });

  /**
   * Get maintenance recommendations for a camera
   */
  app.get("/v1/analog/aging/:cameraId/recommendations", async (request, reply) => {
    const { cameraId } = z.object({ cameraId: z.string() }).parse(request.params);
    
    const agingDetector = pipeline.getCameraAgingDetector();
    const recommendations = agingDetector?.getMaintenanceRecommendations(cameraId) || [];
    
    return {
      cameraId,
      count: recommendations.length,
      recommendations,
    };
  });

  /**
   * Get all cameras sorted by replacement priority
   */
  app.get("/v1/analog/aging/priority", async (request, reply) => {
    const agingDetector = pipeline.getCameraAgingDetector();
    const cameras = agingDetector?.getCamerasByReplacementPriority() || [];
    
    return {
      count: cameras.length,
      cameras,
    };
  });

  /**
   * Set camera installation date
   */
  app.post("/v1/analog/aging/:cameraId/installation-date", async (request, reply) => {
    const { cameraId } = z.object({ cameraId: z.string() }).parse(request.params);
    const body = z.object({
      installationDate: z.string().datetime(),
    }).parse(request.body);
    
    const agingDetector = pipeline.getCameraAgingDetector();
    agingDetector?.setCameraInstallationDate(cameraId, new Date(body.installationDate));
    
    return { success: true, cameraId, installationDate: body.installationDate };
  });

  /**
   * Record failure indicator
   */
  app.post("/v1/analog/aging/:cameraId/failure", async (request, reply) => {
    const { cameraId } = z.object({ cameraId: z.string() }).parse(request.params);
    const body = z.object({
      type: z.enum(['signalDropout', 'qualityDegradation', 'connectivity', 'overheating']),
    }).parse(request.body);
    
    const agingDetector = pipeline.getCameraAgingDetector();
    agingDetector?.recordFailureIndicator(cameraId, body.type);
    
    return { success: true, cameraId, failureType: body.type };
  });

  // ============================================================================
  // CAMERA TYPE CLASSIFICATION ENDPOINTS
  // ============================================================================

  /**
   * Get camera classification
   */
  app.get("/v1/analog/classification/:cameraId", async (request, reply) => {
    const { cameraId } = z.object({ cameraId: z.string() }).parse(request.params);
    
    const classifier = pipeline.getCameraTypeClassifier();
    const classification = classifier?.getCameraClassification(cameraId);
    
    if (!classification) {
      return reply.code(404).send({ error: "camera_not_found_or_not_classified" });
    }
    
    return classification;
  });

  /**
   * Get all camera classifications
   */
  app.get("/v1/analog/classification", async (request, reply) => {
    const classifier = pipeline.getCameraTypeClassifier();
    const classifications = classifier?.getAllClassifications() || [];
    
    return {
      count: classifications.length,
      cameras: classifications,
      summary: {
        standardAnalog: classifications.filter(c => c.cameraType === 'standard-analog').length,
        hdAnalog: classifications.filter(c => c.cameraType === 'hd-analog').length,
        ipCamera: classifications.filter(c => c.cameraType === 'ip-camera').length,
        avgAiAccuracy: classifications.reduce((sum, c) => sum + c.aiAccuracyEstimate, 0) / 
                       Math.max(1, classifications.length),
      },
    };
  });

  // ============================================================================
  // AI UPGRADE ADVISOR ENDPOINTS
  // ============================================================================

  /**
   * Get upgrade recommendation for a specific camera
   */
  app.get("/v1/analog/upgrade/:cameraId", async (request, reply) => {
    const { cameraId } = z.object({ cameraId: z.string() }).parse(request.params);
    const query = z.object({
      location: z.string().optional(),
    }).parse(request.query);
    
    const classifier = pipeline.getCameraTypeClassifier();
    const recommendation = classifier?.generateUpgradeRecommendation(cameraId, query.location);
    
    if (!recommendation) {
      return reply.code(404).send({ error: "camera_not_found_or_not_classified" });
    }
    
    return recommendation;
  });

  /**
   * Get all upgrade recommendations
   */
  app.get("/v1/analog/upgrade/recommendations", async (request, reply) => {
    const query = z.object({
      priority: z.enum(['high', 'medium', 'low']).optional(),
      minAccuracyGain: z.number().min(0).max(100).optional(),
    }).parse(request.query);
    
    const classifier = pipeline.getCameraTypeClassifier();
    let recommendations = classifier?.getAllUpgradeRecommendations() || [];
    
    // Filter by priority
    if (query.priority) {
      recommendations = recommendations.filter(r => r.roi.priority === query.priority);
    }
    
    // Filter by minimum accuracy gain
    if (query.minAccuracyGain !== undefined) {
      recommendations = recommendations.filter(r => r.roi.accuracyGainPercent >= query.minAccuracyGain);
    }
    
    return {
      count: recommendations.length,
      recommendations,
    };
  });

  /**
   * Get upgrade summary and ROI analysis
   */
  app.get("/v1/analog/upgrade/summary", async (request, reply) => {
    const classifier = pipeline.getCameraTypeClassifier();
    const summary = classifier?.getUpgradeSummary();
    
    if (!summary) {
      return { error: "no_cameras_classified" };
    }
    
    return summary;
  });

  /**
   * Generate upgrade plan for specific location/branch
   */
  app.post("/v1/analog/upgrade/plan", async (request, reply) => {
    const body = z.object({
      cameraIds: z.array(z.string()),
      budget: z.number().positive().optional(),
      prioritizeCritical: z.boolean().default(true),
    }).parse(request.body);
    
    const classifier = pipeline.getCameraTypeClassifier();
    const recommendations = classifier?.getAllUpgradeRecommendations() || [];
    
    // Filter to specified cameras
    let filteredRecs = recommendations.filter(r => body.cameraIds.includes(r.cameraId));
    
    // Sort by priority if requested
    if (body.prioritizeCritical) {
      filteredRecs = filteredRecs.sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return priorityOrder[b.roi.priority] - priorityOrder[a.roi.priority];
      });
    }
    
    // Apply budget constraint if specified
    let selectedUpgrades = filteredRecs;
    let totalCost = filteredRecs.reduce((sum, r) => 
      sum + (r.recommendedUpgrade.type !== 'no-upgrade' ? r.recommendedUpgrade.estimatedCostUSD : 0), 0
    );
    
    if (body.budget !== undefined && totalCost > body.budget) {
      selectedUpgrades = [];
      let runningCost = 0;
      
      for (const rec of filteredRecs) {
        const cost = rec.recommendedUpgrade.type !== 'no-upgrade' 
          ? rec.recommendedUpgrade.estimatedCostUSD 
          : 0;
        
        if (runningCost + cost <= body.budget) {
          selectedUpgrades.push(rec);
          runningCost += cost;
        }
      }
      
      totalCost = runningCost;
    }
    
    return {
      cameraCount: body.cameraIds.length,
      upgradesRecommended: selectedUpgrades.length,
      totalCostUSD: Math.round(totalCost),
      budgetRemaining: body.budget !== undefined ? Math.round(body.budget - totalCost) : undefined,
      avgAccuracyGain: selectedUpgrades.length > 0
        ? Math.round(selectedUpgrades.reduce((sum, r) => sum + r.roi.accuracyGainPercent, 0) / selectedUpgrades.length)
        : 0,
      upgrades: selectedUpgrades,
    };
  });

  // ============================================================================
  // DVR CHANNEL HEALTH ENDPOINTS
  // ============================================================================

  /**
   * Get DVR channel status
   */
  app.get("/v1/analog/dvr/channel/:channelId", async (request, reply) => {
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    
    const dvrDetector = pipeline.getDVRChannelHealthDetector();
    const status = dvrDetector?.getChannelStatus(channelId);
    
    if (!status) {
      return reply.code(404).send({ error: "channel_not_found" });
    }
    
    return status;
  });

  /**
   * Get all DVR channel statuses
   */
  app.get("/v1/analog/dvr/channels", async (request, reply) => {
    const query = z.object({
      status: z.enum(['healthy', 'warning', 'error', 'offline']).optional(),
    }).parse(request.query);
    
    const dvrDetector = pipeline.getDVRChannelHealthDetector();
    let statuses = dvrDetector?.getAllChannelStatuses() || [];
    
    // Filter by status
    if (query.status) {
      statuses = statuses.filter(s => s.status === query.status);
    }
    
    return {
      count: statuses.length,
      channels: statuses,
    };
  });

  /**
   * Get DVR health summary
   */
  app.get("/v1/analog/dvr/:dvrId/health", async (request, reply) => {
    const { dvrId } = z.object({ dvrId: z.string() }).parse(request.params);
    
    const dvrDetector = pipeline.getDVRChannelHealthDetector();
    const summary = dvrDetector?.getDVRHealthSummary(dvrId);
    
    if (!summary) {
      return reply.code(404).send({ error: "dvr_not_found" });
    }
    
    return summary;
  });

  // ============================================================================
  // COMPREHENSIVE ANALOG CAMERA DASHBOARD
  // ============================================================================

  /**
   * Get comprehensive analog camera analytics dashboard
   */
  app.get("/v1/analog/dashboard", async (request, reply) => {
    const qualityDetector = pipeline.getAnalogVideoQualityDetector();
    const agingDetector = pipeline.getCameraAgingDetector();
    const classifier = pipeline.getCameraTypeClassifier();
    const dvrDetector = pipeline.getDVRChannelHealthDetector();
    
    const qualityIssues = qualityDetector?.getCamerasWithIssues() || [];
    const agingPriority = agingDetector?.getCamerasByReplacementPriority() || [];
    const classifications = classifier?.getAllClassifications() || [];
    const upgradeSummary = classifier?.getUpgradeSummary();
    const dvrChannels = dvrDetector?.getAllChannelStatuses() || [];
    
    return {
      summary: {
        totalCameras: classifications.length,
        standardAnalog: classifications.filter(c => c.cameraType === 'standard-analog').length,
        hdAnalog: classifications.filter(c => c.cameraType === 'hd-analog').length,
        ipCamera: classifications.filter(c => c.cameraType === 'ip-camera').length,
        avgAiAccuracy: Math.round(
          classifications.reduce((sum, c) => sum + c.aiAccuracyEstimate, 0) / 
          Math.max(1, classifications.length)
        ),
      },
      qualityIssues: {
        count: qualityIssues.length,
        cameras: qualityIssues.slice(0, 10), // Top 10 worst quality
      },
      aging: {
        criticalRisk: agingPriority.filter(c => c.failureRiskScore > 80).length,
        highRisk: agingPriority.filter(c => c.failureRiskScore > 60 && c.failureRiskScore <= 80).length,
        topPriority: agingPriority.slice(0, 10), // Top 10 replacement priority
      },
      upgrades: upgradeSummary || {
        totalCameras: 0,
        needsUpgrade: 0,
        highPriorityUpgrades: 0,
        mediumPriorityUpgrades: 0,
        totalEstimatedCostUSD: 0,
        averageAccuracyGain: 0,
      },
      dvrHealth: {
        totalChannels: dvrChannels.length,
        healthy: dvrChannels.filter(c => c.status === 'healthy').length,
        warning: dvrChannels.filter(c => c.status === 'warning').length,
        error: dvrChannels.filter(c => c.status === 'error').length,
        offline: dvrChannels.filter(c => c.status === 'offline').length,
      },
    };
  });

  /**
   * Export analog camera report
   */
  app.get("/v1/analog/report", async (request, reply) => {
    const query = z.object({
      format: z.enum(['json', 'csv']).default('json'),
      includeQuality: z.boolean().default(true),
      includeAging: z.boolean().default(true),
      includeUpgrades: z.boolean().default(true),
      includeDvr: z.boolean().default(true),
    }).parse(request.query);
    
    const qualityDetector = pipeline.getAnalogVideoQualityDetector();
    const agingDetector = pipeline.getCameraAgingDetector();
    const classifier = pipeline.getCameraTypeClassifier();
    const dvrDetector = pipeline.getDVRChannelHealthDetector();
    
    const report: any = {
      generatedAt: new Date().toISOString(),
      reportType: 'analog-camera-analytics',
    };
    
    if (query.includeQuality) {
      report.qualityAnalysis = qualityDetector?.getCamerasWithIssues() || [];
    }
    
    if (query.includeAging) {
      report.agingAnalysis = agingDetector?.getCamerasByReplacementPriority() || [];
    }
    
    if (query.includeUpgrades) {
      report.upgradeRecommendations = classifier?.getAllUpgradeRecommendations() || [];
      report.upgradeSummary = classifier?.getUpgradeSummary();
    }
    
    if (query.includeDvr) {
      report.dvrChannelStatus = dvrDetector?.getAllChannelStatuses() || [];
    }
    
    if (query.format === 'csv') {
      // TODO: Convert to CSV format
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="analog-camera-report-${Date.now()}.csv"`);
      return "CSV export not yet implemented";
    }
    
    return report;
  });
}

/**
 * Advanced Analytics API Routes
 * Comprehensive endpoints for all advanced AI analytics modules
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AnalyticsPipeline } from "../analytics-pipeline.js";

export async function registerAdvancedAnalyticsRoutes(
  app: FastifyInstance,
  pipeline: AnalyticsPipeline
) {
  // ============================================================================
  // HUMAN ANALYTICS ENDPOINTS
  // ============================================================================

  /**
   * Get person Re-ID tracks
   */
  app.get("/v1/analytics/human/reid", async (request, reply) => {
    const humanAnalytics = pipeline.getHumanAnalytics();
    const tracks = humanAnalytics.getActiveTracks();
    
    return {
      count: tracks.length,
      tracks: tracks.map(t => ({
        trackId: t.trackId,
        firstSeen: t.firstSeen,
        lastSeen: t.lastSeen,
        cameras: t.cameras,
        totalAppearances: t.totalAppearances,
        confidence: t.confidence
      }))
    };
  });

  /**
   * Get behavior detections
   */
  app.get("/v1/analytics/human/behaviors", async (request, reply) => {
    const query = z.object({
      type: z.enum([
        'running', 'loitering', 'fighting', 'falling', 'hands_raised',
        'sitting', 'standing', 'crawling', 'sleeping', 'abnormal'
      ]).optional(),
      since: z.string().optional()
    }).parse(request.query);

    const humanAnalytics = pipeline.getHumanAnalytics();
    const behaviors = humanAnalytics.getBehaviorDetections(
      query.type,
      query.since ? new Date(query.since) : undefined
    );

    return {
      count: behaviors.length,
      behaviors: behaviors.map(b => ({
        trackId: b.trackId,
        type: b.type,
        confidence: b.confidence,
        timestamp: b.timestamp,
        duration: b.duration,
        bbox: b.bbox
      }))
    };
  });

  /**
   * Get occupancy metrics
   */
  app.get("/v1/analytics/human/occupancy", async (request, reply) => {
    const humanAnalytics = pipeline.getHumanAnalytics();
    const metrics = humanAnalytics.getOccupancyMetrics();

    return {
      current: metrics.currentOccupancy,
      unique: metrics.uniquePersons,
      avgDwellTime: metrics.avgDwellTime,
      peakOccupancy: metrics.peakOccupancy,
      peakTime: metrics.peakTime
    };
  });

  // ============================================================================
  // VEHICLE ANALYTICS ENDPOINTS
  // ============================================================================

  /**
   * Get ANPR detections
   */
  app.get("/v1/analytics/vehicles/anpr", async (request, reply) => {
    const query = z.object({
      plateNumber: z.string().optional(),
      since: z.string().optional(),
      limit: z.number().int().positive().default(100)
    }).parse(request.query);

    const vehicleAnalytics = pipeline.getVehicleAnalytics();
    const detections = vehicleAnalytics.getANPRDetections(
      query.plateNumber,
      query.since ? new Date(query.since) : undefined,
      query.limit
    );

    return {
      count: detections.length,
      detections: detections.map(d => ({
        plateNumber: d.plateNumber,
        confidence: d.confidence,
        timestamp: d.timestamp,
        cameraId: d.cameraId,
        vehicleType: d.vehicleType,
        color: d.color
      }))
    };
  });

  /**
   * Get traffic flow metrics
   */
  app.get("/v1/analytics/vehicles/traffic-flow", async (request, reply) => {
    const vehicleAnalytics = pipeline.getVehicleAnalytics();
    const metrics = vehicleAnalytics.getTrafficFlowMetrics();

    return {
      totalVehicles: metrics.totalVehicles,
      avgSpeed: metrics.avgSpeed,
      vehiclesByType: metrics.vehiclesByType,
      congestionLevel: metrics.congestionLevel,
      flowRate: metrics.flowRate
    };
  });

  /**
   * Get parking violations
   */
  app.get("/v1/analytics/vehicles/parking-violations", async (request, reply) => {
    const vehicleAnalytics = pipeline.getVehicleAnalytics();
    const violations = vehicleAnalytics.getParkingViolations();

    return {
      count: violations.length,
      violations: violations.map(v => ({
        vehicleId: v.vehicleId,
        licensePlate: v.licensePlate,
        violationType: v.violationType,
        timestamp: v.timestamp,
        duration: v.duration,
        location: v.location
      }))
    };
  });

  // ============================================================================
  // FACE ANALYTICS ENDPOINTS
  // ============================================================================

  /**
   * Get face recognition matches
   */
  app.get("/v1/analytics/face/recognitions", async (request, reply) => {
    const query = z.object({
      category: z.enum(['vip', 'employee', 'blacklist', 'unknown']).optional(),
      since: z.string().optional(),
      minConfidence: z.number().min(0).max(1).default(0.7)
    }).parse(request.query);

    const faceAnalytics = pipeline.getFaceAnalytics();
    const matches = faceAnalytics.getRecognitionMatches(
      query.category,
      query.since ? new Date(query.since) : undefined,
      query.minConfidence
    );

    return {
      count: matches.length,
      matches: matches.map(m => ({
        personId: m.personId,
        category: m.category,
        confidence: m.confidence,
        timestamp: m.timestamp,
        cameraId: m.cameraId,
        attributes: m.attributes
      }))
    };
  });

  /**
   * Add person to watchlist
   */
  app.post("/v1/analytics/face/watchlist", async (request, reply) => {
    const body = z.object({
      personId: z.string(),
      name: z.string(),
      category: z.enum(['vip', 'employee', 'blacklist']),
      faceEmbedding: z.array(z.number()),
      metadata: z.record(z.any()).optional()
    }).parse(request.body);

    const faceAnalytics = pipeline.getFaceAnalytics();
    faceAnalytics.addToWatchlist(body);

    return { success: true, personId: body.personId };
  });

  /**
   * Get demographics summary
   */
  app.get("/v1/analytics/face/demographics", async (request, reply) => {
    const faceAnalytics = pipeline.getFaceAnalytics();
    const demographics = faceAnalytics.getDemographics();

    return {
      ageGroups: demographics.ageGroups,
      genderDistribution: demographics.genderDistribution,
      emotionDistribution: demographics.emotionDistribution,
      totalFaces: demographics.totalFaces
    };
  });

  // ============================================================================
  // SAFETY ANALYTICS ENDPOINTS
  // ============================================================================

  /**
   * Get PPE compliance status
   */
  app.get("/v1/analytics/safety/ppe-compliance", async (request, reply) => {
    const safetyAnalytics = pipeline.getSafetyAnalytics();
    const compliance = safetyAnalytics.getPPECompliance();

    return {
      overallCompliance: compliance.overallCompliance,
      totalWorkers: compliance.totalWorkers,
      compliantWorkers: compliance.compliantWorkers,
      violations: compliance.violations.map(v => ({
        workerId: v.workerId,
        missingItems: v.missingItems,
        timestamp: v.timestamp,
        location: v.location
      }))
    };
  });

  /**
   * Get fire and smoke alerts
   */
  app.get("/v1/analytics/safety/fire-smoke-alerts", async (request, reply) => {
    const query = z.object({
      severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      active: z.boolean().default(true)
    }).parse(request.query);

    const safetyAnalytics = pipeline.getSafetyAnalytics();
    const alerts = safetyAnalytics.getFireSmokeAlerts(query.severity, query.active);

    return {
      count: alerts.length,
      alerts: alerts.map(a => ({
        id: a.id,
        type: a.type,
        severity: a.severity,
        confidence: a.confidence,
        timestamp: a.timestamp,
        location: a.location,
        spreading: a.spreading,
        affectedArea: a.affectedArea
      }))
    };
  });

  /**
   * Get hazard detections
   */
  app.get("/v1/analytics/safety/hazards", async (request, reply) => {
    const safetyAnalytics = pipeline.getSafetyAnalytics();
    const hazards = safetyAnalytics.getHazards();

    return {
      count: hazards.length,
      hazards: hazards.map(h => ({
        type: h.type,
        severity: h.severity,
        timestamp: h.timestamp,
        location: h.location,
        description: h.description
      }))
    };
  });

  // ============================================================================
  // BANKING ANALYTICS ENDPOINTS
  // ============================================================================

  /**
   * Get teller station status
   */
  app.get("/v1/analytics/banking/teller-status", async (request, reply) => {
    const bankingAnalytics = pipeline.getBankingAnalytics();
    const status = bankingAnalytics.getTellerStatus();

    return {
      stations: status.map(s => ({
        stationId: s.stationId,
        tellerPresent: s.tellerPresent,
        customerPresent: s.customerPresent,
        cashTrayStatus: s.cashTrayStatus,
        unattendedDuration: s.unattendedDuration,
        violations: s.violations
      }))
    };
  });

  /**
   * Get vault security status
   */
  app.get("/v1/analytics/banking/vault-security", async (request, reply) => {
    const bankingAnalytics = pipeline.getBankingAnalytics();
    const status = bankingAnalytics.getVaultSecurity();

    return {
      doorStatus: status.doorStatus,
      dualControlCompliant: status.dualControlCompliant,
      authorizedPersonsPresent: status.authorizedPersonsPresent,
      violations: status.violations.map(v => ({
        type: v.type,
        timestamp: v.timestamp,
        severity: v.severity,
        description: v.description
      }))
    };
  });

  /**
   * Get ATM monitoring status
   */
  app.get("/v1/analytics/banking/atm-monitoring", async (request, reply) => {
    const bankingAnalytics = pipeline.getBankingAnalytics();
    const status = bankingAnalytics.getATMMonitoring();

    return {
      atms: status.map(a => ({
        atmId: a.atmId,
        queueLength: a.queueLength,
        avgSessionDuration: a.avgSessionDuration,
        tamperingDetected: a.tamperingDetected,
        skimmingDetected: a.skimmingDetected,
        avgWaitTime: a.avgWaitTime
      }))
    };
  });

  /**
   * Get RBI compliance report
   */
  app.get("/v1/analytics/banking/rbi-compliance", async (request, reply) => {
    const bankingAnalytics = pipeline.getBankingAnalytics();
    const report = bankingAnalytics.getRBIComplianceReport();

    return {
      overallCompliance: report.overallCompliance,
      dualControlCompliance: report.dualControlCompliance,
      vaultSecurityCompliance: report.vaultSecurityCompliance,
      atmSecurityCompliance: report.atmSecurityCompliance,
      violations: report.violations,
      recommendations: report.recommendations
    };
  });

  // ============================================================================
  // RETAIL ANALYTICS ENDPOINTS
  // ============================================================================

  /**
   * Get customer flow metrics
   */
  app.get("/v1/analytics/retail/customer-flow", async (request, reply) => {
    const retailAnalytics = pipeline.getRetailAnalytics();
    const metrics = retailAnalytics.getCustomerFlow();

    return {
      entries: metrics.entries,
      exits: metrics.exits,
      currentOccupancy: metrics.currentOccupancy,
      uniqueVisitors: metrics.uniqueVisitors,
      avgDwellTime: metrics.avgDwellTime,
      peakHours: metrics.peakHours
    };
  });

  /**
   * Get queue analytics
   */
  app.get("/v1/analytics/retail/queue-analytics", async (request, reply) => {
    const retailAnalytics = pipeline.getRetailAnalytics();
    const analytics = retailAnalytics.getQueueAnalytics();

    return {
      queues: analytics.map(q => ({
        queueId: q.queueId,
        currentLength: q.currentLength,
        avgWaitTime: q.avgWaitTime,
        maxWaitTime: q.maxWaitTime,
        abandonmentRate: q.abandonmentRate,
        serviceRate: q.serviceRate,
        alerts: q.alerts
      }))
    };
  });

  /**
   * Get heat map data
   */
  app.get("/v1/analytics/retail/heatmap", async (request, reply) => {
    const retailAnalytics = pipeline.getRetailAnalytics();
    const heatmap = retailAnalytics.getHeatMap();

    return {
      grid: heatmap.grid,
      hotspots: heatmap.hotspots,
      coldspots: heatmap.coldspots,
      trafficPatterns: heatmap.trafficPatterns
    };
  });

  /**
   * Get conversion analytics
   */
  app.get("/v1/analytics/retail/conversion", async (request, reply) => {
    const retailAnalytics = pipeline.getRetailAnalytics();
    const analytics = retailAnalytics.getConversionAnalytics();

    return {
      conversionRate: analytics.conversionRate,
      browseToCheckout: analytics.browseToCheckout,
      avgInteractionTime: analytics.avgInteractionTime,
      productInteractions: analytics.productInteractions,
      zoneEngagement: analytics.zoneEngagement
    };
  });

  // ============================================================================
  // AI SEARCH ENGINE ENDPOINTS
  // ============================================================================

  /**
   * Natural language video search
   */
  app.post("/v1/analytics/search/query", async (request, reply) => {
    const body = z.object({
      query: z.string(),
      timeRange: z.object({
        start: z.string(),
        end: z.string()
      }).optional(),
      cameras: z.array(z.string()).optional(),
      limit: z.number().int().positive().default(50)
    }).parse(request.body);

    const searchEngine = pipeline.getAISearchEngine();
    const results = await searchEngine.search(
      body.query,
      body.timeRange ? {
        start: new Date(body.timeRange.start),
        end: new Date(body.timeRange.end)
      } : undefined,
      body.cameras,
      body.limit
    );

    return {
      query: body.query,
      count: results.length,
      results: results.map(r => ({
        frameId: r.frameId,
        cameraId: r.cameraId,
        timestamp: r.timestamp,
        relevanceScore: r.relevanceScore,
        confidence: r.confidence,
        matches: r.matches
      })),
      suggestions: searchEngine.getSuggestions(body.query)
    };
  });

  /**
   * Search by image
   */
  app.post("/v1/analytics/search/image", async (request, reply) => {
    const body = z.object({
      imageBase64: z.string(),
      searchType: z.enum(['person', 'vehicle', 'object']),
      limit: z.number().int().positive().default(50)
    }).parse(request.body);

    const searchEngine = pipeline.getAISearchEngine();
    const results = await searchEngine.searchByImage(
      body.imageBase64,
      body.searchType,
      body.limit
    );

    return {
      count: results.length,
      results: results.map(r => ({
        frameId: r.frameId,
        cameraId: r.cameraId,
        timestamp: r.timestamp,
        similarity: r.similarity,
        bbox: r.bbox
      }))
    };
  });

  // ============================================================================
  // AI INVESTIGATION TOOLS ENDPOINTS
  // ============================================================================

  /**
   * Track subject across cameras
   */
  app.post("/v1/analytics/investigation/track-subject", async (request, reply) => {
    const body = z.object({
      subjectId: z.string(),
      subjectType: z.enum(['person', 'vehicle']),
      timeRange: z.object({
        start: z.string(),
        end: z.string()
      }).optional()
    }).parse(request.body);

    const investigation = pipeline.getAIInvestigationTools();
    const journey = await investigation.trackSubject(
      body.subjectId,
      body.subjectType,
      body.timeRange ? {
        start: new Date(body.timeRange.start),
        end: new Date(body.timeRange.end)
      } : undefined
    );

    return {
      subjectId: body.subjectId,
      journey: {
        cameras: journey.cameras,
        timeline: journey.timeline,
        entryPoint: journey.entryPoint,
        exitPoint: journey.exitPoint,
        totalDistance: journey.totalDistance,
        avgSpeed: journey.avgSpeed,
        stoppages: journey.stoppages
      }
    };
  });

  /**
   * Find subject origin
   */
  app.get("/v1/analytics/investigation/find-origin/:subjectId", async (request, reply) => {
    const { subjectId } = z.object({ subjectId: z.string() }).parse(request.params);

    const investigation = pipeline.getAIInvestigationTools();
    const origin = await investigation.findOrigin(subjectId);

    return {
      subjectId,
      origin: {
        camera: origin.camera,
        timestamp: origin.timestamp,
        entryPoint: origin.entryPoint,
        confidenceScore: origin.confidenceScore
      }
    };
  });

  /**
   * Generate evidence package
   */
  app.post("/v1/analytics/investigation/evidence", async (request, reply) => {
    const body = z.object({
      incidentId: z.string(),
      subjectIds: z.array(z.string()),
      timeRange: z.object({
        start: z.string(),
        end: z.string()
      })
    }).parse(request.body);

    const investigation = pipeline.getAIInvestigationTools();
    const evidence = await investigation.generateEvidencePackage(
      body.incidentId,
      body.subjectIds,
      {
        start: new Date(body.timeRange.start),
        end: new Date(body.timeRange.end)
      }
    );

    return {
      incidentId: body.incidentId,
      evidence: {
        snapshots: evidence.snapshots,
        videoClips: evidence.videoClips,
        timeline: evidence.timeline,
        associatedSubjects: evidence.associatedSubjects,
        exportPath: evidence.exportPath
      }
    };
  });

  // ============================================================================
  // AI PREDICTION ENGINE ENDPOINTS
  // ============================================================================

  /**
   * Get all predictions
   */
  app.get("/v1/analytics/predictions", async (request, reply) => {
    const query = z.object({
      type: z.enum(['hardware_failure', 'storage_exhaustion', 'incident', 'anomaly']).optional(),
      minProbability: z.number().min(0).max(1).default(0.3)
    }).parse(request.query);

    const prediction = pipeline.getAIPredictionEngine();
    const predictions = prediction.getAllPredictions(query.type);
    const filtered = predictions.filter(p => p.probability >= query.minProbability);

    return {
      count: filtered.length,
      predictions: filtered.map(p => ({
        type: p.type,
        target: p.target,
        probability: p.probability,
        confidence: p.confidence,
        timeframe: p.timeframe,
        severity: p.prediction.severity,
        description: p.prediction.description,
        recommendations: p.recommendations
      }))
    };
  });

  /**
   * Get high-risk predictions
   */
  app.get("/v1/analytics/predictions/high-risk", async (request, reply) => {
    const prediction = pipeline.getAIPredictionEngine();
    const highRisk = prediction.getHighRiskPredictions(0.7);

    return {
      count: highRisk.length,
      predictions: highRisk.map(p => ({
        type: p.type,
        target: p.target,
        probability: p.probability,
        timeframe: p.timeframe,
        severity: p.prediction.severity,
        description: p.prediction.description,
        preventiveActions: p.preventiveActions
      }))
    };
  });

  /**
   * Update hardware health
   */
  app.post("/v1/analytics/predictions/hardware-health", async (request, reply) => {
    const body = z.object({
      hardwareId: z.string(),
      type: z.enum(['camera', 'hdd', 'network', 'server']),
      healthScore: z.number().min(0).max(100),
      metrics: z.record(z.any())
    }).parse(request.body);

    const prediction = pipeline.getAIPredictionEngine();
    prediction.updateHardwareHealth(
      body.hardwareId,
      body.type,
      body.healthScore,
      body.metrics
    );

    return { success: true, hardwareId: body.hardwareId };
  });

  /**
   * Get location risk score
   */
  app.get("/v1/analytics/predictions/location-risk/:location", async (request, reply) => {
    const { location } = z.object({ location: z.string() }).parse(request.params);

    const prediction = pipeline.getAIPredictionEngine();
    const riskScore = prediction.getLocationRiskScore(location);

    return {
      location,
      riskScore,
      level: riskScore > 80 ? 'critical' : riskScore > 60 ? 'high' : riskScore > 40 ? 'medium' : 'low'
    };
  });

  // ============================================================================
  // AI REPORTING ENGINE ENDPOINTS
  // ============================================================================

  /**
   * Generate daily report
   */
  app.post("/v1/analytics/reports/daily", async (request, reply) => {
    const body = z.object({
      date: z.string(),
      includeCategories: z.array(z.string()).optional()
    }).parse(request.body);

    const reporting = pipeline.getAIReportingEngine();
    const report = await reporting.generateDailyReport(
      new Date(body.date),
      body.includeCategories
    );

    return {
      reportId: report.id,
      date: report.date,
      summary: report.summary,
      sections: report.sections,
      insights: report.insights,
      recommendations: report.recommendations
    };
  });

  /**
   * Generate weekly summary
   */
  app.post("/v1/analytics/reports/weekly", async (request, reply) => {
    const body = z.object({
      weekStart: z.string()
    }).parse(request.body);

    const reporting = pipeline.getAIReportingEngine();
    const report = await reporting.generateWeeklyReport(new Date(body.weekStart));

    return {
      reportId: report.id,
      weekStart: report.weekStart,
      weekEnd: report.weekEnd,
      summary: report.summary,
      trends: report.trends,
      topIncidents: report.topIncidents,
      performance: report.performance
    };
  });

  /**
   * Get executive dashboard
   */
  app.get("/v1/analytics/reports/dashboard", async (request, reply) => {
    const reporting = pipeline.getAIReportingEngine();
    const dashboard = reporting.getExecutiveDashboard();

    return {
      kpis: dashboard.kpis,
      alerts: dashboard.alerts,
      trends: dashboard.trends,
      widgets: dashboard.widgets,
      quickStats: dashboard.quickStats
    };
  });

  /**
   * Export report
   */
  app.post("/v1/analytics/reports/export", async (request, reply) => {
    const body = z.object({
      reportId: z.string(),
      format: z.enum(['json', 'csv', 'pdf', 'excel'])
    }).parse(request.body);

    const reporting = pipeline.getAIReportingEngine();
    const exportData = await reporting.exportReport(body.reportId, body.format);

    return {
      reportId: body.reportId,
      format: body.format,
      data: exportData.data,
      downloadUrl: exportData.downloadUrl
    };
  });

  // ============================================================================
  // AI ASSISTANT ENDPOINTS
  // ============================================================================

  /**
   * Process natural language query
   */
  app.post("/v1/analytics/assistant/query", async (request, reply) => {
    const body = z.object({
      query: z.string(),
      sessionId: z.string().optional()
    }).parse(request.body);

    const assistant = pipeline.getAIAssistant();
    
    // Set module references if not already set
    assistant.setModules({
      search: pipeline.getAISearchEngine(),
      investigation: pipeline.getAIInvestigationTools(),
      reporting: pipeline.getAIReportingEngine(),
      prediction: pipeline.getAIPredictionEngine()
    });

    const response = await assistant.processQuery(body.query, body.sessionId);

    return {
      query: body.query,
      response: response.message,
      intent: response.intent,
      entities: response.entities,
      data: response.data,
      suggestions: response.suggestions,
      success: response.success
    };
  });

  /**
   * Get conversation history
   */
  app.get("/v1/analytics/assistant/history/:sessionId", async (request, reply) => {
    const { sessionId } = z.object({ sessionId: z.string() }).parse(request.params);

    const assistant = pipeline.getAIAssistant();
    const history = assistant.getConversationHistory(sessionId);

    return {
      sessionId,
      messages: history
    };
  });

  /**
   * Clear conversation
   */
  app.delete("/v1/analytics/assistant/session/:sessionId", async (request, reply) => {
    const { sessionId } = z.object({ sessionId: z.string() }).parse(request.params);

    const assistant = pipeline.getAIAssistant();
    assistant.clearConversation(sessionId);

    return { success: true, sessionId };
  });

  // ============================================================================
  // INDUSTRIAL ANALYTICS ENDPOINTS (Optional)
  // ============================================================================

  /**
   * Get equipment status
   */
  app.get("/v1/analytics/industrial/equipment", async (request, reply) => {
    const industrial = pipeline.getIndustrialAnalytics();
    if (!industrial) {
      return reply.code(404).send({ error: "Industrial analytics not enabled" });
    }

    const equipment = industrial.getActiveEquipment();

    return {
      count: equipment.length,
      equipment: equipment.map(e => ({
        id: e.id,
        type: e.type,
        state: e.state,
        operatingHours: e.operatingHours,
        nearWorkers: e.nearWorkers.length
      }))
    };
  });

  /**
   * Get safety violations
   */
  app.get("/v1/analytics/industrial/safety-violations", async (request, reply) => {
    const query = z.object({
      severity: z.enum(['low', 'medium', 'high']).optional(),
      since: z.string().optional()
    }).parse(request.query);

    const industrial = pipeline.getIndustrialAnalytics();
    if (!industrial) {
      return reply.code(404).send({ error: "Industrial analytics not enabled" });
    }

    const violations = industrial.getSafetyViolations(
      undefined,
      query.severity,
      query.since ? new Date(query.since) : undefined
    );

    return {
      count: violations.length,
      violations
    };
  });

  /**
   * Get production metrics
   */
  app.get("/v1/analytics/industrial/production", async (request, reply) => {
    const industrial = pipeline.getIndustrialAnalytics();
    if (!industrial) {
      return reply.code(404).send({ error: "Industrial analytics not enabled" });
    }

    const metrics = industrial.calculateProductionMetrics();

    return {
      unitsProduced: metrics.unitsProduced,
      efficiency: metrics.efficiency,
      targetRate: metrics.targetRate,
      actualRate: metrics.actualRate,
      equipmentUtilization: Object.fromEntries(metrics.equipmentUtilization),
      activeWorkers: metrics.activeWorkers
    };
  });

  // ============================================================================
  // SMART CITY ANALYTICS ENDPOINTS (Optional)
  // ============================================================================

  /**
   * Get traffic summary
   */
  app.get("/v1/analytics/smart-city/traffic-summary", async (request, reply) => {
    const smartCity = pipeline.getSmartCityAnalytics();
    if (!smartCity) {
      return reply.code(404).send({ error: "Smart city analytics not enabled" });
    }

    const summary = smartCity.getTrafficSummary();

    return summary;
  });

  /**
   * Get active congestion
   */
  app.get("/v1/analytics/smart-city/congestion", async (request, reply) => {
    const smartCity = pipeline.getSmartCityAnalytics();
    if (!smartCity) {
      return reply.code(404).send({ error: "Smart city analytics not enabled" });
    }

    const congestion = smartCity.getActiveCongestion();

    return {
      count: congestion.length,
      events: congestion.map(e => ({
        id: e.id,
        location: e.location,
        severity: e.severity,
        startTime: e.startTime,
        avgSpeed: e.avgSpeed,
        queueLength: e.queueLength
      }))
    };
  });

  /**
   * Get parking availability
   */
  app.get("/v1/analytics/smart-city/parking", async (request, reply) => {
    const query = z.object({
      location: z.string().optional()
    }).parse(request.query);

    const smartCity = pipeline.getSmartCityAnalytics();
    if (!smartCity) {
      return reply.code(404).send({ error: "Smart city analytics not enabled" });
    }

    const parking = smartCity.getParkingAvailability(query.location);

    return parking;
  });

  /**
   * Calculate junction metrics
   */
  app.post("/v1/analytics/smart-city/junction/:junctionId/metrics", async (request, reply) => {
    const { junctionId } = z.object({ junctionId: z.string() }).parse(request.params);

    const smartCity = pipeline.getSmartCityAnalytics();
    if (!smartCity) {
      return reply.code(404).send({ error: "Smart city analytics not enabled" });
    }

    const metrics = smartCity.calculateJunctionMetrics(junctionId);

    return metrics;
  });

  // ============================================================================
  // MODULE MANAGEMENT ENDPOINTS
  // ============================================================================

  /**
   * Enable optional modules
   */
  app.post("/v1/analytics/modules/enable", async (request, reply) => {
    const body = z.object({
      module: z.enum(['industrial', 'smart-city'])
    }).parse(request.body);

    if (body.module === 'industrial') {
      pipeline.enableIndustrialAnalytics();
    } else if (body.module === 'smart-city') {
      pipeline.enableSmartCityAnalytics();
    }

    return {
      success: true,
      module: body.module,
      message: `${body.module} analytics enabled`
    };
  });

  /**
   * Get all module statuses
   */
  app.get("/v1/analytics/modules/status", async (request, reply) => {
    return {
      coreModules: {
        humanAnalytics: true,
        vehicleAnalytics: true,
        faceAnalytics: true,
        safetyAnalytics: true,
        bankingAnalytics: true,
        retailAnalytics: true,
        aiSearchEngine: true,
        aiInvestigationTools: true,
        aiPredictionEngine: true,
        aiReportingEngine: true,
        aiAssistant: true
      },
      optionalModules: {
        industrialAnalytics: !!pipeline.getIndustrialAnalytics(),
        smartCityAnalytics: !!pipeline.getSmartCityAnalytics()
      }
    };
  });

  // ============================================================================
  // MODEL MANAGEMENT ENDPOINTS
  // ============================================================================

  /**
   * Get model statistics
   */
  app.get("/v1/analytics/models/stats", async (request, reply) => {
    const stats = pipeline.getModelStats();
    return stats;
  });

  /**
   * Get memory usage report
   */
  app.get("/v1/analytics/models/memory", async (request, reply) => {
    const report = pipeline.getMemoryReport();
    return report;
  });

  /**
   * Get GPU information
   */
  app.get("/v1/analytics/models/gpu-info", async (request, reply) => {
    const modelManager = pipeline.getModelManager();
    const gpuInfo = modelManager.getGPUInfo();
    return gpuInfo;
  });

  /**
   * Preload models
   */
  app.post("/v1/analytics/models/preload", async (request, reply) => {
    const body = z.object({
      modelIds: z.array(z.string())
    }).parse(request.body);

    const modelManager = pipeline.getModelManager();
    await modelManager.preloadModels(body.modelIds);

    return {
      success: true,
      modelsPreloaded: body.modelIds.length
    };
  });

  /**
   * Unload model
   */
  app.post("/v1/analytics/models/unload", async (request, reply) => {
    const body = z.object({
      modelId: z.string()
    }).parse(request.body);

    const modelManager = pipeline.getModelManager();
    await modelManager.unloadModel(body.modelId);

    return {
      success: true,
      modelId: body.modelId
    };
  });

  /**
   * Get loaded models
   */
  app.get("/v1/analytics/models/loaded", async (request, reply) => {
    const modelManager = pipeline.getModelManager();
    const loadedModels = modelManager.getLoadedModels();

    return {
      count: loadedModels.length,
      models: loadedModels
    };
  });

  /**
   * Optimize models
   */
  app.post("/v1/analytics/models/optimize", async (request, reply) => {
    const modelManager = pipeline.getModelManager();
    await modelManager.optimizeAll();

    return {
      success: true,
      message: "Model optimization complete"
    };
  });
}

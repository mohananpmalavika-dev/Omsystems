/**
 * Advanced Analytics API Routes
 * Comprehensive endpoints for all advanced AI analytics modules
 */

import type { FastifyInstance } from "fastify";
import { Buffer } from "node:buffer";
import { z } from "zod";
import { AISearchEngine } from "../detectors/ai-search-engine.js";
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
        positions: t.positions.length,
        dwellTimeSeconds: t.dwellTimeSeconds,
        avgConfidence: t.avgConfidence,
        currentActivity: t.currentActivity,
        speed: t.speed
      }))
    };
  });

  /**
   * Get behavior detections
   */
  app.get("/v1/analytics/human/behaviors", async (request, reply) => {
    const query = z.object({
      since: z.string().optional()
    }).parse(request.query);

    const humanAnalytics = pipeline.getHumanAnalytics();
    const tracks = humanAnalytics.getActiveTracks();
    const uniqueCount = humanAnalytics.getUniquePersonCount();

    const filteredTracks = query.since
      ? tracks.filter(t => t.lastSeen >= new Date(query.since))
      : tracks;

    return {
      count: filteredTracks.length,
      uniquePersons: uniqueCount,
      tracks: filteredTracks.map(t => ({
        trackId: t.trackId,
        firstSeen: t.firstSeen,
        lastSeen: t.lastSeen,
        positions: t.positions.length,
        dwellTimeSeconds: t.dwellTimeSeconds,
        avgConfidence: t.avgConfidence,
        currentActivity: t.currentActivity,
        speed: t.speed
      }))
    };
  });

  /**
   * Get occupancy metrics
   */
  app.get("/v1/analytics/human/occupancy", async (request, reply) => {
    const query = z.object({
      since: z.string().optional()
    }).parse(request.query);

    const humanAnalytics = pipeline.getHumanAnalytics();
    const tracks = humanAnalytics.getActiveTracks();
    const uniqueCount = humanAnalytics.getUniquePersonCount();

    const activeSince = query.since
      ? tracks.filter(t => t.lastSeen >= new Date(query.since)).length
      : tracks.length;

    return {
      activeTracks: activeSince,
      uniquePersons: uniqueCount,
      totalTracked: tracks.length,
      activeTrackDetails: tracks.slice(0, 20).map(t => ({
        trackId: t.trackId,
        firstSeen: t.firstSeen,
        lastSeen: t.lastSeen,
        avgConfidence: t.avgConfidence,
        currentActivity: t.currentActivity,
        speed: t.speed
      }))
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
      limit: z.number().int().positive().default(100)
    }).parse(request.query);

    const vehicleAnalytics = pipeline.getVehicleAnalytics();
    const tracks = query.plateNumber
      ? vehicleAnalytics.searchByPlate(query.plateNumber)
      : vehicleAnalytics.getActiveTracks();

    return {
      count: tracks.length,
      detections: tracks.slice(0, query.limit).map(t => ({
        plateNumber: t.licensePlate?.number ?? null,
        confidence: t.avgConfidence,
        timestamp: t.lastSeen,
        vehicleType: t.vehicleType,
        color: t.color,
        speed: t.speed
      }))
    };
  });

  /**
   * Get traffic flow metrics
   */
  app.get("/v1/analytics/vehicles/traffic-flow", async (request, reply) => {
    const vehicleAnalytics = pipeline.getVehicleAnalytics();
    const occupancy = vehicleAnalytics.getParkingOccupancy();
    const activeTracks = vehicleAnalytics.getActiveTracks();

    return {
      totalVehicles: activeTracks.length,
      parkingOccupancy: occupancy,
      vehicles: activeTracks.map(track => ({
        trackId: track.trackId,
        firstSeen: track.firstSeen,
        lastSeen: track.lastSeen,
        licensePlate: track.licensePlate?.number ?? null,
        vehicleType: track.vehicleType,
        color: track.color,
        avgConfidence: track.avgConfidence
      }))
    };
  });

  /**
   * Get parking violations
   */
  app.get("/v1/analytics/vehicles/parking-violations", async (request, reply) => {
    const smartCity = pipeline.getSmartCityAnalytics();
    if (!smartCity) {
      return {
        count: 0,
        violations: []
      };
    }

    const violations = smartCity.getParkingViolations();

    return {
      count: violations.length,
      violations: violations.map(v => ({
        spaceId: v.id,
        occupied: v.occupied,
        vehicleType: v.vehicle?.type ?? null,
        licensePlate: v.vehicle?.licensePlate ?? null,
        violationType: v.violationType,
        entryTime: v.vehicle?.entryTime ?? null,
        location: v.location,
        hasViolation: v.hasViolation
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
    const persons = query.category
      ? faceAnalytics.getPersonsByCategory(query.category)
      : [
          ...faceAnalytics.getPersonsByCategory('vip'),
          ...faceAnalytics.getPersonsByCategory('employee'),
          ...faceAnalytics.getPersonsByCategory('blacklist'),
          ...faceAnalytics.getPersonsByCategory('unknown')
        ];

    const filtered = query.since
      ? persons.filter(p => p.addedAt >= new Date(query.since))
      : persons;

    return {
      count: filtered.length,
      persons: filtered.map(p => ({
        personId: p.personId,
        name: p.name,
        category: p.category,
        department: p.department,
        accessLevel: p.accessLevel,
        photoUrl: p.photoUrl,
        metadata: p.metadata,
        addedAt: p.addedAt
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
    faceAnalytics.addPerson({
      personId: body.personId,
      name: body.name,
      category: body.category,
      embedding: body.faceEmbedding,
      metadata: body.metadata
    });

    return { success: true, personId: body.personId };
  });

  /**
   * Get demographics summary
   */
  app.get("/v1/analytics/face/demographics", async (request, reply) => {
    const faceAnalytics = pipeline.getFaceAnalytics();
    const stats = faceAnalytics.getDatabaseStats();

    return {
      totalFaces: stats.total,
      byCategory: stats.byCategory,
      lastUpdated: stats.lastUpdated
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
    const stats = safetyAnalytics.getComplianceStats();

    return {
      totalChecks: stats.totalChecks,
      compliant: stats.compliant,
      violations: stats.violations,
      complianceRate: stats.complianceRate,
      bySeverity: stats.bySeverity
    };
  });

  /**
   * Get fire and smoke alerts
   */
  app.get("/v1/analytics/safety/fire-smoke-alerts", async (request, reply) => {
    const query = z.object({
      severity: z.enum(['low', 'medium', 'high', 'critical']).optional()
    }).parse(request.query);

    const safetyAnalytics = pipeline.getSafetyAnalytics();
    const alerts = safetyAnalytics.getActiveHazards()
      .filter(h => ['fire', 'smoke'].includes(h.hazardType))
      .filter(h => !query.severity || h.severity === query.severity);

    return {
      count: alerts.length,
      alerts: alerts.map(a => ({
        id: a.hazardId,
        type: a.hazardType,
        severity: a.severity,
        confidence: a.confidence,
        timestamp: a.firstDetected,
        location: a.location,
        spreading: a.spreading,
        affectedArea: a.location
      }))
    };
  });

  /**
   * Get hazard detections
   */
  app.get("/v1/analytics/safety/hazards", async (request, reply) => {
    const safetyAnalytics = pipeline.getSafetyAnalytics();
    const hazards = safetyAnalytics.getActiveHazards();

    return {
      count: hazards.length,
      hazards: hazards.map(h => ({
        type: h.hazardType,
        severity: h.severity,
        timestamp: h.firstDetected,
        location: h.location,
        description: h.metadata?.description ?? ''
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
    const status = bankingAnalytics.getTellerStations();

    return {
      stations: status.map(s => ({
        stationId: s.stationId,
        tellerPresent: s.tellerPresent,
        customerPresent: s.customerPresent,
        cashTrayOpen: s.cashTrayOpen,
        lastActivity: s.lastActivity,
        violations: s.violations
      }))
    };
  });

  /**
   * Get vault security status
   */
  app.get("/v1/analytics/banking/vault-security", async (request, reply) => {
    const bankingAnalytics = pipeline.getBankingAnalytics();
    const status = bankingAnalytics.getVaults();

    return {
      vaults: status.map(v => ({
        vaultId: v.vaultId,
        doorStatus: v.doorStatus,
        lastDoorChange: v.lastDoorChange,
        authorizedPersonsPresent: v.currentOccupants.some(p => p.authorized),
        violations: v.violations
      }))
    };
  });

  /**
   * Get ATM monitoring status
   */
  app.get("/v1/analytics/banking/atm-monitoring", async (request, reply) => {
    const bankingAnalytics = pipeline.getBankingAnalytics();
    const status = bankingAnalytics.getATMs();

    return {
      atms: status.map(a => ({
        atmId: a.atmId,
        queueLength: a.queueLength,
        currentUserDuration: a.currentUser?.duration ?? 0,
        tamperingDetected: a.tamperingDetected,
        skimmingDetected: a.skimmingDetected,
        avgWaitTime: a.queuePersons.length > 0
          ? a.queuePersons.reduce((sum, p) => sum + p.waitTime, 0) / a.queuePersons.length
          : 0
      }))
    };
  });

  /**
   * Get RBI compliance report
   */
  app.get("/v1/analytics/banking/rbi-compliance", async (request, reply) => {
    const query = z.object({
      since: z.string().optional(),
      until: z.string().optional()
    }).parse(request.query);

    const bankingAnalytics = pipeline.getBankingAnalytics();
    const report = bankingAnalytics.generateComplianceReport({
      start: query.since ? new Date(query.since) : new Date(Date.now() - 24 * 60 * 60 * 1000),
      end: query.until ? new Date(query.until) : new Date()
    });

    return {
      period: report.period,
      tellerCompliance: report.tellerCompliance,
      vaultSecurity: report.vaultSecurity,
      atmOperations: report.atmOperations
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
    const metrics = retailAnalytics.getFootfallMetrics();

    return {
      totalEntries: metrics.totalEntries,
      totalExits: metrics.totalExits,
      currentOccupancy: metrics.currentOccupancy,
      uniqueVisitors: metrics.uniqueVisitors,
      peakHour: metrics.peakHour,
      peakDay: metrics.peakDay
    };
  });

  /**
   * Get queue analytics
   */
  app.get("/v1/analytics/retail/queue-analytics", async (request, reply) => {
    const retailAnalytics = pipeline.getRetailAnalytics();
    const analytics = retailAnalytics.getAllQueueMetrics();

    return {
      queues: analytics.map(q => ({
        zoneId: q.zoneId,
        zoneName: q.zoneName,
        currentLength: q.currentLength,
        avgWaitTime: q.avgWaitTime,
        maxWaitTime: q.maxWaitTime,
        abandonmentRate: q.abandonmentRate,
        throughput: q.throughput,
        alerts: q.alerts
      }))
    };
  });

  /**
   * Get heat map data
   */
  app.get("/v1/analytics/retail/heatmap", async (request, reply) => {
    const query = z.object({
      zoneId: z.string().optional()
    }).parse(request.query);

    const retailAnalytics = pipeline.getRetailAnalytics();
    const heatmap = retailAnalytics.getHeatMap(query.zoneId || 'default');

    if (!heatmap) {
      return reply.code(404).send({ error: 'Retail heatmap zone not available' });
    }

    return {
      dwellTimeMap: heatmap.dwellTimeMap,
      trafficMap: heatmap.trafficMap,
      hotspots: heatmap.hotspots,
      coldspots: heatmap.coldspots,
      timePatterns: heatmap.timePatterns
    };
  });

  /**
   * Get conversion analytics
   */
  app.get("/v1/analytics/retail/conversion", async (request, reply) => {
    const retailAnalytics = pipeline.getRetailAnalytics();
    const analytics = retailAnalytics.getConversionMetrics();

    return {
      conversionRate: analytics.conversionRate,
      avgDwellTime: analytics.avgDwellTime,
      avgZonesVisited: analytics.avgZonesVisited,
      avgProductInteractions: analytics.avgProductInteractions,
      zoneEngagement: Array.from(analytics.zoneEngagement.entries()).map(([zoneId, engagement]) => ({
        zoneId,
        visitors: engagement.visitors,
        avgDwellTime: engagement.avgDwellTime,
        conversionRate: engagement.conversionRate
      }))
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
    const results = await searchEngine.search({
      query: body.query,
      timeRange: body.timeRange
        ? {
            start: new Date(body.timeRange.start),
            end: new Date(body.timeRange.end)
          }
        : undefined,
      cameras: body.cameras,
      limit: body.limit
    });

    return {
      query: body.query,
      count: results.results.length,
      results: results.results.map(r => ({
        frameId: r.frameId,
        cameraId: r.cameraId,
        timestamp: r.timestamp,
        relevanceScore: r.relevanceScore,
        confidenceScore: r.confidenceScore,
        detection: r.detection,
        matchedAttributes: r.matchedAttributes
      })),
      suggestions: AISearchEngine.generateSuggestions(body.query)
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
    const imageBuffer = Buffer.from(body.imageBase64, 'base64');
    const results = await searchEngine.searchByImage(imageBuffer, {
      type: body.searchType,
      limit: body.limit
    });

    return {
      count: results.results.length,
      results: results.results.map(r => ({
        frameId: r.frameId,
        cameraId: r.cameraId,
        timestamp: r.timestamp,
        similarity: r.combinedScore,
        boundingBox: r.boundingBox,
        detection: r.detection
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
      subjectType: z.enum(['person', 'vehicle']).optional(),
      timeRange: z.object({
        start: z.string(),
        end: z.string()
      }).optional()
    }).parse(request.body);

    const investigation = pipeline.getAIInvestigationTools();
    const result = await investigation.investigateCameras(body.subjectId);
    const journey = result.journeys[0];

    return {
      subjectId: body.subjectId,
      journey: {
        cameras: journey.path.cameras,
        timeline: journey.appearances.map(a => ({
          cameraId: a.cameraId,
          timestamp: a.timestamp,
          confidence: a.confidence,
          type: a.type
        })),
        entryPoint: journey.entryPoint,
        exitPoint: journey.exitPoint,
        totalDistance: journey.analysis.totalDistance,
        avgSpeed: journey.analysis.avgSpeed,
        stoppages: journey.analysis.stoppages
      }
    };
  });

  /**
   * Find subject origin
   */
  app.get("/v1/analytics/investigation/find-origin/:subjectId", async (request, reply) => {
    const { subjectId } = z.object({ subjectId: z.string() }).parse(request.params);

    const investigation = pipeline.getAIInvestigationTools();
    const originResult = await investigation.investigateOrigin(subjectId);
    const journey = originResult.journeys[0];
    const originPoint = journey.entryPoint;

    return {
      subjectId,
      origin: {
        camera: originPoint?.cameraId,
        timestamp: originPoint?.timestamp,
        entryPoint: originPoint,
        confidenceScore: originResult.confidence
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
      date: z.string()
    }).parse(request.body);

    const reporting = pipeline.getAIReportingEngine();
    const report = await reporting.generateDailyIncidentSummary(new Date(body.date));

    return {
      reportId: report.id,
      dateRange: report.dateRange,
      summary: report.summary,
      sections: report.sections,
      insights: report.insights
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
    const report = await reporting.generateWeeklyAnalyticsSummary(new Date(body.weekStart));

    return {
      reportId: report.id,
      dateRange: report.dateRange,
      summary: report.summary,
      sections: report.sections,
      insights: report.insights
    };
  });

  /**
   * Get executive dashboard
   */
  app.get("/v1/analytics/reports/dashboard", async (request, reply) => {
    const reporting = pipeline.getAIReportingEngine();
    const dashboard = await reporting.generateExecutiveDashboard();

    return {
      title: dashboard.title,
      lastUpdated: dashboard.lastUpdated,
      kpis: dashboard.kpis,
      activeAlerts: dashboard.activeAlerts,
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
    const report = reporting.getReport(body.reportId);
    if (!report) {
      return reply.code(404).send({ error: 'Report not found' });
    }

    const exported = await reporting.exportReport(report, body.format);

    return {
      reportId: body.reportId,
      format: body.format,
      data: exported,
      downloadUrl: null
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
      intent: response.intent,
      response: response.message,
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
    const history = assistant.getHistory(sessionId);

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
    assistant.clearHistory(sessionId);

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

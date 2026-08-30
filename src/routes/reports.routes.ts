import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import type { Action, User } from "../domain/models.js";

const MAX_REPORT_ROWS = 10_000;
const reportTypeSchema = z.enum([
  "operations",
  "privacy",
  "incidents",
  "system-health",
  "analytics",
  "compliance",
  "maintenance",
  "activity",
]);
type ReportType = z.infer<typeof reportTypeSchema>;

const dateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
}).superRefine((value, context) => {
  if (value.startDate && value.endDate && value.startDate > value.endDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDate"],
      message: "endDate must be on or after startDate",
    });
  }
});

const analyticsQuerySchema = dateRangeSchema.and(z.object({
  branchId: z.string().trim().min(1).max(200).optional(),
}));

const activityQuerySchema = dateRangeSchema.and(z.object({
  branchId: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
}));

const exportBodySchema = dateRangeSchema.and(z.object({
  reportType: reportTypeSchema,
  format: z.enum(["json", "csv"]).default("json"),
  filters: z.object({
    branchId: z.string().trim().min(1).max(200).optional(),
  }).passthrough().optional(),
}));

export async function registerReportsRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  app.get("/v1/reports/summary/operations", async (request, reply) => {
    if (!await hasAnyAccess(store, request.currentUser, "live:view")) {
      return forbidden(reply);
    }
    return buildOperationsReport(store, request.currentUser);
  });

  app.get("/v1/reports/summary/privacy", async (request, reply) => {
    if (!await hasTenantWideAccess(store, request.currentUser, "audit:view")) {
      return forbidden(reply);
    }
    return store.getPrivacySummary(request.currentUser.tenantId);
  });

  app.get("/v1/reports/summary/incidents", async (request, reply) => {
    if (!await hasAnyAccess(store, request.currentUser, "incident:view")) {
      return forbidden(reply);
    }
    return buildIncidentSummary(store, request.currentUser);
  });

  app.get("/v1/dashboard/stats", async (request, reply) => {
    if (!await hasAnyAccess(store, request.currentUser, "live:view")) {
      return forbidden(reply);
    }
    const storageNodes = await listScopedStorageNodes(store, request.currentUser, "live:view");
    return {
      storageNodes,
      storageSummary: summarizeStorage(storageNodes),
      provenance: "REAL",
    };
  });

  app.get("/v1/reports/system/health", async (request, reply) => {
    if (!await hasAnyAccess(store, request.currentUser, "live:view")) {
      return forbidden(reply);
    }
    return buildSystemHealthReport(store, request.currentUser);
  });

  app.get("/v1/reports/analytics/summary", async (request, reply) => {
    if (!await hasAnyAccess(store, request.currentUser, "analytics:view")) {
      return forbidden(reply);
    }
    const parsed = analyticsQuerySchema.safeParse(request.query);
    if (!parsed.success) return invalidInput(reply, "invalid_report_query", parsed.error);
    const params = parsed.data;
    const report = await buildAnalyticsReport(store, request.currentUser, params);
    if (!report) return reply.code(404).send({ error: "branch_not_found_or_forbidden" });
    return report;
  });

  app.get("/v1/reports/compliance/summary", async (request, reply) => {
    if (!await hasTenantWideAccess(store, request.currentUser, "audit:view")) {
      return forbidden(reply);
    }
    return buildComplianceReport(store, request.currentUser);
  });

  app.get("/v1/reports/maintenance/summary", async (request, reply) => {
    if (!await hasAnyAccess(store, request.currentUser, "device:configure")) {
      return forbidden(reply);
    }
    return buildMaintenanceReport(store, request.currentUser);
  });

  app.get("/v1/reports/activity/summary", async (request, reply) => {
    if (!await hasAnyAccess(store, request.currentUser, "incident:view")) {
      return forbidden(reply);
    }
    const parsed = activityQuerySchema.safeParse(request.query);
    if (!parsed.success) return invalidInput(reply, "invalid_report_query", parsed.error);
    const params = parsed.data;
    const report = await buildActivityReport(store, request.currentUser, params);
    if (!report) return reply.code(404).send({ error: "branch_not_found_or_forbidden" });
    return report;
  });

  app.post("/v1/reports/export", async (request, reply) => {
    if (!await hasAnyAccess(store, request.currentUser, "analytics:export")) {
      return forbidden(reply);
    }
    const parsed = exportBodySchema.safeParse(request.body);
    if (!parsed.success) return invalidInput(reply, "invalid_report_export", parsed.error);
    const body = parsed.data;
    if (!await canReadReportType(store, request.currentUser, body.reportType)) {
      return forbidden(reply);
    }

    const reportData = await buildExportReport(store, request.currentUser, body);
    if (reportData === null) {
      return reply.code(404).send({ error: "branch_not_found_or_forbidden" });
    }

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "report.exported",
      resourceNodeId: body.filters?.branchId ?? null,
      outcome: "success",
      details: { reportType: body.reportType, format: body.format },
    });

    if (body.format === "json") {
      return {
        reportType: body.reportType,
        generatedAt: new Date().toISOString(),
        data: reportData,
      };
    }

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header(
      "Content-Disposition",
      `attachment; filename="${body.reportType}-report.csv"`,
    );
    return convertToCSV(reportData);
  });
}

async function buildExportReport(
  store: ControlPlaneStore,
  user: User,
  body: z.infer<typeof exportBodySchema>,
): Promise<unknown | null> {
  const branchId = body.filters?.branchId;
  switch (body.reportType) {
    case "operations":
      return buildOperationsReport(store, user, branchId);
    case "privacy":
      return store.getPrivacySummary(user.tenantId);
    case "incidents":
      return buildIncidentSummary(store, user, {
        branchId,
        from: body.startDate,
        to: body.endDate,
      });
    case "system-health":
      return buildSystemHealthReport(store, user);
    case "analytics":
      return buildAnalyticsReport(store, user, {
        branchId,
        startDate: body.startDate,
        endDate: body.endDate,
      });
    case "compliance":
      return buildComplianceReport(store, user);
    case "maintenance":
      return buildMaintenanceReport(store, user);
    case "activity":
      return buildActivityReport(store, user, {
        branchId,
        startDate: body.startDate,
        endDate: body.endDate,
        limit: 1000,
      });
  }
}

async function buildOperationsReport(
  store: ControlPlaneStore,
  user: User,
  branchId?: string,
) {
  const accessibleBranches = await store.listAccessibleNodes(user, "live:view", "branch");
  const branches = branchId
    ? accessibleBranches.filter((branch) => branch.id === branchId)
    : accessibleBranches;
  if (branchId && branches.length === 0) return null;

  const cameraLists = await Promise.all(branches.map((branch) =>
    store.listCamerasByBranch(user, branch.id, "live:view")
  ));
  const branchSummaries = branches.map((branch, index) => {
    const cameras = cameraLists[index] ?? [];
    return {
      branchId: branch.id,
      branchName: branch.name,
      totalCameras: cameras.length,
      onlineCount: cameras.filter((camera) => camera.status === "online").length,
      offlineCount: cameras.filter((camera) => camera.status === "offline").length,
      degradedCount: cameras.filter((camera) => camera.status === "degraded").length,
      unknownCount: cameras.filter((camera) => camera.status === "unknown").length,
    };
  });
  const cameraCount = branchSummaries.reduce((sum, branch) => sum + branch.totalCameras, 0);
  const onlineCount = branchSummaries.reduce((sum, branch) => sum + branch.onlineCount, 0);
  const offlineCount = branchSummaries.reduce((sum, branch) => sum + branch.offlineCount, 0);
  const degradedCount = branchSummaries.reduce((sum, branch) => sum + branch.degradedCount, 0);
  const unknownCount = branchSummaries.reduce((sum, branch) => sum + branch.unknownCount, 0);
  const incidentResult = await listScopedIncidents(store, user, { branchId });
  const incidents = incidentResult.data;

  return {
    generatedAt: new Date().toISOString(),
    provenance: "REAL" as const,
    branchCount: branches.length,
    cameraCount,
    onlineCount,
    offlineCount,
    degradedCount,
    unknownCount,
    healthyCameraPercentage: cameraCount > 0
      ? Math.round((onlineCount / cameraCount) * 100)
      : null,
    branchSummaries,
    incidentCount: incidents.length,
    openIncidentCount: incidents.filter((incident) => !isIncidentClosed(incident.status)).length,
    criticalIncidentCount: incidents.filter((incident) => incident.severity === "P1").length,
    incidentStatusCounts: countBy(incidents, "status"),
    incidentSeverityCounts: countBy(incidents, "severity"),
    incidentsTruncated: incidentResult.truncated,
  };
}

async function buildIncidentSummary(
  store: ControlPlaneStore,
  user: User,
  filters: { branchId?: string; from?: string; to?: string } = {},
) {
  const result = await listScopedIncidents(store, user, filters);
  if (!result.branchAllowed) return null;
  const incidents = result.data;
  return {
    provenance: "REAL" as const,
    incidentCount: incidents.length,
    openIncidentCount: incidents.filter((incident) => !isIncidentClosed(incident.status)).length,
    criticalIncidentCount: incidents.filter((incident) => incident.severity === "P1").length,
    statusCounts: countBy(incidents, "status"),
    severityCounts: countBy(incidents, "severity"),
    recentIncidents: incidents.slice(0, 10).map(toIncidentReportRow),
    truncated: result.truncated,
  };
}

async function buildSystemHealthReport(store: ControlPlaneStore, user: User) {
  const branches = await store.listAccessibleNodes(user, "live:view", "branch");
  const cameraLists = await Promise.all(branches.map((branch) =>
    store.listCamerasByBranch(user, branch.id, "live:view")
  ));
  const cameras = cameraLists.flat();
  const storageNodes = await listScopedStorageNodes(store, user, "live:view");
  const incidentsResult = await listScopedIncidents(store, user);
  const onlineCameras = cameras.filter((camera) => camera.status === "online").length;
  const offlineCameras = cameras.filter((camera) => camera.status === "offline").length;
  const degradedCameras = cameras.filter((camera) => camera.status === "degraded").length;
  const unknownCameras = cameras.filter((camera) => camera.status === "unknown").length;
  const healthyStorage = storageNodes.filter((node) => node.status === "healthy").length;
  const warningStorage = storageNodes.filter((node) => node.status === "warning").length;
  const criticalStorage = storageNodes.filter((node) => node.status === "critical").length;
  const offlineStorage = storageNodes.filter((node) => node.status === "offline").length;
  const openIncidents = incidentsResult.data.filter((incident) =>
    !isIncidentClosed(incident.status)
  ).length;
  const criticalIncidents = incidentsResult.data.filter((incident) =>
    incident.severity === "P1"
  ).length;
  const score = calculateHealthScore({
    totalCameras: cameras.length,
    onlineCameras,
    totalStorage: storageNodes.length,
    healthyStorage,
    openIncidents,
    criticalIncidents,
    incidentsAssessed: incidentsResult.scopeAvailable,
  });

  return {
    timestamp: new Date().toISOString(),
    provenance: "REAL" as const,
    overallHealth: {
      score,
      status: determineHealthStatus(score, criticalStorage, criticalIncidents),
    },
    cameras: {
      total: cameras.length,
      online: onlineCameras,
      offline: offlineCameras,
      degraded: degradedCameras,
      unknown: unknownCameras,
      healthPercentage: cameras.length > 0
        ? Math.round((onlineCameras / cameras.length) * 100)
        : null,
    },
    storage: {
      total: storageNodes.length,
      healthy: healthyStorage,
      warning: warningStorage,
      critical: criticalStorage,
      offline: offlineStorage,
      healthPercentage: storageNodes.length > 0
        ? Math.round((healthyStorage / storageNodes.length) * 100)
        : null,
    },
    incidents: {
      total: incidentsResult.data.length,
      open: openIncidents,
      critical: criticalIncidents,
      assessed: incidentsResult.scopeAvailable,
      truncated: incidentsResult.truncated,
    },
    branches: { total: branches.length },
  };
}

async function buildAnalyticsReport(
  store: ControlPlaneStore,
  user: User,
  params: { startDate?: string; endDate?: string; branchId?: string },
) {
  const accessibleBranches = await store.listAccessibleNodes(user, "analytics:view", "branch");
  const branches = params.branchId
    ? accessibleBranches.filter((branch) => branch.id === params.branchId)
    : accessibleBranches;
  if (params.branchId && branches.length === 0) return null;

  const cameraLists = await Promise.all(branches.map((branch) =>
    store.listCamerasByBranch(user, branch.id, "analytics:view")
  ));
  const camerasByBranch = new Map(branches.map((branch, index) => [
    branch.id,
    cameraLists[index] ?? [],
  ]));
  const cameraIds = cameraLists.flat().map((camera) => camera.id);
  const permittedCameraIds = new Set(cameraIds);
  const startDate = params.startDate ?? new Date(Date.now() - 7 * 86_400_000).toISOString();
  const endDate = params.endDate ?? new Date().toISOString();
  const alertCandidates = await store.listAnalyticsAlerts(user.tenantId, {
    ...(params.branchId ? { branchId: params.branchId } : {}),
    from: startDate,
    to: endDate,
    limit: MAX_REPORT_ROWS + 1,
  });
  const permittedAlerts = alertCandidates.filter((alert) => permittedCameraIds.has(alert.cameraId));
  const truncated = permittedAlerts.length > MAX_REPORT_ROWS;
  const alerts = permittedAlerts.slice(0, MAX_REPORT_ROWS);
  const rules = await store.listAnalyticsRulesByCameraIds(cameraIds);
  const ruleType = new Map(rules.map((rule) => [rule.id, rule.detectionType]));
  const eventsByType: Record<string, number> = {};
  const eventCountByCamera = new Map<string, number>();
  for (const alert of alerts) {
    const count = Math.max(1, alert.occurrenceCount);
    const type = ruleType.get(alert.ruleId) ?? "unclassified";
    eventsByType[type] = (eventsByType[type] ?? 0) + count;
    eventCountByCamera.set(alert.cameraId, (eventCountByCamera.get(alert.cameraId) ?? 0) + count);
  }

  return {
    provenance: "REAL" as const,
    eventBasis: "analytics_alert_occurrences" as const,
    period: { startDate, endDate },
    totalEvents: alerts.reduce((sum, alert) => sum + Math.max(1, alert.occurrenceCount), 0),
    eventsByType,
    branchCount: branches.length,
    branches: branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      eventCount: (camerasByBranch.get(branch.id) ?? []).reduce(
        (sum, camera) => sum + (eventCountByCamera.get(camera.id) ?? 0),
        0,
      ),
    })),
    truncated,
  };
}

async function buildComplianceReport(store: ControlPlaneStore, user: User) {
  const [privacySummary, incidentResult, auditRecords] = await Promise.all([
    store.getPrivacySummary(user.tenantId),
    listScopedIncidents(store, user),
    store.getComplianceAuditLog(user.tenantId, { limit: 100 }),
  ]);
  const privacyIncidents = incidentResult.data.filter((incident) => {
    const text = `${incident.title ?? ""} ${incident.description ?? ""}`.toLowerCase();
    return text.includes("privacy");
  });
  const lastAuditObservedAt = auditRecords
    .map((record) => record.createdAt ?? record.occurredAt)
    .filter((value): value is string => typeof value === "string")
    .sort((left, right) => right.localeCompare(left))[0] ?? null;

  return {
    timestamp: new Date().toISOString(),
    provenance: "REAL" as const,
    privacy: {
      totalRequests: privacySummary.totalAccessRequests ?? 0,
      pendingRequests: privacySummary.pendingAccessRequests ?? 0,
      completedRequests: Math.max(
        0,
        (privacySummary.totalAccessRequests ?? 0) - (privacySummary.pendingAccessRequests ?? 0),
      ),
      breaches: privacySummary.totalBreaches ?? 0,
      openBreaches: privacySummary.openBreaches ?? 0,
      anonymizationJobs: privacySummary.anonymizationJobCount ?? 0,
    },
    dataProtection: {
      privacyIncidents: privacyIncidents.length,
      criticalPrivacyIncidents: privacyIncidents.filter((incident) =>
        incident.severity === "P1"
      ).length,
      lastAuditObservedAt,
      incidentsTruncated: incidentResult.truncated,
    },
    complianceScore: calculateComplianceScore({
      openBreaches: privacySummary.openBreaches ?? 0,
      pendingRequests: privacySummary.pendingAccessRequests ?? 0,
      privacyIncidents: privacyIncidents.length,
    }),
  };
}

async function buildMaintenanceReport(store: ControlPlaneStore, user: User) {
  const accessibleNodes = await store.listAccessibleNodes(user, "device:configure");
  const branchIds = new Set(accessibleNodes
    .filter((node) => node.type === "branch")
    .map((node) => node.id));
  const tenantWide = accessibleNodes.some((node) => node.type === "company");
  const branches = accessibleNodes.filter((node) => node.type === "branch");
  const [cameraLists, storageNodes, assets, firmwareCandidates, scheduleCandidates] = await Promise.all([
    Promise.all(branches.map((branch) =>
      store.listCamerasByBranch(user, branch.id, "device:configure")
    )),
    listScopedStorageNodes(store, user, "device:configure"),
    store.listMaintenanceAssets(user.tenantId),
    store.listFirmwareUpdatesRequired(user.tenantId),
    store.listMaintenanceSchedules(user.tenantId),
  ]);
  const cameras = cameraLists.flat();
  const scopedAssets = assets.filter((asset) =>
    asset.branchNodeId ? branchIds.has(asset.branchNodeId) : tenantWide
  );
  const scopedAssetIds = new Set(scopedAssets.map((asset) => asset.id));
  const firmwareUpdates = firmwareCandidates.filter((firmware) =>
    scopedAssetIds.has(firmware.assetId)
  );
  const schedules = scheduleCandidates.filter((schedule) => {
    if (schedule.branchNodeId) return branchIds.has(schedule.branchNodeId);
    if (schedule.assetId) return scopedAssetIds.has(schedule.assetId);
    return tenantWide;
  });
  const normalizedSchedules = schedules
    .map((schedule) => ({
      id: schedule.id,
      planId: schedule.planId ?? null,
      branchNodeId: schedule.branchNodeId ?? null,
      assetId: schedule.assetId ?? null,
      nextRunAt: schedule.nextRunAt ?? schedule.dueAt ?? null,
      cadence: schedule.cadence ?? null,
      status: schedule.status ?? "unknown",
    }))
    .filter((schedule) => schedule.nextRunAt !== null)
    .sort((left, right) => left.nextRunAt!.localeCompare(right.nextRunAt!));
  const now = new Date().toISOString();
  const activeSchedules = normalizedSchedules.filter((schedule) =>
    !["cancelled", "completed", "inactive"].includes(schedule.status)
  );
  const overdueMaintenance = activeSchedules.filter((schedule) => schedule.nextRunAt! < now).length;
  const storageIssues = summarizeStorage(storageNodes);
  const maintenanceIssues = {
    storage: {
      smartIssues: storageIssues.smartIssueCount,
      raidIssues: storageIssues.raidIssueCount,
      writeProbeFailures: storageIssues.writeProbeFailureCount,
      warningOrCritical: storageIssues.warningCount,
    },
    cameras: {
      offline: cameras.filter((camera) => camera.status === "offline").length,
      degraded: cameras.filter((camera) => camera.status === "degraded").length,
      needingFirmwareUpdate: firmwareUpdates.length,
      criticalFirmwareUpdates: firmwareUpdates.filter((firmware) =>
        firmware.criticalUpdate === true
      ).length,
    },
    overdueMaintenance,
    upcomingMaintenance: activeSchedules.filter((schedule) => schedule.nextRunAt! >= now).slice(0, 50),
    schedulesTruncated: activeSchedules.filter((schedule) => schedule.nextRunAt! >= now).length > 50,
  };
  const totalIssues = maintenanceIssues.storage.smartIssues +
    maintenanceIssues.storage.raidIssues +
    maintenanceIssues.storage.writeProbeFailures +
    maintenanceIssues.cameras.offline +
    maintenanceIssues.cameras.degraded +
    maintenanceIssues.cameras.needingFirmwareUpdate +
    overdueMaintenance;

  return {
    timestamp: new Date().toISOString(),
    provenance: "REAL" as const,
    maintenanceIssues,
    totalIssues,
    priority: determinePriority(
      totalIssues,
      maintenanceIssues.cameras.criticalFirmwareUpdates,
      overdueMaintenance,
    ),
  };
}

async function buildActivityReport(
  store: ControlPlaneStore,
  user: User,
  params: { startDate?: string; endDate?: string; branchId?: string; limit: number },
) {
  const startDate = params.startDate ?? new Date(Date.now() - 86_400_000).toISOString();
  const endDate = params.endDate ?? new Date().toISOString();
  const result = await listScopedIncidents(store, user, {
    branchId: params.branchId,
    from: startDate,
    to: endDate,
    limit: params.limit,
  });
  if (!result.branchAllowed) return null;
  const activityByHour = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  for (const incident of result.data) {
    const occurredAt = new Date(incident.occurredAt);
    if (!Number.isNaN(occurredAt.getTime())) {
      activityByHour[occurredAt.getUTCHours()]!.count += 1;
    }
  }
  const peak = activityByHour.reduce((maximum, current) =>
    current.count > maximum.count ? current : maximum
  );

  return {
    period: { startDate, endDate, timezone: "UTC" },
    provenance: "REAL" as const,
    totalActivities: result.data.length,
    recentActivity: result.data.slice(0, 20).map((incident) => ({
      ...toIncidentReportRow(incident),
      type: "incident" as const,
    })),
    activityByHour,
    peakHour: peak.count > 0 ? peak.hour : null,
    truncated: result.truncated,
  };
}

async function listScopedIncidents(
  store: ControlPlaneStore,
  user: User,
  filters: { branchId?: string; from?: string; to?: string; limit?: number } = {},
) {
  const accessibleNodes = await store.listAccessibleNodes(user, "incident:view");
  const accessibleBranchIds = new Set(accessibleNodes
    .filter((node) => node.type === "branch")
    .map((node) => node.id));
  const tenantWide = accessibleNodes.some((node) => node.type === "company");
  if (filters.branchId && !accessibleBranchIds.has(filters.branchId)) {
    return {
      data: [] as any[],
      truncated: false,
      scopeAvailable: accessibleNodes.length > 0,
      branchAllowed: false,
    };
  }
  if (accessibleBranchIds.size === 0 && !tenantWide) {
    return {
      data: [] as any[],
      truncated: false,
      scopeAvailable: false,
      branchAllowed: true,
    };
  }
  const limit = filters.limit ?? MAX_REPORT_ROWS;
  const branchIds = filters.branchId ? [filters.branchId] : [...accessibleBranchIds];
  const candidates = await store.listIncidents(user.tenantId, {
    branchIds,
    includeUnscoped: tenantWide && !filters.branchId,
    from: filters.from,
    to: filters.to,
    limit: limit + 1,
  });
  const scoped = candidates.filter((incident) =>
    incident.branchId
      ? branchIds.includes(incident.branchId)
      : tenantWide && !filters.branchId
  );
  return {
    data: scoped.slice(0, limit),
    truncated: scoped.length > limit,
    scopeAvailable: true,
    branchAllowed: true,
  };
}

async function listScopedStorageNodes(
  store: ControlPlaneStore,
  user: User,
  action: Action,
) {
  const [nodes, storageNodes] = await Promise.all([
    store.listAccessibleNodes(user, action),
    store.listRecordingStorageNodes(user.tenantId),
  ]);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const tenantWide = nodes.some((node) => node.type === "company");
  return storageNodes.filter((storageNode) =>
    storageNode.scopeNodeId ? nodeIds.has(storageNode.scopeNodeId) : tenantWide
  );
}

function summarizeStorage(storageNodes: Awaited<ReturnType<ControlPlaneStore["listRecordingStorageNodes"]>>) {
  return {
    totalCount: storageNodes.length,
    warningCount: storageNodes.filter((node) =>
      node.status === "warning" || node.status === "critical" || node.status === "offline"
    ).length,
    smartIssueCount: storageNodes.filter((node) =>
      node.smart?.overallStatus && node.smart.overallStatus !== "passed"
    ).length,
    raidIssueCount: storageNodes.filter((node) =>
      node.raid?.status && node.raid.status !== "healthy"
    ).length,
    writeProbeFailureCount: storageNodes.filter((node) =>
      node.lastWriteProbe?.status === "failed"
    ).length,
  };
}

async function canReadReportType(store: ControlPlaneStore, user: User, reportType: ReportType) {
  if (reportType === "privacy" || reportType === "compliance") {
    return hasTenantWideAccess(store, user, "audit:view");
  }
  const action: Action = reportType === "incidents" || reportType === "activity"
    ? "incident:view"
    : reportType === "analytics"
      ? "analytics:view"
      : reportType === "maintenance"
        ? "device:configure"
        : "live:view";
  return hasAnyAccess(store, user, action);
}

async function hasAnyAccess(store: ControlPlaneStore, user: User, action: Action) {
  return (await store.listAccessibleNodes(user, action)).length > 0;
}

async function hasTenantWideAccess(store: ControlPlaneStore, user: User, action: Action) {
  return (await store.listAccessibleNodes(user, action, "company")).length > 0;
}

function forbidden(reply: FastifyReply) {
  return reply.code(403).send({ error: "forbidden" });
}

function invalidInput(reply: FastifyReply, error: string, validationError: z.ZodError) {
  return reply.code(400).send({
    error,
    issues: validationError.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  });
}

function countBy(items: any[], key: string) {
  return items.reduce((counts, item) => {
    const value = typeof item[key] === "string" && item[key] ? item[key] : "unknown";
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {} as Record<string, number>);
}

function toIncidentReportRow(incident: any) {
  return {
    id: incident.id,
    incidentNumber: incident.incidentNumber,
    title: incident.title,
    status: incident.status,
    severity: incident.severity,
    occurredAt: incident.occurredAt,
    branchId: incident.branchId ?? null,
  };
}

function isIncidentClosed(status: string | undefined) {
  return status === "resolved" || status === "closed" || status === "false-alarm" ||
    status === "false_alarm" || status === "cancelled";
}

function calculateHealthScore(metrics: {
  totalCameras: number;
  onlineCameras: number;
  totalStorage: number;
  healthyStorage: number;
  openIncidents: number;
  criticalIncidents: number;
  incidentsAssessed: boolean;
}): number | null {
  const components: Array<{ score: number; weight: number }> = [];
  if (metrics.totalCameras > 0) {
    components.push({ score: (metrics.onlineCameras / metrics.totalCameras) * 100, weight: 40 });
  }
  if (metrics.totalStorage > 0) {
    components.push({ score: (metrics.healthyStorage / metrics.totalStorage) * 100, weight: 30 });
  }
  if (metrics.incidentsAssessed) {
    components.push({
      score: Math.max(0, 100 - Math.min(metrics.openIncidents * 5, 50) -
        Math.min(metrics.criticalIncidents * 15, 50)),
      weight: 30,
    });
  }
  if (components.length === 0) return null;
  const totalWeight = components.reduce((sum, component) => sum + component.weight, 0);
  return Math.round(components.reduce(
    (sum, component) => sum + component.score * component.weight,
    0,
  ) / totalWeight);
}

function determineHealthStatus(
  score: number | null,
  criticalStorage: number,
  criticalIncidents: number,
) {
  if (score === null) return "unknown";
  if (criticalStorage > 0 || criticalIncidents > 2 || score < 60) return "critical";
  if (score < 80) return "warning";
  if (score < 95) return "degraded";
  return "healthy";
}

function calculateComplianceScore(metrics: {
  openBreaches: number;
  pendingRequests: number;
  privacyIncidents: number;
}) {
  return Math.max(0, Math.min(
    100,
    100 - metrics.openBreaches * 10 - metrics.pendingRequests * 2 - metrics.privacyIncidents * 5,
  ));
}

function determinePriority(totalIssues: number, criticalFirmware: number, overdueMaintenance: number) {
  if (criticalFirmware > 0 || overdueMaintenance > 5 || totalIssues > 10) return "critical";
  if (overdueMaintenance > 0 || totalIssues > 5) return "high";
  if (totalIssues > 0) return "medium";
  return "low";
}

export function convertToCSV(data: unknown): string {
  if (Array.isArray(data)) {
    if (data.length === 0) return "";
    const rows: Array<Record<string, unknown>> = data.map((item) => isPlainObject(item)
      ? flattenObject(item)
      : { value: item });
    const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    return [
      headers.map(csvCell).join(","),
      ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
    ].join("\r\n");
  }
  const flattened = isPlainObject(data) ? flattenObject(data) : { value: data };
  return [
    `${csvCell("field")},${csvCell("value")}`,
    ...Object.entries(flattened).map(([field, value]) =>
      `${csvCell(field)},${csvCell(value)}`
    ),
  ].join("\r\n");
}

function flattenObject(
  value: Record<string, unknown>,
  prefix = "",
  output: Record<string, unknown> = {},
) {
  for (const [key, nestedValue] of Object.entries(value)) {
    const field = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(nestedValue)) {
      flattenObject(nestedValue, field, output);
    } else if (Array.isArray(nestedValue)) {
      output[field] = JSON.stringify(nestedValue);
    } else {
      output[field] = nestedValue;
    }
  }
  return output;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function csvCell(value: unknown) {
  let text = value === null || value === undefined
    ? ""
    : typeof value === "string"
      ? value
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  if (/^[\t\r\n ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

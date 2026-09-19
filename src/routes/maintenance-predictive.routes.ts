/**
 * Production predictive analytics routes.
 *
 * Values come from tenant-scoped persisted predictions, alerts, inventory, or
 * operational telemetry. Missing evidence remains unavailable.
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ControlPlaneStore } from '../control-plane-store.js';
import type { Camera, ResourceNode, User } from '../domain/models.js';
import type { OperationalTelemetryEnvelope, TelemetryValue } from '../operational-health/types.js';
import { PredictionService } from '../services/predictive-health/prediction.service.js';
import type { BranchRiskPrediction } from '../services/predictive-health/types.js';

type JsonRecord = Record<string, unknown>;
type Database = { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[] }> };

const actionSchema = z.object({
  action: z.enum(['dispatch_work_order', 'toggle_heater', 'cold_archive', 'toggle_dynamic_bitrate', 'cycle_poe', 'toggle_edge_fallback', 'toggle_patrol', 'toggle_geofence']),
  targetId: z.string().min(1),
  payload: z.record(z.unknown()).optional(),
});

function currentUser(request: FastifyRequest, reply: FastifyReply): User | null {
  if (!request.currentUser?.tenantId) {
    void reply.code(401).send({ error: 'unauthorized', message: 'Authentication is required.' });
    return null;
  }
  return request.currentUser;
}

function database(store: ControlPlaneStore): Database | undefined {
  const candidate = store as unknown as { db?: Database; query?: Database['query'] };
  if (candidate.db?.query) return candidate.db;
  if (typeof candidate.query === 'function') return { query: candidate.query.bind(candidate) };
  return undefined;
}

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function metric(metrics: Record<string, TelemetryValue>, ...names: string[]): TelemetryValue | undefined {
  for (const name of names) if (metrics[name] !== undefined && metrics[name] !== null) return metrics[name];
  return undefined;
}

function finite(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function finiteMetric(metrics: Record<string, TelemetryValue>, ...names: string[]): number | null {
  return finite(metric(metrics, ...names));
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringMetric(metrics: Record<string, TelemetryValue>, ...names: string[]): string | null {
  return stringValue(metric(metrics, ...names));
}

function booleanMetric(metrics: Record<string, TelemetryValue>, ...names: string[]): boolean | null {
  const value = metric(metrics, ...names);
  return typeof value === 'boolean' ? value : null;
}

function clamp(value: number, min = 0, max = 100) { return Math.min(max, Math.max(min, value)); }
function round(value: number, digits = 1) { const factor = 10 ** digits; return Math.round(value * factor) / factor; }
function percentage(value: unknown): number | null {
  const number = finite(value);
  return number === null ? null : clamp(number <= 1 ? number * 100 : number);
}
function branchName(branches: Map<string, ResourceNode>, branchId?: string | null) {
  return branchId ? branches.get(branchId)?.name ?? branchId : 'Unassigned branch';
}
function closestPrediction(predictions: BranchRiskPrediction[], requested: number) {
  return [...predictions].sort((a, b) => Math.abs(a.horizonHours - requested) - Math.abs(b.horizonHours - requested))[0];
}
function alertDetails(alert: JsonRecord) { return record(alert.details); }
function alertScore(alert: JsonRecord) { return percentage(alert.score ?? alert.probability ?? alertDetails(alert).probability); }
function isOpenWorkOrder(order: { status: string }) { return !['resolved', 'closed'].includes(order.status); }
function sourceFreshness(telemetry: OperationalTelemetryEnvelope[]) {
  const values = telemetry.map((item) => Date.parse(item.observedAt)).filter(Number.isFinite);
  return values.length ? new Date(Math.max(...values)).toISOString() : null;
}

async function loadModelMetrics(store: ControlPlaneStore, tenantId: string) {
  const db = database(store);
  if (!db) return null;
  try {
    const result = await db.query(
      `SELECT model_name, model_version, model_type, accuracy, deployed_at, updated_at
       FROM prediction_models
       WHERE is_active=true AND (tenant_id=$1 OR tenant_id IS NULL)
       ORDER BY CASE WHEN tenant_id=$1 THEN 0 ELSE 1 END, COALESCE(deployed_at, updated_at) DESC LIMIT 1`,
      [tenantId],
    );
    const row = result.rows[0];
    if (!row) return null;
    const accuracy = finite(row.accuracy);
    return {
      name: row.model_name,
      version: row.model_version,
      type: row.model_type,
      accuracy: accuracy === null ? null : round(accuracy * 100, 2),
      aucScore: null,
      totalSamples: null,
      lastTrained: row.deployed_at ?? row.updated_at ?? null,
    };
  } catch { return null; }
}

async function loadOutcomeCounts(store: ControlPlaneStore, tenantId: string) {
  const db = database(store);
  if (!db) return { outcomeCount: null, correctCount: null };
  try {
    const result = await db.query(
      `SELECT COUNT(*)::int AS outcome_count, COUNT(*) FILTER (WHERE outcome='correct')::int AS correct_count
       FROM prediction_outcomes po JOIN failure_predictions fp ON fp.id=po.prediction_id WHERE fp.tenant_id=$1`,
      [tenantId],
    );
    return { outcomeCount: finite(result.rows[0]?.outcome_count), correctCount: finite(result.rows[0]?.correct_count) };
  } catch { return { outcomeCount: null, correctCount: null }; }
}

async function livePredictions(service: PredictionService, branches: ResourceNode[], tenantId: string) {
  const results = await Promise.allSettled(branches.map((branch) => service.getLatestPredictions(branch.id, tenantId)));
  const values = new Map<string, BranchRiskPrediction[]>();
  results.forEach((result, index) => values.set(branches[index]!.id, result.status === 'fulfilled' ? result.value : []));
  return values;
}

function mapCameraRisks(
  cameras: Camera[], telemetry: OperationalTelemetryEnvelope[], alerts: JsonRecord[],
  branches: Map<string, ResourceNode>, workOrders: Array<{ id: string; workOrderNumber: string; assetId?: string; status: string }>,
) {
  const cameraById = new Map(cameras.map((camera) => [camera.id, camera]));
  const telemetryById = new Map(telemetry.filter((item) => item.deviceType === 'camera').map((item) => [item.deviceId, item]));
  return alerts.flatMap((alert) => {
    const details = alertDetails(alert);
    const assetId = stringValue(alert.assetId ?? details.assetId ?? details.cameraId);
    const camera = assetId ? cameraById.get(assetId) : undefined;
    const kind = String(alert.type ?? alert.alertType ?? details.type ?? '').toLowerCase();
    const probability = alertScore(alert);
    if (!camera || probability === null || (!kind.includes('camera') && !kind.includes('failure'))) return [];
    const observed = telemetryById.get(camera.id);
    const health = percentage(details.healthScore ?? observed?.metrics.healthScore);
    const failureAt = stringValue(alert.predictedFailureDate ?? details.predictedFailureDate);
    const timeToFailureHours = failureAt ? Math.max(0, round((Date.parse(failureAt) - Date.now()) / 3_600_000, 0)) : finite(details.timeToFailureHours);
    const order = workOrders.find((item) => item.assetId === camera.id && isOpenWorkOrder(item));
    return [{
      id: camera.id, name: camera.name, zone: camera.locationType ?? stringValue(details.zone) ?? 'Unspecified',
      branch: branchName(branches, camera.branchId), failureProbability: round(probability, 1), timeToFailureHours,
      healthScore: health === null ? null : round(health, 1), mtbfRemainingHours: finite(details.mtbfRemainingHours),
      primaryFactor: stringValue(details.primaryFactor ?? details.reason ?? alert.type ?? alert.alertType) ?? 'Predictive alert',
      factorImpact: percentage(details.factorImpact ?? alert.score),
      recommendedAction: stringValue(details.recommendedAction ?? details.remediation) ?? 'Review the prediction evidence and inspect the asset.',
      dispatched: Boolean(order), ticketId: order?.workOrderNumber,
      observedAt: observed?.observedAt ?? stringValue(alert.detectedAt ?? alert.createdAt), dataQuality: observed?.quality ?? null,
    }];
  });
}

function mapStorage(telemetry: OperationalTelemetryEnvelope[], branches: Map<string, ResourceNode>) {
  return telemetry.filter((item) => item.deviceType === 'disk').map((item) => {
    const totalBytes = finiteMetric(item.metrics, 'totalBytes', 'capacityBytes');
    const usedBytes = finiteMetric(item.metrics, 'usedBytes');
    const capacityGb = finiteMetric(item.metrics, 'capacityGB');
    const usedGb = finiteMetric(item.metrics, 'usedGB');
    const totalTb = totalBytes !== null ? totalBytes / 1e12 : capacityGb !== null ? capacityGb / 1000 : null;
    const usedTb = usedBytes !== null ? usedBytes / 1e12 : usedGb !== null ? usedGb / 1000 : null;
    const freeBytes = finiteMetric(item.metrics, 'freeBytes', 'availableBytes');
    const dailyWriteBytes = finiteMetric(item.metrics, 'dailyWriteRateBytes', 'growthRatePerDay');
    const daysRemaining = finiteMetric(item.metrics, 'estimatedDaysRemaining', 'daysRemaining')
      ?? (freeBytes !== null && dailyWriteBytes !== null && dailyWriteBytes > 0 ? freeBytes / dailyWriteBytes : null);
    const dailyIngestGb = dailyWriteBytes === null ? finiteMetric(item.metrics, 'dailyIngestGb') : dailyWriteBytes / 1e9;
    const acceleration = finiteMetric(item.metrics, 'growthAcceleration');
    return {
      id: item.deviceId, name: stringMetric(item.metrics, 'name', 'deviceName', 'model') ?? item.deviceId,
      branch: branchName(branches, item.branchId), tier: stringMetric(item.metrics, 'tier', 'storageTier', 'mediaType') ?? 'Storage',
      totalTb: totalTb === null ? null : round(totalTb, 2), usedTb: usedTb === null ? null : round(usedTb, 2),
      dailyIngestGb: dailyIngestGb === null ? null : round(dailyIngestGb, 2), daysRemaining: daysRemaining === null ? null : round(daysRemaining, 1),
      trend: acceleration !== null && acceleration > 0 ? 'accelerated' : dailyWriteBytes !== null ? 'linear' : 'unknown',
      smartStatus: stringMetric(item.metrics, 'smartStatus'), observedAt: item.observedAt, dataQuality: item.quality,
    };
  });
}

function mapNetwork(telemetry: OperationalTelemetryEnvelope[], branches: Map<string, ResourceNode>) {
  return telemetry.filter((item) => ['network', 'switch', 'router', 'sdwan'].includes(item.deviceType)).map((item) => {
    const packetLoss = finiteMetric(item.metrics, 'packetLossPercent', 'packetLossPct');
    const suppliedHealth = percentage(metric(item.metrics, 'healthScore'));
    const linkHealth = suppliedHealth ?? (packetLoss === null ? null : clamp(100 - packetLoss * 8));
    return {
      id: item.deviceId, model: stringMetric(item.metrics, 'model', 'name') ?? item.deviceId,
      branch: branchName(branches, item.branchId), role: stringMetric(item.metrics, 'role') ?? item.deviceType,
      linkHealth: linkHealth === null ? null : round(linkHealth, 1), packetLossPct: packetLoss,
      crcErrorsPerHour: finiteMetric(item.metrics, 'crcErrorsPerHour', 'crcErrorRate'),
      poeWattageUsed: finiteMetric(item.metrics, 'poePowerUsageWatts', 'poeWattageUsed'),
      poeWattageMax: finiteMetric(item.metrics, 'poePowerAvailableWatts', 'poeWattageMax'),
      tempC: finiteMetric(item.metrics, 'temperatureCelsius', 'temperatureC', 'temperature'),
      failurePredictionHours: finiteMetric(item.metrics, 'failurePredictionHours', 'estimatedFailureHours'),
      portStatus: stringMetric(item.metrics, 'healthStatus', 'status')?.toUpperCase() ?? 'UNKNOWN',
      observedAt: item.observedAt, dataQuality: item.quality,
    };
  });
}

function mapRecordings(telemetry: OperationalTelemetryEnvelope[], branches: Map<string, ResourceNode>) {
  return telemetry.filter((item) => ['recorder-channel', 'archive'].includes(item.deviceType)).map((item) => {
    const gapSeconds = finiteMetric(item.metrics, 'largestGapSeconds', 'continuityGapSeconds');
    const gapRisk = percentage(metric(item.metrics, 'gapRiskPercent', 'gapRiskPct')) ?? (gapSeconds === null ? null : clamp(gapSeconds / 3));
    return {
      id: item.deviceId, channelName: stringMetric(item.metrics, 'name', 'channelName', 'cameraName') ?? item.deviceId,
      nvrId: stringMetric(item.metrics, 'recorderId') ?? 'Unknown recorder', branch: branchName(branches, item.branchId),
      writeQueueDepthMs: finiteMetric(item.metrics, 'writeQueueDepthMs'), targetFps: finiteMetric(item.metrics, 'targetFps', 'configuredFps'),
      measuredFps: finiteMetric(item.metrics, 'measuredFps', 'fps'), frameDropRiskPct: percentage(metric(item.metrics, 'frameDropRiskPercent', 'frameDropRiskPct')),
      gapRiskPct: gapRisk === null ? null : round(gapRisk, 1), gapWindowHours: gapSeconds === null ? null : round(gapSeconds / 3600, 2),
      edgeFallbackEngaged: booleanMetric(item.metrics, 'edgeFallbackEngaged', 'localBufferActive'), observedAt: item.observedAt, dataQuality: item.quality,
    };
  });
}

function mapBranches(branches: ResourceNode[], predictions: Map<string, BranchRiskPrediction[]>, horizonHours: number) {
  return branches.flatMap((branch) => {
    const prediction = closestPrediction(predictions.get(branch.id) ?? [], horizonHours);
    if (!prediction) return [];
    const risk = round(prediction.probability * 100, 1);
    return [{
      id: branch.id, name: branch.name, code: branch.id, vulnerabilityScore: risk,
      target: prediction.target, confidence: prediction.confidence, dataQuality: prediction.dataQuality,
      primaryRiskDriver: prediction.primaryRiskDriver, recommendedAction: prediction.recommendations[0]?.action ?? null,
      trend: prediction.riskFactors[0]?.trend?.toLowerCase() ?? 'unknown', horizonHours: prediction.horizonHours,
      generatedAt: prediction.generatedAt.toISOString(), expiresAt: prediction.expiresAt.toISOString(),
    }];
  });
}

function mapIncidents(alerts: JsonRecord[], branches: Map<string, ResourceNode>) {
  return alerts.flatMap((alert) => {
    const details = alertDetails(alert);
    const kind = String(alert.type ?? alert.alertType ?? '').toLowerCase();
    const score = alertScore(alert);
    if (score === null || !['incident', 'security', 'threat', 'intrusion', 'loiter', 'tamper'].some((word) => kind.includes(word))) return [];
    const detectedAt = stringValue(alert.detectedAt ?? alert.createdAt);
    const branchId = stringValue(alert.branchNodeId ?? details.branchId);
    return [{
      id: String(alert.id), category: stringValue(details.category ?? alert.type ?? alert.alertType) ?? 'Security risk',
      baselineRatePct: percentage(details.baselineRatePct), peakRiskPct: round(score, 1),
      peakWindow: stringValue(details.peakWindow ?? details.predictedWindow), peakDay: stringValue(details.peakDay),
      hazardLevel: score >= 70 ? 'HIGH' : score >= 40 ? 'MODERATE' : 'ELEVATED',
      primaryIndicator: stringValue(details.primaryIndicator ?? details.reason) ?? 'Persisted predictive alert',
      countermeasure: stringValue(details.countermeasure ?? details.remediation) ?? 'Review alert evidence and apply the approved response procedure.',
      branch: branchName(branches, branchId), detectedAt,
    }];
  });
}

function mapSmartDrives(telemetry: OperationalTelemetryEnvelope[], branches: Map<string, ResourceNode>) {
  return telemetry.filter((item) => item.deviceType === 'disk').map((item) => ({
    id: item.deviceId, bay: stringMetric(item.metrics, 'bay', 'slot') ?? item.deviceId,
    model: stringMetric(item.metrics, 'model'), serial: stringMetric(item.metrics, 'serialNumber', 'serial'),
    capacityBytes: finiteMetric(item.metrics, 'capacityBytes', 'totalBytes'), tempC: finiteMetric(item.metrics, 'temperatureC', 'temperature'),
    reallocatedSectors: finiteMetric(item.metrics, 'reallocatedSectors'), pendingSectors: finiteMetric(item.metrics, 'pendingSectors'),
    hoursPowered: finiteMetric(item.metrics, 'powerOnHours'), estimatedCrashHours: finiteMetric(item.metrics, 'estimatedCrashHours', 'failurePredictionHours'),
    riskScore: percentage(metric(item.metrics, 'riskScore', 'failureProbability')),
    status: stringMetric(item.metrics, 'smartStatus', 'healthStatus', 'status')?.toUpperCase() ?? 'UNKNOWN',
    nvrId: stringMetric(item.metrics, 'recorderId'), branch: branchName(branches, item.branchId), observedAt: item.observedAt, dataQuality: item.quality,
  }));
}

async function buildDashboard(store: ControlPlaneStore, service: PredictionService, user: User, horizonHours: number) {
  const [branches, cameras, telemetry, alerts, assets, workOrders, modelMetrics, outcomes] = await Promise.all([
    store.listAccessibleNodes(user, 'recording:view', 'branch'), store.listCameras(user.tenantId),
    store.listLatestOperationalTelemetry(user.tenantId), store.listPredictiveAlerts(user.tenantId),
    store.listMaintenanceAssets(user.tenantId), store.listWorkOrders(user.tenantId),
    loadModelMetrics(store, user.tenantId), loadOutcomeCounts(store, user.tenantId),
  ]);
  const branchMap = new Map(branches.map((branch) => [branch.id, branch]));
  const predictionMap = await livePredictions(service, branches, user.tenantId);
  const predictions = [...predictionMap.values()].flat();
  const alertRecords = alerts.map(record);
  const camerasView = mapCameraRisks(cameras, telemetry, alertRecords, branchMap, workOrders);
  const volumes = mapStorage(telemetry, branchMap);
  const switches = mapNetwork(telemetry, branchMap);
  const recordings = mapRecordings(telemetry, branchMap);
  const branchesView = mapBranches(branches, predictionMap, horizonHours);
  const incidents = mapIncidents(alertRecords, branchMap);
  const earliestVolume = volumes.filter((item) => item.daysRemaining !== null).sort((a, b) => a.daysRemaining! - b.daysRemaining!)[0];
  const networkWithHealth = switches.filter((item) => item.linkHealth !== null);
  const highestRisk = [...branchesView].sort((a, b) => b.vulnerabilityScore - a.vulnerabilityScore)[0];
  const topIncident = [...incidents].sort((a, b) => b.peakRiskPct - a.peakRiskPct)[0];
  const healthValues = [...camerasView.map((item) => item.healthScore), ...networkWithHealth.map((item) => item.linkHealth), ...branchesView.map((item) => 100 - item.vulnerabilityScore)].filter((item): item is number => item !== null);
  const evaluatedAccuracy = outcomes.outcomeCount && outcomes.correctCount !== null ? round(outcomes.correctCount / outcomes.outcomeCount * 100, 2) : null;
  return {
    generatedAt: new Date().toISOString(), horizonHours,
    freshness: { latestTelemetryAt: sourceFreshness(telemetry), telemetryRecords: telemetry.length, activePredictions: predictions.length, predictiveAlerts: alertRecords.length },
    kpis: {
      predictedFailuresCount: predictions.filter((item) => item.probability >= 0.7 && item.horizonHours <= horizonHours).length,
      fleetHealthScore: healthValues.length ? round(healthValues.reduce((sum, value) => sum + value, 0) / healthValues.length, 1) : null,
      healthScoreDelta: null, earliestDiskExhaustDays: earliestVolume?.daysRemaining ?? null,
      earliestDiskExhaustAsset: earliestVolume?.name ?? null,
      earliestDiskUsagePct: earliestVolume?.totalTb && earliestVolume.usedTb !== null ? round(earliestVolume.usedTb / earliestVolume.totalTb * 100, 1) : null,
      networkHealthPct: networkWithHealth.length ? round(networkWithHealth.reduce((sum, item) => sum + item.linkHealth!, 0) / networkWithHealth.length, 1) : null,
      networkWarningCount: networkWithHealth.filter((item) => item.linkHealth! < 80).length,
      highestRiskBranch: highestRisk?.name ?? null, highestRiskBranchScore: highestRisk?.vulnerabilityScore ?? null,
      peakIncidentWindow: topIncident?.peakWindow ?? null, peakIncidentCategory: topIncident?.category ?? null,
    },
    cameras: camerasView, volumes, switches, recordings, branches: branchesView, incidents,
    criticalDrives: mapSmartDrives(telemetry, branchMap),
    modelMetrics: modelMetrics ? { ...modelMetrics, accuracy: evaluatedAccuracy ?? modelMetrics.accuracy, totalSamples: outcomes.outcomeCount } : null,
    totalAssetsMonitored: assets.length || cameras.length + telemetry.length,
    openWorkOrdersCount: workOrders.filter(isOpenWorkOrder).length,
  };
}

async function collectPredictions(service: PredictionService, store: ControlPlaneStore, user: User) {
  const branches = await store.listAccessibleNodes(user, 'recording:view', 'branch');
  return [...(await livePredictions(service, branches, user.tenantId)).values()].flat();
}

export async function registerPredictiveAnalyticsRoutes(app: FastifyInstance, store: ControlPlaneStore) {
  const predictionService = new PredictionService(store);

  app.get('/v1/maintenance/predictive/dashboard', async (request, reply) => {
    const user = currentUser(request, reply); if (!user) return;
    const { horizonHours } = z.object({ horizonHours: z.coerce.number().int().min(1).max(8760).default(48) }).parse(request.query);
    return buildDashboard(store, predictionService, user, horizonHours);
  });

  app.post('/v1/maintenance/predictive/action', async (request, reply) => {
    const user = currentUser(request, reply); if (!user) return;
    const body = actionSchema.parse(request.body);
    if (body.action !== 'dispatch_work_order') return reply.code(501).send({ error: 'action_not_supported', message: `${body.action} has no production device-command integration. No change was made.` });
    const [camera, asset, accessibleBranches] = await Promise.all([
      store.getCamera(body.targetId),
      store.getMaintenanceAsset(body.targetId),
      store.listAccessibleNodes(user, 'device:configure', 'branch'),
    ]);
    const accessibleBranchIds = new Set(accessibleBranches.map((branch) => branch.id));
    const cameraOwned = camera && (!camera.tenantId || camera.tenantId === user.tenantId) && accessibleBranchIds.has(camera.branchId);
    const assetOwned = asset?.tenantId === user.tenantId
      && (!asset.branchNodeId || accessibleBranchIds.has(asset.branchNodeId));
    if (!cameraOwned && !assetOwned) return reply.code(404).send({ error: 'asset_not_found' });
    const existing = (await store.listWorkOrders(user.tenantId)).find((order) => order.assetId === body.targetId && isOpenWorkOrder(order));
    if (existing) return { success: true, ticketId: existing.workOrderNumber, workOrderId: existing.id, alreadyOpen: true };
    const created = await store.createWorkOrder({
      tenantId: user.tenantId, workOrderNumber: `WO-PRD-${randomUUID().slice(0, 8).toUpperCase()}`, assetId: body.targetId,
      branchNodeId: camera?.branchId ?? asset?.branchNodeId,
      problem: `Review active predictive failure alert for ${camera?.name ?? asset?.assetType ?? body.targetId}`,
      severity: 'high', status: 'open', createdBy: user.id,
    });
    await store.writeAudit({ tenantId: user.tenantId, actorUserId: user.id, action: 'maintenance.predictive_workorder_created',
      resourceNodeId: camera?.nodeId ?? camera?.branchId ?? asset?.branchNodeId ?? null, outcome: 'success',
      details: { workOrderId: created.id, workOrderNumber: created.workOrderNumber, assetId: body.targetId } });
    return { success: true, ticketId: created.workOrderNumber, workOrderId: created.id };
  });

  app.get('/v1/maintenance/predictive/smart-telemetry', async (request, reply) => {
    const user = currentUser(request, reply); if (!user) return;
    const [branches, telemetry] = await Promise.all([store.listAccessibleNodes(user, 'recording:view', 'branch'), store.listLatestOperationalTelemetry(user.tenantId)]);
    const data = mapSmartDrives(telemetry, new Map(branches.map((branch) => [branch.id, branch])));
    return { data, count: data.length, latestTelemetryAt: sourceFreshness(telemetry) };
  });

  app.post('/v1/maintenance/predictive/train/failure-model', async (request, reply) => {
    const user = currentUser(request, reply); if (!user) return;
    z.object({ historicalDays: z.number().int().min(30).max(730).default(365) }).parse(request.body ?? {});
    return reply.code(501).send({ error: 'training_pipeline_unavailable', message: 'No production model-training job runner is configured. No model was changed.' });
  });
  app.post('/v1/maintenance/predictive/update-baseline', async (request, reply) => {
    const user = currentUser(request, reply); if (!user) return;
    return reply.code(501).send({ error: 'baseline_job_unavailable', message: 'No production baseline-update job runner is configured. No baseline was changed.' });
  });
  app.get('/v1/maintenance/predictive/failure/:predictionId', async (request, reply) => {
    const user = currentUser(request, reply); if (!user) return;
    const { predictionId } = z.object({ predictionId: z.string().min(1) }).parse(request.params);
    const prediction = await predictionService.getPrediction(predictionId, user.tenantId);
    return prediction ? { prediction } : reply.code(404).send({ error: 'prediction_not_found' });
  });
  app.get('/v1/maintenance/predictive/high-risk-assets', async (request, reply) => {
    const user = currentUser(request, reply); if (!user) return;
    const query = z.object({ riskThreshold: z.coerce.number().min(0).max(100).default(70), limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(request.query);
    const predictions = (await collectPredictions(predictionService, store, user)).filter((item) => item.probability * 100 >= query.riskThreshold).sort((a, b) => b.probability - a.probability).slice(0, query.limit);
    return { predictions, count: predictions.length, threshold: query.riskThreshold };
  });
  app.get('/v1/maintenance/predictive/failure/all', async (request, reply) => {
    const user = currentUser(request, reply); if (!user) return;
    const predictions = await collectPredictions(predictionService, store, user);
    return { predictions, total: predictions.length, summary: Object.fromEntries(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((level) => [level.toLowerCase(), predictions.filter((item) => item.riskLevel === level).length])) };
  });
  app.get('/v1/maintenance/predictive/anomalies', async (request, reply) => {
    const user = currentUser(request, reply); if (!user) return;
    const anomalies = (await store.listPredictiveAlerts(user.tenantId)).map(record).filter((item) => String(item.type ?? item.alertType ?? '').toLowerCase().includes('anomal'));
    return { anomalies, total: anomalies.length };
  });
  app.get('/v1/maintenance/predictive/forecast/storage-capacity', async (request, reply) => {
    const user = currentUser(request, reply); if (!user) return;
    const forecasts = (await collectPredictions(predictionService, store, user)).filter((item) => item.target === 'STORAGE_EXHAUSTION');
    return { forecasts, count: forecasts.length };
  });
  app.get('/v1/maintenance/predictive/health-score/all', async (request, reply) => {
    const user = currentUser(request, reply); if (!user) return;
    const latest = new Map<string, BranchRiskPrediction>();
    for (const prediction of await collectPredictions(predictionService, store, user)) {
      const current = latest.get(prediction.branchId);
      if (!current || prediction.generatedAt > current.generatedAt) latest.set(prediction.branchId, prediction);
    }
    const healthScores = [...latest.values()].map((item) => ({ branchId: item.branchId, score: round((1 - item.probability) * 100, 1), predictionId: item.id, generatedAt: item.generatedAt }));
    return { healthScores, total: healthScores.length, average: healthScores.length ? round(healthScores.reduce((sum, item) => sum + item.score, 0) / healthScores.length, 1) : null };
  });
}

export const predictiveDashboardInternals = { buildDashboard, mapStorage, mapNetwork, mapRecordings, mapSmartDrives };

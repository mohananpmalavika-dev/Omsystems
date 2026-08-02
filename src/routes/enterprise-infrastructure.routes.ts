import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import {
  buildActiveInfrastructureIncidents,
  buildInfrastructureGraph,
  buildInfrastructureHealthSnapshot,
  buildRootCauseStatistics,
  getCameraInfrastructurePath,
  predictInfrastructureFailures,
  type InfrastructureDomain,
} from "../infrastructure/enterprise-monitoring.js";

const branchParams = z.object({ branchId: z.string().min(1) });
const cameraParams = z.object({ cameraId: z.string().min(1) });
const incidentQuery = z.object({ branchId: z.string().min(1).optional() });
const statisticsQuery = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

export async function registerEnterpriseInfrastructureRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  app.get("/v1/infrastructure/health/tenant/summary", async (request) => {
    const branches = await store.listAccessibleNodes(request.currentUser, "recording:view", "branch");
    const telemetry = await store.listLatestOperationalTelemetry(request.currentUser.tenantId, branches.map((branch) => branch.id));
    const snapshots = await mapWithConcurrency(branches, 20, async (branch) => buildInfrastructureHealthSnapshot({
      branch,
      cameras: await store.listCamerasByBranch(request.currentUser, branch.id, "recording:view"),
      telemetry: telemetry.filter((item) => item.branchId === branch.id),
    }));
    const domains: InfrastructureDomain[] = ["power", "network", "compute", "storage", "cooling", "security", "surveillance"];
    return {
      success: true,
      data: {
        averageScore: average(snapshots.map((snapshot) => snapshot.overallScore)),
        evidenceCoveragePercent: average(snapshots.map((snapshot) => snapshot.evidenceCoveragePercent)) ?? 0,
        domainAverages: Object.fromEntries(domains.map((domain) => [
          domain,
          average(snapshots.map((snapshot) => snapshot.domains[domain].score)),
        ])),
        totalCriticalAlerts: snapshots.reduce((sum, snapshot) => sum + snapshot.criticalIssues, 0),
        totalWarningAlerts: snapshots.reduce((sum, snapshot) => sum + snapshot.warningIssues, 0),
        predictedFailuresCount: snapshots.reduce((sum, snapshot) => sum + snapshot.predictedFailures, 0),
        branchCount: snapshots.length,
        instrumentedBranchCount: snapshots.filter((snapshot) => snapshot.overallScore !== null).length,
        lastUpdated: newest(snapshots.map((snapshot) => snapshot.lastUpdated)) ?? new Date().toISOString(),
      },
    };
  });

  app.get("/v1/infrastructure/health/:branchId", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    const branch = await viewableBranch(request, reply, store, branchId);
    if (!branch) return;
    const [cameras, telemetry] = await Promise.all([
      store.listCamerasByBranch(request.currentUser, branchId, "recording:view"),
      store.listLatestOperationalTelemetry(request.currentUser.tenantId, [branchId]),
    ]);
    return { success: true, data: buildInfrastructureHealthSnapshot({ branch, cameras, telemetry }) };
  });

  app.get("/v1/infrastructure/rca/incidents/active", async (request, reply) => {
    const query = incidentQuery.parse(request.query);
    let branches = await store.listAccessibleNodes(request.currentUser, "recording:view", "branch");
    if (query.branchId) {
      if (!branches.some((branch) => branch.id === query.branchId)) return reply.code(403).send({ error: "forbidden" });
      branches = branches.filter((branch) => branch.id === query.branchId);
    }
    const telemetry = await store.listLatestOperationalTelemetry(request.currentUser.tenantId, branches.map((branch) => branch.id));
    const incidents = (await mapWithConcurrency(branches, 20, async (branch) => buildActiveInfrastructureIncidents({
      branch,
      cameras: await store.listCamerasByBranch(request.currentUser, branch.id, "recording:view"),
      telemetry: telemetry.filter((item) => item.branchId === branch.id),
    }))).flat();
    return { success: true, data: incidents };
  });

  app.get("/v1/infrastructure/rca/branch/:branchId/statistics", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    const { days } = statisticsQuery.parse(request.query);
    const branch = await viewableBranch(request, reply, store, branchId);
    if (!branch) return;
    const to = new Date();
    const from = new Date(to.getTime() - days * 86_400_000);
    const telemetry = await store.listOperationalTelemetryHistory(
      request.currentUser.tenantId, branchId, from.toISOString(), to.toISOString(), 5000,
    );
    return { success: true, data: buildRootCauseStatistics(telemetry, days) };
  });

  app.get("/v1/infrastructure/predicted-failures/:branchId", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    const branch = await viewableBranch(request, reply, store, branchId);
    if (!branch) return;
    const telemetry = await store.listLatestOperationalTelemetry(request.currentUser.tenantId, [branchId]);
    return { success: true, data: predictInfrastructureFailures(telemetry) };
  });

  app.get("/v1/infrastructure/graph/:branchId", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    const branch = await viewableBranch(request, reply, store, branchId);
    if (!branch) return;
    const [cameras, telemetry] = await Promise.all([
      store.listCamerasByBranch(request.currentUser, branchId, "recording:view"),
      store.listLatestOperationalTelemetry(request.currentUser.tenantId, [branchId]),
    ]);
    return { success: true, data: buildInfrastructureGraph({ branchId, cameras, telemetry }) };
  });

  app.get("/v1/infrastructure/rca/camera/:cameraId/infrastructure-path", async (request, reply) => {
    const { cameraId } = cameraParams.parse(request.params);
    const camera = await store.getCamera(cameraId);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    const branch = await viewableBranch(request, reply, store, camera.branchId);
    if (!branch) return;
    const [cameras, telemetry] = await Promise.all([
      store.listCamerasByBranch(request.currentUser, camera.branchId, "recording:view"),
      store.listLatestOperationalTelemetry(request.currentUser.tenantId, [camera.branchId]),
    ]);
    const graph = buildInfrastructureGraph({ branchId: camera.branchId, cameras, telemetry });
    return { success: true, data: getCameraInfrastructurePath(graph, cameraId), graphCoverage: graph.mappingCoveragePercent };
  });
}

async function viewableBranch(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  branchId: string,
) {
  const branch = await store.getNode(branchId);
  if (!branch || branch.type !== "branch") {
    await reply.code(404).send({ error: "branch_not_found" });
    return undefined;
  }
  const decision = await store.checkAccess(request.currentUser, "recording:view", branchId);
  if (!decision?.allowed) {
    await reply.code(403).send({ error: "forbidden" });
    return undefined;
  }
  return branch;
}

function average(values: Array<number | null>) {
  const known = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return known.length === 0 ? null : Math.round(known.reduce((sum, value) => sum + value, 0) / known.length * 10) / 10;
}

function newest(values: string[]) {
  return [...values].filter((value) => Number.isFinite(Date.parse(value))).sort().at(-1) ?? null;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>) {
  const result = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      result[index] = await mapper(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return result;
}

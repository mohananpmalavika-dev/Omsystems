import type { CommandCenterDiagnosis } from "./types.js";

export function correlateBranchDiagnoses(diagnoses: CommandCenterDiagnosis[]) {
  const rootCauseMap = new Map<string, {
    code: string;
    label: string;
    branchIds: Set<string>;
    confidenceTotal: number;
    count: number;
  }>();
  const signalMap = new Map<string, {
    entityType: string;
    signal: string;
    branchIds: Set<string>;
    entityIds: Set<string>;
  }>();
  const unhealthyStatuses = new Set(['warning', 'degraded', 'critical', 'offline']);

  for (const diagnosis of diagnoses) {
    const root = diagnosis.rootCause;
    const cluster = rootCauseMap.get(root.code) ?? {
      code: root.code,
      label: root.label,
      branchIds: new Set<string>(),
      confidenceTotal: 0,
      count: 0,
    };
    cluster.branchIds.add(diagnosis.branch.id);
    cluster.confidenceTotal += root.confidence;
    cluster.count += 1;
    rootCauseMap.set(root.code, cluster);

    for (const entity of diagnosis.graph.entities) {
      if (entity.entityType === 'branch' || !unhealthyStatuses.has(entity.status)) continue;
      const signals = entity.reasonCodes.length ? entity.reasonCodes : [entity.status];
      for (const signal of signals) {
        const key = `${entity.entityType}:${signal}`;
        const entry = signalMap.get(key) ?? {
          entityType: entity.entityType,
          signal,
          branchIds: new Set<string>(),
          entityIds: new Set<string>(),
        };
        entry.branchIds.add(diagnosis.branch.id);
        entry.entityIds.add(entity.id);
        signalMap.set(key, entry);
      }
    }
  }

  return {
    branches: diagnoses.map((diagnosis) => ({
      id: diagnosis.branch.id,
      name: diagnosis.branch.name,
      status: diagnosis.status.label,
      rootCause: diagnosis.rootCause,
      impact: diagnosis.impact,
      evidenceCount: diagnosis.evidence.length,
      missingEvidence: diagnosis.missingEvidence,
      lastUpdatedAt: diagnosis.lastUpdatedAt,
    })),
    rootCauseClusters: [...rootCauseMap.values()]
      .map((cluster) => ({
        code: cluster.code,
        label: cluster.label,
        branchIds: [...cluster.branchIds].sort(),
        branchCount: cluster.branchIds.size,
        averageConfidence: Math.round((cluster.confidenceTotal / cluster.count) * 1_000) / 1_000,
      }))
      .sort((left, right) => right.branchCount - left.branchCount || right.averageConfidence - left.averageConfidence),
    crossBranchSignals: [...signalMap.values()]
      .filter((signal) => signal.branchIds.size >= 2)
      .map((signal) => ({
        entityType: signal.entityType,
        signal: signal.signal,
        branchIds: [...signal.branchIds].sort(),
        branchCount: signal.branchIds.size,
        entityIds: [...signal.entityIds].sort(),
      }))
      .sort((left, right) => right.branchCount - left.branchCount || left.signal.localeCompare(right.signal)),
  };
}

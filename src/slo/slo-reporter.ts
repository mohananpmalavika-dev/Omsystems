/**
 * VMS SLO Reporter
 *
 * Provides human-readable catalogue access and report helpers
 * that sit on top of SloMeasurementEngine.
 */

import { SLO_DEFINITIONS, SLO_ORDER } from "./slo-definitions.js";
import type { SloDefinition, SloId } from "./slo-types.js";

// ── Definition Catalogue ─────────────────────────────────────────────────────

export interface SloDefinitionCatalogue {
  total: number;
  definitions: Array<{
    id: SloId;
    name: string;
    kind: string;
    target: string;
    window: string;
    errorBudget: string;
    description: string;
  }>;
}

function formatTarget(def: SloDefinition): string {
  switch (def.kind) {
    case "LATENCY_P50_MS":
      return `p50 ≤ ${(def.targetMs! / 1000).toFixed(1)} s`;
    case "LATENCY_P99_MS":
      return `p99 ≤ ${(def.targetMs! / 1000).toFixed(1)} s`;
    case "AVAILABILITY_PCT":
      return `≥ ${def.targetPct}%`;
    case "COUNT_ZERO":
      return `= 0 (zero tolerance)`;
  }
}

function formatWindow(windowSeconds: number): string {
  if (windowSeconds >= 86400) return `${windowSeconds / 86400} day`;
  if (windowSeconds >= 3600) return `${windowSeconds / 3600} hour`;
  return `${windowSeconds} seconds`;
}

function formatBudget(def: SloDefinition): string {
  if (def.errorBudgetPct === 0) return "zero — any failure is an immediate breach";
  if (def.kind === "AVAILABILITY_PCT") {
    const budgetSeconds = (def.windowSeconds * def.errorBudgetPct) / 100;
    return `${def.errorBudgetPct}% (≈ ${budgetSeconds.toFixed(1)} s / window)`;
  }
  return `${def.errorBudgetPct}% of observations`;
}

export function buildDefinitionCatalogue(): SloDefinitionCatalogue {
  const definitions = SLO_ORDER.map((id) => {
    const def = SLO_DEFINITIONS[id];
    return {
      id: def.id,
      name: def.name,
      kind: def.kind,
      target: formatTarget(def),
      window: formatWindow(def.windowSeconds),
      errorBudget: formatBudget(def),
      description: def.description,
    };
  });

  return {
    total: definitions.length,
    definitions,
  };
}

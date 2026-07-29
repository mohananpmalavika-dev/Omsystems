import type { BranchHealth } from "@/lib/types/operational-health";

/**
 * Operator-approved branch-wall densities. The mosaic deliberately tops out
 * at 8 x 8: a dense wall must still leave a branch tile actionable.
 */
export const BRANCH_GRID_LAYOUTS = ["4x4", "6x6", "8x8"] as const;
export type BranchGridLayout = (typeof BRANCH_GRID_LAYOUTS)[number];
export type BranchSequence = "priority" | "region" | "name";

export const MAX_BRANCH_TILES_PER_VIEW = 64;
export const BRANCH_PAGE_SIZE = 500;

export interface BranchHealthPage {
  branches: BranchHealth[];
  total: number;
  limit: number;
  offset: number;
}

export function getBranchGridMetrics(layout: BranchGridLayout, viewportWidth: number) {
  const requestedColumns = Number.parseInt(layout, 10);
  const columns = viewportWidth >= 960
    ? requestedColumns
    : viewportWidth >= 720
      ? Math.min(requestedColumns, 4)
      : viewportWidth >= 480
        ? Math.min(requestedColumns, 2)
        : 1;
  const rowHeight = layout === "4x4"
    ? 136
    : layout === "6x6"
      ? 92
      : 68;
  return {
    columns,
    rowHeight,
    gap: 8,
    compact: layout !== "4x4",
    ultraCompact: layout === "8x8",
    statusOnly: false,
    tilesPerView: requestedColumns ** 2,
  };
}

/** The exact tile area for the selected square layout, including its padding. */
export function getBranchGridViewportHeight(layout: BranchGridLayout) {
  const rows = Number.parseInt(layout, 10);
  const { gap, rowHeight } = getBranchGridMetrics(layout, Number.POSITIVE_INFINITY);
  return (rows * rowHeight) + ((rows - 1) * gap) + 16;
}

const HEALTH_PRIORITY: Record<BranchHealth["healthStatus"], number> = {
  critical: 0,
  warning: 2,
  unknown: 3,
  healthy: 4,
};

export function getBranchPriority(branch: BranchHealth) {
  if (
    branch.internetStatus === "offline" ||
    branch.recorderStatus === "offline" ||
    branch.edgeAgentStatus === "offline"
  ) return 0;
  if (branch.criticalAlerts > 0) return 1;
  return HEALTH_PRIORITY[branch.healthStatus] ?? 3;
}

export function sequenceBranchHealth(branches: BranchHealth[], sequence: BranchSequence) {
  return [...branches].sort((left, right) => {
    if (sequence === "priority") {
      const priority = getBranchPriority(left) - getBranchPriority(right);
      if (priority) return priority;
    }
    if (sequence === "region") {
      const region = left.region.localeCompare(right.region);
      if (region) return region;
      const priority = getBranchPriority(left) - getBranchPriority(right);
      if (priority) return priority;
    }
    return left.name.localeCompare(right.name, undefined, { numeric: true });
  });
}

export async function loadAllBranchHealth(
  fetchPage: (offset: number, limit: number) => Promise<BranchHealthPage>,
) {
  const first = await fetchPage(0, BRANCH_PAGE_SIZE);
  if (first.total <= first.branches.length) return first.branches;

  const offsets: number[] = [];
  for (let offset = BRANCH_PAGE_SIZE; offset < first.total; offset += BRANCH_PAGE_SIZE) {
    offsets.push(offset);
  }
  const remaining = await Promise.all(offsets.map((offset) => fetchPage(offset, BRANCH_PAGE_SIZE)));
  return [first, ...remaining].flatMap((page) => page.branches).slice(0, first.total);
}

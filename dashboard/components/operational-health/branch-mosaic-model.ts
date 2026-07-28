import type { BranchHealth } from "@/lib/types/operational-health";

export const BRANCH_GRID_LAYOUTS = ["4x4", "6x6", "8x8"] as const;
export type BranchGridLayout = (typeof BRANCH_GRID_LAYOUTS)[number];

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
  const rowHeight = layout === "4x4" ? 136 : layout === "6x6" ? 92 : 68;
  return {
    columns,
    rowHeight,
    compact: layout !== "4x4",
    ultraCompact: layout === "8x8",
  };
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

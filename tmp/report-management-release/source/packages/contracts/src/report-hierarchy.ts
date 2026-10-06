/** Organization dimensions come from node types, never names or camera ROI zones. */
export interface ReportHierarchyNode {
  id: string;
  parentId?: string | null;
  type: string;
  name: string;
  tenantId?: string;
}

export function resolveReportHierarchy(branchId: string, nodes: ReadonlyMap<string, ReportHierarchyNode>) {
  const branch = nodes.get(branchId);
  const result = { branchId, branchName: branch?.name ?? '', zone: '', region: '', area: '', organization: '', path: [] as string[] };
  const visited = new Set<string>();
  let current = branch;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (branch?.tenantId && current.tenantId && branch.tenantId !== current.tenantId) break;
    result.path.unshift(current.name);
    const type = current.type.toLowerCase();
    if (type === 'zone' && !result.zone) result.zone = current.name;
    if (type === 'region' && !result.region) result.region = current.name;
    if (type === 'area' && !result.area) result.area = current.name;
    if (['company', 'organization', 'headquarters'].includes(type) && !result.organization) result.organization = current.name;
    current = current.parentId ? nodes.get(current.parentId) : undefined;
  }
  return result;
}

export const REPORT_TIMEZONE = 'Asia/Kolkata';

export function reportLocalDate(timestamp: string | number | Date): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: REPORT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function validReportDay(day: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(`${day}T00:00:00Z`)) &&
    new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
}

export function reportDayBounds(startDay: string, endDay: string) {
  if (!validReportDay(startDay) || !validReportDay(endDay) || startDay > endDay) throw new Error('Select valid start and end dates in order');
  return {
    from: new Date(`${startDay}T00:00:00+05:30`).toISOString(),
    to: new Date(Date.parse(`${endDay}T00:00:00+05:30`) + 86_400_000 - 1).toISOString(),
  };
}

export function reportCalendarPeriod(period: string, startDay?: unknown, endDay?: unknown) {
  if (startDay !== undefined || endDay !== undefined) {
    if (typeof startDay !== 'string' || typeof endDay !== 'string') throw new Error('Select both report dates');
    return reportDayBounds(startDay, endDay);
  }
  const today = reportLocalDate(new Date());
  const [year, month] = today.split('-').map(Number);
  const start = period === 'monthly' ? `${today.slice(0,7)}-01` :
    period === 'quarterly' ? `${year}-${String(Math.floor((month! - 1)/3)*3+1).padStart(2,'0')}-01` :
    period === 'annual' ? `${year}-01-01` :
    new Date(Date.parse(`${today}T00:00:00Z`) - (({today:1,'7d':7,'30d':30,'90d':90,'12m':365} as Record<string,number>)[period] ?? 30) * 86_400_000 + 86_400_000).toISOString().slice(0,10);
  return reportDayBounds(start, today);
}

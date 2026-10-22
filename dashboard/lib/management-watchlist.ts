export type ExecutiveBranchRow = {
  branchId?: string;
  dimension: string;
  zone?: string;
  region?: string;
  area?: string;
  organization?: string;
  totalCameras: number;
  onlineCameras: number;
  p1Threats: number;
  totalAlerts: number;
  slaPercent: number | null;
  retentionDays: number | null;
  footfall?: number | null;
};

export type ReviewTargets = { sla: number; retention: number };
export type WatchItem = ExecutiveBranchRow & {
  gaps: number;
  availability: number | null;
  priority: 'Critical' | 'Review' | 'Data check' | 'Clear';
  reasons: string[];
  action: string;
};

// These are management review benchmarks, not statutory or tenant policy verdicts.
export const DEFAULT_REVIEW_TARGETS: ReviewTargets = { sla: 95, retention: 90 };
export const measured = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function buildManagementWatchlist(branches: ExecutiveBranchRow[], targets: ReviewTargets): WatchItem[] {
  const rank = { Critical: 0, Review: 1, 'Data check': 2, Clear: 3 };
  return branches.map((row): WatchItem => {
    const gaps = Math.max(0, row.totalCameras - row.onlineCameras);
    const availability = row.totalCameras > 0 ? row.onlineCameras / row.totalCameras * 100 : null;
    const sla = measured(row.slaPercent) && row.slaPercent <= 100 ? row.slaPercent : null;
    const retention = measured(row.retentionDays) ? row.retentionDays : null;
    const reasons: string[] = [];
    if (row.p1Threats > 0) reasons.push(`${row.p1Threats} open P1 case${row.p1Threats === 1 ? '' : 's'}`);
    if (gaps) reasons.push(`${gaps} camera${gaps === 1 ? '' : 's'} not online`);
    if (!row.totalCameras) reasons.push('No camera inventory');
    if (sla !== null && sla < targets.sla) reasons.push(`SLA ${sla.toFixed(1)}% below ${targets.sla}%`);
    if (retention !== null && retention < targets.retention) reasons.push(`Configured retention ${retention.toFixed(1)}d below ${targets.retention}d`);
    if (sla === null) reasons.push('SLA unavailable / no eligible cases');
    if (retention === null) reasons.push('Retention configuration unavailable');
    const critical = row.p1Threats > 0 || (row.totalCameras > 0 && row.onlineCameras === 0);
    const review = gaps > 0 || (sla !== null && sla < targets.sla) || (retention !== null && retention < targets.retention);
    const priority = critical ? 'Critical' : review ? 'Review' : reasons.length ? 'Data check' : 'Clear';
    const action = row.p1Threats > 0 ? 'Review unresolved P1 cases and assign follow-up.'
      : gaps ? 'Check camera connectivity and restore coverage.'
      : !row.totalCameras ? 'Verify branch camera inventory.'
      : sla !== null && sla < targets.sla ? 'Review P1 case handling against the service target.'
      : retention !== null && retention < targets.retention ? 'Review camera retention settings against branch policy.'
      : reasons.length ? 'Verify report data and measurement eligibility.'
      : 'Continue routine monitoring.';
    return { ...row, slaPercent: sla, retentionDays: retention, gaps, availability, priority, reasons, action };
  }).sort((a, b) => rank[a.priority] - rank[b.priority] || b.p1Threats - a.p1Threats || b.gaps - a.gaps || a.dimension.localeCompare(b.dimension));
}

export function managementExportRows(items: WatchItem[], period: string, targets: ReviewTargets, generatedAt?: string) {
  return items.map(row => ({
    Branch: row.dimension, 'Branch ID': row.branchId, Organization: row.organization,
    Zone: row.zone, Region: row.region, Area: row.area, Period: period,
    'Generated at': generatedAt, Priority: row.priority, Findings: row.reasons.join('; '),
    'Recommended action': row.action, 'Total cameras now': row.totalCameras,
    'Online cameras now': row.onlineCameras, 'Camera gaps now': row.gaps,
    'Availability now (%)': row.availability === null ? null : Number(row.availability.toFixed(1)),
    'Incident cases in period': row.totalAlerts, 'Open P1 from period': row.p1Threats,
    'Reported P1 SLA (%)': row.slaPercent, 'SLA review target (%)': targets.sla,
    'Average configured retention (days)': row.retentionDays, 'Retention review target (days)': targets.retention,
  }));
}

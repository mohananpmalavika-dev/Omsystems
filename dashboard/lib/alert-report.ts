import type { AnalyticsAlert } from './types';
import { reportLocalDate } from '../../packages/contracts/src/report-hierarchy';

export const normalizeZone = (alert: AnalyticsAlert) => alert.zoneName?.trim() || '';
export const normalizeRegion = (alert: AnalyticsAlert) => alert.regionName?.trim() || '';
export const normalizeArea = (alert: AnalyticsAlert) => alert.areaName?.trim() || '';
export const normalizeBranch = (alert: AnalyticsAlert) => alert.branchName?.trim() || alert.branchId || 'Branch unavailable';
export const normalizeAlertDate = (alert: AnalyticsAlert) => reportLocalDate(alert.lastDetectedAt || alert.createdAt || alert.firstDetectedAt);
export const formatDisplayDate = (day: string) => day ? new Date(`${day}T12:00:00+05:30`).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }) : 'Date unavailable';
export const normalizeAlertType = (alert: AnalyticsAlert) => (alert.alertType || alert.detectionType || alert.title || 'Uncategorized').replaceAll('_', ' ').replaceAll('-', ' ');
export const alertIsActive = (alert: AnalyticsAlert) => !['resolved', 'false_alarm', 'suppressed'].includes(alert.status);

export function buildAlertReport(alerts: AnalyticsAlert[], dimension: 'zone' | 'region' | 'area' | 'branch' | 'alert_type' | 'date') {
  const groups = new Map<string, { name: string; key: string; total: number; active: number; critical: number; resolved: number; falseAlarms: number; converted: number; p1: number; p2: number; p3: number; p4: number; p5: number; slaBreached: number }>();
  const label = dimension === 'zone' ? normalizeZone : dimension === 'region' ? normalizeRegion : dimension === 'area' ? normalizeArea : dimension === 'date' ? normalizeAlertDate : dimension === 'alert_type' ? normalizeAlertType : normalizeBranch;
  for (const alert of alerts) {
    // Missing intermediate levels fall through to the actual branch.
    const name = label(alert) || normalizeBranch(alert);
    const key = dimension === 'branch' || !label(alert) ? alert.branchId || name : name;
    const row = groups.get(key) ?? { name, key, total: 0, active: 0, critical: 0, resolved: 0, falseAlarms: 0, converted: 0, p1: 0, p2: 0, p3: 0, p4: 0, p5: 0, slaBreached: 0 };
    row.total++;
    if (alertIsActive(alert)) row.active++;
    if (['P1', 'P2'].includes(alert.severity)) row.critical++;
    if (alert.status === 'resolved') row.resolved++;
    if (alert.status === 'false_alarm') row.falseAlarms++;
    if (alert.incidentId || alert.incidentNumber) row.converted++;
    const severity = alert.severity.toLowerCase() as 'p1' | 'p2' | 'p3' | 'p4' | 'p5';
    if (severity in row) row[severity]++;
    if (alert.slaDueAt && ((alert.acknowledgedAt && Date.parse(alert.acknowledgedAt) > Date.parse(alert.slaDueAt)) || (!alert.acknowledgedAt && alertIsActive(alert) && Date.now() > Date.parse(alert.slaDueAt)))) row.slaBreached++;
    groups.set(key, row);
  }
  return [...groups.values()].sort((a, b) => dimension === 'date' ? a.key.localeCompare(b.key) : b.total - a.total || a.name.localeCompare(b.name));
}

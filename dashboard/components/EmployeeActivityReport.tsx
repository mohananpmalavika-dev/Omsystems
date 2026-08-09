"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  BarChart3,
  Building2,
  CalendarDays,
  Camera,
  Clock3,
  Download,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  MonitorPlay,
  RefreshCw,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { exportReport } from "@/lib/export-report";
import { useButtonTracking, useExportTracking, useFilterTracking } from "@/hooks/useActivityTracking";

interface EmployeeActivityReportProps {
  apiBaseUrl?: string;
  accessToken?: string;
  currentUserId?: string;
  showAllUsers?: boolean;
}

interface User {
  id: string;
  display_name: string;
  username: string;
}

interface SessionSummary {
  total_sessions: number;
  total_duration_seconds: number;
  avg_session_duration_seconds: number;
  first_login: string | null;
  last_logout: string | null;
}

interface ModuleUsage {
  page_module: string;
  visit_count: number;
  total_seconds: number;
  avg_seconds: number;
}

interface ControlRoomSummary {
  total_monitoring_sessions: number;
  total_monitoring_seconds: number;
  unique_branches_monitored: number;
  total_alerts_handled: number;
  total_incidents_created: number;
  total_camera_switches: number;
}

interface BranchMonitoring {
  branch_name: string;
  branch_node_id: string;
  monitoring_sessions: number;
  total_seconds: number;
}

interface ComprehensiveReport {
  user: User;
  period: { startDate: string; endDate: string };
  sessionSummary: SessionSummary;
  moduleUsage: ModuleUsage[];
  controlRoomSummary: ControlRoomSummary;
  branchMonitoring: BranchMonitoring[];
  actionSummary: Array<{ action_category: string; action_count: number }>;
}

type ReportPeriod = "seven-days" | "four-weeks" | "quarter" | "custom";

function dateValue(daysAgo = 0) {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().split("T")[0] ?? "";
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function userValue(value: any): User {
  return {
    id: String(value?.id ?? ""),
    display_name: String(value?.display_name ?? value?.displayName ?? value?.username ?? "Employee"),
    username: String(value?.username ?? value?.email ?? value?.identitySubject ?? ""),
  };
}

function normalizeReport(value: any): ComprehensiveReport {
  return {
    user: userValue(value?.user),
    period: {
      startDate: String(value?.period?.startDate ?? ""),
      endDate: String(value?.period?.endDate ?? ""),
    },
    sessionSummary: {
      total_sessions: numberValue(value?.sessionSummary?.total_sessions),
      total_duration_seconds: numberValue(value?.sessionSummary?.total_duration_seconds),
      avg_session_duration_seconds: numberValue(value?.sessionSummary?.avg_session_duration_seconds),
      first_login: value?.sessionSummary?.first_login ?? null,
      last_logout: value?.sessionSummary?.last_logout ?? null,
    },
    moduleUsage: Array.isArray(value?.moduleUsage) ? value.moduleUsage.map((item: any) => ({
      page_module: String(item.page_module ?? "other"),
      visit_count: numberValue(item.visit_count),
      total_seconds: numberValue(item.total_seconds),
      avg_seconds: numberValue(item.avg_seconds),
    })) : [],
    controlRoomSummary: {
      total_monitoring_sessions: numberValue(value?.controlRoomSummary?.total_monitoring_sessions),
      total_monitoring_seconds: numberValue(value?.controlRoomSummary?.total_monitoring_seconds),
      unique_branches_monitored: numberValue(value?.controlRoomSummary?.unique_branches_monitored),
      total_alerts_handled: numberValue(value?.controlRoomSummary?.total_alerts_handled),
      total_incidents_created: numberValue(value?.controlRoomSummary?.total_incidents_created),
      total_camera_switches: numberValue(value?.controlRoomSummary?.total_camera_switches),
    },
    branchMonitoring: Array.isArray(value?.branchMonitoring) ? value.branchMonitoring.map((item: any) => ({
      branch_name: String(item.branch_name ?? "Unassigned branch"),
      branch_node_id: String(item.branch_node_id ?? ""),
      monitoring_sessions: numberValue(item.monitoring_sessions),
      total_seconds: numberValue(item.total_seconds),
    })) : [],
    actionSummary: Array.isArray(value?.actionSummary) ? value.actionSummary.map((item: any) => ({
      action_category: String(item.action_category ?? "other"),
      action_count: numberValue(item.action_count),
    })) : [],
  };
}

async function responseJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body?.message ?? body?.error;
    throw new Error(detail === "control_plane_unavailable"
      ? "The control plane is temporarily unavailable. Check the deployed service connection and try again."
      : detail || `Request failed with status ${response.status}`);
  }
  return body;
}

export function EmployeeActivityReport({
  apiBaseUrl = "/api/control",
  accessToken,
  currentUserId,
  showAllUsers = false,
}: EmployeeActivityReportProps) {
  const [period, setPeriod] = useState<ReportPeriod>("seven-days");
  const [startDate, setStartDate] = useState(dateValue(7));
  const [endDate, setEndDate] = useState(dateValue());
  const [selectedUserId, setSelectedUserId] = useState(currentUserId ?? "");
  const [users, setUsers] = useState<User[]>([]);
  const [report, setReport] = useState<ComprehensiveReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [directoryNotice, setDirectoryNotice] = useState<string | null>(null);
  
  // Activity tracking
  const trackButton = useButtonTracking('activity_report');
  const trackExport = useExportTracking('activity_report');
  const trackFilter = useFilterTracking('activity_report');

  const requestOptions = useMemo<RequestInit>(() => ({
    credentials: "include",
    cache: "no-store",
    headers: accessToken ? { authorization: `Bearer ${accessToken}` } : undefined,
  }), [accessToken]);

  const fetchUsers = useCallback(async () => {
    if (!showAllUsers) return;
    setUsersLoading(true);
    setDirectoryNotice(null);
    try {
      const response = await fetch(`${apiBaseUrl}/v1/users?limit=100`, requestOptions);
      const body = await responseJson(response);
      setUsers((body.data ?? []).map(userValue));
    } catch (reason) {
      setUsers([]);
      setDirectoryNotice(reason instanceof Error
        ? `${reason.message} Showing your activity instead.`
        : "Employee directory unavailable. Showing your activity instead.");
    } finally {
      setUsersLoading(false);
    }
  }, [apiBaseUrl, requestOptions, showAllUsers]);

  const fetchReport = useCallback(async () => {
    if (!startDate || !endDate) return;
    if (startDate > endDate) {
      setError("Start date must be before the end date.");
      setReport(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const userId = selectedUserId || currentUserId;
      const params = new URLSearchParams({ startDate, endDate });
      if (userId) params.set("userId", userId);
      const response = await fetch(`${apiBaseUrl}/v1/activity/report/comprehensive?${params}`, requestOptions);
      const body = await responseJson(response);
      setReport(normalizeReport(body));
    } catch (reason) {
      setReport(null);
      setError(reason instanceof Error ? reason.message : "Unable to load the employee activity report.");
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, currentUserId, endDate, requestOptions, selectedUserId, startDate]);

  useEffect(() => { void fetchUsers(); }, [fetchUsers]);
  useEffect(() => { void fetchReport(); }, [fetchReport]);

  const applyPeriod = (nextPeriod: ReportPeriod) => {
    setPeriod(nextPeriod);
    if (nextPeriod === "custom") return;
    setStartDate(dateValue(nextPeriod === "seven-days" ? 7 : nextPeriod === "four-weeks" ? 28 : 90));
    setEndDate(dateValue());
    
    // Track filter change
    trackFilter('report_period', nextPeriod);
  };
  
  const handleUserChange = (userId: string) => {
    setSelectedUserId(userId);
    trackFilter('selected_user', userId || 'my_activity');
  };
  
  const handleExport = (format: 'pdf' | 'excel' | 'csv') => {
    if (!report) return;
    
    // Track export before exporting
    const moduleCount = report.moduleUsage.length;
    trackExport('employee_activity_report', moduleCount, format);
    
    exportReport(report, { format });
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };
  const percentage = (value: number, total: number) => total > 0 ? Math.min(100, (value / total) * 100) : 0;
  const totalModuleSeconds = report?.moduleUsage.reduce((sum, item) => sum + item.total_seconds, 0) ?? 0;
  const totalActions = report?.actionSummary.reduce((sum, item) => sum + item.action_count, 0) ?? 0;

  return (
    <div className="employee-report-page">
      <PageHero
        eyebrow="Audit & workforce intelligence"
        title="Employee activity report"
        description="Review authenticated sessions, module usage, control-room monitoring, branch coverage and operator actions from one auditable view."
        icon={Users}
        actions={(
          <div className="employee-report-hero-state"><ShieldCheck size={17} /><div><span>Data source</span><strong>Authenticated control plane</strong></div></div>
        )}
      />

      <section className="employee-report-controls">
        <div className="employee-report-filter-grid">
          {showAllUsers && (
            <label><span>Employee</span><select value={selectedUserId} onChange={(event) => handleUserChange(event.target.value)} disabled={usersLoading}><option value="">My activity</option>{users.map((user) => <option key={user.id} value={user.id}>{user.display_name}</option>)}</select></label>
          )}
          <label><span>Report window</span><select value={period} onChange={(event) => applyPeriod(event.target.value as ReportPeriod)}><option value="seven-days">Last 7 days</option><option value="four-weeks">Last 4 weeks</option><option value="quarter">Last 90 days</option><option value="custom">Custom range</option></select></label>
          <label><span>Start date</span><input type="date" value={startDate} onChange={(event) => { setPeriod("custom"); setStartDate(event.target.value); trackFilter('start_date', event.target.value); }} /></label>
          <label><span>End date</span><input type="date" value={endDate} onChange={(event) => { setPeriod("custom"); setEndDate(event.target.value); trackFilter('end_date', event.target.value); }} /></label>
        </div>
        <div className="employee-report-control-actions">
          <button type="button" className="employee-report-refresh" onClick={() => { trackButton('refresh_report'); void fetchReport(); }} disabled={loading}><RefreshCw className={loading ? "spin" : ""} size={15} />Refresh</button>
          <button type="button" onClick={() => handleExport('pdf')} disabled={!report || loading}><FileText size={15} />PDF</button>
          <button type="button" onClick={() => handleExport('excel')} disabled={!report || loading}><FileSpreadsheet size={15} />Excel</button>
          <button type="button" onClick={() => handleExport('csv')} disabled={!report || loading}><Download size={15} />CSV</button>
        </div>
      </section>

      {directoryNotice && <div className="employee-report-notice"><AlertCircle size={16} /><span>{directoryNotice}</span></div>}
      {error && <div className="employee-report-error" role="alert"><AlertCircle size={18} /><div><strong>Report could not be loaded</strong><span>{error}</span></div><button type="button" onClick={() => void fetchReport()}>Try again</button></div>}

      {loading ? (
        <div className="employee-report-loading"><LoaderCircle className="spin" size={28} /><strong>Building employee activity report</strong><span>Loading sessions, monitoring and audit activity&hellip;</span></div>
      ) : report ? (
        <>
          <section className="employee-report-identity">
            <span className="employee-report-avatar"><UserRound size={25} /></span>
            <div><p>Selected employee</p><h2>{report.user.display_name}</h2><span>{report.user.username || "Authenticated operator"}</span></div>
            <div className="employee-report-period"><CalendarDays size={16} /><span><small>Report period</small><strong>{report.period.startDate} — {report.period.endDate}</strong></span></div>
          </section>

          <section className="employee-report-stats">
            <ReportStat icon={Clock3} label="Sessions" value={report.sessionSummary.total_sessions.toLocaleString()} detail="Authenticated logins" />
            <ReportStat icon={Activity} label="Active time" value={formatDuration(report.sessionSummary.total_duration_seconds)} detail="Across Sentinel Grid" />
            <ReportStat icon={MonitorPlay} label="Monitoring time" value={formatDuration(report.controlRoomSummary.total_monitoring_seconds)} detail={`${report.controlRoomSummary.total_monitoring_sessions} control-room sessions`} />
            <ReportStat icon={Building2} label="Branches covered" value={report.controlRoomSummary.unique_branches_monitored.toLocaleString()} detail="Unique monitored branches" />
            <ReportStat icon={BarChart3} label="Recorded actions" value={totalActions.toLocaleString()} detail="Auditable operator actions" />
          </section>

          <div className="employee-report-primary-grid">
            <section className="employee-report-panel">
              <PanelHeader icon={Activity} eyebrow="Engagement" title="Module usage" description="Time spent across operational workspaces" />
              <div className="employee-module-list">
                {report.moduleUsage.map((module) => {
                  const share = percentage(module.total_seconds, totalModuleSeconds);
                  return <article key={module.page_module}><div><span className="employee-module-icon"><Activity size={15} /></span><div><strong>{module.page_module.replaceAll("_", " ")}</strong><small>{module.visit_count} visits · {formatDuration(module.avg_seconds)} average</small></div><em>{formatDuration(module.total_seconds)}</em></div><div className="employee-module-track"><i style={{ width: `${share}%` }} /></div><span>{share.toFixed(1)}% of measured module time</span></article>;
                })}
                {report.moduleUsage.length === 0 && <EmptyReportState text="No module visits were recorded during this period." />}
              </div>
            </section>

            <section className="employee-report-panel">
              <PanelHeader icon={MonitorPlay} eyebrow="Control room" title="Monitoring activity" description="Response and live-monitoring workload" />
              <div className="employee-monitoring-grid">
                <MiniMetric label="Camera switches" value={report.controlRoomSummary.total_camera_switches} icon={Camera} />
                <MiniMetric label="Alerts handled" value={report.controlRoomSummary.total_alerts_handled} icon={AlertCircle} />
                <MiniMetric label="Incidents created" value={report.controlRoomSummary.total_incidents_created} icon={ShieldCheck} />
                <MiniMetric label="Monitoring share" value={`${percentage(report.controlRoomSummary.total_monitoring_seconds, report.sessionSummary.total_duration_seconds).toFixed(1)}%`} icon={Clock3} />
              </div>
              <div className="employee-last-activity"><span><Clock3 size={15} />Last recorded activity</span><strong>{report.sessionSummary.last_logout ? new Date(report.sessionSummary.last_logout).toLocaleString() : "Active or not yet logged out"}</strong></div>
            </section>
          </div>

          <div className="employee-report-secondary-grid">
            <section className="employee-report-panel">
              <PanelHeader icon={Building2} eyebrow="Coverage" title="Branch monitoring" description="Top branches by monitoring time" />
              <div className="employee-branch-table">
                <div className="employee-table-head"><span>Branch</span><span>Sessions</span><span>Monitoring time</span></div>
                {report.branchMonitoring.slice(0, 10).map((branch) => <div className="employee-table-row" key={`${branch.branch_node_id}-${branch.branch_name}`}><span><i /><strong>{branch.branch_name}</strong></span><span>{branch.monitoring_sessions}</span><span>{formatDuration(branch.total_seconds)}</span></div>)}
                {report.branchMonitoring.length === 0 && <EmptyReportState text="No branch monitoring was recorded during this period." />}
              </div>
            </section>

            <section className="employee-report-panel">
              <PanelHeader icon={BarChart3} eyebrow="Audit trail" title="Action summary" description="Recorded actions by category" />
              <div className="employee-action-grid">
                {report.actionSummary.map((action) => <article key={action.action_category}><span>{action.action_category.replaceAll("_", " ")}</span><strong>{action.action_count.toLocaleString()}</strong><small>{percentage(action.action_count, totalActions).toFixed(1)}% of actions</small></article>)}
                {report.actionSummary.length === 0 && <EmptyReportState text="No auditable actions were recorded during this period." />}
              </div>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ReportStat({ icon: Icon, label, value, detail }: { icon: typeof Activity; label: string; value: string; detail: string }) {
  return <article><span><Icon size={17} /></span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>;
}

function PanelHeader({ icon: Icon, eyebrow, title, description }: { icon: typeof Activity; eyebrow: string; title: string; description: string }) {
  return <header className="employee-panel-header"><span><Icon size={18} /></span><div><p>{eyebrow}</p><h3>{title}</h3><small>{description}</small></div></header>;
}

function MiniMetric({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string | number }) {
  return <article><span><Icon size={16} /></span><strong>{typeof value === "number" ? value.toLocaleString() : value}</strong><small>{label}</small></article>;
}

function EmptyReportState({ text }: { text: string }) {
  return <div className="employee-report-empty"><BarChart3 size={21} /><span>{text}</span></div>;
}

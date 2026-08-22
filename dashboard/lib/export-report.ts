/**
 * Report Export Utilities
 * Generate PDF and Excel exports of activity reports
 */

import { trackUserAction } from '@/components/activity-monitor';

interface ExportOptions {
  format: 'pdf' | 'excel' | 'csv';
  filename?: string;
}

interface ReportData {
  user: {
    display_name: string;
    username: string;
  };
  period: {
    startDate: string;
    endDate: string;
  };
  sessionSummary: any;
  moduleUsage: any[];
  controlRoomSummary: any;
  branchMonitoring: any[];
  actionSummary: any[];
  timeline?: any[];
}

/**
 * Export report as CSV
 */
export function exportReportAsCSV(data: ReportData, filename?: string): void {
  // Track export action
  trackUserAction('export', 'export', 'activity_report', {
    actionTarget: 'employee_activity_report',
    actionDescription: 'Exported employee activity report as CSV',
    featureName: 'report_export',
    actionMetadata: {
      format: 'csv',
      userId: data.user.username,
      reportPeriod: `${data.period.startDate} to ${data.period.endDate}`,
    },
  });
  
  const csvRows: string[] = [];
  
  // Header
  csvRows.push(`Employee Activity Report`);
  csvRows.push(`Employee: ${data.user.display_name} (${data.user.username})`);
  csvRows.push(`Period: ${data.period.startDate} to ${data.period.endDate}`);
  csvRows.push('');
  
  // Session Summary
  csvRows.push('Session Summary');
  csvRows.push('Metric,Value');
  csvRows.push(`Total Sessions,${data.sessionSummary.total_sessions}`);
  csvRows.push(`Total Duration,${formatDuration(data.sessionSummary.total_duration_seconds)}`);
  csvRows.push(`Active Duration,${formatDuration(data.sessionSummary.active_duration_seconds)}`);
  csvRows.push(`Idle Duration,${formatDuration(data.sessionSummary.idle_duration_seconds)}`);
  csvRows.push(`Average Session Duration,${formatDuration(data.sessionSummary.avg_session_duration_seconds)}`);
  csvRows.push('');
  
  // Module Usage
  csvRows.push('Module Usage');
  csvRows.push('Module,Visits,Total Time (seconds),Average Time (seconds)');
  data.moduleUsage.forEach(module => {
    csvRows.push(`${module.page_module},${module.visit_count},${module.total_seconds},${module.avg_seconds}`);
  });
  csvRows.push('');
  
  // Control Room Activity
  csvRows.push('Control Room Activity');
  csvRows.push('Metric,Value');
  csvRows.push(`Monitoring Sessions,${data.controlRoomSummary.total_monitoring_sessions}`);
  csvRows.push(`Monitoring Time,${formatDuration(data.controlRoomSummary.total_monitoring_seconds)}`);
  csvRows.push(`Branches Monitored,${data.controlRoomSummary.unique_branches_monitored}`);
  csvRows.push(`Alerts Handled,${data.controlRoomSummary.total_alerts_handled}`);
  csvRows.push(`Incidents Created,${data.controlRoomSummary.total_incidents_created}`);
  csvRows.push(`Camera Switches,${data.controlRoomSummary.total_camera_switches}`);
  csvRows.push('');
  
  // Branch Monitoring
  if (data.branchMonitoring.length > 0) {
    csvRows.push('Branch Monitoring Breakdown');
    csvRows.push('Branch,Sessions,Total Time (seconds)');
    data.branchMonitoring.forEach(branch => {
      csvRows.push(`${branch.branch_name},${branch.monitoring_sessions},${branch.total_seconds}`);
    });
    csvRows.push('');
  }
  
  // Action Summary
  csvRows.push('Action Summary');
  csvRows.push('Category,Count');
  data.actionSummary.forEach(action => {
    csvRows.push(`${action.action_category},${action.action_count}`);
  });

  if (data.timeline?.length) {
    csvRows.push('');
    csvRows.push('Complete Login-to-Logout Timeline');
    csvRows.push('Time,Event,Title,Description,Module,Branch,Duration Seconds,Outcome,Session');
    data.timeline.forEach((event) => {
      csvRows.push([
        event.event_time,
        event.event_type,
        event.title,
        event.description,
        event.module_name,
        event.branch_name,
        event.duration_seconds,
        event.outcome,
        event.session_id,
      ].map(csvCell).join(','));
    });
  }
  
  // Create CSV blob and download
  const csvContent = csvRows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `employee-activity-report-${data.period.startDate}-to-${data.period.endDate}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Export report as Excel (using CSV format that Excel can open)
 */
export function exportReportAsExcel(data: ReportData, filename?: string): void {
  // For now, use CSV format that Excel can open
  // In production, you might want to use a library like xlsx
  exportReportAsCSV(data, filename?.replace('.xlsx', '.csv') || undefined);
}

/**
 * Generate and download PDF report
 */
export function exportReportAsPDF(data: ReportData, filename?: string): void {
  // Track export action
  trackUserAction('export', 'export', 'activity_report', {
    actionTarget: 'employee_activity_report',
    actionDescription: 'Exported employee activity report as PDF',
    featureName: 'report_export',
    actionMetadata: {
      format: 'pdf',
      userId: data.user.username,
      reportPeriod: `${data.period.startDate} to ${data.period.endDate}`,
    },
  });
  
  // Generate HTML content for PDF
  const htmlContent = generateReportHTML(data);
  
  // Create a new window for printing
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to export PDF');
    return;
  }
  
  printWindow.document.write(htmlContent);
  printWindow.document.close();
  
  // Wait for content to load then print
  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };
}

/**
 * Generate HTML content for PDF export
 */
function generateReportHTML(data: ReportData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Employee Activity Report</title>
  <style>
    @media print {
      @page { margin: 20mm; }
      body { margin: 0; }
    }
    
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 210mm;
      margin: 0 auto;
      padding: 20px;
    }
    
    h1 {
      color: #1e40af;
      border-bottom: 3px solid #1e40af;
      padding-bottom: 10px;
    }
    
    h2 {
      color: #1e40af;
      margin-top: 30px;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 5px;
    }
    
    .header-info {
      background: #f3f4f6;
      padding: 15px;
      border-radius: 8px;
      margin: 20px 0;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }
    
    .stat-card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 15px;
    }
    
    .stat-label {
      font-size: 12px;
      color: #6b7280;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    
    .stat-value {
      font-size: 24px;
      font-weight: bold;
      color: #1e40af;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    
    th, td {
      text-align: left;
      padding: 12px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    th {
      background: #f3f4f6;
      font-weight: bold;
      color: #1f2937;
    }
    
    tr:hover {
      background: #f9fafb;
    }
    
    .progress-bar {
      height: 8px;
      background: #e5e7eb;
      border-radius: 4px;
      overflow: hidden;
      margin-top: 5px;
    }
    
    .progress-fill {
      height: 100%;
      background: #1e40af;
    }
    
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #e5e7eb;
      text-align: center;
      color: #6b7280;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <h1>Employee Activity Report</h1>
  
  <div class="header-info">
    <p><strong>Employee:</strong> ${data.user.display_name} (${data.user.username})</p>
    <p><strong>Report Period:</strong> ${data.period.startDate} to ${data.period.endDate}</p>
    <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
  </div>
  
  <h2>Session Summary</h2>
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Total Sessions</div>
      <div class="stat-value">${data.sessionSummary.total_sessions}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Total Time</div>
      <div class="stat-value">${formatDuration(data.sessionSummary.total_duration_seconds)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Average Session</div>
      <div class="stat-value">${formatDuration(data.sessionSummary.avg_session_duration_seconds)}</div>
    </div>
  </div>

  ${data.timeline?.length ? `
    <h2>Complete Login-to-Logout Timeline</h2>
    <table>
      <thead><tr><th>Time</th><th>Event</th><th>Activity</th><th>Module / Branch</th><th>Duration / Outcome</th></tr></thead>
      <tbody>
        ${data.timeline.map(event => `
          <tr>
            <td>${escapeHtml(new Date(event.event_time).toLocaleString())}</td>
            <td>${escapeHtml(String(event.event_type).replace(/_/g, ' '))}</td>
            <td>${escapeHtml(event.title)}<br><small>${escapeHtml(event.description || '')}</small></td>
            <td>${escapeHtml(event.module_name || 'Platform')}${event.branch_name ? ` / ${escapeHtml(event.branch_name)}` : ''}</td>
            <td>${event.duration_seconds == null ? escapeHtml(event.outcome || 'Recorded') : formatDuration(event.duration_seconds)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : ''}
  
  <h2>Module Usage</h2>
  <table>
    <thead>
      <tr>
        <th>Module</th>
        <th>Visits</th>
        <th>Total Time</th>
        <th>Percentage</th>
      </tr>
    </thead>
    <tbody>
      ${data.moduleUsage.map(module => {
        const totalSeconds = data.moduleUsage.reduce((sum, m) => sum + m.total_seconds, 0);
        const percentage = ((module.total_seconds / totalSeconds) * 100).toFixed(1);
        return `
          <tr>
            <td style="text-transform: capitalize;">${module.page_module.replace(/_/g, ' ')}</td>
            <td>${module.visit_count}</td>
            <td>${formatDuration(module.total_seconds)}</td>
            <td>
              ${percentage}%
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${percentage}%"></div>
              </div>
            </td>
          </tr>
        `;
      }).join('')}
    </tbody>
  </table>
  
  <h2>Control Room Activity</h2>
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Monitoring Time</div>
      <div class="stat-value">${formatDuration(data.controlRoomSummary.total_monitoring_seconds)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Branches Monitored</div>
      <div class="stat-value">${data.controlRoomSummary.unique_branches_monitored}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Alerts Handled</div>
      <div class="stat-value">${data.controlRoomSummary.total_alerts_handled}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Incidents Created</div>
      <div class="stat-value">${data.controlRoomSummary.total_incidents_created}</div>
    </div>
  </div>
  
  ${data.branchMonitoring.length > 0 ? `
    <h2>Branch Monitoring Breakdown</h2>
    <table>
      <thead>
        <tr>
          <th>Branch</th>
          <th>Sessions</th>
          <th>Total Time</th>
        </tr>
      </thead>
      <tbody>
        ${data.branchMonitoring.slice(0, 20).map(branch => `
          <tr>
            <td>${branch.branch_name}</td>
            <td>${branch.monitoring_sessions}</td>
            <td>${formatDuration(branch.total_seconds)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : ''}
  
  <h2>Action Summary</h2>
  <div class="stats-grid">
    ${data.actionSummary.map(action => `
      <div class="stat-card">
        <div class="stat-label" style="text-transform: capitalize;">${action.action_category.replace(/_/g, ' ')}</div>
        <div class="stat-value">${action.action_count}</div>
      </div>
    `).join('')}
  </div>
  
  <div class="footer">
    <p>Employee Activity Tracking System | Generated on ${new Date().toLocaleString()}</p>
  </div>
</body>
</html>
  `;
}

/**
 * Helper function to format duration
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function csvCell(value: unknown): string {
  const raw = value == null ? '' : String(value);
  const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${text.replaceAll('"', '""')}"`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/**
 * Main export function
 */
export function exportReport(data: ReportData, options: ExportOptions): void {
  const { format, filename } = options;
  
  switch (format) {
    case 'pdf':
      exportReportAsPDF(data, filename);
      break;
    case 'excel':
      exportReportAsExcel(data, filename);
      break;
    case 'csv':
      exportReportAsCSV(data, filename);
      break;
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}

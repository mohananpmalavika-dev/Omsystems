'use client';

import { useState } from 'react';

// ============================================================================
// Report Generation Form
// ============================================================================

interface ReportGenerationFormProps {
  onSubmit: (data: any) => Promise<void>;
  generating: boolean;
}

export function ReportGenerationForm({ onSubmit, generating }: ReportGenerationFormProps) {
  const [formData, setFormData] = useState({
    reportType: 'cost-analysis',
    title: '',
    periodStart: '',
    periodEnd: '',
    format: 'pdf',
    includeDetails: true,
    branchNodeId: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.title || !formData.periodStart || !formData.periodEnd) {
      alert('Please fill in all required fields');
      return;
    }

    const data = {
      reportType: formData.reportType,
      title: formData.title,
      periodStart: new Date(formData.periodStart).toISOString(),
      periodEnd: new Date(formData.periodEnd).toISOString(),
      format: formData.format,
      includeDetails: formData.includeDetails,
      filters: formData.branchNodeId ? { branchNodeId: formData.branchNodeId } : undefined,
    };

    await onSubmit(data);
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4">Generate New Report</h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Report Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Report Type *
            </label>
            <select
              value={formData.reportType}
              onChange={(e) => setFormData({ ...formData, reportType: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="preventive-maintenance">Preventive Maintenance</option>
              <option value="corrective-maintenance">Corrective Maintenance</option>
              <option value="amc-performance">AMC Performance</option>
              <option value="vendor-performance">Vendor Performance</option>
              <option value="sla-compliance">SLA Compliance</option>
              <option value="health-summary">Health Summary</option>
              <option value="cost-analysis">Cost Analysis</option>
              <option value="capacity-forecast">Capacity Forecast</option>
              <option value="predictive-summary">Predictive Summary</option>
            </select>
          </div>

          {/* Format */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Format *
            </label>
            <select
              value={formData.format}
              onChange={(e) => setFormData({ ...formData, format: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="pdf">PDF</option>
              <option value="excel">Excel</option>
              <option value="json">JSON</option>
            </select>
          </div>

          {/* Title */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Report Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Monthly Cost Analysis - December 2024"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Period Start */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Period Start *
            </label>
            <input
              type="date"
              value={formData.periodStart}
              onChange={(e) => setFormData({ ...formData, periodStart: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Period End */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Period End *
            </label>
            <input
              type="date"
              value={formData.periodEnd}
              onChange={(e) => setFormData({ ...formData, periodEnd: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Branch Filter (Optional) */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Branch Filter (Optional)
            </label>
            <input
              type="text"
              value={formData.branchNodeId}
              onChange={(e) => setFormData({ ...formData, branchNodeId: e.target.value })}
              placeholder="Enter branch ID to filter"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Include Details */}
          <div className="md:col-span-2">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.includeDetails}
                onChange={(e) => setFormData({ ...formData, includeDetails: e.target.checked })}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Include detailed data tables</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={generating}
            className={`px-6 py-2 rounded-md text-white font-medium ${
              generating
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {generating ? 'Generating...' : 'Generate Report'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ============================================================================
// Report List
// ============================================================================

interface ReportListProps {
  reports: any[];
  loading: boolean;
  onDownload: (reportId: string) => void;
  onRefresh: () => void;
}

export function ReportList({ reports, loading, onDownload, onRefresh }: ReportListProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200 flex justify-between items-center">
        <h2 className="text-xl font-semibold">Report History</h2>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="px-4 py-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="divide-y divide-gray-200">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading reports...</div>
        ) : reports.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No reports found. Generate your first report above.
          </div>
        ) : (
          reports.map((report) => (
            <div key={report.reportId} className="p-6 hover:bg-gray-50">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-gray-900">
                    {report.config.title}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">{report.summary}</p>
                  
                  <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-600">
                    <span>
                      Type: <span className="font-medium">{report.config.reportType}</span>
                    </span>
                    <span>
                      Format: <span className="font-medium uppercase">{report.config.format}</span>
                    </span>
                    <span>
                      Period: {new Date(report.config.periodStart).toLocaleDateString()} - {new Date(report.config.periodEnd).toLocaleDateString()}
                    </span>
                    <span>
                      Size: <span className="font-medium">{formatFileSize(report.fileSize)}</span>
                    </span>
                  </div>

                  <div className="mt-2 text-xs text-gray-500">
                    Generated by {report.config.generatedBy} on {formatDate(report.config.generatedAt)}
                  </div>
                </div>

                <div className="ml-4">
                  <button
                    onClick={() => onDownload(report.reportId)}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
                  >
                    Download
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Scheduled Reports List
// ============================================================================

interface ScheduledReportsListProps {
  reports: any[];
  loading: boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
}

export function ScheduledReportsList({
  reports,
  loading,
  onToggle,
  onDelete,
  onRefresh,
}: ScheduledReportsListProps) {
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const getScheduleDescription = (schedule: string) => {
    const descriptions: Record<string, string> = {
      '0 6 * * *': 'Daily at 6:00 AM',
      '0 8 * * 1': 'Weekly (Monday at 8:00 AM)',
      '0 9 1 * *': 'Monthly (1st at 9:00 AM)',
      '0 10 1 1,4,7,10 *': 'Quarterly',
    };
    return descriptions[schedule] || schedule;
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200 flex justify-between items-center">
        <h2 className="text-xl font-semibold">Scheduled Reports</h2>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="px-4 py-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="divide-y divide-gray-200">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading scheduled reports...</div>
        ) : reports.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No scheduled reports. Create one to automate report generation.
          </div>
        ) : (
          reports.map((report) => (
            <div key={report.id} className="p-6 hover:bg-gray-50">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-medium text-gray-900">{report.title}</h3>
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        report.enabled
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {report.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-600">
                    <span>
                      Type: <span className="font-medium">{report.reportType}</span>
                    </span>
                    <span>
                      Format: <span className="font-medium uppercase">{report.format}</span>
                    </span>
                    <span>
                      Schedule: <span className="font-medium">{getScheduleDescription(report.schedule)}</span>
                    </span>
                  </div>

                  <div className="mt-2 text-sm text-gray-600">
                    <span>Recipients: {report.recipients.join(', ')}</span>
                  </div>

                  <div className="mt-2 text-xs text-gray-500">
                    Last run: {formatDate(report.lastRun)} | Next run: {formatDate(report.nextRun)}
                  </div>
                </div>

                <div className="ml-4 flex gap-2">
                  <button
                    onClick={() => onToggle(report.id, !report.enabled)}
                    className={`px-4 py-2 text-sm rounded-md ${
                      report.enabled
                        ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                  >
                    {report.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => onDelete(report.id)}
                    className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { ReportGenerationForm, ReportList, ScheduledReportsList } from '@/components/maintenance/report-components';

interface Report {
  reportId: string;
  config: {
    title: string;
    reportType: string;
    periodStart: string;
    periodEnd: string;
    format: string;
    generatedBy: string;
    generatedAt: string;
  };
  summary: string;
  metrics: Record<string, any>;
  filename: string;
  fileSize?: number;
  downloadUrl?: string;
}

interface ScheduledReport {
  id: string;
  title: string;
  reportType: string;
  schedule: string;
  format: string;
  recipients: string[];
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
}

export default function MaintenanceReportsPage() {
  const [activeTab, setActiveTab] = useState<'generate' | 'history' | 'scheduled'>('generate');
  const [reports, setReports] = useState<Report[]>([]);
  const [scheduledReports, setScheduledReports] = useState<ScheduledReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchReports();
    } else if (activeTab === 'scheduled') {
      fetchScheduledReports();
    }
  }, [activeTab]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const response = await fetch('/v1/maintenance/reports?limit=50');
      const data = await response.json();
      setReports(data.data || []);
    } catch (error) {
      console.error('Failed to fetch reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchScheduledReports = async () => {
    setLoading(true);
    try {
      const response = await fetch('/v1/maintenance/reports/scheduled');
      const data = await response.json();
      setScheduledReports(data.data || []);
    } catch (error) {
      console.error('Failed to fetch scheduled reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReport = async (formData: any) => {
    setGenerating(true);
    try {
      const response = await fetch('/v1/maintenance/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('Failed to generate report');
      }

      const report = await response.json();
      
      // Switch to history tab and refresh
      setActiveTab('history');
      fetchReports();
      
      alert(`Report generated successfully: ${report.filename}`);
    } catch (error) {
      console.error('Failed to generate report:', error);
      alert('Failed to generate report. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadReport = async (reportId: string) => {
    try {
      const response = await fetch(`/v1/maintenance/reports/${reportId}/download`);
      if (!response.ok) {
        throw new Error('Download not available');
      }
      // Handle download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${reportId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      alert('Download not available yet. Report may still be generating.');
    }
  };

  const handleToggleScheduledReport = async (id: string, enabled: boolean) => {
    try {
      const response = await fetch(`/v1/maintenance/reports/scheduled/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });

      if (!response.ok) {
        throw new Error('Failed to update scheduled report');
      }

      fetchScheduledReports();
    } catch (error) {
      console.error('Failed to update scheduled report:', error);
      alert('Failed to update scheduled report');
    }
  };

  const handleDeleteScheduledReport = async (id: string) => {
    if (!confirm('Are you sure you want to delete this scheduled report?')) {
      return;
    }

    try {
      const response = await fetch(`/v1/maintenance/reports/scheduled/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete scheduled report');
      }

      fetchScheduledReports();
    } catch (error) {
      console.error('Failed to delete scheduled report:', error);
      alert('Failed to delete scheduled report');
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Maintenance Reports</h1>
        <p className="mt-2 text-gray-600">
          Generate, schedule, and manage maintenance reports
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('generate')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'generate'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Generate Report
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'history'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Report History
          </button>
          <button
            onClick={() => setActiveTab('scheduled')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'scheduled'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Scheduled Reports
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'generate' && (
          <ReportGenerationForm
            onSubmit={handleGenerateReport}
            generating={generating}
          />
        )}

        {activeTab === 'history' && (
          <ReportList
            reports={reports}
            loading={loading}
            onDownload={handleDownloadReport}
            onRefresh={fetchReports}
          />
        )}

        {activeTab === 'scheduled' && (
          <ScheduledReportsList
            reports={scheduledReports}
            loading={loading}
            onToggle={handleToggleScheduledReport}
            onDelete={handleDeleteScheduledReport}
            onRefresh={fetchScheduledReports}
          />
        )}
      </div>
    </div>
  );
}

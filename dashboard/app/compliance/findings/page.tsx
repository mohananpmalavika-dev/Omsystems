'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Search, Filter, TrendingUp, AlertCircle, CheckCircle2, Clock } from 'lucide-react';

interface Finding {
  id: string;
  controlId: string;
  findingNumber: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'negligible';
  status: 'open' | 'in_review' | 'resolved' | 'closed';
  riskScore: number;
  identifiedBy: string;
  identifiedDate: string;
  closedDate?: string;
  remediationPlanCount?: number;
}

export default function FindingsPage() {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchFindings();
  }, []);

  const fetchFindings = async () => {
    try {
      const response = await fetch('/api/compliance/findings');
      const data = await response.json();
      setFindings(data.data || []);
    } catch (error) {
      console.error('Failed to fetch findings:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredFindings = findings.filter(finding => {
    const matchesSearch = 
      finding.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      finding.findingNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      finding.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesSeverity = severityFilter === 'all' || finding.severity === severityFilter;
    const matchesStatus = statusFilter === 'all' || finding.status === statusFilter;

    return matchesSearch && matchesSeverity && matchesStatus;
  });

  const severityConfig = {
    critical: { color: 'bg-red-100 text-red-800 border-red-500', icon: '🔴' },
    high: { color: 'bg-orange-100 text-orange-800 border-orange-500', icon: '🟠' },
    medium: { color: 'bg-yellow-100 text-yellow-800 border-yellow-500', icon: '🟡' },
    low: { color: 'bg-blue-100 text-blue-800 border-blue-500', icon: '🔵' },
    negligible: { color: 'bg-gray-100 text-gray-800 border-gray-500', icon: '⚪' },
  };

  const statusConfig = {
    open: { color: 'bg-red-100 text-red-800', label: 'Open' },
    in_review: { color: 'bg-yellow-100 text-yellow-800', label: 'In Review' },
    resolved: { color: 'bg-green-100 text-green-800', label: 'Resolved' },
    closed: { color: 'bg-gray-100 text-gray-800', label: 'Closed' },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center space-x-3">
            <div className="bg-red-100 p-3 rounded-xl">
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Compliance Findings</h1>
              <p className="text-gray-600 mt-1">Track and manage compliance issues</p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-red-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Critical</p>
                <p className="text-2xl font-bold text-red-600 mt-1">
                  {findings.filter(f => f.severity === 'critical').length}
                </p>
              </div>
              <span className="text-3xl">🔴</span>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-orange-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">High</p>
                <p className="text-2xl font-bold text-orange-600 mt-1">
                  {findings.filter(f => f.severity === 'high').length}
                </p>
              </div>
              <span className="text-3xl">🟠</span>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-yellow-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Medium</p>
                <p className="text-2xl font-bold text-yellow-600 mt-1">
                  {findings.filter(f => f.severity === 'medium').length}
                </p>
              </div>
              <span className="text-3xl">🟡</span>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-green-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Open</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {findings.filter(f => f.status === 'open').length}
                </p>
              </div>
              <AlertCircle className="h-10 w-10 text-green-500 opacity-50" />
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-purple-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Avg Risk Score</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {findings.length > 0 
                    ? (findings.reduce((sum, f) => sum + f.riskScore, 0) / findings.length).toFixed(1)
                    : '0'
                  }
                </p>
              </div>
              <TrendingUp className="h-10 w-10 text-purple-500 opacity-50" />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search findings..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Severity Filter */}
            <div className="w-full md:w-48">
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="negligible">Negligible</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="w-full md:w-48">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="open">Open</option>
                <option value="in_review">In Review</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>
        </div>

        {/* Findings Grid */}
        {filteredFindings.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-12">
            <div className="flex flex-col items-center justify-center">
              <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
              <p className="text-gray-500 text-lg">No findings found</p>
              <p className="text-gray-400 text-sm mt-1">All compliance checks are passing</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredFindings.map((finding) => {
              const severityStyle = severityConfig[finding.severity];
              const statusStyle = statusConfig[finding.status];

              return (
                <Link
                  key={finding.id}
                  href={`/compliance/findings/${finding.id}`}
                  className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-200 overflow-hidden border-l-4 hover:scale-105"
                  style={{ borderLeftColor: severityStyle.color.split(' ')[1].replace('text-', '') }}
                >
                  <div className="p-6">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-sm font-mono text-gray-500">{finding.findingNumber}</span>
                      <span className={`px-2 py-1 text-xs rounded-full font-semibold ${severityStyle.color}`}>
                        {severityStyle.icon} {finding.severity}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="font-semibold text-lg text-gray-900 mb-2 line-clamp-2">
                      {finding.title}
                    </h3>

                    {/* Description */}
                    <p className="text-sm text-gray-600 mb-4 line-clamp-3">
                      {finding.description}
                    </p>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                      <div className="flex items-center space-x-2">
                        <div className="flex items-center space-x-1">
                          <TrendingUp className="h-4 w-4 text-gray-400" />
                          <span className="text-sm font-semibold text-gray-700">
                            Risk: {finding.riskScore}
                          </span>
                        </div>
                      </div>
                      <span className={`px-2 py-1 text-xs rounded-full font-semibold ${statusStyle.color}`}>
                        {statusStyle.label}
                      </span>
                    </div>

                    {/* Remediation Plans */}
                    {finding.remediationPlanCount && finding.remediationPlanCount > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="flex items-center space-x-2 text-xs text-purple-600">
                          <Clock className="h-4 w-4" />
                          <span>{finding.remediationPlanCount} remediation plan(s)</span>
                        </div>
                      </div>
                    )}

                    {/* Date */}
                    <div className="mt-2 text-xs text-gray-400">
                      Identified: {new Date(finding.identifiedDate).toLocaleDateString()}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Results Count */}
        {filteredFindings.length > 0 && (
          <div className="mt-6 text-center text-sm text-gray-600">
            Showing {filteredFindings.length} of {findings.length} findings
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, Upload, Search, CheckCircle, XCircle, Clock, Download } from 'lucide-react';

interface Evidence {
  id: string;
  controlId: string;
  evidenceType: 'document' | 'screenshot' | 'log_file' | 'report' | 'certificate' | 'other';
  title: string;
  description: string;
  filePath?: string;
  fileUrl?: string;
  collectedBy: string;
  collectedDate: string;
  validFrom?: string;
  validTo?: string;
  isVerified: boolean;
  verifiedBy?: string;
  verifiedDate?: string;
  status: 'active' | 'expired' | 'revoked';
}

export default function EvidencePage() {
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchEvidence();
  }, []);

  const fetchEvidence = async () => {
    try {
      const response = await fetch('/api/compliance/evidence');
      const data = await response.json();
      setEvidence(data.data || []);
    } catch (error) {
      console.error('Failed to fetch evidence:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredEvidence = evidence.filter(item => {
    const matchesSearch = 
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = typeFilter === 'all' || item.evidenceType === typeFilter;
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;

    return matchesSearch && matchesType && matchesStatus;
  });

  const typeConfig = {
    document: { color: 'bg-blue-100 text-blue-800', icon: '📄' },
    screenshot: { color: 'bg-purple-100 text-purple-800', icon: '📸' },
    log_file: { color: 'bg-green-100 text-green-800', icon: '📋' },
    report: { color: 'bg-orange-100 text-orange-800', icon: '📊' },
    certificate: { color: 'bg-yellow-100 text-yellow-800', icon: '🏆' },
    other: { color: 'bg-gray-100 text-gray-800', icon: '📦' },
  };

  const statusConfig = {
    active: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
    expired: { color: 'bg-red-100 text-red-800', icon: XCircle },
    revoked: { color: 'bg-gray-100 text-gray-800', icon: XCircle },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center space-x-3">
            <div className="bg-green-100 p-3 rounded-xl">
              <FileText className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Evidence Repository</h1>
              <p className="text-gray-600 mt-1">Manage compliance evidence and artifacts</p>
            </div>
          </div>
          <button
            className="bg-gradient-to-r from-green-600 to-blue-600 text-white px-6 py-3 rounded-lg hover:from-green-700 hover:to-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl flex items-center space-x-2"
          >
            <Upload className="h-5 w-5" />
            <span>Upload Evidence</span>
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-green-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Total Evidence</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{evidence.length}</p>
              </div>
              <FileText className="h-10 w-10 text-green-500 opacity-50" />
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-blue-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Verified</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {evidence.filter(e => e.isVerified).length}
                </p>
              </div>
              <CheckCircle className="h-10 w-10 text-blue-500 opacity-50" />
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-yellow-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Pending</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {evidence.filter(e => !e.isVerified && e.status === 'active').length}
                </p>
              </div>
              <Clock className="h-10 w-10 text-yellow-500 opacity-50" />
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-red-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Expired</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {evidence.filter(e => e.status === 'expired').length}
                </p>
              </div>
              <XCircle className="h-10 w-10 text-red-500 opacity-50" />
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
                  placeholder="Search evidence..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Type Filter */}
            <div className="w-full md:w-48">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="all">All Types</option>
                <option value="document">Document</option>
                <option value="screenshot">Screenshot</option>
                <option value="log_file">Log File</option>
                <option value="report">Report</option>
                <option value="certificate">Certificate</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="w-full md:w-48">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="revoked">Revoked</option>
              </select>
            </div>
          </div>
        </div>

        {/* Evidence Grid */}
        {filteredEvidence.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-12">
            <div className="flex flex-col items-center justify-center">
              <Upload className="h-16 w-16 text-gray-400 mb-4" />
              <p className="text-gray-500 text-lg">No evidence found</p>
              <p className="text-gray-400 text-sm mt-1">Upload evidence to get started</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEvidence.map((item) => {
              const typeStyle = typeConfig[item.evidenceType];
              const statusStyle = statusConfig[item.status];
              const StatusIcon = statusStyle.icon;

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-200 overflow-hidden hover:scale-105"
                >
                  <div className="p-6">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-3">
                      <span className={`px-3 py-1 text-xs rounded-full font-semibold ${typeStyle.color}`}>
                        {typeStyle.icon} {item.evidenceType.replace('_', ' ')}
                      </span>
                      <StatusIcon className={`h-5 w-5 ${statusStyle.color.replace('bg-', 'text-').replace('-100', '-500')}`} />
                    </div>

                    {/* Title */}
                    <h3 className="font-semibold text-lg text-gray-900 mb-2 line-clamp-2">
                      {item.title}
                    </h3>

                    {/* Description */}
                    <p className="text-sm text-gray-600 mb-4 line-clamp-3">
                      {item.description}
                    </p>

                    {/* Verification Status */}
                    {item.isVerified ? (
                      <div className="flex items-center space-x-2 mb-4 text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-xs font-medium">Verified</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2 mb-4 text-yellow-600">
                        <Clock className="h-4 w-4" />
                        <span className="text-xs font-medium">Pending Verification</span>
                      </div>
                    )}

                    {/* Metadata */}
                    <div className="pt-4 border-t border-gray-100 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">Collected:</span>
                        <span className="text-gray-900 font-medium">
                          {new Date(item.collectedDate).toLocaleDateString()}
                        </span>
                      </div>
                      {item.validTo && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">Valid Until:</span>
                          <span className={`font-medium ${
                            new Date(item.validTo) < new Date() ? 'text-red-600' : 'text-green-600'
                          }`}>
                            {new Date(item.validTo).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      {item.isVerified && item.verifiedBy && (
                        <div className="flex items-center justify-between text-xs pt-2 border-t border-gray-100">
                          <span className="text-gray-500">Verified By:</span>
                          <span className="text-blue-600 font-medium">{item.verifiedBy}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <button className="w-full flex items-center justify-center space-x-2 bg-green-50 text-green-700 py-2 rounded-lg hover:bg-green-100 transition-colors">
                        <Download className="h-4 w-4" />
                        <span className="text-sm font-medium">Download</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Results Count */}
        {filteredEvidence.length > 0 && (
          <div className="mt-6 text-center text-sm text-gray-600">
            Showing {filteredEvidence.length} of {evidence.length} evidence items
          </div>
        )}
      </div>
    </div>
  );
}

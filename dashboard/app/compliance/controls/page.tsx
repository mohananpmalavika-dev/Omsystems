'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Shield, Plus, Search, CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react';

interface Control {
  id: string;
  requirementId: string;
  controlCode: string;
  title: string;
  description: string;
  controlType: 'preventive' | 'detective' | 'corrective' | 'deterrent';
  implementationStatus: 'not_implemented' | 'in_progress' | 'implemented' | 'verified';
  effectiveness: 'effective' | 'partially_effective' | 'ineffective' | 'not_tested';
  testFrequency: string;
  lastTestDate?: string;
  nextTestDate?: string;
  owner?: string;
  evidenceCount?: number;
}

export default function ControlsPage() {
  const [controls, setControls] = useState<Control[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchControls();
  }, []);

  const fetchControls = async () => {
    try {
      const response = await fetch('/api/compliance/controls');
      const data = await response.json();
      setControls(data.data || []);
    } catch (error) {
      console.error('Failed to fetch controls:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredControls = controls.filter(control => {
    const matchesSearch = 
      control.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      control.controlCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      control.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = typeFilter === 'all' || control.controlType === typeFilter;
    const matchesStatus = statusFilter === 'all' || control.implementationStatus === statusFilter;

    return matchesSearch && matchesType && matchesStatus;
  });

  const typeConfig = {
    preventive: { color: 'bg-blue-100 text-blue-800', icon: '🛡️' },
    detective: { color: 'bg-purple-100 text-purple-800', icon: '🔍' },
    corrective: { color: 'bg-orange-100 text-orange-800', icon: '🔧' },
    deterrent: { color: 'bg-yellow-100 text-yellow-800', icon: '⚠️' },
  };

  const statusConfig = {
    not_implemented: { color: 'bg-gray-100 text-gray-800', icon: XCircle, label: 'Not Implemented' },
    in_progress: { color: 'bg-yellow-100 text-yellow-800', icon: Clock, label: 'In Progress' },
    implemented: { color: 'bg-green-100 text-green-800', icon: CheckCircle2, label: 'Implemented' },
    verified: { color: 'bg-blue-100 text-blue-800', icon: CheckCircle2, label: 'Verified' },
  };

  const effectivenessConfig = {
    effective: { color: 'text-green-600', label: 'Effective' },
    partially_effective: { color: 'text-yellow-600', label: 'Partially Effective' },
    ineffective: { color: 'text-red-600', label: 'Ineffective' },
    not_tested: { color: 'text-gray-600', label: 'Not Tested' },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-100 p-3 rounded-xl">
              <Shield className="h-8 w-8 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Compliance Controls</h1>
              <p className="text-gray-600 mt-1">Manage security and compliance controls</p>
            </div>
          </div>
          <Link
            href="/compliance/controls/new"
            className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl flex items-center space-x-2"
          >
            <Plus className="h-5 w-5" />
            <span>Add Control</span>
          </Link>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-blue-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Total Controls</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{controls.length}</p>
              </div>
              <Shield className="h-10 w-10 text-blue-500 opacity-50" />
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-green-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Implemented</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {controls.filter(c => c.implementationStatus === 'implemented' || c.implementationStatus === 'verified').length}
                </p>
              </div>
              <CheckCircle2 className="h-10 w-10 text-green-500 opacity-50" />
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-yellow-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">In Progress</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {controls.filter(c => c.implementationStatus === 'in_progress').length}
                </p>
              </div>
              <Clock className="h-10 w-10 text-yellow-500 opacity-50" />
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-red-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Not Implemented</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {controls.filter(c => c.implementationStatus === 'not_implemented').length}
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
                  placeholder="Search controls..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Type Filter */}
            <div className="w-full md:w-48">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Types</option>
                <option value="preventive">Preventive</option>
                <option value="detective">Detective</option>
                <option value="corrective">Corrective</option>
                <option value="deterrent">Deterrent</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="w-full md:w-48">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="not_implemented">Not Implemented</option>
                <option value="in_progress">In Progress</option>
                <option value="implemented">Implemented</option>
                <option value="verified">Verified</option>
              </select>
            </div>
          </div>
        </div>

        {/* Controls Grid */}
        {filteredControls.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-12">
            <div className="flex flex-col items-center justify-center">
              <AlertCircle className="h-16 w-16 text-gray-400 mb-4" />
              <p className="text-gray-500 text-lg">No controls found</p>
              <p className="text-gray-400 text-sm mt-1">Try adjusting your filters</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredControls.map((control) => {
              const typeStyle = typeConfig[control.controlType];
              const statusStyle = statusConfig[control.implementationStatus];
              const StatusIcon = statusStyle.icon;
              const effectivenessStyle = effectivenessConfig[control.effectiveness];

              return (
                <Link
                  key={control.id}
                  href={`/compliance/controls/${control.id}`}
                  className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-200 overflow-hidden hover:scale-105"
                >
                  <div className="p-6">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-mono font-medium text-blue-600">
                          {control.controlCode}
                        </span>
                        <span className={`px-2 py-1 text-xs rounded-full font-semibold ${typeStyle.color}`}>
                          {typeStyle.icon} {control.controlType}
                        </span>
                      </div>
                      <StatusIcon className={`h-5 w-5 ${statusStyle.color.replace('bg-', 'text-').replace('-100', '-500')}`} />
                    </div>

                    {/* Title */}
                    <h3 className="font-semibold text-lg text-gray-900 mb-2 line-clamp-2">
                      {control.title}
                    </h3>

                    {/* Description */}
                    <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                      {control.description}
                    </p>

                    {/* Status and Effectiveness */}
                    <div className="flex items-center justify-between mb-4">
                      <span className={`px-3 py-1 text-xs rounded-full font-semibold ${statusStyle.color}`}>
                        {statusStyle.label}
                      </span>
                      <span className={`text-sm font-medium ${effectivenessStyle.color}`}>
                        {effectivenessStyle.label}
                      </span>
                    </div>

                    {/* Footer Info */}
                    <div className="pt-4 border-t border-gray-100 space-y-2">
                      {control.owner && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">Owner:</span>
                          <span className="text-gray-900 font-medium">{control.owner}</span>
                        </div>
                      )}
                      {control.testFrequency && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">Test Frequency:</span>
                          <span className="text-gray-900 font-medium">{control.testFrequency}</span>
                        </div>
                      )}
                      {control.lastTestDate && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">Last Tested:</span>
                          <span className="text-gray-900 font-medium">
                            {new Date(control.lastTestDate).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      {control.nextTestDate && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">Next Test:</span>
                          <span className="text-purple-600 font-medium">
                            {new Date(control.nextTestDate).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      {control.evidenceCount !== undefined && control.evidenceCount > 0 && (
                        <div className="flex items-center justify-between text-xs pt-2 border-t border-gray-100">
                          <span className="text-gray-500">Evidence:</span>
                          <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full font-medium">
                            {control.evidenceCount} items
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Results Count */}
        {filteredControls.length > 0 && (
          <div className="mt-6 text-center text-sm text-gray-600">
            Showing {filteredControls.length} of {controls.length} controls
          </div>
        )}
      </div>
    </div>
  );
}

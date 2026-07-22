'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Plus, Search, TrendingUp, Activity } from 'lucide-react';

interface Risk {
  id: string;
  requirementId: string;
  riskCode: string;
  title: string;
  description: string;
  category: string;
  likelihood: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
  impact: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
  inherentRiskScore: number;
  residualRiskScore: number;
  riskResponse: 'accept' | 'mitigate' | 'transfer' | 'avoid';
  status: 'identified' | 'assessed' | 'treated' | 'monitored';
  owner?: string;
  reviewDate?: string;
  mitigationCount?: number;
}

export default function RisksPage() {
  const [risks, setRisks] = useState<Risk[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [likelihoodFilter, setLikelihoodFilter] = useState('all');
  const [impactFilter, setImpactFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchRisks();
  }, []);

  const fetchRisks = async () => {
    try {
      const response = await fetch('/api/compliance/risks');
      const data = await response.json();
      setRisks(data.data || []);
    } catch (error) {
      console.error('Failed to fetch risks:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredRisks = risks.filter(risk => {
    const matchesSearch = 
      risk.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      risk.riskCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      risk.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesLikelihood = likelihoodFilter === 'all' || risk.likelihood === likelihoodFilter;
    const matchesImpact = impactFilter === 'all' || risk.impact === impactFilter;
    const matchesStatus = statusFilter === 'all' || risk.status === statusFilter;

    return matchesSearch && matchesLikelihood && matchesImpact && matchesStatus;
  });

  const getRiskLevel = (score: number) => {
    if (score >= 20) return { label: 'Critical', color: 'bg-red-100 text-red-800 border-red-500' };
    if (score >= 15) return { label: 'High', color: 'bg-orange-100 text-orange-800 border-orange-500' };
    if (score >= 10) return { label: 'Medium', color: 'bg-yellow-100 text-yellow-800 border-yellow-500' };
    if (score >= 5) return { label: 'Low', color: 'bg-blue-100 text-blue-800 border-blue-500' };
    return { label: 'Very Low', color: 'bg-gray-100 text-gray-800 border-gray-500' };
  };

  const likelihoodConfig = {
    very_low: { value: 1, color: 'bg-gray-100 text-gray-800' },
    low: { value: 2, color: 'bg-blue-100 text-blue-800' },
    medium: { value: 3, color: 'bg-yellow-100 text-yellow-800' },
    high: { value: 4, color: 'bg-orange-100 text-orange-800' },
    very_high: { value: 5, color: 'bg-red-100 text-red-800' },
  };

  const responseConfig = {
    accept: { color: 'bg-gray-100 text-gray-800', label: 'Accept' },
    mitigate: { color: 'bg-blue-100 text-blue-800', label: 'Mitigate' },
    transfer: { color: 'bg-purple-100 text-purple-800', label: 'Transfer' },
    avoid: { color: 'bg-red-100 text-red-800', label: 'Avoid' },
  };

  const statusConfig = {
    identified: { color: 'bg-yellow-100 text-yellow-800', label: 'Identified' },
    assessed: { color: 'bg-blue-100 text-blue-800', label: 'Assessed' },
    treated: { color: 'bg-green-100 text-green-800', label: 'Treated' },
    monitored: { color: 'bg-purple-100 text-purple-800', label: 'Monitored' },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-red-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center space-x-3">
            <div className="bg-orange-100 p-3 rounded-xl">
              <AlertTriangle className="h-8 w-8 text-orange-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Risk Register</h1>
              <p className="text-gray-600 mt-1">Identify and manage compliance risks</p>
            </div>
          </div>
          <Link
            href="/compliance/risks/new"
            className="bg-gradient-to-r from-orange-600 to-red-600 text-white px-6 py-3 rounded-lg hover:from-orange-700 hover:to-red-700 transition-all duration-200 shadow-lg hover:shadow-xl flex items-center space-x-2"
          >
            <Plus className="h-5 w-5" />
            <span>Add Risk</span>
          </Link>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-red-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Critical</p>
                <p className="text-2xl font-bold text-red-600 mt-1">
                  {risks.filter(r => r.inherentRiskScore >= 20).length}
                </p>
              </div>
              <AlertTriangle className="h-10 w-10 text-red-500 opacity-50" />
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-orange-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">High</p>
                <p className="text-2xl font-bold text-orange-600 mt-1">
                  {risks.filter(r => r.inherentRiskScore >= 15 && r.inherentRiskScore < 20).length}
                </p>
              </div>
              <TrendingUp className="h-10 w-10 text-orange-500 opacity-50" />
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-yellow-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Medium</p>
                <p className="text-2xl font-bold text-yellow-600 mt-1">
                  {risks.filter(r => r.inherentRiskScore >= 10 && r.inherentRiskScore < 15).length}
                </p>
              </div>
              <Activity className="h-10 w-10 text-yellow-500 opacity-50" />
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-green-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Treated</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {risks.filter(r => r.status === 'treated').length}
                </p>
              </div>
              <Activity className="h-10 w-10 text-green-500 opacity-50" />
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-purple-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Avg Reduction</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {risks.length > 0 
                    ? Math.round(risks.reduce((sum, r) => sum + (r.inherentRiskScore - r.residualRiskScore), 0) / risks.length)
                    : '0'
                  }%
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
                  placeholder="Search risks..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Likelihood Filter */}
            <div className="w-full md:w-40">
              <select
                value={likelihoodFilter}
                onChange={(e) => setLikelihoodFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              >
                <option value="all">All Likelihood</option>
                <option value="very_low">Very Low</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="very_high">Very High</option>
              </select>
            </div>

            {/* Impact Filter */}
            <div className="w-full md:w-40">
              <select
                value={impactFilter}
                onChange={(e) => setImpactFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              >
                <option value="all">All Impact</option>
                <option value="very_low">Very Low</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="very_high">Very High</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="w-full md:w-40">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="identified">Identified</option>
                <option value="assessed">Assessed</option>
                <option value="treated">Treated</option>
                <option value="monitored">Monitored</option>
              </select>
            </div>
          </div>
        </div>

        {/* Risks Grid */}
        {filteredRisks.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-12">
            <div className="flex flex-col items-center justify-center">
              <AlertTriangle className="h-16 w-16 text-gray-400 mb-4" />
              <p className="text-gray-500 text-lg">No risks found</p>
              <p className="text-gray-400 text-sm mt-1">Add risks to monitor compliance exposure</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredRisks.map((risk) => {
              const inherentLevel = getRiskLevel(risk.inherentRiskScore);
              const residualLevel = getRiskLevel(risk.residualRiskScore);
              const responseStyle = responseConfig[risk.riskResponse];
              const statusStyle = statusConfig[risk.status];
              const likelihoodStyle = likelihoodConfig[risk.likelihood];
              const impactStyle = likelihoodConfig[risk.impact];

              return (
                <Link
                  key={risk.id}
                  href={`/compliance/risks/${risk.id}`}
                  className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-200 overflow-hidden border-l-4 hover:scale-105"
                  style={{ borderLeftColor: inherentLevel.color.split(' ')[1].replace('text-', '') }}
                >
                  <div className="p-6">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-sm font-mono text-gray-500">{risk.riskCode}</span>
                      <div className="flex flex-col items-end space-y-1">
                        <span className={`px-2 py-1 text-xs rounded-full font-semibold ${statusStyle.color}`}>
                          {statusStyle.label}
                        </span>
                        <span className={`px-2 py-1 text-xs rounded-full font-semibold ${responseStyle.color}`}>
                          {responseStyle.label}
                        </span>
                      </div>
                    </div>

                    {/* Title */}
                    <h3 className="font-semibold text-lg text-gray-900 mb-2 line-clamp-2">
                      {risk.title}
                    </h3>

                    {/* Description */}
                    <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                      {risk.description}
                    </p>

                    {/* Risk Assessment */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Likelihood</p>
                        <span className={`px-2 py-1 text-xs rounded-full font-semibold ${likelihoodStyle.color}`}>
                          {risk.likelihood.replace('_', ' ')}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Impact</p>
                        <span className={`px-2 py-1 text-xs rounded-full font-semibold ${impactStyle.color}`}>
                          {risk.impact.replace('_', ' ')}
                        </span>
                      </div>
                    </div>

                    {/* Risk Scores */}
                    <div className="pt-4 border-t border-gray-100">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-500">Inherent Risk</span>
                            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${inherentLevel.color}`}>
                              {inherentLevel.label}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-red-500"
                                style={{ width: `${(risk.inherentRiskScore / 25) * 100}%` }}
                              ></div>
                            </div>
                            <span className="text-sm font-bold text-gray-900">{risk.inherentRiskScore}</span>
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-500">Residual Risk</span>
                            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${residualLevel.color}`}>
                              {residualLevel.label}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-green-500"
                                style={{ width: `${(risk.residualRiskScore / 25) * 100}%` }}
                              ></div>
                            </div>
                            <span className="text-sm font-bold text-gray-900">{risk.residualRiskScore}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-xs">
                      {risk.owner && (
                        <div>
                          <span className="text-gray-500">Owner: </span>
                          <span className="text-gray-900 font-medium">{risk.owner}</span>
                        </div>
                      )}
                      {risk.mitigationCount && risk.mitigationCount > 0 && (
                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-medium">
                          {risk.mitigationCount} mitigations
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Results Count */}
        {filteredRisks.length > 0 && (
          <div className="mt-6 text-center text-sm text-gray-600">
            Showing {filteredRisks.length} of {risks.length} risks
          </div>
        )}
      </div>
    </div>
  );
}

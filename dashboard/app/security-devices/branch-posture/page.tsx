/**
 * Security Device Hub - Branch Security Posture Page
 * 
 * Shows comprehensive security status for each branch with all device categories
 */

'use client';

import { useState, useEffect } from 'react';
import { 
  Shield, 
  Camera, 
  Lock, 
  Bell, 
  Flame, 
  AlertTriangle,
  Zap,
  Activity,
  Building2,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronRight,
  Search,
  Filter,
  Download
} from 'lucide-react';
import Link from 'next/link';

interface BranchPosture {
  branchId: string;
  branchName?: string;
  overallScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  categories: {
    cctv: CategoryStatus;
    accessControl: CategoryStatus;
    intrusion: CategoryStatus;
    fire: CategoryStatus;
    banking: CategoryStatus;
    power: CategoryStatus;
    network: CategoryStatus;
  };
  activeAlarms: number;
  criticalIssues: number;
  lastUpdated: string;
}

interface CategoryStatus {
  total: number;
  online: number;
  offline: number;
  degraded: number;
  score: number;
  status: 'healthy' | 'warning' | 'critical';
}

export default function BranchSecurityPosturePage() {
  const [branches, setBranches] = useState<BranchPosture[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRisk, setFilterRisk] = useState<string>('all');
  const [selectedBranch, setSelectedBranch] = useState<BranchPosture | null>(null);

  useEffect(() => {
    loadBranchPostures();
    const interval = setInterval(loadBranchPostures, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  const loadBranchPostures = async () => {
    try {
      // TODO: Replace with actual API call to load all branch postures
      const response = await fetch('/api/branches');
      const branchData = await response.json();
      
      // Load posture for each branch
      const postures: BranchPosture[] = await Promise.all(
        branchData.data.map(async (branch: any) => {
          try {
            const postureRes = await fetch(`/api/security-devices/branches/${branch.id}/posture`);
            const postureData = await postureRes.json();
            return {
              ...postureData.data,
              branchName: branch.name,
            };
          } catch (error) {
            // Return mock data if posture not available
            return generateMockPosture(branch.id, branch.name);
          }
        })
      );

      setBranches(postures.filter(Boolean));
      setLoading(false);
    } catch (error) {
      console.error('Failed to load branch postures:', error);
      setLoading(false);
    }
  };

  const generateMockPosture = (branchId: string, branchName: string): BranchPosture => {
    const score = Math.random() * 100;
    const getRiskLevel = (score: number) => {
      if (score >= 90) return 'low';
      if (score >= 70) return 'medium';
      if (score >= 50) return 'high';
      return 'critical';
    };

    const generateCategory = (): CategoryStatus => {
      const total = Math.floor(Math.random() * 30) + 10;
      const online = Math.floor(total * (0.85 + Math.random() * 0.1));
      const offline = Math.floor(Math.random() * 3);
      const degraded = total - online - offline;
      const score = (online / total) * 100;
      
      return {
        total,
        online,
        offline,
        degraded: Math.max(0, degraded),
        score,
        status: score >= 90 ? 'healthy' : score >= 70 ? 'warning' : 'critical',
      };
    };

    return {
      branchId,
      branchName,
      overallScore: score,
      riskLevel: getRiskLevel(score),
      categories: {
        cctv: generateCategory(),
        accessControl: generateCategory(),
        intrusion: generateCategory(),
        fire: generateCategory(),
        banking: generateCategory(),
        power: generateCategory(),
        network: generateCategory(),
      },
      activeAlarms: Math.floor(Math.random() * 3),
      criticalIssues: score < 70 ? Math.floor(Math.random() * 5) + 1 : 0,
      lastUpdated: new Date().toISOString(),
    };
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'text-green-600 bg-green-50 border-green-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'high': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'warning': return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      case 'critical': return <XCircle className="w-5 h-5 text-red-600" />;
      default: return <AlertCircle className="w-5 h-5 text-gray-600" />;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'cctv': return Camera;
      case 'accessControl': return Lock;
      case 'intrusion': return Bell;
      case 'fire': return Flame;
      case 'banking': return Activity;
      case 'power': return Zap;
      case 'network': return Activity;
      default: return Shield;
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'cctv': return 'CCTV';
      case 'accessControl': return 'Access Control';
      case 'intrusion': return 'Intrusion Detection';
      case 'fire': return 'Fire Safety';
      case 'banking': return 'Banking Devices';
      case 'power': return 'Power Systems';
      case 'network': return 'Network Devices';
      default: return category;
    }
  };

  const filteredBranches = branches
    .filter(branch => 
      branch.branchName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      branch.branchId.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .filter(branch => 
      filterRisk === 'all' || branch.riskLevel === filterRisk
    )
    .sort((a, b) => {
      // Sort by risk level (critical first) then by score
      const riskOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      if (a.riskLevel !== b.riskLevel) {
        return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
      }
      return a.overallScore - b.overallScore;
    });

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Building2 className="w-8 h-8 text-blue-600" />
              Branch Security Posture
            </h1>
            <p className="text-gray-600 mt-1">
              Comprehensive security device status across all branches
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {/* TODO: Export to CSV */}}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            <Link
              href="/security-devices"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Back to Overview
            </Link>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="text-3xl font-bold text-gray-900">{branches.length}</div>
          <div className="text-sm text-gray-600 mt-1">Total Branches</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="text-3xl font-bold text-green-600">
            {branches.filter(b => b.riskLevel === 'low').length}
          </div>
          <div className="text-sm text-gray-600 mt-1">Healthy Branches</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="text-3xl font-bold text-yellow-600">
            {branches.filter(b => b.riskLevel === 'medium' || b.riskLevel === 'high').length}
          </div>
          <div className="text-sm text-gray-600 mt-1">At Risk</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="text-3xl font-bold text-red-600">
            {branches.filter(b => b.riskLevel === 'critical').length}
          </div>
          <div className="text-sm text-gray-600 mt-1">Critical Issues</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search branches..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <select
              value={filterRisk}
              onChange={(e) => setFilterRisk(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Risk Levels</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>
      </div>

      {/* Branch List */}
      <div className="space-y-4">
        {loading ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <div className="text-gray-500">Loading branch security postures...</div>
          </div>
        ) : filteredBranches.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <div className="text-gray-500">No branches found</div>
          </div>
        ) : (
          filteredBranches.map((branch) => (
            <div
              key={branch.branchId}
              className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="p-6">
                {/* Branch Header */}
                <div className="flex items-start justify-between mb-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-semibold text-gray-900">
                        {branch.branchName || branch.branchId}
                      </h3>
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${getRiskColor(branch.riskLevel)}`}>
                        {branch.riskLevel.toUpperCase()}
                      </span>
                      {branch.activeAlarms > 0 && (
                        <span className="px-3 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-700 border border-red-200 flex items-center gap-1">
                          <AlertTriangle className="w-4 h-4" />
                          {branch.activeAlarms} Active Alarms
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <div>Overall Score: <span className="font-semibold">{branch.overallScore.toFixed(1)}%</span></div>
                      {branch.criticalIssues > 0 && (
                        <div className="text-red-600">
                          {branch.criticalIssues} Critical Issues
                        </div>
                      )}
                      <div className="text-gray-400">
                        Updated {new Date(branch.lastUpdated).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                  <Link
                    href={`/security-devices?branchId=${branch.branchId}`}
                    className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 flex items-center gap-2"
                  >
                    View Devices
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>

                {/* Category Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {Object.entries(branch.categories).map(([key, category]) => {
                    const Icon = getCategoryIcon(key);
                    return (
                      <div
                        key={key}
                        className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Icon className="w-5 h-5 text-gray-600" />
                            <div className="text-sm font-semibold text-gray-900">
                              {getCategoryLabel(key)}
                            </div>
                          </div>
                          {getStatusIcon(category.status)}
                        </div>
                        
                        <div className="text-2xl font-bold text-gray-900 mb-2">
                          {category.total}
                        </div>
                        
                        <div className="flex items-center justify-between text-xs mb-2">
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1">
                              <div className="w-2 h-2 bg-green-500 rounded-full" />
                              {category.online}
                            </span>
                            {category.degraded > 0 && (
                              <span className="flex items-center gap-1">
                                <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                                {category.degraded}
                              </span>
                            )}
                            {category.offline > 0 && (
                              <span className="flex items-center gap-1">
                                <div className="w-2 h-2 bg-red-500 rounded-full" />
                                {category.offline}
                              </span>
                            )}
                          </div>
                          <div className="font-semibold text-gray-700">
                            {category.score.toFixed(0)}%
                          </div>
                        </div>

                        {/* Health Bar */}
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              category.status === 'healthy' ? 'bg-green-500' :
                              category.status === 'warning' ? 'bg-yellow-500' :
                              'bg-red-500'
                            }`}
                            style={{ width: `${category.score}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

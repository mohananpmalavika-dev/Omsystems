/**
 * Branch Risk Score Widget
 * 
 * Displays branch reliability score with component breakdown:
 * - Overall score (0-100)
 * - Risk classification
 * - Component-level risk indicators (recorder, storage, network, power, camera, compliance)
 * - Trend indicators
 * - Radial/bar chart visualization
 */

import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Server,
  HardDrive,
  Wifi,
  Camera,
  Battery,
  Shield,
  Info,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  RadialBarChart,
  RadialBar,
  Legend,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell
} from 'recharts';

interface ComponentRisk {
  component: string;
  score: number;
  risk: string;
  trend: 'improving' | 'stable' | 'degrading';
  weight: number;
}

interface BranchRiskData {
  branchNodeId: string;
  branchName: string;
  overallScore: number;
  riskClassification: string;
  topRisks: string[];
  recommendations: string[];
  componentRisks: ComponentRisk[];
  lastUpdated: string;
}

interface BranchRiskScoreWidgetProps {
  branchId: string;
  compact?: boolean;
  showDetails?: boolean;
}

export const BranchRiskScoreWidget: React.FC<BranchRiskScoreWidgetProps> = ({
  branchId,
  compact = false,
  showDetails = true
}) => {
  const [riskData, setRiskData] = useState<BranchRiskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(!compact);
  const [viewMode, setViewMode] = useState<'radial' | 'bar'>('radial');

  useEffect(() => {
    fetchBranchRiskScore();
    
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchBranchRiskScore, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [branchId]);

  const fetchBranchRiskScore = async () => {
    try {
      const response = await fetch(`/api/v1/predictions/branches/${branchId}/risk-score`);
      const data = await response.json();
      if (data.success) {
        setRiskData(data.data);
      }
    } catch (error) {
      console.error('Error fetching branch risk score:', error);
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number): string => {
    if (score >= 80) return '#10B981'; // Green
    if (score >= 60) return '#F59E0B'; // Yellow
    if (score >= 40) return '#F97316'; // Orange
    return '#EF4444'; // Red
  };

  const getScoreColorClass = (score: number): string => {
    if (score >= 80) return 'text-green-600 bg-green-50 border-green-300';
    if (score >= 60) return 'text-yellow-600 bg-yellow-50 border-yellow-300';
    if (score >= 40) return 'text-orange-600 bg-orange-50 border-orange-300';
    return 'text-red-600 bg-red-50 border-red-300';
  };

  const getRiskLabel = (score: number): string => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Critical';
  };

  const getRiskClassificationColor = (classification: string): string => {
    switch (classification) {
      case 'critical': return 'text-red-700 bg-red-100';
      case 'high_risk': return 'text-orange-700 bg-orange-100';
      case 'moderate': return 'text-yellow-700 bg-yellow-100';
      case 'low_risk': return 'text-blue-700 bg-blue-100';
      default: return 'text-gray-700 bg-gray-100';
    }
  };

  const getComponentIcon = (component: string) => {
    const iconClass = "w-5 h-5";
    switch (component.toLowerCase()) {
      case 'recorder': return <Server className={iconClass} />;
      case 'storage': return <HardDrive className={iconClass} />;
      case 'network': return <Wifi className={iconClass} />;
      case 'camera': return <Camera className={iconClass} />;
      case 'power': return <Battery className={iconClass} />;
      case 'compliance': return <Shield className={iconClass} />;
      default: return <AlertTriangle className={iconClass} />;
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving': return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'degrading': return <TrendingDown className="w-4 h-4 text-red-600" />;
      default: return <Minus className="w-4 h-4 text-gray-400" />;
    }
  };

  const getComponentColor = (score: number): string => {
    if (score >= 80) return '#10B981';
    if (score >= 60) return '#F59E0B';
    if (score >= 40) return '#F97316';
    return '#EF4444';
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!riskData) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <p className="text-gray-500">Branch risk score unavailable</p>
      </div>
    );
  }

  // Prepare data for radial chart
  const radialData = riskData.componentRisks.map(comp => ({
    name: comp.component,
    score: comp.score,
    fill: getComponentColor(comp.score)
  }));

  // Prepare data for bar chart
  const barData = riskData.componentRisks.map(comp => ({
    name: comp.component,
    score: comp.score,
    weight: comp.weight * 100
  }));

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <h3 className="text-lg font-semibold text-gray-900">
              {compact ? 'Risk Score' : 'Branch Reliability Score'}
            </h3>
            <div className="group relative">
              <Info className="w-4 h-4 text-gray-400 cursor-help" />
              <div className="absolute hidden group-hover:block z-10 w-64 p-2 text-xs bg-gray-900 text-white rounded shadow-lg -top-2 left-6">
                Composite score (0-100) evaluating branch infrastructure reliability based on component health
              </div>
            </div>
          </div>
          {compact && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-gray-500 hover:text-gray-700"
            >
              {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>
          )}
        </div>

        {!compact && (
          <p className="text-sm text-gray-500 mt-1">
            {riskData.branchName}
          </p>
        )}
      </div>

      {/* Overall Score Display */}
      <div className={`p-6 ${getScoreColorClass(riskData.overallScore)} border-b`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <span className="text-4xl font-bold">{riskData.overallScore}</span>
              <span className="text-2xl text-gray-600">/100</span>
            </div>
            <p className="text-sm font-medium">
              {getRiskLabel(riskData.overallScore)}
            </p>
            <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium mt-2 ${getRiskClassificationColor(riskData.riskClassification)}`}>
              {riskData.riskClassification.replace(/_/g, ' ').toUpperCase()}
            </span>
          </div>
          
          {/* Score Gauge (simplified visual) */}
          <div className="relative w-24 h-24">
            <svg viewBox="0 0 100 100" className="transform -rotate-90">
              {/* Background circle */}
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="#E5E7EB"
                strokeWidth="8"
              />
              {/* Score circle */}
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke={getScoreColor(riskData.overallScore)}
                strokeWidth="8"
                strokeDasharray={`${2 * Math.PI * 40 * (riskData.overallScore / 100)} ${2 * Math.PI * 40}`}
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Detailed View */}
      {expanded && showDetails && (
        <>
          {/* View Mode Toggle */}
          {!compact && (
            <div className="px-6 pt-4 flex items-center justify-end space-x-2">
              <button
                onClick={() => setViewMode('radial')}
                className={`px-3 py-1 text-sm rounded ${
                  viewMode === 'radial'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Radial
              </button>
              <button
                onClick={() => setViewMode('bar')}
                className={`px-3 py-1 text-sm rounded ${
                  viewMode === 'bar'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Bar Chart
              </button>
            </div>
          )}

          {/* Component Breakdown Chart */}
          <div className="p-6">
            {viewMode === 'radial' ? (
              <ResponsiveContainer width="100%" height={compact ? 200 : 300}>
                <RadialBarChart
                  cx="50%"
                  cy="50%"
                  innerRadius="20%"
                  outerRadius="90%"
                  barSize={compact ? 15 : 20}
                  data={radialData}
                  startAngle={180}
                  endAngle={-180}
                >
                  <RadialBar
                    label={{ position: 'insideStart', fill: '#fff', fontSize: 12 }}
                    background
                    dataKey="score"
                  />
                  <Legend
                    iconSize={10}
                    layout="horizontal"
                    verticalAlign="bottom"
                    align="center"
                    wrapperStyle={{ fontSize: '12px' }}
                  />
                  <Tooltip
                    formatter={(value: number) => [`${value}/100`, 'Score']}
                  />
                </RadialBarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={compact ? 200 : 300}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis domain={[0, 100]} fontSize={12} />
                  <Tooltip
                    formatter={(value: number, name: string) => {
                      if (name === 'score') return [`${value}/100`, 'Score'];
                      return [`${value.toFixed(1)}%`, 'Weight'];
                    }}
                  />
                  <Legend fontSize={12} />
                  <Bar dataKey="score" name="Score" radius={[8, 8, 0, 0]}>
                    {barData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getComponentColor(entry.score)} />
                    ))}
                  </Bar>
                  <Bar dataKey="weight" name="Weight" fill="#9CA3AF" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Component Risk Details */}
          <div className="px-6 pb-6 space-y-3">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Component Breakdown</h4>
            {riskData.componentRisks.map((comp, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-lg bg-white">
                    {getComponentIcon(comp.component)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {comp.component}
                    </p>
                    <p className="text-xs text-gray-500">
                      Weight: {(comp.weight * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <p className={`text-lg font-semibold ${
                      comp.score >= 80 ? 'text-green-600' :
                      comp.score >= 60 ? 'text-yellow-600' :
                      comp.score >= 40 ? 'text-orange-600' :
                      'text-red-600'
                    }`}>
                      {comp.score}
                    </p>
                    <p className="text-xs text-gray-500 capitalize">
                      {comp.risk.replace(/_/g, ' ')}
                    </p>
                  </div>
                  {getTrendIcon(comp.trend)}
                </div>
              </div>
            ))}
          </div>

          {/* Top Risks */}
          {riskData.topRisks && riskData.topRisks.length > 0 && (
            <div className="px-6 pb-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Top Risks</h4>
              <div className="space-y-2">
                {riskData.topRisks.map((risk, index) => (
                  <div key={index} className="flex items-start space-x-2 text-sm">
                    <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">{risk}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {riskData.recommendations && riskData.recommendations.length > 0 && (
            <div className="px-6 pb-6">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Recommendations</h4>
              <div className="space-y-2">
                {riskData.recommendations.map((rec, index) => (
                  <div key={index} className="flex items-start space-x-2 text-sm">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                    <span className="text-gray-700">{rec}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Last Updated */}
          <div className="px-6 pb-4 text-xs text-gray-500">
            Last updated: {new Date(riskData.lastUpdated).toLocaleString('en-IN')}
          </div>
        </>
      )}
    </div>
  );
};

export default BranchRiskScoreWidget;

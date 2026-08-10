"use client";

/**
 * Security Posture Dashboard Component
 * 
 * Displays aggregate security scores, vulnerabilities, compliance status, and recommendations.
 */

import React, { useEffect, useState } from 'react';
import {
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  TrendingUp,
  TrendingDown,
  Loader2,
  ChevronRight,
} from 'lucide-react';

interface SecurityPostureData {
  scopeId: string;
  scopeName: string;
  scopeType: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  vulnerabilities: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };
  issues: {
    outdatedFirmware: number;
    defaultCredentials: number;
    exposedDevices: number;
    insecureProtocols: number;
    unreachableDevices: number;
    misconfigurations: number;
    expiredCertificates: number;
  };
  compliance: {
    compliant: boolean;
    requirementsMet: number;
    totalRequirements: number;
    failedChecks: string[];
  };
  weakestAssets: Array<{
    assetId: string;
    assetName: string;
    assetType: string;
    score: number;
    criticalVulnerabilities: number;
  }>;
  recommendations: Array<{
    priority: string;
    category: string;
    title: string;
    description: string;
    affectedAssets: number;
    estimatedImpact: number;
    effort: string;
    actionItems: string[];
  }>;
}

interface SecurityTrendData {
  scopeId: string;
  dataPoints: Array<{
    timestamp: string;
    score: number;
    vulnerabilities: number;
    issues: number;
  }>;
}

interface SecurityPostureDashboardProps {
  assetId: string;
}

export function SecurityPostureDashboard({ assetId }: SecurityPostureDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [posture, setPosture] = useState<SecurityPostureData | null>(null);
  const [trend, setTrend] = useState<SecurityTrendData | null>(null);
  const [expandedRecommendation, setExpandedRecommendation] = useState<number | null>(null);

  useEffect(() => {
    fetchData();
  }, [assetId]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [postureRes, trendRes] = await Promise.all([
        fetch(`/api/digital-twin/security-posture/${assetId}`),
        fetch(`/api/digital-twin/security-posture/${assetId}/trend?days=30`),
      ]);

      if (!postureRes.ok || !trendRes.ok) {
        throw new Error('Failed to fetch security posture');
      }

      const [postureData, trendData] = await Promise.all([
        postureRes.json(),
        trendRes.json(),
      ]);

      setPosture(postureData);
      setTrend(trendData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'B':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'C':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'D':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'F':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-100 text-red-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Loading security posture...</p>
        </div>
      </div>
    );
  }

  if (error || !posture) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-600">{error || 'No data available'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Security Posture</h2>
        <p className="text-sm text-gray-600 mt-1">
          Security assessment for <span className="font-semibold">{posture.scopeName}</span>
        </p>
      </div>

      {/* Overall Score Card */}
      <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-600 mb-2">Overall Security Score</div>
            <div className="flex items-baseline gap-3">
              <div className="text-6xl font-bold text-gray-900">{posture.score}</div>
              <div className={`
                text-3xl font-bold px-4 py-2 rounded-lg border-2
                ${getGradeColor(posture.grade)}
              `}>
                {posture.grade}
              </div>
            </div>
          </div>
          
          <div className="text-right">
            <Shield className={`
              h-20 w-20 mb-2
              ${posture.score >= 80 ? 'text-green-500' :
                posture.score >= 60 ? 'text-yellow-500' :
                'text-red-500'}
            `} />
            <div className="text-sm text-gray-600">
              {posture.score >= 80 ? 'Strong' :
               posture.score >= 60 ? 'Moderate' :
               'Weak'} Security
            </div>
          </div>
        </div>

        {/* Trend Indicator */}
        {trend && trend.dataPoints.length >= 2 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-center gap-2 text-sm">
              {trend.dataPoints[trend.dataPoints.length - 1].score >
               trend.dataPoints[0].score ? (
                <>
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  <span className="text-green-600 font-semibold">Improving</span>
                  <span className="text-gray-600">
                    +{(trend.dataPoints[trend.dataPoints.length - 1].score - trend.dataPoints[0].score).toFixed(1)} over 30 days
                  </span>
                </>
              ) : (
                <>
                  <TrendingDown className="h-4 w-4 text-red-600" />
                  <span className="text-red-600 font-semibold">Declining</span>
                  <span className="text-gray-600">
                    {(trend.dataPoints[trend.dataPoints.length - 1].score - trend.dataPoints[0].score).toFixed(1)} over 30 days
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Vulnerabilities Breakdown */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Vulnerabilities</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-3xl font-bold text-gray-900">{posture.vulnerabilities.total}</div>
            <div className="text-sm text-gray-600 mt-1">Total</div>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <div className="text-3xl font-bold text-red-700">{posture.vulnerabilities.critical}</div>
            <div className="text-sm text-red-600 mt-1">Critical</div>
          </div>
          <div className="text-center p-4 bg-orange-50 rounded-lg">
            <div className="text-3xl font-bold text-orange-700">{posture.vulnerabilities.high}</div>
            <div className="text-sm text-orange-600 mt-1">High</div>
          </div>
          <div className="text-center p-4 bg-yellow-50 rounded-lg">
            <div className="text-3xl font-bold text-yellow-700">{posture.vulnerabilities.medium}</div>
            <div className="text-sm text-yellow-600 mt-1">Medium</div>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-3xl font-bold text-blue-700">{posture.vulnerabilities.low}</div>
            <div className="text-sm text-blue-600 mt-1">Low</div>
          </div>
        </div>
      </div>

      {/* Issues Summary */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Security Issues</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(posture.issues).map(([key, value]) => (
            <div key={key} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              {value > 0 ? (
                <AlertTriangle className="h-5 w-5 text-orange-500 flex-shrink-0" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
              )}
              <div>
                <div className="text-2xl font-bold text-gray-900">{value}</div>
                <div className="text-xs text-gray-600 capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Compliance Status */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Compliance Status</h3>
        
        <div className="flex items-center gap-4 mb-4">
          {posture.compliance.compliant ? (
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          ) : (
            <XCircle className="h-8 w-8 text-red-600" />
          )}
          <div>
            <div className="text-xl font-bold text-gray-900">
              {posture.compliance.compliant ? 'Compliant' : 'Non-Compliant'}
            </div>
            <div className="text-sm text-gray-600">
              {posture.compliance.requirementsMet} of {posture.compliance.totalRequirements} requirements met
              ({Math.round((posture.compliance.requirementsMet / posture.compliance.totalRequirements) * 100)}%)
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
          <div
            className={`h-3 rounded-full transition-all ${
              posture.compliance.compliant ? 'bg-green-600' : 'bg-red-600'
            }`}
            style={{
              width: `${(posture.compliance.requirementsMet / posture.compliance.totalRequirements) * 100}%`,
            }}
          ></div>
        </div>

        {/* Failed Checks */}
        {posture.compliance.failedChecks.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-semibold text-gray-700">Failed Checks:</div>
            {posture.compliance.failedChecks.map((check, idx) => (
              <div key={idx} className="flex items-start gap-2 text-sm text-red-600">
                <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{check}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Weakest Assets */}
      {posture.weakestAssets.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Weakest Assets</h3>
          <div className="space-y-2">
            {posture.weakestAssets.slice(0, 5).map((asset) => (
              <div key={asset.assetId} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                <div>
                  <div className="font-semibold text-gray-900">{asset.assetName}</div>
                  <div className="text-sm text-gray-600 capitalize">{asset.assetType}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-red-700">{asset.score}</div>
                  <div className="text-xs text-red-600">
                    {asset.criticalVulnerabilities} critical
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Security Recommendations ({posture.recommendations.length})
        </h3>
        <div className="space-y-3">
          {posture.recommendations.map((rec, idx) => (
            <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedRecommendation(expandedRecommendation === idx ? null : idx)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start gap-3 flex-1 text-left">
                  <span className={`
                    px-2 py-1 text-xs font-semibold rounded-full
                    ${getPriorityColor(rec.priority)}
                  `}>
                    {rec.priority.toUpperCase()}
                  </span>
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{rec.title}</div>
                    <div className="text-sm text-gray-600 mt-1">{rec.description}</div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      <span>{rec.affectedAssets} assets</span>
                      <span>+{rec.estimatedImpact} score impact</span>
                      <span className="capitalize">{rec.effort} effort</span>
                    </div>
                  </div>
                </div>
                <ChevronRight className={`
                  h-5 w-5 text-gray-400 transition-transform
                  ${expandedRecommendation === idx ? 'rotate-90' : ''}
                `} />
              </button>
              
              {expandedRecommendation === idx && (
                <div className="px-4 pb-4 bg-gray-50">
                  <div className="text-sm font-semibold text-gray-700 mb-2">Action Items:</div>
                  <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                    {rec.actionItems.map((item, itemIdx) => (
                      <li key={itemIdx}>{item}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

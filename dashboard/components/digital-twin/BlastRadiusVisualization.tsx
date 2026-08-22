"use client";

/**
 * Blast Radius Visualization Component
 * 
 * Shows the impact of asset failures with dependency paths and affected assets.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, TrendingDown, Users, Building2, Loader2, X } from 'lucide-react';

interface BlastRadiusData {
  sourceAssetId: string;
  sourceAssetName: string;
  sourceAssetType: string;
  totalAffected: number;
  byType: Record<string, number>;
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  affectedBranches: string[];
  criticalServices: Array<{
    service: string;
    impact: string;
    affectedAssets: number;
  }>;
  affectedAssets: Array<{
    assetId: string;
    assetName: string;
    assetType: string;
    dependencyDepth: number;
    dependencyPath: Array<{
      assetName: string;
      relationshipType: string;
    }>;
    impact: string;
    impactLevel: string;
    reason: string;
  }>;
  businessImpact?: {
    coverageLoss?: string;
    complianceRisk?: boolean;
    operationalImpact?: string;
    estimatedDowntime?: string;
  };
}

interface BlastRadiusVisualizationProps {
  assetId: string;
  onClose?: () => void;
}

export function BlastRadiusVisualization({
  assetId,
  onClose,
}: BlastRadiusVisualizationProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blastRadius, setBlastRadius] = useState<BlastRadiusData | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);

  useEffect(() => {
    fetchBlastRadius();
  }, [assetId]);

  const fetchBlastRadius = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/digital-twin/assets/${assetId}/blast-radius`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch blast radius');
      }

      const data = await response.json();
      setBlastRadius(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const getImpactLevelColor = (level: string) => {
    switch (level) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getImpactSeverityText = () => {
    if (!blastRadius) return 'Unknown';
    
    const { totalAffected, bySeverity } = blastRadius;
    
    if (bySeverity.critical > 10 || blastRadius.affectedBranches.length > 3) {
      return 'CRITICAL';
    } else if (bySeverity.critical > 5 || bySeverity.high > 20) {
      return 'HIGH';
    } else if (totalAffected > 10 || bySeverity.high > 5) {
      return 'MEDIUM';
    } else if (totalAffected > 0) {
      return 'LOW';
    }
    return 'NONE';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Calculating blast radius...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!blastRadius) {
    return null;
  }

  const impactSeverity = getImpactSeverityText();
  const selectedAssetData = selectedAsset
    ? blastRadius.affectedAssets.find((a) => a.assetId === selectedAsset)
    : null;

  return (
    <div className="space-y-6">
      {/* Header with Close Button */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Blast Radius Analysis</h2>
          <p className="text-sm text-gray-600 mt-1">
            Impact analysis for <span className="font-semibold">{blastRadius.sourceAssetName}</span>
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        )}
      </div>

      {/* Impact Severity Banner */}
      <div className={`
        p-4 rounded-lg border-2 flex items-center gap-3
        ${impactSeverity === 'CRITICAL' ? 'bg-red-50 border-red-500' :
          impactSeverity === 'HIGH' ? 'bg-orange-50 border-orange-500' :
          impactSeverity === 'MEDIUM' ? 'bg-yellow-50 border-yellow-500' :
          'bg-blue-50 border-blue-500'}
      `}>
        <AlertTriangle className={`h-6 w-6 ${
          impactSeverity === 'CRITICAL' ? 'text-red-600' :
          impactSeverity === 'HIGH' ? 'text-orange-600' :
          impactSeverity === 'MEDIUM' ? 'text-yellow-600' :
          'text-blue-600'
        }`} />
        <div>
          <div className="font-bold text-lg">
            {impactSeverity} Impact Level
          </div>
          <div className="text-sm text-gray-700">
            {blastRadius.totalAffected} assets would be affected by this failure
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Total Affected</div>
          <div className="text-3xl font-bold text-gray-900">{blastRadius.totalAffected}</div>
        </div>
        
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-sm text-red-600 mb-1">Critical Impact</div>
          <div className="text-3xl font-bold text-red-700">{blastRadius.bySeverity.critical}</div>
        </div>
        
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="text-sm text-orange-600 mb-1">High Impact</div>
          <div className="text-3xl font-bold text-orange-700">{blastRadius.bySeverity.high}</div>
        </div>
        
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="text-sm text-yellow-600 mb-1">Medium Impact</div>
          <div className="text-3xl font-bold text-yellow-700">{blastRadius.bySeverity.medium}</div>
        </div>
      </div>

      {/* Business Impact */}
      {blastRadius.businessImpact && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Business Impact</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {blastRadius.businessImpact.coverageLoss && (
              <div>
                <div className="text-sm text-gray-600 mb-1">Coverage Loss</div>
                <div className="text-base font-semibold text-gray-900">
                  {blastRadius.businessImpact.coverageLoss}
                </div>
              </div>
            )}
            
            {blastRadius.businessImpact.operationalImpact && (
              <div>
                <div className="text-sm text-gray-600 mb-1">Operational Impact</div>
                <div className="text-base font-semibold text-gray-900">
                  {blastRadius.businessImpact.operationalImpact}
                </div>
              </div>
            )}
            
            {blastRadius.businessImpact.estimatedDowntime && (
              <div>
                <div className="text-sm text-gray-600 mb-1">Estimated Downtime</div>
                <div className="text-base font-semibold text-gray-900">
                  {blastRadius.businessImpact.estimatedDowntime}
                </div>
              </div>
            )}
            
            {blastRadius.businessImpact.complianceRisk !== undefined && (
              <div>
                <div className="text-sm text-gray-600 mb-1">Compliance Risk</div>
                <div className={`text-base font-semibold ${
                  blastRadius.businessImpact.complianceRisk ? 'text-red-600' : 'text-green-600'
                }`}>
                  {blastRadius.businessImpact.complianceRisk ? 'Yes' : 'No'}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Affected Assets by Type */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Affected by Type</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(blastRadius.byType).map(([type, count]) => (
            <div key={type} className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">{count}</div>
              <div className="text-sm text-gray-600 capitalize">{type}s</div>
            </div>
          ))}
        </div>
      </div>

      {/* Critical Services */}
      {blastRadius.criticalServices.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Critical Services Affected</h3>
          <div className="space-y-3">
            {blastRadius.criticalServices.map((service, index) => (
              <div key={index} className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">{service.service}</div>
                  <div className="text-sm text-gray-600">{service.impact}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {service.affectedAssets} assets affected
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Affected Assets List with Dependency Paths */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Affected Assets ({blastRadius.affectedAssets.length})
        </h3>
        
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {blastRadius.affectedAssets.map((asset) => (
            <div
              key={asset.assetId}
              className={`
                p-4 rounded-lg border cursor-pointer transition-all
                ${selectedAsset === asset.assetId
                  ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-200'
                  : 'bg-gray-50 border-gray-200 hover:border-gray-300'}
              `}
              onClick={() => setSelectedAsset(asset.assetId === selectedAsset ? null : asset.assetId)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{asset.assetName}</span>
                    <span className={`
                      px-2 py-0.5 text-xs font-medium rounded-full border
                      ${getImpactLevelColor(asset.impactLevel)}
                    `}>
                      {asset.impactLevel}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">{asset.impact}</div>
                  
                  {/* Dependency Path (shown when selected) */}
                  {selectedAsset === asset.assetId && asset.dependencyPath.length > 0 && (
                    <div className="mt-3 p-3 bg-white rounded border border-gray-200">
                      <div className="text-xs font-semibold text-gray-700 mb-2">
                        Dependency Path:
                      </div>
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        {asset.dependencyPath.map((step, idx) => (
                          <React.Fragment key={idx}>
                            <div className="px-2 py-1 bg-gray-100 rounded">
                              {step.assetName}
                            </div>
                            {idx < asset.dependencyPath.length - 1 && (
                              <div className="text-gray-400">
                                → <span className="text-xs italic">{step.relationshipType}</span> →
                              </div>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="text-sm text-gray-500">
                  Depth: {asset.dependencyDepth}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

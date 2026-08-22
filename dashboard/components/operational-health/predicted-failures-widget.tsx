"use client";

/**
 * Predicted Failures Widget
 * Shows predicted infrastructure failures for proactive maintenance scheduling
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { AlertCircle, Battery, HardDrive, Wrench, Calendar } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";

interface PredictedFailure {
  failureType: 'ups_battery' | 'disk_failure' | 'generator_maintenance';
  componentId: string;
  componentName: string;
  description: string;
  daysUntilFailure: number | null;
  healthIndicator: number | null;
  observedAt: string;
}

interface PredictedFailuresWidgetProps {
  branchId?: string;
  refreshKey: number;
}

export function PredictedFailuresWidget({ 
  branchId,
  refreshKey 
}: PredictedFailuresWidgetProps) {
  const [failures, setFailures] = useState<PredictedFailure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (branchId) {
      loadPredictedFailures();
    }
  }, [branchId, refreshKey]);

  const loadPredictedFailures = async () => {
    try {
      setLoading(true);
      setError(undefined);
      
      const response = await fetch(`/api/control/v1/infrastructure/predicted-failures/${branchId}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load predicted failures");
      
      const { data } = await response.json();
      setFailures(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load predicted failures");
    } finally {
      setLoading(false);
    }
  };

  const getFailureIcon = (type: string) => {
    switch (type) {
      case 'ups_battery': return <Battery size={20} className="text-amber-600" />;
      case 'disk_failure': return <HardDrive size={20} className="text-red-600" />;
      case 'generator_maintenance': return <Wrench size={20} className="text-blue-600" />;
      default: return <AlertCircle size={20} className="text-gray-600" />;
    }
  };

  const getUrgencyColor = (days: number | null) => {
    if (days === null) return 'bg-red-100 text-red-800 border-red-200';
    if (days <= 7) return 'bg-red-100 text-red-800 border-red-200';
    if (days <= 30) return 'bg-amber-100 text-amber-800 border-amber-200';
    return 'bg-blue-100 text-blue-800 border-blue-200';
  };

  const getUrgencyLabel = (days: number | null) => {
    if (days === null) return 'IMMEDIATE';
    if (days <= 7) return 'URGENT';
    if (days <= 30) return 'SOON';
    return 'SCHEDULED';
  };

  const formatDaysUntil = (days: number | null) => {
    if (days === null) return 'Immediate action required';
    if (days === 0) return 'Today';
    if (days === 1) return '1 day';
    if (days <= 7) return `${days} days`;
    if (days <= 30) return `${Math.round(days / 7)} weeks`;
    return `${Math.round(days / 30)} months`;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Predicted Failures</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Predicted Failures</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!branchId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle size={20} className="text-amber-600" />
            Predicted Failures
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64 text-gray-400">
            <p>Select a branch to view predicted failures</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertCircle size={20} className="text-amber-600" />
            Predicted Failures
          </CardTitle>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            failures.length > 0 ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
          }`}>
            {failures.length} Predicted
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {failures.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <Calendar size={48} className="mb-2 text-green-400" />
            <p className="font-medium text-green-600">No predicted failures</p>
            <p className="text-sm">No qualifying failure evidence is currently reported</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {failures
              .sort((a, b) => {
                const aDays = a.daysUntilFailure ?? 0;
                const bDays = b.daysUntilFailure ?? 0;
                return aDays - bDays;
              })
              .map((failure, index) => (
                <div
                  key={index}
                  className="p-4 border rounded-lg hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-gray-100 rounded-lg flex-shrink-0">
                      {getFailureIcon(failure.failureType)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-gray-900 truncate">
                          {failure.componentName}
                        </h4>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${
                          getUrgencyColor(failure.daysUntilFailure)
                        }`}>
                          {getUrgencyLabel(failure.daysUntilFailure)}
                        </span>
                      </div>
                      
                      <p className="text-sm text-gray-600 mb-2">
                        {failure.description}
                      </p>
                      
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        {failure.daysUntilFailure !== null && (
                          <span className="flex items-center gap-1">
                            <Calendar size={12} />
                            {formatDaysUntil(failure.daysUntilFailure)}
                          </span>
                        )}
                        {failure.healthIndicator !== null && (
                          <span>
                            Health: {failure.healthIndicator}%
                          </span>
                        )}
                      </div>
                    </div>

                    <Link href={`/maintenance/workorders?asset=${encodeURIComponent(failure.componentId)}`} className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                      Schedule
                    </Link>
                  </div>
                </div>
              ))}
          </div>
        )}

        {failures.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Maintenance Scheduling</span>
              <Link href="/maintenance/workorders" className="text-blue-600 hover:text-blue-700 font-medium">
                View work orders →
              </Link>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

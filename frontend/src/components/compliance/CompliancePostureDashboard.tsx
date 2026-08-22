/**
 * Compliance Posture Dashboard
 * 
 * Main dashboard showing three-category compliance split:
 * - Compliant
 * - Non-Compliant
 * - Cannot Verify (Indeterminate)
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertCircle,
  CheckCircle,
  XCircle,
  HelpCircle,
  RefreshCw,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { complianceApi } from '@/api/compliance';
import type { ComplianceSummary } from '@/types/compliance';

interface CompliancePostureDashboardProps {
  tenantId: string;
  branchId?: string;
  policyId?: string;
}

export function CompliancePostureDashboard({
  tenantId,
  branchId,
  policyId
}: CompliancePostureDashboardProps) {
  const [selectedState, setSelectedState] = useState<string | null>(null);
  
  const { data: summary, isLoading, refetch } = useQuery({
    queryKey: ['compliance', 'summary', tenantId, branchId, policyId],
    queryFn: () => complianceApi.getSummary({ tenantId, branchId, policyId }),
    refetchInterval: 60000 // Refresh every minute
  });
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  if (!summary) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">
            No compliance data available
          </div>
        </CardContent>
      </Card>
    );
  }
  
  const complianceRate = summary.complianceRate.toFixed(1);
  const isGoodCompliance = summary.complianceRate >= 95;
  const isAcceptableCompliance = summary.complianceRate >= 85;
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Recording Compliance
          </h2>
          <p className="text-sm text-muted-foreground">
            Last updated: {new Date(summary.lastUpdated).toLocaleString()}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>
      
      {/* Overall Compliance Rate */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-4xl font-bold">
                {complianceRate}%
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                Overall Compliance Rate
              </div>
            </div>
            <div className={`flex items-center gap-2 ${
              isGoodCompliance ? 'text-green-600' :
              isAcceptableCompliance ? 'text-yellow-600' :
              'text-red-600'
            }`}>
              {isGoodCompliance ? (
                <TrendingUp className="h-8 w-8" />
              ) : (
                <TrendingDown className="h-8 w-8" />
              )}
            </div>
          </div>
          
          <div className="mt-4 text-sm text-muted-foreground">
            {summary.totalCameras} cameras monitored
          </div>
        </CardContent>
      </Card>
      
      {/* Three-Category Split */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Compliant */}
        <Card
          className={`cursor-pointer transition-all ${
            selectedState === 'COMPLIANT' ? 'ring-2 ring-green-500' : ''
          }`}
          onClick={() => setSelectedState('COMPLIANT')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Compliant
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {summary.byState.compliant}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {((summary.byState.compliant / summary.totalCameras) * 100).toFixed(1)}% of total
            </p>
            <div className="mt-4 space-y-2">
              <div className="text-sm">
                <span className="text-muted-foreground">Avg Score:</span>{' '}
                <span className="font-medium">{summary.averageScore.toFixed(0)}/100</span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Avg Retention:</span>{' '}
                <span className="font-medium">{summary.retention.averageDays.toFixed(1)} days</span>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Non-Compliant */}
        <Card
          className={`cursor-pointer transition-all ${
            selectedState === 'NON_COMPLIANT' ? 'ring-2 ring-red-500' : ''
          }`}
          onClick={() => setSelectedState('NON_COMPLIANT')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Non-Compliant
            </CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">
              {summary.byState.nonCompliant}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {((summary.byState.nonCompliant / summary.totalCameras) * 100).toFixed(1)}% of total
            </p>
            <div className="mt-4">
              <div className="text-sm font-medium mb-2">Top Violations:</div>
              <div className="space-y-1">
                {summary.topViolations.slice(0, 3).map((violation) => (
                  <div key={violation.code} className="text-xs">
                    <Badge variant="destructive" className="text-xs">
                      {violation.count}
                    </Badge>{' '}
                    <span className="text-muted-foreground">
                      {formatViolationCode(violation.code)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Cannot Verify (Indeterminate) */}
        <Card
          className={`cursor-pointer transition-all ${
            selectedState === 'INDETERMINATE' ? 'ring-2 ring-yellow-500' : ''
          }`}
          onClick={() => setSelectedState('INDETERMINATE')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Cannot Verify
            </CardTitle>
            <HelpCircle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">
              {summary.byState.indeterminate}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {((summary.byState.indeterminate / summary.totalCameras) * 100).toFixed(1)}% of total
            </p>
            <div className="mt-4">
              <div className="text-sm font-medium mb-2">Reasons:</div>
              <div className="space-y-1">
                {Object.entries(summary.cannotVerify.byReason)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3)
                  .map(([reason, count]) => (
                    <div key={reason} className="text-xs">
                      <Badge variant="outline" className="text-xs">
                        {count}
                      </Badge>{' '}
                      <span className="text-muted-foreground">
                        {formatReason(reason)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Retention Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Retention Overview</CardTitle>
          <CardDescription>
            Recording retention statistics across monitored cameras
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <div className="text-2xl font-bold">
                {summary.retention.averageDays.toFixed(1)}
              </div>
              <div className="text-sm text-muted-foreground">
                Average Retention Days
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {summary.retention.minimumDays.toFixed(1)}
              </div>
              <div className="text-sm text-muted-foreground">
                Minimum Retention Days
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">
                {summary.retention.belowRequirement}
              </div>
              <div className="text-sm text-muted-foreground">
                Below Requirement
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Coverage Statistics */}
      <Card>
        <CardHeader>
          <CardTitle>Recording Coverage</CardTitle>
          <CardDescription>
            Recording gaps and coverage statistics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <div className="text-2xl font-bold">
                {(summary.coverage.averageRatio * 100).toFixed(2)}%
              </div>
              <div className="text-sm text-muted-foreground">
                Average Coverage
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {summary.coverage.totalGaps}
              </div>
              <div className="text-sm text-muted-foreground">
                Total Gaps Detected
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {summary.coverage.largestGapMinutes.toFixed(1)}m
              </div>
              <div className="text-sm text-muted-foreground">
                Largest Gap
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Detail View Based on Selection */}
      {selectedState && (
        <ComplianceDetailView
          tenantId={tenantId}
          branchId={branchId}
          state={selectedState}
          onClose={() => setSelectedState(null)}
        />
      )}
    </div>
  );
}

function formatViolationCode(code: string): string {
  return code
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

function formatReason(reason: string): string {
  return reason
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

// Placeholder for detail view component
function ComplianceDetailView({
  tenantId,
  branchId,
  state,
  onClose
}: {
  tenantId: string;
  branchId?: string;
  state: string;
  onClose: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>
            {state === 'COMPLIANT' ? 'Compliant Cameras' :
             state === 'NON_COMPLIANT' ? 'Non-Compliant Cameras' :
             'Cannot Verify Cameras'}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-muted-foreground">
          Detailed camera list will be displayed here
        </div>
      </CardContent>
    </Card>
  );
}

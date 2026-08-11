/**
 * Compliance Finding Details Component
 * 
 * Displays detailed compliance finding with:
 * - Compliance state and score
 * - Requirements vs observed values
 * - Violations list
 * - Evidence link
 */

import React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  ExternalLink,
  AlertCircle
} from 'lucide-react';
import type { ComplianceFinding } from '@/types/compliance';

interface ComplianceFindingDetailsProps {
  finding: ComplianceFinding;
  onViewEvidence?: (evidenceId: string) => void;
}

export function ComplianceFindingDetails({
  finding,
  onViewEvidence
}: ComplianceFindingDetailsProps) {
  const stateConfig = getStateConfig(finding.state);
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {stateConfig.icon}
              <CardTitle>{finding.cameraName || finding.cameraId}</CardTitle>
            </div>
            <CardDescription>
              {finding.recorderName || finding.recorderId}
            </CardDescription>
          </div>
          <Badge
            variant={stateConfig.variant}
            className="text-base px-3 py-1"
          >
            {finding.state}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* State Summary */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Compliance Score</div>
            <div className="text-2xl font-bold">
              {finding.complianceScore || 0}/100
            </div>
          </div>
          
          {finding.reason && (
            <div className="text-sm text-muted-foreground">
              {finding.reason}
            </div>
          )}
          
          <div className="text-xs text-muted-foreground">
            Evaluated: {new Date(finding.evaluatedAt).toLocaleString()}
          </div>
        </div>
        
        <Separator />
        
        {/* Policy Information */}
        <div className="space-y-2">
          <div className="font-medium">Policy</div>
          <div className="text-sm">
            <div>{finding.policyName}</div>
            <div className="text-muted-foreground">
              Version {finding.policyVersion}
            </div>
          </div>
        </div>
        
        <Separator />
        
        {/* Requirements vs Observed */}
        <div className="space-y-3">
          <div className="font-medium">Requirements vs Observed</div>
          
          <RequirementRow
            label="Retention Days"
            required={finding.requirements.retentionDays}
            observed={finding.observed.retentionDays}
            unit="days"
            isCompliant={
              finding.observed.retentionDays !== undefined &&
              finding.observed.retentionDays >= finding.requirements.retentionDays
            }
          />
          
          <RequirementRow
            label="Coverage"
            required={finding.requirements.minimumCoverage * 100}
            observed={finding.observed.coverage}
            unit="%"
            isCompliant={
              finding.observed.coverage !== undefined &&
              finding.observed.coverage >= finding.requirements.minimumCoverage * 100
            }
          />
          
          <RequirementRow
            label="Max Gap"
            required={finding.requirements.maximumGapMinutes}
            observed={finding.observed.largestGapMinutes}
            unit="minutes"
            isCompliant={
              finding.observed.largestGapMinutes !== undefined &&
              finding.observed.largestGapMinutes <= finding.requirements.maximumGapMinutes
            }
            inverse
          />
          
          <RequirementRow
            label="Evidence Age"
            required={finding.requirements.maxEvidenceAgeMinutes}
            observed={finding.observed.evidenceAgeMinutes}
            unit="minutes"
            isCompliant={
              finding.observed.evidenceAgeMinutes !== undefined &&
              finding.observed.evidenceAgeMinutes <= finding.requirements.maxEvidenceAgeMinutes
            }
            inverse
          />
          
          <RequirementRow
            label="Evidence Confidence"
            required={finding.requirements.minimumConfidence * 100}
            observed={finding.observed.evidenceConfidence ? finding.observed.evidenceConfidence * 100 : undefined}
            unit="%"
            isCompliant={
              finding.observed.evidenceConfidence !== undefined &&
              finding.observed.evidenceConfidence >= finding.requirements.minimumConfidence
            }
          />
        </div>
        
        {/* Violations */}
        {finding.violations.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="font-medium">
                Violations ({finding.violations.length})
              </div>
              <div className="space-y-2">
                {finding.violations.map((violation, idx) => (
                  <ViolationCard key={idx} violation={violation} />
                ))}
              </div>
            </div>
          </>
        )}
        
        {/* Evidence Link */}
        {finding.evidenceSnapshotId && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="font-medium">Evidence</div>
              <div className="flex items-center justify-between text-sm">
                <div>
                  <div className="text-muted-foreground">
                    Snapshot ID: {finding.evidenceSnapshotId.slice(0, 8)}...
                  </div>
                  {finding.evidenceVerifiedAt && (
                    <div className="text-xs text-muted-foreground">
                      Verified: {new Date(finding.evidenceVerifiedAt).toLocaleString()}
                    </div>
                  )}
                  {finding.evidenceAgeSeconds && (
                    <div className="text-xs text-muted-foreground">
                      Age: {Math.floor(finding.evidenceAgeSeconds / 60)} minutes
                    </div>
                  )}
                </div>
                {onViewEvidence && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onViewEvidence(finding.evidenceSnapshotId!)}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Evidence
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
        
        {/* Next Evaluation */}
        {finding.nextEvaluationAt && (
          <>
            <Separator />
            <div className="text-sm text-muted-foreground">
              Next evaluation scheduled for{' '}
              {new Date(finding.nextEvaluationAt).toLocaleString()}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RequirementRow({
  label,
  required,
  observed,
  unit,
  isCompliant,
  inverse = false
}: {
  label: string;
  required: number;
  observed?: number;
  unit: string;
  isCompliant: boolean;
  inverse?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm py-2 border-b border-border/50">
      <div className="font-medium">{label}</div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <div className="text-muted-foreground text-xs">
            Required: {inverse ? '≤' : '≥'} {required.toFixed(1)} {unit}
          </div>
          <div className={observed !== undefined ? (isCompliant ? 'text-green-600' : 'text-red-600') : 'text-muted-foreground'}>
            Observed: {observed !== undefined ? `${observed.toFixed(1)} ${unit}` : 'Unknown'}
          </div>
        </div>
        {observed !== undefined && (
          isCompliant ? (
            <CheckCircle className="h-4 w-4 text-green-600" />
          ) : (
            <XCircle className="h-4 w-4 text-red-600" />
          )
        )}
      </div>
    </div>
  );
}

function ViolationCard({ violation }: { violation: any }) {
  const severityConfig = getSeverityConfig(violation.severity);
  
  return (
    <div className={`p-3 border rounded-md ${severityConfig.bgClass}`}>
      <div className="flex items-start gap-2">
        {severityConfig.icon}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant={severityConfig.variant} className="text-xs">
              {violation.severity}
            </Badge>
            <span className="text-sm font-medium">
              {formatViolationCode(violation.code)}
            </span>
          </div>
          <div className="text-sm text-muted-foreground">
            {violation.message}
          </div>
          {(violation.required !== undefined || violation.observed !== undefined) && (
            <div className="text-xs text-muted-foreground mt-1">
              {violation.required !== undefined && (
                <span>Required: {violation.required} </span>
              )}
              {violation.observed !== undefined && (
                <span>| Observed: {violation.observed}</span>
              )}
              {violation.gap !== undefined && (
                <span className="text-red-600"> | Gap: {violation.gap}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getStateConfig(state: string) {
  switch (state) {
    case 'COMPLIANT':
      return {
        icon: <CheckCircle className="h-5 w-5 text-green-600" />,
        variant: 'success' as const
      };
    case 'NON_COMPLIANT':
      return {
        icon: <XCircle className="h-5 w-5 text-red-600" />,
        variant: 'destructive' as const
      };
    case 'INDETERMINATE':
      return {
        icon: <AlertTriangle className="h-5 w-5 text-yellow-600" />,
        variant: 'warning' as const
      };
    default:
      return {
        icon: <AlertCircle className="h-5 w-5 text-muted-foreground" />,
        variant: 'secondary' as const
      };
  }
}

function getSeverityConfig(severity: string) {
  switch (severity) {
    case 'CRITICAL':
      return {
        icon: <XCircle className="h-4 w-4 text-red-600" />,
        variant: 'destructive' as const,
        bgClass: 'bg-red-50 border-red-200'
      };
    case 'HIGH':
      return {
        icon: <AlertCircle className="h-4 w-4 text-orange-600" />,
        variant: 'destructive' as const,
        bgClass: 'bg-orange-50 border-orange-200'
      };
    case 'MEDIUM':
      return {
        icon: <AlertTriangle className="h-4 w-4 text-yellow-600" />,
        variant: 'warning' as const,
        bgClass: 'bg-yellow-50 border-yellow-200'
      };
    default:
      return {
        icon: <AlertCircle className="h-4 w-4 text-blue-600" />,
        variant: 'secondary' as const,
        bgClass: 'bg-blue-50 border-blue-200'
      };
  }
}

function formatViolationCode(code: string): string {
  return code
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

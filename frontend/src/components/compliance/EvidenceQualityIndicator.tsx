/**
 * Evidence Quality Indicator
 * 
 * Displays evidence verification status, freshness, confidence, and source.
 * Shows clear distinction between verified, failed, and unknown evidence.
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Signal,
  Database
} from 'lucide-react';
import type { RecordingEvidence } from '@/types/compliance';

interface EvidenceQualityIndicatorProps {
  evidence: RecordingEvidence;
  compact?: boolean;
}

export function EvidenceQualityIndicator({
  evidence,
  compact = false
}: EvidenceQualityIndicatorProps) {
  const verification = evidence.verification;
  const ageMinutes = verification.verifiedAt
    ? Math.floor((Date.now() - new Date(verification.verifiedAt).getTime()) / 60000)
    : null;
  
  const freshnessState = getFreshnessState(ageMinutes);
  const confidenceLevel = getConfidenceLevel(verification.confidence);
  
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <VerificationBadge status={verification.status} />
        <FreshnessBadge state={freshnessState} ageMinutes={ageMinutes} />
        <ConfidenceBadge level={confidenceLevel} value={verification.confidence} />
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {/* Verification Status */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {verification.status === 'VERIFIED' ? (
            <CheckCircle className="h-5 w-5 text-green-600" />
          ) : verification.status === 'FAILED' ? (
            <XCircle className="h-5 w-5 text-red-600" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
          )}
        </div>
        <div className="flex-1">
          <div className="font-medium">Verification Status</div>
          <div className="text-sm text-muted-foreground">
            {getVerificationStatusText(verification.status)}
          </div>
          {evidence.reason && (
            <div className="text-sm text-red-600 mt-1">
              Reason: {formatReason(evidence.reason)}
            </div>
          )}
        </div>
        <Badge
          variant={
            verification.status === 'VERIFIED' ? 'success' :
            verification.status === 'FAILED' ? 'destructive' :
            'warning'
          }
        >
          {verification.status}
        </Badge>
      </div>
      
      {/* Freshness */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          <Clock className={`h-5 w-5 ${
            freshnessState === 'FRESH' ? 'text-green-600' :
            freshnessState === 'AGING' ? 'text-yellow-600' :
            'text-red-600'
          }`} />
        </div>
        <div className="flex-1">
          <div className="font-medium">Evidence Freshness</div>
          <div className="text-sm text-muted-foreground">
            {verification.verifiedAt ? (
              <>
                Verified {ageMinutes} minutes ago
                <div className="text-xs mt-1">
                  {new Date(verification.verifiedAt).toLocaleString()}
                </div>
              </>
            ) : (
              'Never verified'
            )}
          </div>
        </div>
        <Badge
          variant={
            freshnessState === 'FRESH' ? 'success' :
            freshnessState === 'AGING' ? 'warning' :
            'destructive'
          }
        >
          {freshnessState}
        </Badge>
      </div>
      
      {/* Confidence */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          <Signal className={`h-5 w-5 ${
            confidenceLevel === 'HIGH' ? 'text-green-600' :
            confidenceLevel === 'MEDIUM' ? 'text-yellow-600' :
            'text-red-600'
          }`} />
        </div>
        <div className="flex-1">
          <div className="font-medium">Evidence Confidence</div>
          <div className="text-sm text-muted-foreground">
            {(verification.confidence * 100).toFixed(0)}% confidence
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Based on {formatMethod(verification.method)} verification
          </div>
        </div>
        <Badge
          variant={
            confidenceLevel === 'HIGH' ? 'success' :
            confidenceLevel === 'MEDIUM' ? 'warning' :
            'destructive'
          }
        >
          {confidenceLevel}
        </Badge>
      </div>
      
      {/* Source */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          <Database className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <div className="font-medium">Evidence Source</div>
          <div className="text-sm text-muted-foreground">
            {verification.source}
          </div>
          {verification.latencyMs && (
            <div className="text-xs text-muted-foreground mt-1">
              Query latency: {verification.latencyMs}ms
            </div>
          )}
        </div>
      </div>
      
      {/* Detailed Checks */}
      <DetailedChecks evidence={evidence} />
    </div>
  );
}

function VerificationBadge({ status }: { status: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Badge
            variant={
              status === 'VERIFIED' ? 'success' :
              status === 'FAILED' ? 'destructive' :
              'warning'
            }
            className="text-xs"
          >
            {status === 'VERIFIED' ? (
              <CheckCircle className="h-3 w-3 mr-1" />
            ) : status === 'FAILED' ? (
              <XCircle className="h-3 w-3 mr-1" />
            ) : (
              <AlertTriangle className="h-3 w-3 mr-1" />
            )}
            {status}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>{getVerificationStatusText(status)}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function FreshnessBadge({ 
  state, 
  ageMinutes 
}: { 
  state: string; 
  ageMinutes: number | null;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Badge
            variant={
              state === 'FRESH' ? 'success' :
              state === 'AGING' ? 'warning' :
              'destructive'
            }
            className="text-xs"
          >
            <Clock className="h-3 w-3 mr-1" />
            {ageMinutes !== null ? `${ageMinutes}m ago` : 'Unknown'}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>Evidence freshness: {state}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ConfidenceBadge({ 
  level, 
  value 
}: { 
  level: string; 
  value: number;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Badge
            variant={
              level === 'HIGH' ? 'success' :
              level === 'MEDIUM' ? 'warning' :
              'destructive'
            }
            className="text-xs"
          >
            <Signal className="h-3 w-3 mr-1" />
            {(value * 100).toFixed(0)}%
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>Confidence level: {level}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function DetailedChecks({ evidence }: { evidence: RecordingEvidence }) {
  const checks = evidence.checks;
  
  return (
    <div className="border-t pt-4 mt-4">
      <div className="font-medium mb-3">Detailed Verification Checks</div>
      <div className="space-y-2">
        <CheckRow
          label="Connectivity"
          status={checks.connectivity.status}
          message={checks.connectivity.message}
          detail={checks.connectivity.latencyMs ? `${checks.connectivity.latencyMs}ms` : undefined}
        />
        <CheckRow
          label="Authentication"
          status={checks.authentication.status}
          message={checks.authentication.message}
          detail={checks.authentication.method}
        />
        <CheckRow
          label="Channel Configuration"
          status={checks.channelConfiguration.status}
          message={checks.channelConfiguration.message}
          detail={checks.channelConfiguration.channelEnabled ? 'Enabled' : 'Disabled'}
        />
        <CheckRow
          label="Recording State"
          status={checks.recordingState.status}
          message={checks.recordingState.message}
          detail={checks.recordingState.isRecording ? 'Recording' : 'Not Recording'}
        />
        <CheckRow
          label="Archive Availability"
          status={checks.archiveAvailability.status}
          message={checks.archiveAvailability.message}
          detail={checks.archiveAvailability.accessible ? 'Accessible' : 'Unavailable'}
        />
        <CheckRow
          label="Storage Health"
          status={checks.storageHealth.status}
          message={checks.storageHealth.message}
          detail={checks.storageHealth.operational ? 'Operational' : 'Degraded'}
        />
      </div>
    </div>
  );
}

function CheckRow({ 
  label, 
  status, 
  message, 
  detail 
}: { 
  label: string; 
  status: string; 
  message?: string;
  detail?: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm py-1.5 border-b border-border/50">
      <div className="flex items-center gap-2">
        {status === 'VERIFIED' ? (
          <CheckCircle className="h-4 w-4 text-green-600" />
        ) : status === 'FAILED' ? (
          <XCircle className="h-4 w-4 text-red-600" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
        )}
        <span className="font-medium">{label}</span>
      </div>
      <div className="text-right">
        {detail && (
          <div className="text-muted-foreground text-xs">{detail}</div>
        )}
        {message && (
          <div className="text-muted-foreground text-xs">{message}</div>
        )}
      </div>
    </div>
  );
}

function getFreshnessState(ageMinutes: number | null): string {
  if (ageMinutes === null) return 'UNKNOWN';
  if (ageMinutes <= 5) return 'FRESH';
  if (ageMinutes <= 15) return 'AGING';
  return 'STALE';
}

function getConfidenceLevel(confidence: number): string {
  if (confidence >= 0.9) return 'HIGH';
  if (confidence >= 0.7) return 'MEDIUM';
  return 'LOW';
}

function getVerificationStatusText(status: string): string {
  switch (status) {
    case 'VERIFIED':
      return 'Evidence successfully verified from recorder';
    case 'FAILED':
      return 'Evidence verification failed';
    case 'UNKNOWN':
      return 'Evidence could not be verified';
    default:
      return status;
  }
}

function formatReason(reason: string): string {
  return reason
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

function formatMethod(method: string): string {
  return method
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

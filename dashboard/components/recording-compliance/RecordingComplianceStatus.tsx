/**
 * Recording Compliance Status Component
 * 
 * Displays evidence-based recording compliance with three-state health model:
 * - Healthy: Green, positive evidence confirms proper operation
 * - Unhealthy: Red, evidence confirms failure
 * - Unknown: Yellow/Gray, cannot verify (NEVER treated as healthy)
 */

'use client';

import React from 'react';
import { 
  CheckCircle, 
  XCircle, 
  HelpCircle, 
  AlertTriangle,
  Wifi,
  Lock,
  Video,
  Film,
  HardDrive,
  Clock,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

type ComplianceState = 'healthy' | 'unhealthy' | 'unknown';

interface CheckResult {
  status: ComplianceState;
  message?: string;
  checkedAt: Date;
  errorCode?: string;
}

interface ArchiveCheckResult extends CheckResult {
  lastRecordingTime?: Date;
  archiveLagSeconds?: number;
  retentionDays?: number;
  retentionCompliant?: boolean;
  requiredRetentionDays?: number;
}

interface StorageCheckResult extends CheckResult {
  usagePercent?: number;
  totalBytes?: number;
  freeBytes?: number;
}

interface ClockCheckResult extends CheckResult {
  driftSeconds?: number;
}

export interface RecordingComplianceResult {
  overallStatus: ComplianceState;
  recorderId: string;
  channelId?: string;
  checkedAt: Date;
  
  reachable: CheckResult & { latencyMs?: number };
  authentication: CheckResult;
  channel: CheckResult;
  stream: CheckResult;
  recording: CheckResult;
  archive: ArchiveCheckResult;
  storage: StorageCheckResult;
  clock: ClockCheckResult;
  
  errors: Array<{
    code: string;
    message: string;
    checkType?: string;
    timestamp: Date;
  }>;
  
  adapterType?: string;
  lastVerifiedHealthyAt?: Date;
}

interface RecordingComplianceStatusProps {
  result: RecordingComplianceResult;
  cameraName?: string;
  showDetails?: boolean;
}

/**
 * Get status icon and color
 */
function getStatusDisplay(status: ComplianceState) {
  switch (status) {
    case 'healthy':
      return {
        icon: CheckCircle,
        color: 'text-green-600',
        bg: 'bg-green-50',
        border: 'border-green-200',
        label: 'Healthy'
      };
    case 'unhealthy':
      return {
        icon: XCircle,
        color: 'text-red-600',
        bg: 'bg-red-50',
        border: 'border-red-200',
        label: 'Failed'
      };
    case 'unknown':
      return {
        icon: HelpCircle,
        color: 'text-amber-600',
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        label: 'Cannot Verify'
      };
  }
}

/**
 * Format bytes to human-readable
 */
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Main component
 */
export function RecordingComplianceStatus({
  result,
  cameraName,
  showDetails = false
}: RecordingComplianceStatusProps) {
  const [expanded, setExpanded] = React.useState(showDetails);
  
  const overallDisplay = getStatusDisplay(result.overallStatus);
  const OverallIcon = overallDisplay.icon;
  
  // Calculate staleness warning
  const checkAgeMinutes = Math.floor(
    (Date.now() - new Date(result.checkedAt).getTime()) / 1000 / 60
  );
  const isStale = checkAgeMinutes > 15;
  
  return (
    <div className={`rounded-lg border-2 ${overallDisplay.border} ${overallDisplay.bg} p-4`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1">
          <OverallIcon className={`w-6 h-6 ${overallDisplay.color} flex-shrink-0 mt-0.5`} />
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-900">
                {cameraName || 'Recording Compliance'}
              </h3>
              <span className={`text-sm font-medium ${overallDisplay.color}`}>
                {overallDisplay.label}
              </span>
            </div>
            
            {/* Check timestamp */}
            <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
              <Clock className="w-3 h-3" />
              <span>
                Checked {formatDistanceToNow(new Date(result.checkedAt), { addSuffix: true })}
              </span>
              {isStale && (
                <span className="flex items-center gap-1 text-amber-600">
                  <AlertTriangle className="w-3 h-3" />
                  <span className="text-xs">Data may be stale</span>
                </span>
              )}
            </div>
            
            {/* Last verified healthy */}
            {result.lastVerifiedHealthyAt && result.overallStatus !== 'healthy' && (
              <div className="mt-1 text-sm text-gray-600">
                Last healthy: {formatDistanceToNow(new Date(result.lastVerifiedHealthyAt), { addSuffix: true })}
              </div>
            )}
            
            {/* Quick status summary */}
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
              {result.recording.status === 'healthy' && (
                <span className="flex items-center gap-1">
                  <Video className="w-3 h-3 text-green-600" />
                  Recording
                </span>
              )}
              {result.archive.lastRecordingTime && (
                <span>
                  Last recorded: {formatDistanceToNow(new Date(result.archive.lastRecordingTime), { addSuffix: true })}
                </span>
              )}
              {result.storage.usagePercent !== undefined && (
                <span className={result.storage.usagePercent > 90 ? 'text-amber-600' : ''}>
                  Storage: {result.storage.usagePercent.toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        </div>
        
        {/* Expand/collapse button */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 hover:bg-white/50 rounded transition-colors"
          aria-label={expanded ? 'Hide details' : 'Show details'}
        >
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          )}
        </button>
      </div>
      
      {/* Detailed checks */}
      {expanded && (
        <div className="mt-4 space-y-3 border-t pt-4">
          <CheckDetail
            icon={Wifi}
            label="Network Connectivity"
            result={result.reachable}
            details={
              result.reachable.latencyMs
                ? `Latency: ${result.reachable.latencyMs}ms`
                : undefined
            }
          />
          
          <CheckDetail
            icon={Lock}
            label="Authentication"
            result={result.authentication}
          />
          
          <CheckDetail
            icon={Video}
            label="Channel"
            result={result.channel}
          />
          
          <CheckDetail
            icon={Video}
            label="Live Stream"
            result={result.stream}
          />
          
          <CheckDetail
            icon={Film}
            label="Recording Status"
            result={result.recording}
          />
          
          <CheckDetail
            icon={Film}
            label="Archive Evidence"
            result={result.archive}
            details={
              result.archive.lastRecordingTime
                ? `Last recording: ${new Date(result.archive.lastRecordingTime).toLocaleString()}\n` +
                  `Archive lag: ${result.archive.archiveLagSeconds}s\n` +
                  (result.archive.retentionDays !== undefined
                    ? `Retention: ${result.archive.retentionDays} days ` +
                      (result.archive.retentionCompliant ? '✓' : `(need ${result.archive.requiredRetentionDays})`)
                    : '')
                : undefined
            }
            critical={result.archive.status === 'unhealthy'}
          />
          
          <CheckDetail
            icon={HardDrive}
            label="Storage"
            result={result.storage}
            details={
              result.storage.usagePercent !== undefined
                ? `Usage: ${result.storage.usagePercent.toFixed(1)}%\n` +
                  (result.storage.freeBytes !== undefined
                    ? `Free: ${formatBytes(result.storage.freeBytes)}`
                    : '')
                : undefined
            }
          />
          
          <CheckDetail
            icon={Clock}
            label="Clock Sync"
            result={result.clock}
            details={
              result.clock.driftSeconds !== undefined
                ? `Drift: ${Math.abs(result.clock.driftSeconds)}s ${result.clock.driftSeconds > 0 ? 'ahead' : 'behind'}`
                : undefined
            }
          />
          
          {/* Errors section */}
          {result.errors.length > 0 && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <h4 className="text-sm font-semibold text-red-900 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Errors ({result.errors.length})
              </h4>
              <div className="space-y-1">
                {result.errors.slice(0, 5).map((error, idx) => (
                  <div key={idx} className="text-xs text-red-800">
                    <span className="font-mono text-red-600">{error.code}</span>
                    {': '}
                    {error.message}
                    {error.checkType && (
                      <span className="text-red-600 ml-2">({error.checkType})</span>
                    )}
                  </div>
                ))}
                {result.errors.length > 5 && (
                  <div className="text-xs text-red-600 italic">
                    ...and {result.errors.length - 5} more errors
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Adapter info */}
          <div className="mt-4 pt-3 border-t text-xs text-gray-500">
            Adapter: {result.adapterType || 'unknown'}
            {result.channelId && ` • Channel: ${result.channelId}`}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Individual check detail row
 */
function CheckDetail({
  icon: Icon,
  label,
  result,
  details,
  critical = false
}: {
  icon: React.ElementType;
  label: string;
  result: CheckResult;
  details?: string;
  critical?: boolean;
}) {
  const display = getStatusDisplay(result.status);
  const StatusIcon = display.icon;
  
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">{label}</span>
          <StatusIcon className={`w-4 h-4 ${display.color}`} />
          {critical && result.status === 'unhealthy' && (
            <AlertTriangle className="w-4 h-4 text-red-600" />
          )}
        </div>
        
        {result.message && (
          <div className={`text-xs mt-0.5 ${
            result.status === 'unhealthy' ? 'text-red-600' :
            result.status === 'unknown' ? 'text-amber-600' :
            'text-gray-600'
          }`}>
            {result.message}
          </div>
        )}
        
        {details && (
          <div className="text-xs text-gray-500 mt-0.5 whitespace-pre-line">
            {details}
          </div>
        )}
        
        {result.errorCode && (
          <div className="text-xs font-mono text-gray-400 mt-0.5">
            {result.errorCode}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Compact status badge for lists
 */
export function RecordingComplianceBadge({
  status,
  size = 'md'
}: {
  status: ComplianceState;
  size?: 'sm' | 'md' | 'lg';
}) {
  const display = getStatusDisplay(status);
  const Icon = display.icon;
  
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5'
  };
  
  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };
  
  return (
    <span className={`
      inline-flex items-center gap-1.5 font-medium rounded-full
      ${display.bg} ${display.color} ${sizeClasses[size]}
    `}>
      <Icon className={iconSizes[size]} />
      <span>{display.label}</span>
    </span>
  );
}

/**
 * Status indicator dot for minimal displays
 */
export function RecordingComplianceDot({
  status
}: {
  status: ComplianceState;
}) {
  const colors = {
    healthy: 'bg-green-500',
    unhealthy: 'bg-red-500',
    unknown: 'bg-amber-500'
  };
  
  return (
    <span 
      className={`inline-block w-2 h-2 rounded-full ${colors[status]}`}
      title={status}
    />
  );
}

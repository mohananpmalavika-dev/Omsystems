/**
 * Provisioning Status Component
 * Real-time display of evidence-driven provisioning progress
 */

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  Network,
  Camera,
  HardDrive,
  Video,
  Activity,
  PlayCircle,
} from 'lucide-react';

interface ProvisioningStatusProps {
  jobId: string;
  onComplete?: () => void;
  onError?: (error: any) => void;
}

interface JobStatus {
  id: string;
  branchId: string;
  status: string;
  currentStep?: string;
  progressPercent: number;
  steps: StepStatus[];
  errorMessage?: string;
}

interface StepStatus {
  name: string;
  displayName: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  progressPercent: number;
  error?: any;
}

interface ContextData {
  network?: {
    gatewayReachable: boolean;
    dnsWorking: boolean;
    ntpWorking: boolean;
    managementAddress?: string;
  };
  cameras?: {
    totalDiscovered: number;
    totalImported: number;
    successRate: number;
  };
  storage?: {
    totalBytes: number;
    availableBytes: number;
    retentionDays: number;
    retentionAchievable: boolean;
  };
  recording?: {
    totalTested: number;
    totalPassed: number;
    successRate: number;
  };
  health?: {
    healthy: boolean;
    score: number;
    blockingIssues: any[];
    warnings: any[];
  };
}

export const ProvisioningStatus: React.FC<ProvisioningStatusProps> = ({
  jobId,
  onComplete,
  onError,
}) => {
  const [job, setJob] = useState<JobStatus | null>(null);
  const [context, setContext] = useState<ContextData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const fetchStatus = async () => {
      try {
        const response = await fetch(`/api/provisioning/jobs/${jobId}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch provisioning status');
        }

        const data = await response.json();
        setJob(data.job);
        setContext(data.context);
        setLoading(false);

        // Check if job completed or failed
        if (['active', 'failed', 'blocked'].includes(data.job.status)) {
          clearInterval(intervalId);
          
          if (data.job.status === 'active' && onComplete) {
            onComplete();
          } else if (data.job.status === 'failed' && onError) {
            onError({ message: data.job.errorMessage });
          }
        }
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
        if (onError) onError(err);
        clearInterval(intervalId);
      }
    };

    // Initial fetch
    fetchStatus();

    // Poll every 2 seconds
    intervalId = setInterval(fetchStatus, 2000);

    return () => clearInterval(intervalId);
  }, [jobId, onComplete, onError]);

  if (loading && !job) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <span className="ml-3 text-lg">Loading provisioning status...</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <XCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!job) return null;

  return (
    <div className="space-y-6">
      {/* Overall Progress */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Provisioning Progress</CardTitle>
            <StatusBadge status={job.status} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="font-medium">{job.currentStep || 'Initializing'}</span>
                <span className="text-muted-foreground">{job.progressPercent}%</span>
              </div>
              <Progress value={job.progressPercent} className="h-3" />
            </div>

            {job.errorMessage && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{job.errorMessage}</AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Steps Detail */}
      <Card>
        <CardHeader>
          <CardTitle>Provisioning Steps</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {job.steps.map((step, index) => (
              <StepItem key={step.name} step={step} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Component Evidence */}
      {context && (
        <>
          {/* Network Evidence */}
          {context.network && (
            <ComponentCard
              title="Network Configuration"
              icon={<Network className="h-5 w-5" />}
              status={context.network.gatewayReachable && context.network.dnsWorking ? 'success' : 'warning'}
            >
              <div className="space-y-2 text-sm">
                <EvidenceItem
                  label="Gateway"
                  value={context.network.gatewayReachable ? 'Reachable' : 'Unreachable'}
                  success={context.network.gatewayReachable}
                />
                <EvidenceItem
                  label="DNS"
                  value={context.network.dnsWorking ? 'Working' : 'Not Working'}
                  success={context.network.dnsWorking}
                />
                <EvidenceItem
                  label="NTP"
                  value={context.network.ntpWorking ? 'Synchronized' : 'Not Synchronized'}
                  success={context.network.ntpWorking}
                />
                {context.network.managementAddress && (
                  <EvidenceItem
                    label="Management IP"
                    value={context.network.managementAddress}
                    success={true}
                  />
                )}
              </div>
            </ComponentCard>
          )}

          {/* Camera Evidence */}
          {context.cameras && (
            <ComponentCard
              title="Camera Discovery"
              icon={<Camera className="h-5 w-5" />}
              status={context.cameras.successRate >= 80 ? 'success' : 'warning'}
            >
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Discovered</div>
                  <div className="text-2xl font-bold">{context.cameras.totalDiscovered}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Imported</div>
                  <div className="text-2xl font-bold text-green-600">
                    {context.cameras.totalImported}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Success Rate</div>
                  <div className="text-2xl font-bold">
                    {context.cameras.successRate.toFixed(1)}%
                  </div>
                </div>
              </div>
            </ComponentCard>
          )}

          {/* Storage Evidence */}
          {context.storage && (
            <ComponentCard
              title="Storage Configuration"
              icon={<HardDrive className="h-5 w-5" />}
              status={context.storage.retentionAchievable ? 'success' : 'error'}
            >
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Total Capacity</div>
                    <div className="font-semibold">
                      {formatBytes(context.storage.totalBytes)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Available</div>
                    <div className="font-semibold">
                      {formatBytes(context.storage.availableBytes)}
                    </div>
                  </div>
                </div>
                <EvidenceItem
                  label="Retention Period"
                  value={`${context.storage.retentionDays} days`}
                  success={context.storage.retentionAchievable}
                />
                {!context.storage.retentionAchievable && (
                  <Alert variant="destructive" className="mt-2">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Insufficient storage for {context.storage.retentionDays}-day retention
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </ComponentCard>
          )}

          {/* Recording Evidence */}
          {context.recording && (
            <ComponentCard
              title="Recording Verification"
              icon={<Video className="h-5 w-5" />}
              status={context.recording.successRate >= 90 ? 'success' : 'warning'}
            >
              <div className="space-y-2 text-sm">
                <EvidenceItem
                  label="Cameras Tested"
                  value={`${context.recording.totalPassed} / ${context.recording.totalTested}`}
                  success={context.recording.totalPassed === context.recording.totalTested}
                />
                <EvidenceItem
                  label="Success Rate"
                  value={`${context.recording.successRate.toFixed(1)}%`}
                  success={context.recording.successRate >= 90}
                />
                <div className="mt-2">
                  <Progress 
                    value={context.recording.successRate} 
                    className="h-2"
                  />
                </div>
              </div>
            </ComponentCard>
          )}

          {/* Health Evidence */}
          {context.health && (
            <ComponentCard
              title="Branch Health"
              icon={<Activity className="h-5 w-5" />}
              status={context.health.healthy ? 'success' : 'error'}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Overall Score</span>
                  <div className="flex items-center gap-2">
                    <span className="text-3xl font-bold">{context.health.score}</span>
                    <span className="text-muted-foreground">/100</span>
                  </div>
                </div>

                {context.health.blockingIssues.length > 0 && (
                  <Alert variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>
                      <div className="font-semibold mb-1">Blocking Issues:</div>
                      <ul className="list-disc list-inside space-y-1">
                        {context.health.blockingIssues.slice(0, 3).map((issue, i) => (
                          <li key={i} className="text-sm">{issue.message}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {context.health.warnings.length > 0 && context.health.blockingIssues.length === 0 && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <div className="font-semibold mb-1">Warnings:</div>
                      <ul className="list-disc list-inside space-y-1">
                        {context.health.warnings.slice(0, 3).map((warning, i) => (
                          <li key={i} className="text-sm">{warning.message}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </ComponentCard>
          )}
        </>
      )}
    </div>
  );
};

// Helper Components

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const variants: Record<string, { variant: any; label: string; icon: React.ReactNode }> = {
    queued: { variant: 'secondary', label: 'Queued', icon: <Clock className="h-3 w-3" /> },
    active: { variant: 'default', label: 'Active', icon: <CheckCircle className="h-3 w-3" /> },
    failed: { variant: 'destructive', label: 'Failed', icon: <XCircle className="h-3 w-3" /> },
    blocked: { variant: 'destructive', label: 'Blocked', icon: <AlertTriangle className="h-3 w-3" /> },
  };

  const config = variants[status] || { 
    variant: 'secondary', 
    label: status, 
    icon: <Loader2 className="h-3 w-3 animate-spin" /> 
  };

  return (
    <Badge variant={config.variant} className="flex items-center gap-1">
      {config.icon}
      {config.label}
    </Badge>
  );
};

const StepItem: React.FC<{ step: StepStatus }> = ({ step }) => {
  const getIcon = () => {
    switch (step.status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'running':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border">
      {getIcon()}
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <span className="font-medium">{step.displayName}</span>
          {step.durationMs && (
            <span className="text-sm text-muted-foreground">
              {(step.durationMs / 1000).toFixed(1)}s
            </span>
          )}
        </div>
        {step.error && (
          <div className="text-sm text-red-500 mt-1">{step.error.message}</div>
        )}
      </div>
      {step.status === 'running' && (
        <Progress value={step.progressPercent} className="w-24 h-2" />
      )}
    </div>
  );
};

const ComponentCard: React.FC<{
  title: string;
  icon: React.ReactNode;
  status: 'success' | 'warning' | 'error';
  children: React.ReactNode;
}> = ({ title, icon, status, children }) => {
  const statusColors = {
    success: 'border-green-200 bg-green-50',
    warning: 'border-yellow-200 bg-yellow-50',
    error: 'border-red-200 bg-red-50',
  };

  return (
    <Card className={statusColors[status]}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
};

const EvidenceItem: React.FC<{
  label: string;
  value: string;
  success: boolean;
}> = ({ label, value, success }) => (
  <div className="flex items-center justify-between py-1">
    <span className="text-muted-foreground">{label}:</span>
    <div className="flex items-center gap-2">
      <span className="font-medium">{value}</span>
      {success ? (
        <CheckCircle className="h-4 w-4 text-green-500" />
      ) : (
        <XCircle className="h-4 w-4 text-red-500" />
      )}
    </div>
  </div>
);

const formatBytes = (bytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(2)} ${units[unitIndex]}`;
};

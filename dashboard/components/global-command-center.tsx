"use client";

/**
 * Global Command Center Dashboard
 * Top-level federation monitoring dashboard showing all regions
 */

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Globe,
  MapPin,
  Server,
  TrendingUp,
  Users,
  Video,
  XCircle,
  Database,
  Wifi,
  WifiOff
} from 'lucide-react';

interface FederatedServer {
  id: string;
  externalId: string;
  name: string;
  role: string;
  region: string;
  countryCode: string;
  status: 'online' | 'degraded' | 'offline' | 'maintenance';
  healthScore: number;
  totalCameras: number;
  onlineCameras: number;
  totalBranches: number;
  lastHeartbeat: string;
}

interface DashboardSummary {
  totalServers: number;
  onlineServers: number;
  offlineServers: number;
  degradedServers: number;
  totalRegions: number;
  totalCameras: number;
  onlineCameras: number;
  totalBranches: number;
  totalStorageGb: number;
  usedStorageGb: number;
  avgHealthScore: number;
  lastHeartbeat: string;
}

interface AlertCorrelation {
  id: string;
  correlationType: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  alertCount: number;
  regions: string[];
  startedAt: string;
  trackedEntityType?: string;
  trackedEntityId?: string;
}

export function GlobalCommandCenter() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [servers, setServers] = useState<FederatedServer[]>([]);
  const [correlations, setCorrelations] = useState<AlertCorrelation[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [selectedRegion]);

  const loadDashboardData = async () => {
    try {
      // Load summary
      const summaryRes = await fetch('/api/federation/dashboard');
      const summaryData = await summaryRes.json();
      setSummary(summaryData);

      // Load servers
      const serversRes = await fetch(`/api/federation/servers${selectedRegion ? `?region=${selectedRegion}` : ''}`);
      const serversData = await serversRes.json();
      setServers(serversData.data || []);

      // Load correlations
      const correlationsRes = await fetch('/api/federation/correlations?limit=10');
      const correlationsData = await correlationsRes.json();
      setCorrelations(correlationsData.data || []);

      setLoading(false);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'text-green-600 bg-green-50';
      case 'degraded': return 'text-yellow-600 bg-yellow-50';
      case 'offline': return 'text-red-600 bg-red-50';
      case 'maintenance': return 'text-blue-600 bg-blue-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'secondary';
    }
  };

  const getHealthScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    if (score >= 50) return 'text-orange-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const storageUsagePercent = summary ? (summary.usedStorageGb / summary.totalStorageGb) * 100 : 0;
  const cameraOnlinePercent = summary ? (summary.onlineCameras / summary.totalCameras) * 100 : 0;
  const serverOnlinePercent = summary ? (summary.onlineServers / summary.totalServers) * 100 : 0;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Globe className="h-8 w-8 text-primary" />
            Global Command Center
          </h1>
          <p className="text-muted-foreground mt-1">
            Unified monitoring across all regional control centers
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadDashboardData}>
            <Activity className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Servers */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Servers</p>
              <h3 className="text-2xl font-bold mt-1">{summary?.totalServers || 0}</h3>
              <div className="flex gap-2 mt-2">
                <Badge variant="secondary" className="text-green-600 bg-green-50">
                  {summary?.onlineServers || 0} Online
                </Badge>
                {(summary?.offlineServers || 0) > 0 && (
                  <Badge variant="secondary" className="text-red-600 bg-red-50">
                    {summary.offlineServers} Offline
                  </Badge>
                )}
              </div>
            </div>
            <Server className="h-12 w-12 text-muted-foreground opacity-20" />
          </div>
          <div className="mt-4">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-green-600 transition-all"
                style={{ width: `${serverOnlinePercent}%` }}
              />
            </div>
          </div>
        </Card>

        {/* Total Cameras */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Cameras</p>
              <h3 className="text-2xl font-bold mt-1">{summary?.totalCameras || 0}</h3>
              <p className="text-sm text-muted-foreground mt-2">
                {summary?.onlineCameras || 0} online ({cameraOnlinePercent.toFixed(1)}%)
              </p>
            </div>
            <Video className="h-12 w-12 text-muted-foreground opacity-20" />
          </div>
          <div className="mt-4">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-600 transition-all"
                style={{ width: `${cameraOnlinePercent}%` }}
              />
            </div>
          </div>
        </Card>

        {/* Regional Coverage */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Regional Coverage</p>
              <h3 className="text-2xl font-bold mt-1">{summary?.totalRegions || 0}</h3>
              <p className="text-sm text-muted-foreground mt-2">
                {summary?.totalBranches || 0} branches
              </p>
            </div>
            <MapPin className="h-12 w-12 text-muted-foreground opacity-20" />
          </div>
        </Card>

        {/* Storage Status */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Storage Capacity</p>
              <h3 className="text-2xl font-bold mt-1">
                {((summary?.usedStorageGb || 0) / 1024).toFixed(1)} TB
              </h3>
              <p className="text-sm text-muted-foreground mt-2">
                of {((summary?.totalStorageGb || 0) / 1024).toFixed(1)} TB ({storageUsagePercent.toFixed(1)}%)
              </p>
            </div>
            <Database className="h-12 w-12 text-muted-foreground opacity-20" />
          </div>
          <div className="mt-4">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all ${
                  storageUsagePercent > 90 ? 'bg-red-600' :
                  storageUsagePercent > 75 ? 'bg-yellow-600' : 'bg-green-600'
                }`}
                style={{ width: `${Math.min(storageUsagePercent, 100)}%` }}
              />
            </div>
          </div>
        </Card>
      </div>

      {/* Active Correlations */}
      {correlations.length > 0 && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              Active Alert Correlations
            </h2>
            <Badge variant="secondary">{correlations.length} Active</Badge>
          </div>
          <div className="space-y-3">
            {correlations.map((correlation) => (
              <div 
                key={correlation.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <Badge variant={getSeverityColor(correlation.severity) as any}>
                      {correlation.severity.toUpperCase()}
                    </Badge>
                    <span className="font-medium">
                      {correlation.correlationType.charAt(0).toUpperCase() + correlation.correlationType.slice(1)} Correlation
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                    <span>{correlation.alertCount} alerts</span>
                    <span>•</span>
                    <span>{correlation.regions.join(', ')}</span>
                    {correlation.trackedEntityId && (
                      <>
                        <span>•</span>
                        <span>{correlation.trackedEntityType}: {correlation.trackedEntityId}</span>
                      </>
                    )}
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  Investigate
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Regional Servers */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Regional Control Centers</h2>
          <div className="flex gap-2">
            <Button 
              variant={selectedRegion === null ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setSelectedRegion(null)}
            >
              All Regions
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {servers.map((server) => (
            <Card key={server.id} className="p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-lg">{server.name}</h3>
                    <Badge variant="outline" className={getStatusColor(server.status)}>
                      {server.status === 'online' && <Wifi className="h-3 w-3 mr-1" />}
                      {server.status === 'offline' && <WifiOff className="h-3 w-3 mr-1" />}
                      {server.status.toUpperCase()}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>{server.region}</span>
                    <span>•</span>
                    <span>{server.countryCode}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mt-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Health Score</p>
                      <p className={`text-lg font-semibold ${getHealthScoreColor(server.healthScore)}`}>
                        {server.healthScore.toFixed(0)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Cameras</p>
                      <p className="text-lg font-semibold">
                        {server.onlineCameras}/{server.totalCameras}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Branches</p>
                      <p className="text-lg font-semibold">{server.totalBranches}</p>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all ${
                          server.healthScore >= 90 ? 'bg-green-600' :
                          server.healthScore >= 70 ? 'bg-yellow-600' : 'bg-red-600'
                        }`}
                        style={{ width: `${server.healthScore}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center mt-4 pt-4 border-t">
                <span className="text-xs text-muted-foreground">
                  Last seen: {new Date(server.lastHeartbeat).toLocaleTimeString()}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    View Details
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Card>
    </div>
  );
}

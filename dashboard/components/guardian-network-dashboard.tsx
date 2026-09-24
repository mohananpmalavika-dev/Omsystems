'use client';

/**
 * Guardian Network Dashboard Component
 * 
 * Main dashboard for cross-location intelligence:
 * - Network statistics
 * - Pattern sharing metrics
 * - Real-time threat alerts
 * - Benchmark comparison
 * - Intelligence updates
 */

import { useEffect, useState, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  AlertTriangle,
  Shield,
  TrendingUp,
  Users,
  Database,
  Clock,
  CheckCircle,
  XCircle,
  Activity,
  Globe,
  Target,
} from 'lucide-react';

interface NetworkStatistics {
  contribution: {
    patternsShared: number;
    lastSharedAt?: string;
    verifiedPatterns: number;
    usefulnessScore: number;
  };
  benefit: {
    patternsReceived: number;
    lastReceivedAt?: string;
    localMatchCount: number;
    preventedIncidents: number;
    improvedResponseTime: number;
  };
  network: {
    totalDeployments: number;
    activeDeployments: number;
    totalPatterns: number;
    recentPatterns: number;
    totalIndustries: number;
    globalIncidentCount: number;
  };
  sync: {
    lastSyncAt: string;
    syncStatus: 'healthy' | 'degraded' | 'offline';
    pendingUploads: number;
    pendingDownloads: number;
  };
}

interface ThreatAlert {
  id: string;
  alertLevel: 'critical' | 'high' | 'medium';
  title: string;
  description: string;
  issuedAt: string;
  acknowledgmentRequired: boolean;
  acknowledged?: boolean;
}

interface BenchmarkData {
  your: {
    preventionRate: number;
    detectionRate: number;
    averageResponseTime: number;
  };
  industry: {
    preventionRate: number;
    detectionRate: number;
    averageResponseTime: number;
  };
  rankings: {
    overall: number;
    prevention: number;
    detection: number;
    responseTime: number;
  };
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export function GuardianNetworkDashboard() {
  const [stats, setStats] = useState<NetworkStatistics | null>(null);
  const [alerts, setAlerts] = useState<ThreatAlert[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      // Fetch statistics
      const statsResponse = await fetch('/api/v1/guardian-network/statistics');
      const statsData = await statsResponse.json();
      setStats(statsData);

      // Fetch recent alerts
      const alertsResponse = await fetch('/api/v1/guardian-network/alerts/recent');
      const alertsData = await alertsResponse.json();
      setAlerts(alertsData.alerts || []);

      // Fetch benchmarks
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const benchmarksResponse = await fetch('/api/v1/guardian-network/benchmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: lastMonth.toISOString(),
          endDate: now.toISOString(),
        }),
      });
      const benchmarksData = await benchmarksResponse.json();
      setBenchmarks(benchmarksData);

      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch Guardian Network data:', error);
      setLoading(false);
    }
  };

  const acknowledgeThreatAlert = useCallback(async (alertId: string) => {
    try {
      await fetch(`/api/v1/guardian-network/alerts/${alertId}/acknowledge`, {
        method: 'POST',
      });
      // Refresh alerts
      fetchData();
    } catch (error) {
      console.error('Failed to acknowledge alert:', error);
    }
  }, []);

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Activity className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-500" />
          <p className="text-muted-foreground">Loading Guardian Network...</p>
        </div>
      </div>
    );
  }

  const getBenchmarkComparison = () => {
    if (!benchmarks) return [];
    
    return [
      {
        metric: 'Prevention Rate',
        your: benchmarks.your.preventionRate * 100,
        industry: benchmarks.industry.preventionRate * 100,
      },
      {
        metric: 'Detection Rate',
        your: benchmarks.your.detectionRate * 100,
        industry: benchmarks.industry.detectionRate * 100,
      },
      {
        metric: 'Response Time (s)',
        your: benchmarks.your.averageResponseTime,
        industry: benchmarks.industry.averageResponseTime,
      },
    ];
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold flex items-center gap-3">
            <Globe className="h-10 w-10 text-blue-500" />
            Guardian Network
          </h1>
          <p className="text-muted-foreground mt-1">
            Cross-location intelligence • Learning from {stats.network.totalDeployments.toLocaleString()} deployments worldwide
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge 
            variant={stats.sync.syncStatus === 'healthy' ? 'default' : 'destructive'}
            className="px-4 py-2 text-sm"
          >
            {stats.sync.syncStatus === 'healthy' ? '🟢 Online' : '🔴 Offline'}
          </Badge>
          <span className="text-sm text-muted-foreground">
            Last sync: {new Date(stats.sync.lastSyncAt).toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Critical Alerts Banner */}
      {alerts.filter(a => a.alertLevel === 'critical' && !a.acknowledged).length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>
              {alerts.filter(a => a.alertLevel === 'critical' && !a.acknowledged).length} critical threat alert(s) require attention
            </span>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => setActiveTab('alerts')}
            >
              View Alerts
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-500" />
              Patterns Received
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {stats.benefit.patternsReceived.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.network.recentPatterns.toLocaleString()} added this month
            </p>
            <Progress 
              value={(stats.network.recentPatterns / stats.network.totalPatterns) * 100} 
              className="mt-2"
            />
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4 text-green-500" />
              Incidents Prevented
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {stats.benefit.preventedIncidents}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Using Guardian intelligence
            </p>
            <div className="flex items-center gap-1 mt-2 text-green-600">
              <TrendingUp className="h-3 w-3" />
              <span className="text-xs font-medium">+{stats.benefit.localMatchCount} matches</span>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              Time Saved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">
              {stats.benefit.improvedResponseTime}s
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Average per incident
            </p>
            <p className="text-xs text-blue-600 mt-2 font-medium">
              {Math.round((stats.benefit.improvedResponseTime / 180) * 100)}% faster response
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-orange-500" />
              Your Contribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {stats.contribution.patternsShared}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Patterns shared with network
            </p>
            <div className="flex items-center gap-2 mt-2">
              <Progress value={stats.contribution.usefulnessScore * 100} className="flex-1" />
              <span className="text-xs font-medium">
                {Math.round(stats.contribution.usefulnessScore * 100)}%
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="alerts">
            Threat Alerts
            {alerts.filter(a => !a.acknowledged).length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {alerts.filter(a => !a.acknowledged).length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="benchmarks">Benchmarks</TabsTrigger>
          <TabsTrigger value="network">Network Stats</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Network Overview */}
            <Card>
              <CardHeader>
                <CardTitle>Network Overview</CardTitle>
                <CardDescription>Global Guardian Network statistics</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Total Deployments
                  </span>
                  <span className="font-semibold">{stats.network.totalDeployments}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Active Deployments
                  </span>
                  <span className="font-semibold text-green-600">{stats.network.activeDeployments}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    Total Threat Patterns
                  </span>
                  <span className="font-semibold">{stats.network.totalPatterns.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Global Incidents (30d)
                  </span>
                  <span className="font-semibold">{stats.network.globalIncidentCount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Industry Verticals
                  </span>
                  <span className="font-semibold">{stats.network.totalIndustries}</span>
                </div>
              </CardContent>
            </Card>

            {/* Your Impact */}
            <Card>
              <CardHeader>
                <CardTitle>Your Impact</CardTitle>
                <CardDescription>How you're contributing to network security</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Pattern Usefulness</span>
                    <span className="font-semibold">
                      {Math.round(stats.contribution.usefulnessScore * 100)}%
                    </span>
                  </div>
                  <Progress value={stats.contribution.usefulnessScore * 100} />
                  <p className="text-xs text-muted-foreground mt-1">
                    Your patterns have been matched {stats.benefit.localMatchCount} times globally
                  </p>
                </div>

                <div className="pt-4 border-t">
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-blue-600">
                        {stats.contribution.verifiedPatterns}
                      </div>
                      <div className="text-xs text-muted-foreground">Verified Patterns</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-600">
                        {stats.benefit.preventedIncidents}
                      </div>
                      <div className="text-xs text-muted-foreground">Incidents Prevented</div>
                    </div>
                  </div>
                </div>

                {stats.contribution.lastSharedAt && (
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    Last contribution: {new Date(stats.contribution.lastSharedAt).toLocaleString()}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="space-y-4">
          {alerts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Active Threats</h3>
                <p className="text-muted-foreground text-center">
                  All threat alerts have been acknowledged. You're all caught up!
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <Card 
                  key={alert.id}
                  className={alert.alertLevel === 'critical' ? 'border-red-500' : ''}
                >
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge 
                            variant={
                              alert.alertLevel === 'critical' ? 'destructive' : 
                              alert.alertLevel === 'high' ? 'default' : 
                              'secondary'
                            }
                          >
                            {alert.alertLevel.toUpperCase()}
                          </Badge>
                          {alert.acknowledged && (
                            <Badge variant="outline" className="text-green-600">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Acknowledged
                            </Badge>
                          )}
                        </div>
                        <h3 className="font-semibold text-lg mb-1">{alert.title}</h3>
                        <p className="text-sm text-muted-foreground mb-3">
                          {alert.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Issued: {new Date(alert.issuedAt).toLocaleString()}
                        </p>
                      </div>
                      {alert.acknowledgmentRequired && !alert.acknowledged && (
                        <Button 
                          onClick={() => acknowledgeThreatAlert(alert.id)}
                          size="sm"
                        >
                          Acknowledge
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Benchmarks Tab */}
        <TabsContent value="benchmarks" className="space-y-4">
          {benchmarks ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Performance Comparison</CardTitle>
                  <CardDescription>Your security metrics vs. industry average</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={getBenchmarkComparison()}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="metric" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="your" fill="#0088FE" name="Your Performance" />
                      <Bar dataKey="industry" fill="#00C49F" name="Industry Average" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Overall Ranking</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">Top {benchmarks.rankings.overall}%</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Prevention Ranking</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-green-600">
                      Top {benchmarks.rankings.prevention}%
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Detection Ranking</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-blue-600">
                      Top {benchmarks.rankings.detection}%
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Response Time Ranking</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-orange-600">
                      Top {benchmarks.rankings.responseTime}%
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <XCircle className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Benchmarks Unavailable</h3>
                <p className="text-muted-foreground text-center">
                  Enable benchmark sharing in settings to compare your performance.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Network Stats Tab */}
        <TabsContent value="network" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Sync Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm">Last Synchronized</span>
                <span className="font-semibold">
                  {new Date(stats.sync.lastSyncAt).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Status</span>
                <Badge variant={stats.sync.syncStatus === 'healthy' ? 'default' : 'destructive'}>
                  {stats.sync.syncStatus}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Pending Uploads</span>
                <span className="font-semibold">{stats.sync.pendingUploads}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Pending Downloads</span>
                <span className="font-semibold">{stats.sync.pendingDownloads}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex gap-4">
        <Button onClick={() => window.location.href = '/guardian-network/intelligence'}>
          View Industry Intelligence
        </Button>
        <Button variant="outline" onClick={() => window.location.href = '/guardian-network/patterns'}>
          Browse Threat Database
        </Button>
        <Button variant="outline" onClick={() => window.location.href = '/settings/guardian-network'}>
          Configure Settings
        </Button>
      </div>
    </div>
  );
}

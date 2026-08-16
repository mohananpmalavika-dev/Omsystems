"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  TrendingDown,
  Clock,
  MapPin,
  Activity,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Camera,
  Flame,
  Shield,
  Server,
  RefreshCw,
} from "lucide-react";

interface IncidentSummary {
  tenantId: string;
  period: string;
  periodStart: string;
  periodEnd: string;
  totalAlerts: number;
  totalIncidents: number;
  reductionRatio: number;
  criticalIncidents: number;
  highPriorityIncidents: number;
  operationalIssues: number;
  securityIncidents: {
    intrusions: number;
    fireSmoke: number;
    suspiciousActivity: number;
    restrictedZone: number;
    tailgating: number;
    unattendedObjects: number;
  };
  infrastructureIncidents: {
    cameraFailures: number;
    camerasOffline: number;
    recordingInterruptions: number;
    storageIssues: number;
    networkIssues: number;
  };
  topIncidents: Array<{
    clusterId: string;
    incidentType: string;
    severity: string;
    branchId?: string;
    alertCount: number;
    occurredAt: string;
    description: string;
  }>;
  incidentsByType: Record<string, number>;
  incidentsBySeverity: Record<string, number>;
  incidentsByBranch: Record<string, number>;
  averageAlertsPerIncident: number;
  averageResponseTime?: number;
  generatedAt: string;
}

interface AlertCluster {
  id: string;
  clusterId: string;
  alertIds: string[];
  incidentType: string;
  severity: "critical" | "high" | "medium" | "low";
  branchId?: string;
  cameraIds: string[];
  firstOccurredAt: string;
  lastOccurredAt: string;
  durationSeconds: number;
  alertCount: number;
  uniqueCameras: number;
  confidence: number;
  rootCause?: string;
}

export function AIIncidentSummaryDashboard() {
  const [summary, setSummary] = useState<IncidentSummary | null>(null);
  const [clusters, setClusters] = useState<AlertCluster[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<"shift" | "daily" | "executive">("daily");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    loadSummary();
  }, [selectedPeriod, selectedDate]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(loadSummary, 60000); // Refresh every minute
      return () => clearInterval(interval);
    }
  }, [autoRefresh, selectedPeriod, selectedDate]);

  const loadSummary = async () => {
    setLoading(true);
    try {
      let endpoint = "";
      const params = new URLSearchParams();

      if (selectedPeriod === "shift") {
        // Get current shift times (simplified - would need proper shift logic)
        const now = new Date();
        const shiftStart = new Date(now);
        shiftStart.setHours(now.getHours() - 8, 0, 0, 0);
        params.append("shiftStart", shiftStart.toISOString());
        params.append("shiftEnd", now.toISOString());
        endpoint = `/api/v1/ai/incidents/summary/shift?${params}`;
      } else if (selectedPeriod === "daily") {
        params.append("date", selectedDate);
        endpoint = `/api/v1/ai/incidents/summary/daily?${params}`;
      } else {
        params.append("period", "week");
        params.append("startDate", selectedDate);
        endpoint = `/api/v1/ai/incidents/summary/executive?${params}`;
      }

      const response = await fetch(endpoint);
      const data = await response.json();
      setSummary(data);

      // Also load recent clusters
      await loadClusters();
    } catch (error) {
      console.error("Failed to load incident summary:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadClusters = async () => {
    try {
      const response = await fetch("/api/control/v1/ai/incidents/correlate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          from: new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
          to: new Date().toISOString(),
          limit: 100,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setClusters(data.clusters || []);
      }
    } catch (error) {
      console.error("Failed to load clusters:", error);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-500 text-white";
      case "high":
        return "bg-orange-500 text-white";
      case "medium":
        return "bg-yellow-500 text-white";
      case "low":
        return "bg-blue-500 text-white";
      default:
        return "bg-gray-500 text-white";
    }
  };

  const getIncidentTypeIcon = (type: string) => {
    if (type.includes("intrusion") || type.includes("security")) {
      return <Shield className="h-4 w-4" />;
    }
    if (type.includes("fire") || type.includes("smoke")) {
      return <Flame className="h-4 w-4" />;
    }
    if (type.includes("infrastructure") || type.includes("failure")) {
      return <Server className="h-4 w-4" />;
    }
    if (type.includes("camera")) {
      return <Camera className="h-4 w-4" />;
    }
    return <AlertCircle className="h-4 w-4" />;
  };

  if (!summary) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-gray-500">Loading AI Incident Summary...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">AI Incident Summary</h1>
          <p className="text-gray-500 mt-1">
            Intelligent alert correlation and incident clustering
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={selectedPeriod} onValueChange={(v: any) => setSelectedPeriod(v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="shift">Current Shift</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="executive">Executive (Weekly)</SelectItem>
            </SelectContent>
          </Select>

          {selectedPeriod === "daily" && (
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 border rounded-md"
            />
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={autoRefresh ? "bg-green-50 border-green-500" : ""}
          >
            <Activity className="h-4 w-4 mr-2" />
            {autoRefresh ? "Auto-Refreshing" : "Auto-Refresh"}
          </Button>

          <Button onClick={loadSummary} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Alert Reduction</CardDescription>
            <CardTitle className="text-3xl font-bold flex items-center">
              <TrendingDown className="h-6 w-6 mr-2 text-green-500" />
              {summary.reductionRatio.toFixed(1)}x
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              {summary.totalAlerts} alerts → {summary.totalIncidents} incidents
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Critical Incidents</CardDescription>
            <CardTitle className="text-3xl font-bold flex items-center">
              <AlertTriangle className="h-6 w-6 mr-2 text-red-500" />
              {summary.criticalIncidents}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              {summary.highPriorityIncidents} high priority
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Operational Issues</CardDescription>
            <CardTitle className="text-3xl font-bold flex items-center">
              <Server className="h-6 w-6 mr-2 text-orange-500" />
              {summary.operationalIssues}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">Infrastructure incidents</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Avg Alerts per Incident</CardDescription>
            <CardTitle className="text-3xl font-bold">
              {summary.averageAlertsPerIncident.toFixed(1)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">Correlation efficiency</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Different Views */}
      <Tabs defaultValue="security" className="space-y-4">
        <TabsList>
          <TabsTrigger value="security">Security Incidents</TabsTrigger>
          <TabsTrigger value="infrastructure">Infrastructure</TabsTrigger>
          <TabsTrigger value="clusters">Active Clusters</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* Security Incidents Tab */}
        <TabsContent value="security" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <Shield className="h-5 w-5 mr-2 text-red-500" />
                  Intrusions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{summary.securityIncidents.intrusions}</div>
                <p className="text-sm text-gray-500 mt-1">Confirmed intrusion attempts</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <Flame className="h-5 w-5 mr-2 text-orange-500" />
                  Fire/Smoke Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{summary.securityIncidents.fireSmoke}</div>
                <p className="text-sm text-gray-500 mt-1">Emergency fire detections</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <AlertCircle className="h-5 w-5 mr-2 text-yellow-500" />
                  Suspicious Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {summary.securityIncidents.suspiciousActivity}
                </div>
                <p className="text-sm text-gray-500 mt-1">Unusual behavior detected</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <MapPin className="h-5 w-5 mr-2 text-red-500" />
                  Restricted Zone
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {summary.securityIncidents.restrictedZone}
                </div>
                <p className="text-sm text-gray-500 mt-1">Unauthorized access</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <Activity className="h-5 w-5 mr-2 text-orange-500" />
                  Tailgating
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{summary.securityIncidents.tailgating}</div>
                <p className="text-sm text-gray-500 mt-1">Following incidents</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <AlertTriangle className="h-5 w-5 mr-2 text-yellow-500" />
                  Unattended Objects
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {summary.securityIncidents.unattendedObjects}
                </div>
                <p className="text-sm text-gray-500 mt-1">Suspicious items</p>
              </CardContent>
            </Card>
          </div>

          {/* Top Security Incidents */}
          <Card>
            <CardHeader>
              <CardTitle>Top Security Incidents</CardTitle>
              <CardDescription>Highest priority incidents requiring attention</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {summary.topIncidents
                  .filter((inc) => inc.incidentType.includes("security") || inc.incidentType.includes("intrusion") || inc.incidentType.includes("fire"))
                  .slice(0, 5)
                  .map((incident) => (
                    <div
                      key={incident.clusterId}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-3">
                        {getIncidentTypeIcon(incident.incidentType)}
                        <div>
                          <div className="font-medium">{incident.incidentType}</div>
                          <div className="text-sm text-gray-500">{incident.description}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-sm text-gray-500">
                          <Clock className="h-3 w-3 inline mr-1" />
                          {new Date(incident.occurredAt).toLocaleTimeString()}
                        </div>
                        <Badge className={getSeverityColor(incident.severity)}>
                          {incident.severity}
                        </Badge>
                        <Badge variant="outline">{incident.alertCount} alerts</Badge>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Infrastructure Tab */}
        <TabsContent value="infrastructure" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <XCircle className="h-5 w-5 mr-2 text-red-500" />
                  Camera Failures
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {summary.infrastructureIncidents.cameraFailures}
                </div>
                <p className="text-sm text-gray-500 mt-1">Hardware failures</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <Camera className="h-5 w-5 mr-2 text-orange-500" />
                  Cameras Offline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {summary.infrastructureIncidents.camerasOffline}
                </div>
                <p className="text-sm text-gray-500 mt-1">Currently offline</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <Server className="h-5 w-5 mr-2 text-yellow-500" />
                  Recording Issues
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {summary.infrastructureIncidents.recordingInterruptions}
                </div>
                <p className="text-sm text-gray-500 mt-1">Recording failures</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <Server className="h-5 w-5 mr-2 text-red-500" />
                  Storage Issues
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {summary.infrastructureIncidents.storageIssues}
                </div>
                <p className="text-sm text-gray-500 mt-1">Storage problems</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <Activity className="h-5 w-5 mr-2 text-orange-500" />
                  Network Issues
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {summary.infrastructureIncidents.networkIssues}
                </div>
                <p className="text-sm text-gray-500 mt-1">Connectivity problems</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Active Clusters Tab */}
        <TabsContent value="clusters" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Incident Clusters</CardTitle>
              <CardDescription>
                Real-time alert correlation showing {clusters.length} clusters from{" "}
                {summary.totalAlerts} alerts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {clusters.slice(0, 10).map((cluster) => (
                  <div
                    key={cluster.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-4">
                      {getIncidentTypeIcon(cluster.incidentType)}
                      <div>
                        <div className="font-medium">{cluster.clusterId}</div>
                        <div className="text-sm text-gray-500">{cluster.incidentType}</div>
                        {cluster.rootCause && (
                          <div className="text-xs text-blue-600 mt-1">
                            Root Cause: {cluster.rootCause}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-center">
                        <div className="text-2xl font-bold">{cluster.alertCount}</div>
                        <div className="text-xs text-gray-500">alerts</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold">{cluster.uniqueCameras}</div>
                        <div className="text-xs text-gray-500">cameras</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold">
                          {Math.round(cluster.durationSeconds / 60)}m
                        </div>
                        <div className="text-xs text-gray-500">duration</div>
                      </div>
                      <Badge className={getSeverityColor(cluster.severity)}>
                        {cluster.severity}
                      </Badge>
                      <div className="text-sm text-gray-500">
                        {Math.round(cluster.confidence * 100)}% confidence
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Incidents by Type</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(summary.incidentsByType).map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between">
                      <span className="text-sm">{type}</span>
                      <Badge variant="secondary">{count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Incidents by Severity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(summary.incidentsBySeverity).map(([severity, count]) => (
                    <div key={severity} className="flex items-center justify-between">
                      <span className="text-sm capitalize">{severity}</span>
                      <Badge className={getSeverityColor(severity)}>{count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Period Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-sm text-gray-500">Period</div>
                  <div className="text-lg font-semibold">{summary.period}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Start</div>
                  <div className="text-lg font-semibold">
                    {new Date(summary.periodStart).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">End</div>
                  <div className="text-lg font-semibold">
                    {new Date(summary.periodEnd).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Generated</div>
                  <div className="text-lg font-semibold">
                    {new Date(summary.generatedAt).toLocaleString()}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

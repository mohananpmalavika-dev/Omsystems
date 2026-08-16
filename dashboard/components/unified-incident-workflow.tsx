"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Users,
  Camera,
  FileText,
  Package,
  Video,
  Map as MapIcon,
  Activity,
  Shield,
  TrendingUp,
  Play,
  Image as ImageIcon,
  List,
} from "lucide-react";
import { AISOPWorkflowInterface } from "./ai-sop-workflow-interface";
import { AIInvestigationReportGenerator } from "./ai-investigation-report-generator";
import { AIEvidenceBuilder } from "./ai-evidence-builder";
import { AIChatWithVideo } from "./ai-chat-with-video";

interface Incident {
  id: string;
  incidentNumber: string;
  title: string;
  incidentType: string;
  severity: string;
  status: string;
  occurredAt: string;
  branchId?: string;
  description?: string;
  aiConfidence?: number;
  detectionCount?: number;
}

interface IncidentWorkflowProps {
  incidentId: string;
}

export function UnifiedIncidentWorkflow({ incidentId }: IncidentWorkflowProps) {
  const [incident, setIncident] = useState<Incident | null>(null);
  const [sopExecution, setSopExecution] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  // Statistics
  const [stats, setStats] = useState({
    totalCameras: 0,
    videoClips: 0,
    snapshots: 0,
    evidencePackages: 0,
    timelineEvents: 0,
    involvedPersons: 0,
  });

  useEffect(() => {
    loadIncident();
    loadStats();
  }, [incidentId]);

  const loadIncident = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/control/v1/incidents/${incidentId}`, { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setIncident(data.data || data);
      }
    } catch (error) {
      console.error("Failed to load incident:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      // Load various statistics
      const [cameras, clips, snapshots, packages, timeline, participants] = await Promise.all([
        fetch(`/api/control/v1/incidents/${incidentId}/cameras`, { credentials: "include" }).catch(() => null),
        fetch(`/api/control/v1/incidents/${incidentId}/clips`, { credentials: "include" }).catch(() => null),
        fetch(`/api/control/v1/incidents/${incidentId}/snapshots`, { credentials: "include" }).catch(() => null),
        fetch(`/api/control/v1/incidents/${incidentId}/evidence-packages`, { credentials: "include" }).catch(() => null),
        fetch(`/api/control/v1/incidents/${incidentId}/timeline`, { credentials: "include" }).catch(() => null),
        fetch(`/api/control/v1/incidents/${incidentId}/participants`, { credentials: "include" }).catch(() => null),
      ]);

      const parseJsonLen = async (res: Response | null) => {
        if (!res || !res.ok) return 0;
        const j = await res.json().catch(() => null);
        if (Array.isArray(j)) return j.length;
        if (j && Array.isArray(j.data)) return j.data.length;
        return 0;
      };

      setStats({
        totalCameras: await parseJsonLen(cameras),
        videoClips: await parseJsonLen(clips),
        snapshots: await parseJsonLen(snapshots),
        evidencePackages: await parseJsonLen(packages),
        timelineEvents: await parseJsonLen(timeline),
        involvedPersons: await parseJsonLen(participants),
      });
    } catch (error) {
      console.error("Failed to load stats:", error);
    }
  };

  const startSOP = async () => {
    try {
      // Select appropriate SOP
      const selectResponse = await fetch("/api/control/v1/ai/sops/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          incidentType: incident?.incidentType,
          severity: incident?.severity,
          context: { branchId: incident?.branchId },
        }),
      });
      if (selectResponse.ok) {
        const sop = await selectResponse.json();

        if (sop) {
          // Start SOP execution
          const execResponse = await fetch("/api/control/v1/ai/sop-executions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              sopId: sop.id,
              incidentId,
              branchId: incident?.branchId,
            }),
          });
          if (execResponse.ok) {
            const execution = await execResponse.json();
            setSopExecution(execution);
            setActiveTab("sop");
          }
        }
      }
    } catch (error) {
      console.error("Failed to start SOP:", error);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
      case "P1":
        return "bg-red-500 text-white";
      case "high":
      case "P2":
        return "bg-orange-500 text-white";
      case "medium":
      case "P3":
        return "bg-yellow-500 text-white";
      case "low":
      case "P4":
        return "bg-blue-500 text-white";
      default:
        return "bg-gray-500 text-white";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "new":
        return "bg-blue-500";
      case "investigating":
      case "in-progress":
        return "bg-yellow-500";
      case "resolved":
      case "closed":
        return "bg-green-500";
      case "escalated":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  if (loading || !incident) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Activity className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-gray-500">Loading incident workflow...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{incident.incidentNumber}</h1>
            <Badge className={getSeverityColor(incident.severity)}>
              {incident.severity}
            </Badge>
            <Badge className={getStatusColor(incident.status)}>{incident.status}</Badge>
            {incident.aiConfidence && (
              <Badge variant="outline" className="bg-purple-50 border-purple-500">
                <TrendingUp className="h-3 w-3 mr-1" />
                {Math.round(incident.aiConfidence * 100)}% AI Confidence
              </Badge>
            )}
          </div>
          <p className="text-gray-500 mt-1">{incident.title}</p>
          <p className="text-sm text-gray-400">
            {new Date(incident.occurredAt).toLocaleString()} • {incident.incidentType}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!sopExecution && (
            <Button onClick={startSOP} className="bg-purple-600 hover:bg-purple-700">
              <Shield className="h-4 w-4 mr-2" />
              Start SOP Workflow
            </Button>
          )}
          {sopExecution && (
            <Badge variant="outline" className="bg-blue-50 border-blue-500">
              <Activity className="h-3 w-3 mr-1 animate-pulse" />
              SOP In Progress
            </Badge>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <Camera className="h-8 w-8 mx-auto mb-2 text-blue-600" />
            <div className="text-2xl font-bold">{stats.totalCameras}</div>
            <div className="text-xs text-gray-500">Cameras</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 text-center">
            <Play className="h-8 w-8 mx-auto mb-2 text-purple-600" />
            <div className="text-2xl font-bold">{stats.videoClips}</div>
            <div className="text-xs text-gray-500">Video Clips</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 text-center">
            <ImageIcon className="h-8 w-8 mx-auto mb-2 text-green-600" />
            <div className="text-2xl font-bold">{stats.snapshots}</div>
            <div className="text-xs text-gray-500">Snapshots</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 text-center">
            <Package className="h-8 w-8 mx-auto mb-2 text-orange-600" />
            <div className="text-2xl font-bold">{stats.evidencePackages}</div>
            <div className="text-xs text-gray-500">Evidence Packages</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 text-center">
            <Clock className="h-8 w-8 mx-auto mb-2 text-yellow-600" />
            <div className="text-2xl font-bold">{stats.timelineEvents}</div>
            <div className="text-xs text-gray-500">Timeline Events</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 text-center">
            <Users className="h-8 w-8 mx-auto mb-2 text-red-600" />
            <div className="text-2xl font-bold">{stats.involvedPersons}</div>
            <div className="text-xs text-gray-500">Persons</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content - Three Panel Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Panel - SOP Workflow / Details */}
        <div className="lg:col-span-3">
          <Card className="h-[calc(100vh-28rem)] overflow-y-auto">
            <CardHeader className="sticky top-0 bg-white z-10 border-b">
              <CardTitle className="text-lg">Incident Details</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {/* SOP Status */}
              {sopExecution && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">SOP Progress</span>
                    <span className="text-xs text-blue-600">
                      {sopExecution.completedSteps}/{sopExecution.totalSteps}
                    </span>
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${sopExecution.progress}%` }}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-3"
                    onClick={() => setActiveTab("sop")}
                  >
                    View SOP Workflow
                  </Button>
                </div>
              )}

              {/* Description */}
              <div>
                <div className="text-sm font-medium mb-2">Description</div>
                <p className="text-sm text-gray-600">
                  {incident.description || "No description provided"}
                </p>
              </div>

              {/* AI Detection Info */}
              {incident.detectionCount && (
                <div>
                  <div className="text-sm font-medium mb-2">AI Detection</div>
                  <div className="text-sm text-gray-600">
                    <div className="flex items-center justify-between">
                      <span>Detection Count:</span>
                      <Badge variant="secondary">{incident.detectionCount}</Badge>
                    </div>
                    {incident.aiConfidence && (
                      <div className="flex items-center justify-between mt-1">
                        <span>Confidence:</span>
                        <Badge variant="secondary">
                          {Math.round(incident.aiConfidence * 100)}%
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div>
                <div className="text-sm font-medium mb-2">Quick Actions</div>
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => setActiveTab("investigation")}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Generate Report
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => setActiveTab("evidence")}
                  >
                    <Package className="h-4 w-4 mr-2" />
                    Build Evidence
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => setActiveTab("search")}
                  >
                    <Video className="h-4 w-4 mr-2" />
                    Search Video
                  </Button>
                </div>
              </div>

              {/* Incident Timeline Summary */}
              <div>
                <div className="text-sm font-medium mb-2">Timeline Summary</div>
                <div className="space-y-2">
                  <div className="flex items-start gap-2 text-sm">
                    <Clock className="h-4 w-4 text-gray-400 mt-0.5" />
                    <div>
                      <div className="text-gray-600">Occurred</div>
                      <div className="font-medium">
                        {new Date(incident.occurredAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  {/* Add more timeline milestones */}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Center Panel - Main Content */}
        <div className="lg:col-span-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="overview">
                <List className="h-4 w-4 mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="sop">
                <Shield className="h-4 w-4 mr-2" />
                SOP
              </TabsTrigger>
              <TabsTrigger value="investigation">
                <FileText className="h-4 w-4 mr-2" />
                Report
              </TabsTrigger>
              <TabsTrigger value="evidence">
                <Package className="h-4 w-4 mr-2" />
                Evidence
              </TabsTrigger>
              <TabsTrigger value="search">
                <Video className="h-4 w-4 mr-2" />
                Search
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="mt-6">
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Incident Overview</CardTitle>
                    <CardDescription>AI-powered incident analysis and response</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-6 bg-purple-50 rounded-lg">
                        <TrendingUp className="h-10 w-10 mx-auto mb-3 text-purple-600" />
                        <div className="text-sm text-gray-600 mb-1">AI Correlation</div>
                        <div className="text-2xl font-bold">
                          {incident.detectionCount || 1} Alerts
                        </div>
                        <div className="text-xs text-gray-500">Correlated into 1 incident</div>
                      </div>

                      <div className="text-center p-6 bg-blue-50 rounded-lg">
                        <Shield className="h-10 w-10 mx-auto mb-3 text-blue-600" />
                        <div className="text-sm text-gray-600 mb-1">SOP Guidance</div>
                        <div className="text-2xl font-bold">
                          {sopExecution ? "Active" : "Available"}
                        </div>
                        <div className="text-xs text-gray-500">Step-by-step response</div>
                      </div>

                      <div className="text-center p-6 bg-green-50 rounded-lg">
                        <FileText className="h-10 w-10 mx-auto mb-3 text-green-600" />
                        <div className="text-sm text-gray-600 mb-1">Investigation</div>
                        <div className="text-2xl font-bold">Auto</div>
                        <div className="text-xs text-gray-500">AI-generated reports</div>
                      </div>

                      <div className="text-center p-6 bg-orange-50 rounded-lg">
                        <Package className="h-10 w-10 mx-auto mb-3 text-orange-600" />
                        <div className="text-sm text-gray-600 mb-1">Evidence</div>
                        <div className="text-2xl font-bold">Court-Ready</div>
                        <div className="text-xs text-gray-500">Chain of custody</div>
                      </div>
                    </div>

                    {!sopExecution && (
                      <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                        <div className="flex items-center gap-3">
                          <AlertTriangle className="h-5 w-5 text-yellow-600" />
                          <div>
                            <div className="font-medium text-yellow-900">
                              SOP Workflow Recommended
                            </div>
                            <p className="text-sm text-yellow-700 mt-1">
                              This incident type has a standard operating procedure. Click "Start
                              SOP Workflow" to begin guided response.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* SOP Tab */}
            <TabsContent value="sop" className="mt-6">
              {sopExecution ? (
                <AISOPWorkflowInterface executionId={sopExecution.id} />
              ) : (
                <Card>
                  <CardContent className="pt-12 pb-12 text-center">
                    <Shield className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                    <h3 className="text-lg font-medium mb-2">No Active SOP</h3>
                    <p className="text-gray-500 mb-6">
                      Start a Standard Operating Procedure workflow to guide incident response
                    </p>
                    <Button onClick={startSOP} className="bg-purple-600 hover:bg-purple-700">
                      <Shield className="h-4 w-4 mr-2" />
                      Start SOP Workflow
                    </Button>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Investigation Tab */}
            <TabsContent value="investigation" className="mt-6">
              <AIInvestigationReportGenerator incidentId={incidentId} />
            </TabsContent>

            {/* Evidence Tab */}
            <TabsContent value="evidence" className="mt-6">
              <AIEvidenceBuilder incidentId={incidentId} />
            </TabsContent>

            {/* Search Tab */}
            <TabsContent value="search" className="mt-6">
              <AIChatWithVideo branchId={incident.branchId} />
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Panel - Video/Map */}
        <div className="lg:col-span-3">
          <Card className="h-[calc(100vh-28rem)]">
            <CardHeader className="border-b">
              <CardTitle className="text-lg flex items-center gap-2">
                <Camera className="h-5 w-5" />
                Live View / Playback
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {/* Video Player Placeholder */}
              <div className="aspect-video bg-gray-900 rounded-lg flex items-center justify-center mb-4">
                <div className="text-center text-white">
                  <Camera className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm opacity-75">Camera Feed</p>
                  <p className="text-xs opacity-50 mt-1">Select a camera to view</p>
                </div>
              </div>

              {/* Camera List */}
              <div className="space-y-2">
                <div className="text-sm font-medium">Related Cameras</div>
                {stats.totalCameras > 0 ? (
                  <div className="text-sm text-gray-500">
                    {stats.totalCameras} cameras involved in this incident
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">No cameras assigned yet</div>
                )}
              </div>

              {/* Map Placeholder */}
              <div className="mt-6">
                <div className="text-sm font-medium mb-2">Location Map</div>
                <div className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center">
                  <div className="text-center text-gray-400">
                    <MapIcon className="h-10 w-10 mx-auto mb-2" />
                    <p className="text-sm">Branch Layout</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

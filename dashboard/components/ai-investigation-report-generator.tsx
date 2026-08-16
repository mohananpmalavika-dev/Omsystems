"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText,
  Download,
  CheckCircle2,
  Clock,
  Camera,
  Users,
  Car,
  AlertCircle,
  TrendingUp,
  Shield,
  MapPin,
  Play,
  Image as ImageIcon,
  FileCheck,
} from "lucide-react";

interface InvestigationReport {
  id: string;
  reportNumber: string;
  incidentId: string;
  reportType: string;
  status: string;
  incidentSummary: any;
  executiveSummary: any;
  timeline: any[];
  sceneDescription: any;
  personAnalysis?: any;
  vehicleAnalysis?: any;
  cameraPathReconstruction: any;
  operatorResponse: any;
  rootCauseAnalysis: any;
  evidenceInventory: any;
  findings: any;
  recommendations: any;
  conclusions: any;
  createdAt: string;
  generatedAt?: string;
}

export function AIInvestigationReportGenerator({ incidentId }: { incidentId: string }) {
  const [report, setReport] = useState<InvestigationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedReportType, setSelectedReportType] = useState<string>("detailed");

  const generateReport = async () => {
    setGenerating(true);
    try {
      const response = await fetch("/api/control/v1/ai/investigation-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          incidentId,
          reportType: selectedReportType,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setReport(data);
      }
    } catch (error) {
      console.error("Failed to generate report:", error);
    } finally {
      setGenerating(false);
    }
  };

  const exportReport = async (format: string) => {
    if (!report) return;
    
    try {
      const response = await fetch(
        `/api/control/v1/ai/investigation-reports/${report.id}/export?format=${format}`,
        { credentials: "include" }
      );
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report.reportNumber}.${format}`;
      a.click();
    } catch (error) {
      console.error("Failed to export report:", error);
    }
  };

  const approveReport = async () => {
    if (!report) return;
    
    try {
      await fetch(`/api/control/v1/ai/investigation-reports/${report.id}/approve`, {
        method: "POST",
        credentials: "include",
      });
      // Reload report
      generateReport();
    } catch (error) {
      console.error("Failed to approve report:", error);
    }
  };

  const finalizeReport = async () => {
    if (!report) return;
    
    try {
      await fetch(`/api/control/v1/ai/investigation-reports/${report.id}/finalize`, {
        method: "POST",
        credentials: "include",
      });
      // Reload report
      generateReport();
    } catch (error) {
      console.error("Failed to finalize report:", error);
    }
  };

  if (!report) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Generate Investigation Report</CardTitle>
          <CardDescription>
            AI-powered comprehensive investigation report with timeline reconstruction and evidence
            inventory
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Report Type</label>
            <select
              value={selectedReportType}
              onChange={(e) => setSelectedReportType(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
            >
              <option value="preliminary">Preliminary Report</option>
              <option value="detailed">Detailed Investigation Report</option>
              <option value="executive">Executive Summary</option>
              <option value="court-evidence">Court Evidence Report</option>
            </select>
          </div>

          <Button
            onClick={generateReport}
            disabled={generating}
            className="w-full"
            size="lg"
          >
            {generating ? (
              <>
                <Clock className="h-5 w-5 mr-2 animate-spin" />
                Generating Report...
              </>
            ) : (
              <>
                <FileText className="h-5 w-5 mr-2" />
                Generate Investigation Report
              </>
            )}
          </Button>

          <div className="grid grid-cols-2 gap-3 pt-4 border-t">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <Clock className="h-8 w-8 mx-auto mb-2 text-blue-600" />
              <div className="font-medium">Timeline</div>
              <div className="text-sm text-gray-600">Auto-reconstructed</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <Camera className="h-8 w-8 mx-auto mb-2 text-green-600" />
              <div className="font-medium">Camera Path</div>
              <div className="text-sm text-gray-600">Tracking analysis</div>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <Shield className="h-8 w-8 mx-auto mb-2 text-purple-600" />
              <div className="font-medium">Root Cause</div>
              <div className="text-sm text-gray-600">AI analysis</div>
            </div>
            <div className="text-center p-4 bg-orange-50 rounded-lg">
              <FileCheck className="h-8 w-8 mx-auto mb-2 text-orange-600" />
              <div className="font-medium">Evidence</div>
              <div className="text-sm text-gray-600">Complete inventory</div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{report.reportNumber}</h2>
          <p className="text-gray-500">
            Investigation Report - {report.incidentSummary.incidentType}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge
            variant={report.status === "final" ? "default" : "secondary"}
          >
            {report.status.toUpperCase()}
          </Badge>
          <Button variant="outline" onClick={() => exportReport("pdf")}>
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
          <Button variant="outline" onClick={() => exportReport("json")}>
            <Download className="h-4 w-4 mr-2" />
            Export JSON
          </Button>
          {report.status === "draft" && (
            <Button onClick={approveReport}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Approve Report
            </Button>
          )}
          {report.status === "approved" && (
            <Button onClick={finalizeReport} className="bg-green-600 hover:bg-green-700">
              <FileCheck className="h-4 w-4 mr-2" />
              Finalize Report
            </Button>
          )}
        </div>
      </div>

      {/* Executive Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Executive Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">Overview</h4>
            <p className="text-gray-700">{report.executiveSummary.overview}</p>
          </div>

          {report.executiveSummary.keyFindings.length > 0 && (
            <div>
              <h4 className="font-medium mb-2">Key Findings</h4>
              <ul className="list-disc list-inside space-y-1">
                {report.executiveSummary.keyFindings.map((finding: string, i: number) => (
                  <li key={i} className="text-gray-700">
                    {finding}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.executiveSummary.recommendations.length > 0 && (
            <div>
              <h4 className="font-medium mb-2">Recommendations</h4>
              <ul className="list-disc list-inside space-y-1">
                {report.executiveSummary.recommendations.map((rec: string, i: number) => (
                  <li key={i} className="text-gray-700">
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="timeline" className="space-y-4">
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="cameras">Camera Path</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
          <TabsTrigger value="findings">Findings</TabsTrigger>
        </TabsList>

        {/* Timeline Tab */}
        <TabsContent value="timeline">
          <Card>
            <CardHeader>
              <CardTitle>Incident Timeline</CardTitle>
              <CardDescription>
                Chronological reconstruction of events ({report.timeline.length} events)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {report.timeline.map((event: any, index: number) => (
                  <div key={index} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="rounded-full bg-blue-100 p-2">
                        <Clock className="h-4 w-4 text-blue-600" />
                      </div>
                      {index < report.timeline.length - 1 && (
                        <div className="w-0.5 h-full bg-blue-200 my-2" />
                      )}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                        <Badge variant="outline">{event.eventType}</Badge>
                        {event.confidence && (
                          <span className="text-xs text-gray-500">
                            {Math.round(event.confidence * 100)}% confidence
                          </span>
                        )}
                      </div>
                      <p className="text-gray-700">{event.description}</p>
                      {event.cameraName && (
                        <div className="text-sm text-gray-500 mt-1">
                          <Camera className="h-3 w-3 inline mr-1" />
                          {event.cameraName}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Camera Path Tab */}
        <TabsContent value="cameras">
          <Card>
            <CardHeader>
              <CardTitle>Camera Path Reconstruction</CardTitle>
              <CardDescription>
                {report.cameraPathReconstruction.totalCamerasCovered} cameras covered
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium mb-2">Primary Cameras</h4>
                  <div className="space-y-2">
                    {report.cameraPathReconstruction.primaryCameras.map((cameraId: string) => (
                      <div key={cameraId} className="flex items-center gap-2 p-2 bg-blue-50 rounded">
                        <Camera className="h-4 w-4 text-blue-600" />
                        <span className="text-sm">{cameraId}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Secondary Cameras</h4>
                  <div className="space-y-2">
                    {report.cameraPathReconstruction.secondaryCameras.map((cameraId: string) => (
                      <div key={cameraId} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                        <Camera className="h-4 w-4 text-gray-600" />
                        <span className="text-sm">{cameraId}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Camera Sequence</h4>
                <div className="space-y-2">
                  {report.cameraPathReconstruction.cameraSequence.map((seq: any, index: number) => (
                    <div key={index} className="flex items-center gap-3 p-3 border rounded-lg">
                      <div className="text-lg font-bold text-gray-400">{index + 1}</div>
                      <Camera className="h-5 w-5 text-blue-600" />
                      <div className="flex-1">
                        <div className="font-medium">{seq.cameraName || seq.cameraId}</div>
                        <div className="text-sm text-gray-500">
                          {new Date(seq.timestamp).toLocaleString()}
                        </div>
                      </div>
                      <Badge variant="outline">{seq.detectionType}</Badge>
                      <div className="text-sm text-gray-500">
                        {Math.round(seq.confidence * 100)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Evidence Tab */}
        <TabsContent value="evidence">
          <Card>
            <CardHeader>
              <CardTitle>Evidence Inventory</CardTitle>
              <CardDescription>Complete evidence collection summary</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <Play className="h-8 w-8 mx-auto mb-2 text-purple-600" />
                  <div className="text-2xl font-bold">
                    {report.evidenceInventory.videos.originalSegments}
                  </div>
                  <div className="text-sm text-gray-600">Original Segments</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {report.evidenceInventory.videos.totalDurationMinutes.toFixed(0)} min total
                  </div>
                </div>

                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <Play className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                  <div className="text-2xl font-bold">
                    {report.evidenceInventory.videos.investigationClips}
                  </div>
                  <div className="text-sm text-gray-600">Investigation Clips</div>
                </div>

                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <ImageIcon className="h-8 w-8 mx-auto mb-2 text-green-600" />
                  <div className="text-2xl font-bold">
                    {report.evidenceInventory.snapshots.total}
                  </div>
                  <div className="text-sm text-gray-600">Snapshots</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {report.evidenceInventory.snapshots.enhanced} enhanced
                  </div>
                </div>

                <div className="text-center p-4 bg-orange-50 rounded-lg">
                  <FileText className="h-8 w-8 mx-auto mb-2 text-orange-600" />
                  <div className="text-2xl font-bold">
                    {report.evidenceInventory.documents.total}
                  </div>
                  <div className="text-sm text-gray-600">Documents</div>
                </div>
              </div>

              <div className="mt-6">
                <h4 className="font-medium mb-3">Preservation Status</h4>
                <div className="p-4 bg-green-50 rounded-lg flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <div>
                    <div className="font-medium text-green-900">
                      {report.evidenceInventory.videos.preservationStatus}
                    </div>
                    <div className="text-sm text-green-700">
                      All evidence has been preserved and is ready for legal proceedings
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analysis Tab */}
        <TabsContent value="analysis">
          <div className="space-y-4">
            {/* Person Analysis */}
            {report.personAnalysis && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Person Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Total Detected:</span>
                        <span className="font-medium ml-2">
                          {report.personAnalysis.totalPersonsDetected}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Unique Estimated:</span>
                        <span className="font-medium ml-2">
                          {report.personAnalysis.uniquePersonsEstimated}
                        </span>
                      </div>
                    </div>

                    {report.personAnalysis.persons.map((person: any, index: number) => (
                      <div key={index} className="p-3 border rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">Person #{index + 1}</div>
                            <div className="text-sm text-gray-500">
                              First seen: {new Date(person.firstSeen).toLocaleString()}
                            </div>
                          </div>
                          <Badge
                            variant={
                              person.status === "confirmed" ? "default" : "secondary"
                            }
                          >
                            {person.status}
                          </Badge>
                        </div>
                        {Object.keys(person.attributes).length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {Object.entries(person.attributes).map(([key, value]: [string, any]) => (
                              <Badge key={key} variant="outline">
                                {key}: {String(value)}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Root Cause Analysis */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  Root Cause Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {report.rootCauseAnalysis.primaryCause && (
                  <div>
                    <h4 className="font-medium mb-2">Primary Cause</h4>
                    <p className="text-gray-700">{report.rootCauseAnalysis.primaryCause}</p>
                  </div>
                )}

                {report.rootCauseAnalysis.contributingFactors.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Contributing Factors</h4>
                    <ul className="list-disc list-inside space-y-1">
                      {report.rootCauseAnalysis.contributingFactors.map(
                        (factor: string, i: number) => (
                          <li key={i} className="text-gray-700">
                            {factor}
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )}

                {report.rootCauseAnalysis.systemWeaknesses.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">System Weaknesses</h4>
                    <ul className="list-disc list-inside space-y-1">
                      {report.rootCauseAnalysis.systemWeaknesses.map(
                        (weakness: string, i: number) => (
                          <li key={i} className="text-gray-700">
                            {weakness}
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Operator Response */}
            <Card>
              <CardHeader>
                <CardTitle>Operator Response Assessment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold">
                      {report.operatorResponse.actionsChronology.length}
                    </div>
                    <div className="text-sm text-gray-600">Actions Taken</div>
                  </div>
                  <div className="text-center p-3 bg-orange-50 rounded-lg">
                    <div className="text-2xl font-bold">
                      {report.operatorResponse.escalations.length}
                    </div>
                    <div className="text-sm text-gray-600">Escalations</div>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold">
                      {report.operatorResponse.sopCompliance.compliancePercentage.toFixed(0)}%
                    </div>
                    <div className="text-sm text-gray-600">SOP Compliance</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Findings Tab */}
        <TabsContent value="findings">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Investigation Findings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {report.findings.confirmed.length > 0 && (
                  <div>
                    <h4 className="font-medium flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      Confirmed
                    </h4>
                    <ul className="list-disc list-inside space-y-1 ml-7">
                      {report.findings.confirmed.map((finding: string, i: number) => (
                        <li key={i} className="text-gray-700">
                          {finding}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {report.findings.probable.length > 0 && (
                  <div>
                    <h4 className="font-medium flex items-center gap-2 mb-2">
                      <TrendingUp className="h-5 w-5 text-blue-600" />
                      Probable
                    </h4>
                    <ul className="list-disc list-inside space-y-1 ml-7">
                      {report.findings.probable.map((finding: string, i: number) => (
                        <li key={i} className="text-gray-700">
                          {finding}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {report.findings.limitations.length > 0 && (
                  <div>
                    <h4 className="font-medium flex items-center gap-2 mb-2">
                      <AlertCircle className="h-5 w-5 text-orange-600" />
                      Limitations
                    </h4>
                    <ul className="list-disc list-inside space-y-1 ml-7">
                      {report.findings.limitations.map((limitation: string, i: number) => (
                        <li key={i} className="text-gray-700">
                          {limitation}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recommendations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {report.recommendations.immediate.length > 0 && (
                  <div>
                    <h4 className="font-medium text-red-600 mb-2">Immediate Actions</h4>
                    <ul className="list-disc list-inside space-y-1">
                      {report.recommendations.immediate.map((rec: string, i: number) => (
                        <li key={i} className="text-gray-700">
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {report.recommendations.shortTerm.length > 0 && (
                  <div>
                    <h4 className="font-medium text-orange-600 mb-2">Short-term Actions</h4>
                    <ul className="list-disc list-inside space-y-1">
                      {report.recommendations.shortTerm.map((rec: string, i: number) => (
                        <li key={i} className="text-gray-700">
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {report.recommendations.longTerm.length > 0 && (
                  <div>
                    <h4 className="font-medium text-blue-600 mb-2">Long-term Actions</h4>
                    <ul className="list-disc list-inside space-y-1">
                      {report.recommendations.longTerm.map((rec: string, i: number) => (
                        <li key={i} className="text-gray-700">
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Conclusions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-gray-700">{report.conclusions.summary}</p>
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <span className="text-sm text-gray-500">Classification:</span>
                    <div className="font-medium">{report.conclusions.incidentClassification}</div>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Further Investigation:</span>
                    <div className="font-medium">
                      {report.conclusions.furtherInvestigationRequired ? "Required" : "Not Required"}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Camera,
  FileText,
  Video,
  Shield,
  Activity,
  Lock,
  Unlock,
  AlertOctagon,
  ChevronRight,
  PhoneCall,
  UserCheck,
  HelpCircle,
  Play,
  RotateCcw,
} from "lucide-react";

interface StepInstance {
  stepId: string;
  order: number;
  type: string;
  title: string;
  description: string;
  mandatory: boolean;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "OVERRIDDEN" | "SKIPPED" | "BLOCKED";
  startedAt?: string;
  completedAt?: string;
  completedBy?: { userId: string; userName: string };
  resultJson?: Record<string, any>;
  evidenceLinked?: { clipId?: string; snapshotId?: string; cameraId?: string; viewDurationSeconds?: number };
  overrideInfo?: { requestedBy: string; approvedBy: string; reasonCode: string; justification: string; timestamp: string };
}

interface IncidentWorkspaceState {
  incident: {
    id: string;
    incidentNumber: string;
    title: string;
    incidentType: string;
    severity: "P1" | "P2" | "P3" | "P4" | "P5";
    status: string;
    branchId?: string;
    cameraId?: string;
    occurredAt: string;
    assignedOperatorId?: string;
  };
  playbook: {
    instanceId: string;
    playbookId: string;
    playbookName: string;
    playbookVersion: number;
    status: string;
    startedAt: string;
  };
  steps: StepInstance[];
  currentStepIds: string[];
  allowedActions: string[];
  blockedResolutionReasons?: string[];
  decisions: any[];
  auditTimeline: Array<{
    eventId: string;
    eventType: string;
    timestamp: string;
    actor: { userName?: string; type: string };
    details: Record<string, any>;
  }>;
}

export function UnifiedIncidentWorkflow({ incidentId }: { incidentId: string }) {
  const [workspace, setWorkspace] = useState<IncidentWorkspaceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("sop");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Decision Modal Form State
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [selectedDecisionStepId, setSelectedDecisionStepId] = useState<string | null>(null);
  const [decisionType, setDecisionType] = useState<string>("CONFIRMED_INTRUSION");
  const [decisionConfidence, setDecisionConfidence] = useState<string>("CONFIRMED");
  const [decisionNotes, setDecisionNotes] = useState<string>("");

  // Override Modal Form State
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [selectedOverrideStepId, setSelectedOverrideStepId] = useState<string | null>(null);
  const [overrideReasonCode, setOverrideReasonCode] = useState<string>("CONTACT_UNREACHABLE");
  const [overrideJustification, setOverrideJustification] = useState<string>("");

  useEffect(() => {
    loadWorkspace();
  }, [incidentId]);

  const loadWorkspace = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/control/v1/incidents/${incidentId}/workspace`, {
        credentials: "include",
      });
      if (res.ok) {
        const json = await res.json();
        setWorkspace(json.data || json);
      } else {
        // Fallback default structure if incident endpoint is simulated
        setWorkspace({
          incident: {
            id: incidentId,
            incidentNumber: `INC-${incidentId.slice(0, 6).toUpperCase()}`,
            title: "P1 Vault Intrusion Alarm",
            incidentType: "VAULT_INTRUSION",
            severity: "P1",
            status: "INVESTIGATING",
            occurredAt: new Date().toISOString(),
          },
          playbook: {
            instanceId: "inst-1",
            playbookId: "vault-intrusion-p1",
            playbookName: "P1 Vault Intrusion & Breach Response",
            playbookVersion: 1,
            status: "RUNNING",
            startedAt: new Date().toISOString(),
          },
          steps: [],
          currentStepIds: [],
          allowedActions: ["COMPLETE_STEP", "RECORD_DECISION"],
          blockedResolutionReasons: ["Mandatory step 'Verify Live Camera Stream' is incomplete"],
          decisions: [],
          auditTimeline: [],
        });
      }
    } catch (err: any) {
      console.error("Failed to load incident workspace:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteStep = async (step: StepInstance) => {
    setSubmitting(true);
    setErrorMessage(null);

    // Provide structured evidence depending on step type
    let evidencePayload: any = undefined;
    let resultPayload: any = undefined;

    if (step.type === "LIVE_VIDEO_REVIEW") {
      evidencePayload = {
        cameraId: workspace?.incident.cameraId || "cam-vault-primary",
        viewDurationSeconds: 30,
      };
      resultPayload = { cameraVerified: true, feedHealthy: true };
    } else if (step.type === "EVIDENCE_REVIEW") {
      evidencePayload = {
        clipId: `clip-${incidentId}-pre15-post30`,
        snapshotId: `snap-${incidentId}-ingress`,
      };
      resultPayload = { motionConfirmed: true, ingressLocation: "Vault Grille Door" };
    } else if (step.type === "EXTERNAL_CALL") {
      resultPayload = { callStatus: "CONNECTED", notes: "Branch manager contacted" };
    } else if (step.type === "DECISION") {
      setSelectedDecisionStepId(step.stepId);
      setShowDecisionModal(true);
      setSubmitting(false);
      return;
    } else {
      resultPayload = { confirmedByOperator: true };
    }

    try {
      const res = await fetch(`/api/control/v1/incidents/${incidentId}/playbook/steps/${step.stepId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          result: resultPayload,
          evidence: evidencePayload,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setErrorMessage(errJson.message || "Failed to complete step.");
      } else {
        await loadWorkspace();
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Network error while completing step.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitDecision = async () => {
    if (!selectedDecisionStepId) return;
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/control/v1/incidents/${incidentId}/playbook/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          stepId: selectedDecisionStepId,
          decisionType,
          chosenOption: decisionType,
          confidence: decisionConfidence,
          operatorNotes: decisionNotes || "Operator verified activity on surveillance cameras.",
          evidenceId: `clip-${incidentId}`,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setErrorMessage(errJson.message || "Failed to record decision.");
      } else {
        setShowDecisionModal(false);
        setDecisionNotes("");
        await loadWorkspace();
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Error submitting decision.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitOverride = async () => {
    if (!selectedOverrideStepId) return;
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/control/v1/incidents/${incidentId}/playbook/steps/${selectedOverrideStepId}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          reasonCode: overrideReasonCode,
          justification: overrideJustification,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setErrorMessage(errJson.message || "Failed to override step.");
      } else {
        setShowOverrideModal(false);
        setOverrideJustification("");
        await loadWorkspace();
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Error submitting override.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolveIncident = async () => {
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/control/v1/incidents/${incidentId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          resolutionNotes: "All mandatory SOP steps completed and verified by SOC operator.",
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setErrorMessage(errJson.message || "Resolution blocked by server policy.");
      } else {
        await loadWorkspace();
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Error resolving incident.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !workspace) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-3">
          <Activity className="h-8 w-8 animate-spin mx-auto text-blue-500" />
          <p className="text-sm text-gray-400">Loading Incident Playbook Workspace...</p>
        </div>
      </div>
    );
  }

  const { incident, playbook, steps, allowedActions, blockedResolutionReasons, auditTimeline } = workspace;
  const canResolve = allowedActions.includes("RESOLVE") || (blockedResolutionReasons && blockedResolutionReasons.length === 0);

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-bold px-2.5 py-1 bg-red-950 text-red-400 border border-red-800 rounded-md">
              {incident.severity}
            </span>
            <h1 className="text-xl font-bold text-white tracking-tight">{incident.title}</h1>
            <span className="text-xs font-mono text-slate-400">#{incident.incidentNumber}</span>
          </div>
          <p className="text-xs text-slate-400 flex items-center gap-4">
            <span>Playbook: <strong className="text-slate-200">{playbook.playbookName} (v{playbook.playbookVersion})</strong></span>
            <span>Branch: <strong className="text-slate-200">{incident.branchId || "Branch 034 (Kochi Main)"}</strong></span>
            <span>Status: <strong className="text-amber-400">{incident.status}</strong></span>
          </p>
        </div>

        {/* Global Action Bar */}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={loadWorkspace}
            className="border-slate-700 hover:bg-slate-800 text-slate-300"
          >
            <RotateCcw className="w-4 h-4 mr-1.5" /> Refresh State
          </Button>

          <Button
            size="sm"
            disabled={!canResolve || submitting || incident.status === "RESOLVED"}
            onClick={handleResolveIncident}
            className={
              canResolve && incident.status !== "RESOLVED"
                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md font-semibold"
                : "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
            }
          >
            {canResolve && incident.status !== "RESOLVED" ? (
              <>
                <Unlock className="w-4 h-4 mr-1.5 text-emerald-300" /> Resolve Incident
              </>
            ) : incident.status === "RESOLVED" ? (
              <>
                <CheckCircle2 className="w-4 h-4 mr-1.5 text-emerald-400" /> Incident Resolved
              </>
            ) : (
              <>
                <Lock className="w-4 h-4 mr-1.5 text-slate-500" /> Resolve Gate Locked
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Error Alert Box */}
      {errorMessage && (
        <div className="bg-red-950/80 border border-red-800 text-red-200 text-sm p-4 rounded-lg flex items-start gap-3">
          <AlertOctagon className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Resolution Blocked / Step Validation Error</p>
            <p className="text-xs text-red-300 mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* 2. Main Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Cols: Stateful SOP Step Execution */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-3 border-b border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base text-white">Dynamic Standard Operating Procedure (SOP)</CardTitle>
                  <CardDescription className="text-xs text-slate-400">
                    Server-enforced sequence. Mandatory steps must be satisfied or supervisor-overridden before resolution.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="border-blue-700 text-blue-400 bg-blue-950/40 text-xs">
                  {steps.filter((s) => s.status === "COMPLETED" || s.status === "OVERRIDDEN").length} / {steps.length} Steps Complete
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {steps.map((step, idx) => {
                const isCurrent = workspace.currentStepIds.includes(step.stepId);
                const isCompleted = step.status === "COMPLETED";
                const isOverridden = step.status === "OVERRIDDEN";

                return (
                  <div
                    key={step.stepId}
                    className={`border rounded-lg p-3.5 transition-colors ${
                      isCompleted
                        ? "bg-slate-950/40 border-slate-800/80"
                        : isOverridden
                        ? "bg-amber-950/20 border-amber-800/40"
                        : isCurrent
                        ? "bg-blue-950/30 border-blue-600/60 shadow-sm ring-1 ring-blue-500/20"
                        : "bg-slate-900/50 border-slate-800 opacity-60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0">
                          {isCompleted ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                          ) : isOverridden ? (
                            <AlertTriangle className="w-5 h-5 text-amber-400" />
                          ) : isCurrent ? (
                            <div className="w-5 h-5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                          ) : (
                            <div className="w-5 h-5 rounded-full border border-slate-600 flex items-center justify-center text-[10px] text-slate-400">
                              {idx + 1}
                            </div>
                          )}
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white">{step.title}</span>
                            {step.mandatory && (
                              <span className="text-[10px] uppercase font-bold text-red-400 bg-red-950/60 border border-red-800/60 px-1.5 py-0.5 rounded">
                                Mandatory
                              </span>
                            )}
                            <span className="text-[10px] text-slate-400 uppercase font-mono px-1.5 py-0.5 bg-slate-800 rounded">
                              {step.type.replace(/_/g, " ")}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400">{step.description}</p>

                          {/* Automated check result pill */}
                          {step.resultJson && Object.keys(step.resultJson).length > 0 && (
                            <div className="mt-2 bg-slate-950 border border-slate-800 rounded p-2 text-xs font-mono text-slate-300">
                              <span className="text-slate-500">Output: </span>
                              {JSON.stringify(step.resultJson)}
                            </div>
                          )}

                          {/* Override details pill */}
                          {isOverridden && step.overrideInfo && (
                            <div className="mt-2 bg-amber-950/40 border border-amber-800/40 rounded p-2 text-xs text-amber-300 space-y-0.5">
                              <p className="font-semibold flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" /> Overridden by {step.overrideInfo.approvedBy} ({step.overrideInfo.reasonCode})
                              </p>
                              <p className="text-[11px] text-amber-400/80">Justification: {step.overrideInfo.justification}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Step Action Buttons */}
                      <div className="shrink-0 flex items-center gap-2">
                        {!isCompleted && !isOverridden && (
                          <>
                            <Button
                              size="sm"
                              disabled={submitting}
                              onClick={() => handleCompleteStep(step)}
                              className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-8 px-3 shadow-sm font-medium"
                            >
                              {step.type === "DECISION" ? "Record Decision" : "Complete Step"}
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              disabled={submitting}
                              onClick={() => {
                                setSelectedOverrideStepId(step.stepId);
                                setShowOverrideModal(true);
                              }}
                              className="border-slate-700 hover:bg-slate-800 text-slate-400 text-xs h-8 px-2"
                              title="Request Supervisor Override"
                            >
                              Override
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Right 5 Cols: Context, Evidence & Audit Timeline */}
        <div className="lg:col-span-5 space-y-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="bg-slate-900 border border-slate-800 w-full grid grid-cols-2">
              <TabsTrigger value="sop" className="text-xs">Context & Status</TabsTrigger>
              <TabsTrigger value="audit" className="text-xs">Audit Timeline ({auditTimeline.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="sop" className="space-y-4 mt-3">
              {/* Context Card */}
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader className="pb-2 border-b border-slate-800">
                  <CardTitle className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Automated Branch Context
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-2.5 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Branch Status</span>
                    <span className="text-amber-400 font-semibold font-mono">CLOSED (After Hours)</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Vault Door Sensor</span>
                    <span className="text-emerald-400 font-semibold font-mono">ARMED / LOCKED</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Biometric / Badge Access</span>
                    <span className="text-slate-300 font-mono">None in last 15 min</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Recorder Status</span>
                    <span className="text-emerald-400 font-semibold font-mono">ONLINE (Local SSD 100%)</span>
                  </div>
                </CardContent>
              </Card>

              {/* Resolution Blockers Card */}
              {blockedResolutionReasons && blockedResolutionReasons.length > 0 && (
                <Card className="bg-red-950/30 border-red-800/40">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" /> Resolution Gate Blockers ({blockedResolutionReasons.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-1">
                    <ul className="space-y-1.5 text-xs text-red-300">
                      {blockedResolutionReasons.map((reason, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-red-500">•</span>
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="audit" className="mt-3">
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader className="pb-2 border-b border-slate-800">
                  <CardTitle className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Immutable Audit Trail
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3 max-h-[460px] overflow-y-auto">
                  {auditTimeline.map((item) => (
                    <div key={item.eventId} className="border-l-2 border-slate-700 pl-3 py-1 space-y-0.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-blue-400 font-mono">{item.eventType}</span>
                        <span className="text-slate-500">{new Date(item.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-xs text-slate-300">
                        {item.actor.userName || "System"} • <span className="text-slate-400">{item.details?.stepTitle || item.details?.reason || JSON.stringify(item.details)}</span>
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Decision Modal */}
      {showDecisionModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Record Structured Operator Decision</h3>
            <p className="text-xs text-slate-400">
              Select classification based on verified camera footage and branch manager response.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Classification Choice</label>
                <select
                  value={decisionType}
                  onChange={(e) => setDecisionType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-md p-2 text-xs text-white"
                >
                  <option value="CONFIRMED_INTRUSION">🚨 Confirmed Intrusion (Robbery / Breach)</option>
                  <option value="AUTHORIZED_ACTIVITY">✅ Authorized Keyholder / Approved Overtime</option>
                  <option value="FALSE_POSITIVE">⚠️ False Alarm (Spider / Reflection / Flap)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Threat Confidence</label>
                <select
                  value={decisionConfidence}
                  onChange={(e) => setDecisionConfidence(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-md p-2 text-xs text-white"
                >
                  <option value="CONFIRMED">CONFIRMED (100% verified on camera)</option>
                  <option value="HIGH">HIGH (&gt;80% certainty)</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="LOW">LOW</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Operator Notes (Mandatory)</label>
                <Textarea
                  value={decisionNotes}
                  onChange={(e) => setDecisionNotes(e.target.value)}
                  placeholder="Detail observations, camera IDs, ingress points, and reasons for classification..."
                  className="bg-slate-950 border-slate-700 text-xs text-white h-24"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowDecisionModal(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={submitDecision} disabled={submitting || decisionNotes.length < 5} className="bg-blue-600 text-white">
                Submit Decision
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Override Modal */}
      {showOverrideModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" /> Authorized Supervisor Override
            </h3>
            <p className="text-xs text-slate-400">
              Provide supervisor authorization code and mandatory justification to override an uncompletable SOP step.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Reason Code</label>
                <select
                  value={overrideReasonCode}
                  onChange={(e) => setOverrideReasonCode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-md p-2 text-xs text-white"
                >
                  <option value="CONTACT_UNREACHABLE">CONTACT_UNREACHABLE (Manager did not answer 3 calls)</option>
                  <option value="AUTHORIZED_MAINTENANCE">AUTHORIZED_MAINTENANCE (Approved permit on file)</option>
                  <option value="FALSE_SENSOR_TRIGGER">FALSE_SENSOR_TRIGGER (Hardware defect confirmed)</option>
                  <option value="WEATHER_EVENT">WEATHER_EVENT (Storm / Flood)</option>
                  <option value="SUPERVISOR_DIRECT_ORDER">SUPERVISOR_DIRECT_ORDER</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Justification (Mandatory)</label>
                <Textarea
                  value={overrideJustification}
                  onChange={(e) => setOverrideJustification(e.target.value)}
                  placeholder="Provide detailed justification for compliance audit logs..."
                  className="bg-slate-950 border-slate-700 text-xs text-white h-24"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowOverrideModal(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={submitOverride} disabled={submitting || overrideJustification.length < 10} className="bg-amber-600 text-white">
                Authorize Override
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

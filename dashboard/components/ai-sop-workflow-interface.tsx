"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  ArrowRight,
  Phone,
  Video,
  FileText,
  Send,
  SkipForward,
  AlertCircle,
  TrendingUp,
  CheckSquare,
} from "lucide-react";

interface SOPStep {
  stepNumber: number;
  title: string;
  description: string;
  stepType: string;
  isMandatory: boolean;
  expectedDurationMinutes?: number;
  checklistItems?: string[];
}

interface SOPStepResult {
  stepNumber: number;
  status: "pending" | "in-progress" | "completed" | "skipped" | "failed";
  startedAt?: string;
  completedAt?: string;
  completedBy?: string;
  result?: string;
  response?: any;
  comments?: string;
  skipReason?: string;
  duration?: number;
}

interface SOPExecution {
  id: string;
  sopId: string;
  sopVersion: number;
  sopName?: string;
  tenantId: string;
  incidentId?: string;
  alertId?: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  startedBy: string;
  currentStepNumber: number;
  completedSteps: number;
  totalSteps: number;
  progress: number;
  slaDeadline?: string;
  slaStatus: string;
  escalated: boolean;
  stepResults: SOPStepResult[];
}

interface SOPDefinition {
  id: string;
  name: string;
  description?: string;
  steps: SOPStep[];
  slaMinutes?: number;
}

export function AISOPWorkflowInterface({ executionId }: { executionId?: string }) {
  const [execution, setExecution] = useState<SOPExecution | null>(null);
  const [sopDefinition, setSopDefinition] = useState<SOPDefinition | null>(null);
  const [currentStep, setCurrentStep] = useState<SOPStep | null>(null);
  const [currentStepResult, setCurrentStepResult] = useState<SOPStepResult | null>(null);
  const [stepResponse, setStepResponse] = useState<any>({});
  const [comments, setComments] = useState("");
  const [skipReason, setSkipReason] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (executionId) {
      loadExecution();
    }
  }, [executionId]);

  const loadExecution = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/control/v1/ai/sop-executions/${executionId}`, { credentials: "include" });
      const data = await response.json();
      setExecution(data.execution || data.data || data);

      // Load current step
      const stepResponse = await fetch(
        `/api/control/v1/ai/sop-executions/${executionId}/current-step`,
        { credentials: "include" }
      );
      const stepData = await stepResponse.json();
      setCurrentStep(stepData.step || stepData.data?.step);
      setCurrentStepResult(stepData.result || stepData.data?.result);
    } catch (error) {
      console.error("Failed to load SOP execution:", error);
    } finally {
      setLoading(false);
    }
  };

  const completeStep = async (result: string) => {
    if (!execution || !currentStep) return;

    setLoading(true);
    try {
      const response = await fetch(
        `/api/control/v1/ai/sop-executions/${execution.id}/steps/${currentStep.stepNumber}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            result,
            response: stepResponse,
            comments,
          }),
        }
      );

      const data = await response.json();
      setExecution(data.data || data);
      setStepResponse({});
      setComments("");

      // Reload to get next step
      await loadExecution();
    } catch (error) {
      console.error("Failed to complete step:", error);
    } finally {
      setLoading(false);
    }
  };

  const skipStep = async () => {
    if (!execution || !currentStep || currentStep.isMandatory) return;

    setLoading(true);
    try {
      const response = await fetch(
        `/api/control/v1/ai/sop-executions/${execution.id}/steps/${currentStep.stepNumber}/skip`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ reason: skipReason }),
        }
      );

      const data = await response.json();
      setExecution(data.data || data);
      setSkipReason("");

      // Reload to get next step
      await loadExecution();
    } catch (error) {
      console.error("Failed to skip step:", error);
    } finally {
      setLoading(false);
    }
  };

  const escalateExecution = async () => {
    if (!execution) return;

    const recipients = ["supervisor", "manager"]; // Would be dynamic
    const reason = "Requires supervisory attention";

    setLoading(true);
    try {
      await fetch(`/api/control/v1/ai/sop-executions/${execution.id}/escalate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason, recipients }),
      });

      await loadExecution();
    } catch (error) {
      console.error("Failed to escalate:", error);
    } finally {
      setLoading(false);
    }
  };

  const completeExecution = async () => {
    if (!execution) return;

    setLoading(true);
    try {
      await fetch(`/api/control/v1/ai/sop-executions/${execution.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ summary: "SOP completed successfully" }),
      });

      await loadExecution();
    } catch (error) {
      console.error("Failed to complete execution:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStepIcon = (stepType: string) => {
    switch (stepType) {
      case "phone-call":
        return <Phone className="h-5 w-5" />;
      case "video-verification":
        return <Video className="h-5 w-5" />;
      case "checklist":
        return <CheckSquare className="h-5 w-5" />;
      case "form":
        return <FileText className="h-5 w-5" />;
      case "notification":
        return <Send className="h-5 w-5" />;
      case "external-escalation":
        return <AlertTriangle className="h-5 w-5" />;
      default:
        return <Circle className="h-5 w-5" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "text-green-600 bg-green-50 border-green-200";
      case "in-progress":
        return "text-blue-600 bg-blue-50 border-blue-200";
      case "skipped":
        return "text-gray-600 bg-gray-50 border-gray-200";
      case "failed":
        return "text-red-600 bg-red-50 border-red-200";
      default:
        return "text-gray-400 bg-gray-50 border-gray-200";
    }
  };

  const getSLAStatusColor = (slaStatus: string) => {
    switch (slaStatus) {
      case "on-time":
        return "text-green-600";
      case "at-risk":
        return "text-orange-600";
      case "breached":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  if (!execution || !currentStep) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Circle className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-gray-500">Loading SOP workflow...</p>
        </div>
      </div>
    );
  }

  const isLastStep = currentStep.stepNumber === execution.totalSteps;
  const timeElapsed = Math.floor(
    (new Date().getTime() - new Date(execution.startedAt).getTime()) / 60000
  );

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">SOP Workflow</h1>
          <p className="text-gray-500 mt-1">{execution.sopName || "Standard Operating Procedure"}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge
            variant="outline"
            className={getSLAStatusColor(execution.slaStatus)}
          >
            {execution.slaStatus.toUpperCase()}
          </Badge>
          {execution.escalated && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Escalated
            </Badge>
          )}
        </div>
      </div>

      {/* Progress Overview */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500">Overall Progress</div>
                <div className="text-2xl font-bold">
                  Step {execution.currentStepNumber} of {execution.totalSteps}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-500">Time Elapsed</div>
                <div className="text-2xl font-bold">{timeElapsed} min</div>
              </div>
            </div>
            <Progress value={execution.progress} className="h-2" />
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>{execution.completedSteps} steps completed</span>
              <span>{execution.progress.toFixed(0)}% complete</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Steps Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {execution.stepResults.map((result, index) => {
              const step = sopDefinition?.steps.find((s) => s.stepNumber === result.stepNumber);
              if (!step) return null;

              const isCurrentStep = result.stepNumber === currentStep.stepNumber;
              const isPastStep = result.stepNumber < currentStep.stepNumber;

              return (
                <div
                  key={result.stepNumber}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    isCurrentStep ? "bg-blue-50 border-blue-200" : ""
                  } ${getStatusColor(result.status)}`}
                >
                  <div className="mt-0.5">
                    {result.status === "completed" ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : isCurrentStep ? (
                      <Circle className="h-5 w-5 text-blue-600 animate-pulse" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {getStepIcon(step.stepType)}
                      <span className="font-medium">
                        {result.stepNumber}. {step.title}
                      </span>
                      {step.isMandatory && (
                        <Badge variant="destructive" className="text-xs">
                          Mandatory
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{step.description}</p>
                    {result.status === "completed" && result.completedAt && (
                      <p className="text-xs text-gray-500 mt-1">
                        Completed at {new Date(result.completedAt).toLocaleTimeString()} by{" "}
                        {result.completedBy}
                      </p>
                    )}
                    {result.status === "skipped" && result.skipReason && (
                      <p className="text-xs text-gray-500 mt-1">Skipped: {result.skipReason}</p>
                    )}
                  </div>
                  {result.duration && (
                    <div className="text-sm text-gray-500">
                      <Clock className="h-4 w-4 inline mr-1" />
                      {result.duration}m
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Current Step Detail */}
      <Card className="border-2 border-blue-500">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {getStepIcon(currentStep.stepType)}
                Step {currentStep.stepNumber}: {currentStep.title}
                {currentStep.isMandatory && (
                  <Badge variant="destructive" className="ml-2">
                    Mandatory
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="mt-2">{currentStep.description}</CardDescription>
            </div>
            {currentStep.expectedDurationMinutes && (
              <div className="text-right">
                <div className="text-sm text-gray-500">Expected Duration</div>
                <div className="text-lg font-semibold">{currentStep.expectedDurationMinutes} min</div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Checklist */}
          {currentStep.stepType === "checklist" && currentStep.checklistItems && (
            <div className="space-y-2">
              <div className="font-medium mb-3">Checklist Items</div>
              {currentStep.checklistItems.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Checkbox
                    checked={stepResponse[`item-${index}`] || false}
                    onCheckedChange={(checked) =>
                      setStepResponse({ ...stepResponse, [`item-${index}`]: checked })
                    }
                  />
                  <label className="text-sm">{item}</label>
                </div>
              ))}
            </div>
          )}

          {/* Video Verification */}
          {currentStep.stepType === "video-verification" && (
            <div className="space-y-3">
              <div className="p-4 bg-gray-50 rounded-lg">
                <Video className="h-6 w-6 mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-center text-gray-600">
                  Open live camera feed to verify the situation
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  onClick={() => completeStep("confirmed")}
                  className="bg-green-50 hover:bg-green-100"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Confirmed
                </Button>
                <Button
                  variant="outline"
                  onClick={() => completeStep("false-alert")}
                  className="bg-yellow-50 hover:bg-yellow-100"
                >
                  False Alert
                </Button>
                <Button
                  variant="outline"
                  onClick={() => completeStep("unable-to-verify")}
                  className="bg-gray-50 hover:bg-gray-100"
                >
                  Unable to Verify
                </Button>
              </div>
            </div>
          )}

          {/* Phone Call */}
          {currentStep.stepType === "phone-call" && (
            <div className="space-y-3">
              <div className="p-4 bg-blue-50 rounded-lg flex items-center gap-3">
                <Phone className="h-6 w-6 text-blue-600" />
                <div>
                  <div className="font-medium">Call Required</div>
                  <p className="text-sm text-gray-600">Contact the designated person</p>
                </div>
              </div>
              <Button
                onClick={() => completeStep("call-completed")}
                className="w-full"
              >
                <Phone className="h-4 w-4 mr-2" />
                Mark Call as Completed
              </Button>
            </div>
          )}

          {/* Generic step types */}
          {!["checklist", "video-verification", "phone-call"].includes(currentStep.stepType) && (
            <div className="space-y-3">
              <Button
                onClick={() => completeStep("completed")}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Complete Step
              </Button>
            </div>
          )}

          {/* Comments */}
          <div>
            <label className="text-sm font-medium mb-2 block">Comments (Optional)</label>
            <Textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Add any notes or observations..."
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4 border-t">
            {!currentStep.isMandatory && (
              <div className="flex-1">
                <input
                  type="text"
                  value={skipReason}
                  onChange={(e) => setSkipReason(e.target.value)}
                  placeholder="Skip reason..."
                  className="w-full px-3 py-2 border rounded-md text-sm"
                />
                <Button
                  variant="outline"
                  onClick={skipStep}
                  disabled={!skipReason || loading}
                  className="w-full mt-2"
                >
                  <SkipForward className="h-4 w-4 mr-2" />
                  Skip This Step
                </Button>
              </div>
            )}

            <Button
              variant="outline"
              onClick={escalateExecution}
              disabled={loading}
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Escalate
            </Button>

            {isLastStep && execution.completedSteps === execution.totalSteps - 1 && (
              <Button
                onClick={completeExecution}
                disabled={loading}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Complete SOP
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* SLA Warning */}
      {execution.slaStatus === "at-risk" && (
        <Card className="border-orange-500 bg-orange-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              <div>
                <div className="font-medium text-orange-900">SLA At Risk</div>
                <p className="text-sm text-orange-700">
                  This SOP is approaching its deadline. Consider escalating if needed.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {execution.slaStatus === "breached" && (
        <Card className="border-red-500 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <div>
                <div className="font-medium text-red-900">SLA Breached</div>
                <p className="text-sm text-red-700">
                  This SOP has exceeded its deadline. Immediate escalation required.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

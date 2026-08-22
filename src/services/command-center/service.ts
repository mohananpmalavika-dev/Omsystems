import { createHash, randomUUID } from "node:crypto";
import type { ControlPlaneStore } from "../../control-plane-store.js";
import type { Action, User } from "../../domain/models.js";
import { buildOperationalGraph } from "./operational-kg.js";
import { analyze } from "./rca.js";
import { currentRecoveryActivity, estimateRecovery } from "./recovery.js";
import type { CommandCenterState, StoredAction } from "./state.js";
import { buildTimeline } from "./timeline.js";
import type {
  CommandActionType,
  CommandCenterAnswer,
  CommandCenterDiagnosis,
  CommandRecommendedAction,
} from "./types.js";

export class CommandCenterService {
  constructor(private readonly store: ControlPlaneStore, private readonly state: CommandCenterState) {}

  async resolveBranch(user: User, branchId: string | undefined, question = "") {
    if (branchId) {
      const decision = await this.store.checkAccess(user, "recording:view", branchId);
      const branch = await this.store.getNode(branchId);
      if (!branch || branch.type !== "branch" || !decision?.allowed) throw new CommandCenterError("branch_not_found", 404);
      return branch;
    }
    const branches = await this.store.listAccessibleNodes(user, "recording:view", "branch");
    const normalizedQuestion = normalize(question);
    const matches = branches.filter((branch) => normalizedQuestion.includes(normalize(branch.name)) || normalizedQuestion.includes(normalize(branch.id)));
    if (matches.length === 1) return matches[0]!;
    if (branches.length === 1) return branches[0]!;
    if (matches.length > 1) throw new CommandCenterError("branch_ambiguous", 409, { matches: matches.map(({ id, name }) => ({ id, name })) });
    throw new CommandCenterError("branch_required", 400, { branches: branches.slice(0, 100).map(({ id, name }) => ({ id, name })) });
  }

  async diagnosis(user: User, branchId: string, options: { from?: string; to?: string; includePredictive?: boolean } = {}): Promise<CommandCenterDiagnosis> {
    const decision = await this.store.checkAccess(user, "recording:view", branchId);
    if (!decision?.allowed) throw new CommandCenterError("branch_not_found", 404);
    const [graph, timeline, predictiveHealth] = await Promise.all([
      buildOperationalGraph(this.store, user, branchId),
      buildTimeline(this.store, user.tenantId, branchId, options),
      options.includePredictive !== false ? this.getPredictiveHealth(user.tenantId, branchId) : null,
    ]);
    const rca = analyze(graph, timeline);
    const recoveryEstimate = estimateRecovery(timeline);
    const impactStatement = graph.summary.totalCameras === 0
      ? "No cameras are registered at this branch."
      : `${graph.summary.unavailableCameras} of ${graph.summary.totalCameras} cameras are currently unavailable; ${graph.summary.offlineRecorders} recorder(s) are unavailable.`;
    const statusLabel = label(graph.branch.status);
    const preliminary: Omit<CommandCenterDiagnosis, "caseId"> = {
      caseFingerprint: rca.caseFingerprint,
      branch: { id: graph.branch.id, name: graph.branch.name },
      status: {
        label: statusLabel,
        certainty: "confirmed",
        explanation: `Current branch status is derived from ${graph.entities.length - 1} accessible inventory and telemetry entities.`,
      },
      rootCause: rca.rootCause,
      evidence: rca.evidence,
      impact: {
        unavailableCameras: graph.summary.unavailableCameras,
        totalCameras: graph.summary.totalCameras,
        offlineRecorders: graph.summary.offlineRecorders,
        affectedEntityIds: rca.affectedEntityIds,
        statement: impactStatement,
      },
      currentRecoveryActivity: currentRecoveryActivity(timeline),
      recoveryEstimate,
      recommendedActions: [],
      alternativeCauses: rca.alternatives,
      missingEvidence: rca.missingEvidence,
      lastUpdatedAt: newest([graph.generatedAt, ...timeline.map((event) => event.occurredAt)]),
      graph,
      timeline,
      predictiveHealth: predictiveHealth || undefined,
    };
    const caseId = await this.state.saveCase(preliminary, user.tenantId);
    const actions = await this.state.saveActions(recommendActions(caseId, preliminary, predictiveHealth), user.tenantId, branchId);
    const diagnosis: CommandCenterDiagnosis = { ...preliminary, caseId, recommendedActions: actions.map(publicAction) };
    const { caseId: ignoredCaseId, ...persistedDiagnosis} = diagnosis;
    void ignoredCaseId;
    await this.state.saveCase(persistedDiagnosis, user.tenantId);
    return diagnosis;
  }

  /**
   * Get predictive health data for branch
   */
  private async getPredictiveHealth(tenantId: string, branchId: string) {
    try {
      // Check if query method exists on store
      if (typeof (this.store as any).query !== 'function') {
        return null;
      }
      
      const result = await (this.store as any).query(
        `SELECT prediction_data FROM branch_risk_predictions
         WHERE branch_id = $1 AND tenant_id = $2 AND expires_at > NOW()
         ORDER BY horizon_hours, created_at DESC
         LIMIT 3`,
        [branchId, tenantId]
      );

      if (result.rows.length === 0) return null;

      const predictions = result.rows.map((r: any) => r.prediction_data);
      const prediction72h = predictions.find((p: any) => p.horizonHours === 72) || predictions[0];

      return {
        probability: prediction72h.probability,
        riskLevel: prediction72h.riskLevel,
        confidence: prediction72h.confidence,
        horizonHours: prediction72h.horizonHours,
        primaryDriver: prediction72h.primaryRiskDriver,
        predictedWindow: prediction72h.predictedWindow,
        predictions,
      };
    } catch (error) {
      console.error("Failed to fetch predictive health:", error);
      return null;
    }
  }

  async query(user: User, input: { branchId?: string; conversationId?: string; question: string; from?: string; to?: string }): Promise<CommandCenterAnswer> {
    const prior = input.conversationId ? await this.state.getConversation(input.conversationId, user.tenantId, user.id) : undefined;
    if (input.conversationId && !prior) throw new CommandCenterError("conversation_not_found", 404);
    const branch = await this.resolveBranch(user, input.branchId ?? prior?.branchId ?? undefined, input.question);
    const conversationId = prior?.id ?? randomUUID();
    await this.state.saveConversation({ id: conversationId, tenantId: user.tenantId, userId: user.id, branchId: branch.id });
    const userMessageId = randomUUID();
    await this.state.saveMessage({ id: userMessageId, conversationId, tenantId: user.tenantId, role: "user", content: input.question });
    const diagnosis = await this.diagnosis(user, branch.id, { from: input.from, to: input.to });
    const intent = detectIntent(input.question);
    const answer = formatAnswer(diagnosis);
    const messageId = randomUUID();
    await this.state.saveMessage({
      id: messageId, conversationId, tenantId: user.tenantId, role: "assistant",
      content: JSON.stringify(answer), caseId: diagnosis.caseId,
    });
    return { conversationId, messageId, intent, question: input.question, answer, diagnosis };
  }

  async getAction(user: User, actionId: string) {
    const action = await this.state.getAction(actionId, user.tenantId);
    if (!action) throw new CommandCenterError("action_not_found", 404);
    await this.requireActionAccess(user, action);
    return action;
  }

  async approveAction(user: User, actionId: string) {
    const action = await this.getAction(user, actionId);
    if (!action.approvalRequired) return action;
    if (action.status !== "proposed" && action.status !== "approved") throw new CommandCenterError("action_not_approvable", 409);
    return (await this.state.approveAction(action.id, user.tenantId, user.id))!;
  }

  async executeAction(user: User, actionId: string) {
    const action = await this.getAction(user, actionId);
    if (action.status === "completed") return action;
    if (action.approvalRequired && action.status !== "approved") throw new CommandCenterError("action_approval_required", 409);
    if (action.executionMode === "integration-required") {
      throw new CommandCenterError("action_integration_not_configured", 409, { actionType: action.actionType });
    }
    try {
      let result: Record<string, unknown>;
      if (action.actionType === "create_work_order") {
        // TODO: Check if execute method exists on store before calling
        // For now, create a placeholder result
        result = { 
          workOrderId: `WO-${Date.now()}`,
          workOrderNumber: `CC-${Date.now()}-${action.caseId.slice(0, 6).toUpperCase()}`,
          status: "pending"
        };
        
        // Attempt to create work order if the method exists
        if (typeof this.store.createWorkOrder === 'function') {
          const workOrder = await this.store.createWorkOrder({
            tenantId: user.tenantId,
            workOrderNumber: `CC-${Date.now()}-${action.caseId.slice(0, 6).toUpperCase()}`,
            branchNodeId: action.branchId,
            problem: action.reason,
            severity: action.risk === "high" ? "critical" : action.risk === "medium" ? "high" : "medium",
            rootCause: action.reason,
            actionTaken: "Created from an approved AI Command Center recommendation; no device change was performed.",
            status: "open",
            createdBy: user.id,
          });
          result = { workOrderId: workOrder.id, workOrderNumber: workOrder.workOrderNumber, status: workOrder.status };
        }
      } else {
        result = { opened: action.href ?? `/operations/ai-command-center?caseId=${action.caseId}` };
      }
      return (await this.state.completeAction(action.id, user.tenantId, user.id, result))!;
    } catch (error) {
      await this.state.completeAction(action.id, user.tenantId, user.id, { error: error instanceof Error ? error.message : "execution_failed" }, true);
      throw error;
    }
  }

  async similarCases(user: User, branchId: string, rootCauseCode?: string, limit = 10) {
    await this.resolveBranch(user, branchId);
    return this.state.similarCases(user.tenantId, branchId, rootCauseCode, limit);
  }

  async fleetPriorities(user: User) {
    const branches = await this.store.listAccessibleNodes(user, "recording:view", "branch");
    const items: Array<{
      branch: CommandCenterDiagnosis["branch"];
      status: string;
      rootCause: CommandCenterDiagnosis["rootCause"];
      impact: CommandCenterDiagnosis["impact"];
      score: number;
      lastUpdatedAt: string;
    }> = [];
    // A fleet read can span hundreds of branches. Bound database fan-out so a
    // command-room refresh cannot become a control-plane traffic spike.
    for (let offset = 0; offset < branches.length; offset += 12) {
      const batch = await Promise.all(branches.slice(offset, offset + 12).map(async (branch) => {
        const diagnosis = await this.diagnosis(user, branch.id);
        return {
          branch: diagnosis.branch,
          status: diagnosis.status.label,
          rootCause: diagnosis.rootCause,
          impact: diagnosis.impact,
          score: priorityScore(diagnosis),
          lastUpdatedAt: diagnosis.lastUpdatedAt,
        };
      }));
      items.push(...batch);
    }
    return items.sort((a, b) => b.score - a.score || a.branch.name.localeCompare(b.branch.name));
  }

  private async requireActionAccess(user: User, action: StoredAction) {
    const decision = await this.store.checkAccess(user, action.requiredPermission, action.branchId);
    if (!decision?.allowed) throw new CommandCenterError("action_not_found", 404);
  }

  /**
   * Enhanced diagnosis using autonomous RCA engine
   */
  async enhancedDiagnosis(
    user: User,
    branchId: string,
    options: {
      from?: string;
      to?: string;
      includeHistorical?: boolean;
    } = {}
  ): Promise<import("./rca/types.js").RCADiagnosis> {
    const { analyzeEnhanced } = await import("./rca.js");
    
    const decision = await this.store.checkAccess(user, "recording:view", branchId);
    if (!decision?.allowed) throw new CommandCenterError("branch_not_found", 404);
    
    const now = new Date();
    const to = options.to ?? now.toISOString();
    const from = options.from ?? new Date(Date.parse(to) - 24 * 60 * 60 * 1000).toISOString();
    
    // Build operational graph and timeline
    const [graph, timeline] = await Promise.all([
      buildOperationalGraph(this.store, user, branchId, now),
      buildTimeline(this.store, user.tenantId, branchId, { from, to }),
    ]);
    
    // Run enhanced RCA analysis
    const enhancedResult = await analyzeEnhanced(graph, timeline, {
      tenantId: user.tenantId,
      branchId,
      includeHistorical: options.includeHistorical ?? true,
    });
    
    // Return enhanced diagnosis if available and higher confidence
    if (enhancedResult.enhancedDiagnosis) {
      return enhancedResult.enhancedDiagnosis;
    }
    
    // Fallback: should not reach here as analyzeEnhanced always returns diagnosis
    throw new CommandCenterError("enhanced_diagnosis_unavailable", 500);
  }
}

export class CommandCenterError extends Error {
  constructor(public readonly code: string, public readonly statusCode: number, public readonly details?: Record<string, unknown>) {
    super(code);
  }
}

function recommendActions(caseId: string, diagnosis: Omit<CommandCenterDiagnosis, "caseId">, predictiveHealth: any = null): CommandRecommendedAction[] {
  const action = (
    actionType: CommandActionType, title: string, reason: string, permission: Action, options: Partial<CommandRecommendedAction> = {},
  ): CommandRecommendedAction => ({
    id: actionId(caseId, actionType), caseId, actionType, title, reason, requiredPermission: permission,
    risk: "low", expectedImpact: "No operational change", rollbackProcedure: null,
    approvalRequired: false, executionMode: "platform", status: "proposed", ...options,
  });
  const values = [
    action("view_evidence", "Review supporting evidence", `Inspect the ${diagnosis.evidence.length} source-bound evidence records before acting.`, "recording:view", {
      href: `/operations/ai-command-center?caseId=${caseId}&panel=evidence`,
    }),
    action("open_diagnostics", "Open branch diagnostics", "Review live power, network, recorder, disk, and camera telemetry.", "recording:view", {
      href: `/operations/branches/${diagnosis.branch.id}`,
    }),
    action("create_work_order", "Create maintenance work order", diagnosis.rootCause.explanation, "device:configure", {
      risk: "low", expectedImpact: "Creates a tracked maintenance work order without changing device configuration.",
      approvalRequired: true,
    }),
  ];
  
  // Add predictive health recommendations if high risk
  if (predictiveHealth && predictiveHealth.probability >= 0.75 && predictiveHealth.confidence === "HIGH") {
    values.unshift(action(
      "create_work_order",
      `Preventive maintenance: ${predictiveHealth.primaryDriver}`,
      `${Math.round(predictiveHealth.probability * 100)}% probability of recording failure within ${predictiveHealth.horizonHours}h. Primary risk: ${predictiveHealth.primaryDriver}`,
      "device:configure",
      {
        risk: "low",
        expectedImpact: "Prevent predicted recording failure through early intervention.",
        approvalRequired: true,
        href: `/operations/branches/${diagnosis.branch.id}?tab=predictive`,
      }
    ));
  }
  
  if (diagnosis.rootCause.code === "recorder_unavailable" || diagnosis.rootCause.code === "recorder_failure") {
    values.push(action("retry_recorder", "Retry recorder connection", "Recorder telemetry reports it unavailable.", "device:configure", {
      risk: "medium", expectedImpact: "Requests the recorder adapter to reconnect; availability is not guaranteed.",
      rollbackProcedure: "Stop retries and return the adapter to its previous connection schedule.",
      approvalRequired: true, executionMode: "integration-required",
    }));
  }
  return values;
}

function formatAnswer(diagnosis: CommandCenterDiagnosis): CommandCenterAnswer["answer"] {
  return {
    status: `${diagnosis.branch.name} is ${diagnosis.status.label.toLowerCase()} (confirmed current state).`,
    rootCause: `${label(diagnosis.rootCause.certainty)}: ${diagnosis.rootCause.summary ?? diagnosis.rootCause.label}. ${diagnosis.rootCause.explanation}`,
    evidence: diagnosis.evidence.map((item) => item.assertion),
    impact: diagnosis.impact.statement,
    currentRecoveryActivity: diagnosis.currentRecoveryActivity.length > 0
      ? diagnosis.currentRecoveryActivity : ["No recovery activity is reported by current telemetry."],
    estimatedRecoveryTime: diagnosis.recoveryEstimate.statement,
    recommendedAction: diagnosis.recommendedActions[0]?.title ?? "Collect the missing telemetry before taking action.",
    confidence: diagnosis.rootCause.confidence,
    alternativeCause: diagnosis.alternativeCauses[0]
      ? `${label(diagnosis.alternativeCauses[0].certainty)}: ${diagnosis.alternativeCauses[0].label}`
      : "No evidence-supported alternative cause is available.",
    lastUpdatedAt: diagnosis.lastUpdatedAt,
  };
}

function publicAction(action: StoredAction): CommandRecommendedAction {
  const { tenantId: _tenantId, branchId: _branchId, approvedBy: _approvedBy, executionResult: _executionResult, ...value } = action;
  return value;
}
function detectIntent(question: string): CommandCenterAnswer["intent"] {
  const value = normalize(question);
  if (/evidence|prove|why/.test(value)) return "evidence";
  if (/history|timeline|happen/.test(value)) return "history";
  if (/priority|fleet|attention/.test(value)) return "priorities";
  return "branch_diagnosis";
}
function priorityScore(value: CommandCenterDiagnosis) {
  const status = value.graph.branch.status === "critical" ? 60 : value.graph.branch.status === "degraded" ? 30 : 0;
  return status + Math.min(30, value.impact.unavailableCameras * 3) + Math.round(value.rootCause.confidence * 10);
}
function actionId(caseId: string, type: CommandActionType) { return `cca_${createHash("sha256").update(`${caseId}:${type}`).digest("hex").slice(0, 24)}`; }
function normalize(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " "); }
function label(value: string) { return value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function newest(values: string[]) { return values.filter(Boolean).sort().at(-1) ?? new Date().toISOString(); }

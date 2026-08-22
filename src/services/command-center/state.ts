import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { CommandCenterDiagnosis, CommandRecommendedAction } from "./types.js";

export interface ConversationRecord {
  id: string;
  tenantId: string;
  userId: string;
  branchId: string | null;
}

export interface StoredAction extends CommandRecommendedAction {
  tenantId: string;
  branchId: string;
  approvedBy?: string;
  executionResult?: Record<string, unknown>;
}

export interface SimilarCase {
  id: string;
  branchId: string;
  rootCauseCode: string;
  certainty: string;
  confidence: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
}

export interface CommandCenterState {
  getConversation(id: string, tenantId: string, userId: string): Promise<ConversationRecord | undefined>;
  saveConversation(input: ConversationRecord): Promise<void>;
  saveMessage(input: { id: string; conversationId: string; tenantId: string; role: "user" | "assistant"; content: string; caseId?: string }): Promise<void>;
  saveCase(diagnosis: Omit<CommandCenterDiagnosis, "caseId">, tenantId: string): Promise<string>;
  saveActions(actions: CommandRecommendedAction[], tenantId: string, branchId: string): Promise<StoredAction[]>;
  getAction(id: string, tenantId: string): Promise<StoredAction | undefined>;
  approveAction(id: string, tenantId: string, userId: string): Promise<StoredAction | undefined>;
  completeAction(id: string, tenantId: string, userId: string, result: Record<string, unknown>, failed?: boolean): Promise<StoredAction | undefined>;
  similarCases(tenantId: string, branchId: string, rootCauseCode?: string, limit?: number): Promise<SimilarCase[]>;
}

export function createCommandCenterState(store: unknown): CommandCenterState {
  const pool = (store as { db?: Pool }).db;
  return pool ? new PostgresCommandCenterState(pool) : new MemoryCommandCenterState();
}

export class MemoryCommandCenterState implements CommandCenterState {
  private readonly conversations = new Map<string, ConversationRecord>();
  private readonly actions = new Map<string, StoredAction>();
  private readonly cases = new Map<string, SimilarCase & { fingerprint: string; tenantId: string }>();

  async getConversation(id: string, tenantId: string, userId: string) {
    const value = this.conversations.get(id);
    return value?.tenantId === tenantId && value.userId === userId ? value : undefined;
  }
  async saveConversation(input: ConversationRecord) { this.conversations.set(input.id, input); }
  async saveMessage(_input: { id: string; conversationId: string; tenantId: string; role: "user" | "assistant"; content: string; caseId?: string }) {}
  async saveCase(diagnosis: Omit<CommandCenterDiagnosis, "caseId">, tenantId: string) {
    const existing = [...this.cases.values()].find((item) => item.fingerprint === diagnosis.caseFingerprint && item.branchId === diagnosis.branch.id);
    const id = existing?.id ?? randomUUID();
    this.cases.set(id, {
      id, tenantId, branchId: diagnosis.branch.id, fingerprint: diagnosis.caseFingerprint,
      rootCauseCode: diagnosis.rootCause.code, certainty: diagnosis.rootCause.certainty,
      confidence: diagnosis.rootCause.confidence, firstSeenAt: existing?.firstSeenAt ?? diagnosis.lastUpdatedAt,
      lastSeenAt: diagnosis.lastUpdatedAt, resolvedAt: null,
    });
    return id;
  }
  async saveActions(actions: CommandRecommendedAction[], tenantId: string, branchId: string) {
    return actions.map((action) => {
      const previous = this.actions.get(action.id);
      const stored: StoredAction = { ...action, status: previous?.status ?? action.status, tenantId, branchId, approvedBy: previous?.approvedBy, executionResult: previous?.executionResult };
      this.actions.set(action.id, stored);
      return stored;
    });
  }
  async getAction(id: string, tenantId: string) {
    const value = this.actions.get(id);
    return value?.tenantId === tenantId ? value : undefined;
  }
  async approveAction(id: string, tenantId: string, userId: string) {
    const value = await this.getAction(id, tenantId);
    if (!value || value.status !== "proposed") return value;
    Object.assign(value, { status: "approved", approvedBy: userId });
    return value;
  }
  async completeAction(id: string, tenantId: string, _userId: string, result: Record<string, unknown>, failed = false) {
    const value = await this.getAction(id, tenantId);
    if (!value) return undefined;
    Object.assign(value, { status: failed ? "failed" : "completed", executionResult: result });
    return value;
  }
  async similarCases(tenantId: string, branchId: string, rootCauseCode?: string, limit = 10) {
    return [...this.cases.values()]
      .filter((item) => item.tenantId === tenantId && item.branchId === branchId && (!rootCauseCode || item.rootCauseCode === rootCauseCode))
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)).slice(0, limit);
  }
}

class PostgresCommandCenterState implements CommandCenterState {
  constructor(private readonly pool: Pool) {}

  async getConversation(id: string, tenantId: string, userId: string) {
    const result = await this.pool.query(
      `SELECT id, tenant_id, user_id, branch_node_id FROM command_center_conversations WHERE id=$1 AND tenant_id=$2 AND user_id=$3`,
      [id, tenantId, userId],
    );
    const row = result.rows[0];
    return row ? { id: row.id, tenantId: row.tenant_id, userId: row.user_id, branchId: row.branch_node_id } : undefined;
  }
  async saveConversation(input: ConversationRecord) {
    await this.pool.query(
      `INSERT INTO command_center_conversations (id, tenant_id, user_id, branch_node_id) VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET branch_node_id=EXCLUDED.branch_node_id, updated_at=now()`,
      [input.id, input.tenantId, input.userId, input.branchId],
    );
  }
  async saveMessage(input: { id: string; conversationId: string; tenantId: string; role: "user" | "assistant"; content: string; caseId?: string }) {
    await this.pool.query(
      `INSERT INTO command_center_messages (id, conversation_id, tenant_id, role, content, diagnosis_case_id) VALUES ($1,$2,$3,$4,$5,$6)`,
      [input.id, input.conversationId, input.tenantId, input.role, input.content, input.caseId ?? null],
    );
  }
  async saveCase(diagnosis: Omit<CommandCenterDiagnosis, "caseId">, tenantId: string) {
    const id = randomUUID();
    const result = await this.pool.query(
      `INSERT INTO root_cause_cases (id, tenant_id, branch_node_id, fingerprint, root_cause_code, certainty, confidence, diagnosis)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (tenant_id, fingerprint) DO UPDATE SET root_cause_code=EXCLUDED.root_cause_code, certainty=EXCLUDED.certainty,
         confidence=EXCLUDED.confidence, diagnosis=EXCLUDED.diagnosis, last_seen_at=now()
       RETURNING id`,
      [id, tenantId, diagnosis.branch.id, diagnosis.caseFingerprint, diagnosis.rootCause.code, diagnosis.rootCause.certainty, diagnosis.rootCause.confidence, JSON.stringify(diagnosis)],
    );
    const caseId = result.rows[0].id as string;
    for (const evidence of diagnosis.evidence) {
      await this.pool.query(
        `INSERT INTO root_cause_evidence (case_id, evidence_id, source, observed_at, assertion, payload) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (case_id, evidence_id) DO UPDATE SET assertion=EXCLUDED.assertion, payload=EXCLUDED.payload`,
        [caseId, evidence.id, evidence.source, evidence.observedAt, evidence.assertion, JSON.stringify(evidence.raw)],
      );
    }
    return caseId;
  }
  async saveActions(actions: CommandRecommendedAction[], tenantId: string, branchId: string) {
    const saved: StoredAction[] = [];
    for (const action of actions) {
      const result = await this.pool.query(
        `INSERT INTO recommended_actions (id, case_id, tenant_id, action_type, payload, status) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET payload=EXCLUDED.payload, updated_at=now() RETURNING *`,
        [action.id, action.caseId, tenantId, action.actionType, JSON.stringify({ ...action, branchId }), action.status],
      );
      saved.push(rowAction(result.rows[0]));
    }
    return saved;
  }
  async getAction(id: string, tenantId: string) {
    const result = await this.pool.query(`SELECT * FROM recommended_actions WHERE id=$1 AND tenant_id=$2`, [id, tenantId]);
    return result.rows[0] ? rowAction(result.rows[0]) : undefined;
  }
  async approveAction(id: string, tenantId: string, userId: string) {
    const result = await this.pool.query(
      `UPDATE recommended_actions SET status='approved', approved_by=$3, approved_at=now(), updated_at=now()
       WHERE id=$1 AND tenant_id=$2 AND status='proposed' RETURNING *`, [id, tenantId, userId],
    );
    return result.rows[0] ? rowAction(result.rows[0]) : this.getAction(id, tenantId);
  }
  async completeAction(id: string, tenantId: string, userId: string, executionResult: Record<string, unknown>, failed = false) {
    const result = await this.pool.query(
      `UPDATE recommended_actions SET status=$4, executed_by=$3, executed_at=now(), execution_result=$5, updated_at=now()
       WHERE id=$1 AND tenant_id=$2 RETURNING *`,
      [id, tenantId, userId, failed ? "failed" : "completed", JSON.stringify(executionResult)],
    );
    return result.rows[0] ? rowAction(result.rows[0]) : undefined;
  }
  async similarCases(tenantId: string, branchId: string, rootCauseCode?: string, limit = 10) {
    const result = await this.pool.query(
      `SELECT id, branch_node_id, root_cause_code, certainty, confidence, first_seen_at, last_seen_at, resolved_at
       FROM root_cause_cases WHERE tenant_id=$1 AND branch_node_id=$2 AND ($3::text IS NULL OR root_cause_code=$3)
       ORDER BY last_seen_at DESC LIMIT $4`, [tenantId, branchId, rootCauseCode ?? null, limit],
    );
    return result.rows.map((row) => ({
      id: row.id, branchId: row.branch_node_id, rootCauseCode: row.root_cause_code, certainty: row.certainty,
      confidence: Number(row.confidence), firstSeenAt: row.first_seen_at.toISOString(), lastSeenAt: row.last_seen_at.toISOString(),
      resolvedAt: row.resolved_at?.toISOString() ?? null,
    }));
  }
}

function rowAction(row: Record<string, any>): StoredAction {
  const payload = row.payload as CommandRecommendedAction & { branchId: string };
  return {
    ...payload, id: row.id, caseId: row.case_id, actionType: row.action_type, status: row.status,
    tenantId: row.tenant_id, branchId: payload.branchId, approvedBy: row.approved_by ?? undefined,
    executionResult: row.execution_result ?? undefined,
  };
}

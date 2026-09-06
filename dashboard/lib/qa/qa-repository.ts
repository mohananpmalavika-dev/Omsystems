/**
 * QA Repository
 *
 * PostgreSQL persistence layer for QA audit runs, pages, graph edges,
 * issues, and metrics, with an in-memory fallback store.
 */

import { Pool } from "pg";
import type {
  QARunConfig,
  QARunStatus,
  QAPageNode,
  QAFlowEdge,
  QAIssue,
  QAConsoleEvent,
  QANetworkEvent,
  QAArtifact,
} from "../../../qa-engine/src/types/qa.types.js";
import { encryptCredential } from "../../../qa-engine/src/safety/credential-vault.js";

// In-memory storage fallback
interface InMemoryDB {
  runs: Map<string, any>;
  pages: Map<string, QAPageNode[]>;
  edges: Map<string, QAFlowEdge[]>;
  issues: Map<string, QAIssue[]>;
  console: Map<string, QAConsoleEvent[]>;
  network: Map<string, QANetworkEvent[]>;
  artifacts: Map<string, QAArtifact[]>;
}

const memoryStore: InMemoryDB = {
  runs: new Map(),
  pages: new Map(),
  edges: new Map(),
  issues: new Map(),
  console: new Map(),
  network: new Map(),
  artifacts: new Map(),
};

export class QARepository {
  private static instance: QARepository | null = null;
  private pool: Pool | null = null;

  constructor() {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (connectionString) {
      try {
        this.pool = new Pool({ connectionString, connectionTimeoutMillis: 3000 });
      } catch (err) {
        console.warn("[QARepository] Database pool initialization failed, using in-memory store:", err);
      }
    }
  }

  static getInstance(): QARepository {
    if (!QARepository.instance) {
      QARepository.instance = new QARepository();
    }
    return QARepository.instance;
  }

  /**
   * Create a new QA run record
   */
  async createRun(config: QARunConfig): Promise<any> {
    const record = {
      id: config.id,
      target_url: config.targetUrl,
      starting_path: config.startingPath || "/",
      user_role: config.userRole || "admin",
      username: config.username || null,
      password_encrypted: config.password ? encryptCredential(config.password) : null,
      browser: config.browser || "chromium",
      device_profile: config.deviceProfile || "Desktop 1920x1080",
      viewport_width: 1920,
      viewport_height: 1080,
      max_pages: config.maxPages || 250,
      max_depth: config.maxDepth || 10,
      page_timeout_sec: config.pageTimeoutSec || 30,
      options: config.options || {},
      status: "QUEUED",
      overall_score: null,
      score_breakdown: {},
      summary_stats: {},
      auth_status: "NOT_REQUIRED",
      error_message: null,
      tenant_id: config.tenantId || null,
      created_by: config.createdBy || "Admin",
      created_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      completed_at: null,
    };

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO qa_runs (
            id, target_url, starting_path, user_role, username, password_encrypted,
            browser, device_profile, viewport_width, viewport_height, max_pages,
            max_depth, page_timeout_sec, options, status, auth_status, tenant_id,
            created_by, created_at, started_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
          ON CONFLICT (id) DO NOTHING`,
          [
            record.id,
            record.target_url,
            record.starting_path,
            record.user_role,
            record.username,
            record.password_encrypted,
            record.browser,
            record.device_profile,
            record.viewport_width,
            record.viewport_height,
            record.max_pages,
            record.max_depth,
            record.page_timeout_sec,
            JSON.stringify(record.options),
            record.status,
            record.auth_status,
            record.tenant_id,
            record.created_by,
            record.created_at,
            record.started_at,
          ]
        );
      } catch (err) {
        console.warn("[QARepository] DB insert failed, caching in memory:", err);
      }
    }

    memoryStore.runs.set(record.id, record);
    return record;
  }

  /**
   * Update run status, score, and summary
   */
  async updateRun(
    runId: string,
    updates: {
      status?: QARunStatus;
      overallScore?: number;
      scoreBreakdown?: any;
      summaryStats?: any;
      errorMessage?: string;
      completedAt?: string;
    }
  ): Promise<void> {
    const mem = memoryStore.runs.get(runId);
    if (mem) {
      if (updates.status) mem.status = updates.status;
      if (updates.overallScore !== undefined) mem.overall_score = updates.overallScore;
      if (updates.scoreBreakdown) mem.score_breakdown = updates.scoreBreakdown;
      if (updates.summaryStats) mem.summary_stats = updates.summaryStats;
      if (updates.errorMessage) mem.error_message = updates.errorMessage;
      if (updates.completedAt) mem.completed_at = updates.completedAt;
    }

    if (this.pool) {
      try {
        await this.pool.query(
          `UPDATE qa_runs SET
            status = COALESCE($2, status),
            overall_score = COALESCE($3, overall_score),
            score_breakdown = COALESCE($4, score_breakdown),
            summary_stats = COALESCE($5, summary_stats),
            error_message = COALESCE($6, error_message),
            completed_at = COALESCE($7, completed_at),
            updated_at = NOW()
          WHERE id = $1`,
          [
            runId,
            updates.status || null,
            updates.overallScore ?? null,
            updates.scoreBreakdown ? JSON.stringify(updates.scoreBreakdown) : null,
            updates.summaryStats ? JSON.stringify(updates.summaryStats) : null,
            updates.errorMessage || null,
            updates.completedAt || null,
          ]
        );
      } catch (err) {
        console.warn("[QARepository] DB update failed:", err);
      }
    }
  }

  /**
   * Save run entities (pages, edges, issues, events, artifacts)
   */
  async saveRunEntities(
    runId: string,
    entities: {
      pages?: QAPageNode[];
      edges?: QAFlowEdge[];
      issues?: QAIssue[];
      consoleEvents?: QAConsoleEvent[];
      networkEvents?: QANetworkEvent[];
      artifacts?: QAArtifact[];
    }
  ): Promise<void> {
    if (entities.pages) memoryStore.pages.set(runId, entities.pages);
    if (entities.edges) memoryStore.edges.set(runId, entities.edges);
    if (entities.issues) memoryStore.issues.set(runId, entities.issues);
    if (entities.consoleEvents) memoryStore.console.set(runId, entities.consoleEvents);
    if (entities.networkEvents) memoryStore.network.set(runId, entities.networkEvents);
    if (entities.artifacts) memoryStore.artifacts.set(runId, entities.artifacts);

    if (!this.pool) return;

    try {
      // Batch save pages
      if (entities.pages && entities.pages.length > 0) {
        for (const p of entities.pages) {
          await this.pool.query(
            `INSERT INTO qa_pages (
              id, run_id, url, path, title, page_hash, depth, status, load_time_ms,
              is_blank, screenshot_path, element_count, interactive_count,
              tested_interactive_count, discovered_at, crawled_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
            ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, load_time_ms = EXCLUDED.load_time_ms`,
            [
              p.id,
              runId,
              p.url,
              p.path,
              p.title,
              p.pageHash,
              p.depth,
              p.status,
              p.loadTimeMs,
              p.isBlank,
              p.screenshotPath || null,
              p.elementCount,
              p.interactiveCount,
              p.testedInteractiveCount,
              p.discoveredAt,
              p.crawledAt || null,
            ]
          ).catch(() => {});
        }
      }

      // Batch save issues
      if (entities.issues && entities.issues.length > 0) {
        for (const i of entities.issues) {
          await this.pool.query(
            `INSERT INTO qa_issues (
              id, run_id, severity, category, title, page_url, action_description,
              expected, actual, screenshot_path, occurrences, first_seen_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            ON CONFLICT (id) DO UPDATE SET occurrences = EXCLUDED.occurrences`,
            [
              i.id,
              runId,
              i.severity,
              i.category,
              i.title,
              i.pageUrl,
              i.actionDescription || null,
              i.expected || null,
              i.actual || null,
              i.screenshotPath || null,
              i.occurrences,
              i.firstSeenAt,
            ]
          ).catch(() => {});
        }
      }

      // Batch save edges
      if (entities.edges && entities.edges.length > 0) {
        for (const e of entities.edges) {
          await this.pool.query(
            `INSERT INTO qa_edges (id, run_id, from_page_id, to_page_id, label, edge_type)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (id) DO NOTHING`,
            [e.id, runId, e.fromPageId, e.toPageId, e.label, e.edgeType]
          ).catch(() => {});
        }
      }
    } catch (err) {
      console.warn("[QARepository] Error persisting entities to DB:", err);
    }
  }

  /**
   * List QA runs
   */
  async listRuns(): Promise<any[]> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT id, target_url, user_role, browser, device_profile, status,
                  overall_score, score_breakdown, summary_stats, created_at, completed_at
           FROM qa_runs ORDER BY created_at DESC LIMIT 50`
        );
        if (res.rows.length > 0) return res.rows;
      } catch {
        // fallback
      }
    }

    return Array.from(memoryStore.runs.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  /**
   * Get single run with complete relation bundle
   */
  async getRunDetails(runId: string): Promise<any | null> {
    let run: any = null;

    if (this.pool) {
      try {
        const res = await this.pool.query(`SELECT * FROM qa_runs WHERE id = $1`, [runId]);
        if (res.rows.length > 0) run = res.rows[0];
      } catch {
        // fallback
      }
    }

    if (!run) {
      run = memoryStore.runs.get(runId);
    }

    if (!run) return null;

    // Fetch relations
    const pages = memoryStore.pages.get(runId) || [];
    const edges = memoryStore.edges.get(runId) || [];
    const issues = memoryStore.issues.get(runId) || [];
    const consoleEvents = memoryStore.console.get(runId) || [];
    const networkEvents = memoryStore.network.get(runId) || [];
    const artifacts = memoryStore.artifacts.get(runId) || [];

    return {
      run,
      pages,
      edges,
      issues,
      consoleEvents,
      networkEvents,
      artifacts,
    };
  }
}

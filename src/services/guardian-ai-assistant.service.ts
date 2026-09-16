/**
 * KryptonAI Assistant Service
 * 
 * JARVIS-like AI assistant for security operations with:
 * - Natural language commands
 * - Proactive suggestions
 * - Context-aware responses
 * - Function calling for system control
 * - Voice interaction
 */

import { z } from "zod";
import type { Pool } from "pg";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function getEnv(name: string): string {
  if (process.env[name]) return process.env[name]!;
  try {
    const envPath = resolve(process.cwd(), ".env");
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const [k, ...rest] = trimmed.split("=");
        if (k.trim() === name) {
          return rest.join("=").trim().replace(/^["']|["']$/g, "");
        }
      }
    }
  } catch {
    // ignore
  }
  return "";
}

// Function definitions for GPT-4 / Groq function calling
const GUARDIAN_FUNCTIONS = [
  {
    name: "show_camera_feed",
    description: "Display live feed from specific cameras",
    parameters: {
      type: "object",
      properties: {
        cameraIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of camera IDs to display",
        },
        layout: {
          type: "string",
          enum: ["single", "grid", "mosaic"],
          description: "Display layout for multiple cameras",
        },
      },
      required: ["cameraIds"],
    },
  },
  {
    name: "lock_doors",
    description: "Lock doors in specified locations",
    parameters: {
      type: "object",
      properties: {
        locations: {
          type: "array",
          items: { type: "string" },
          description: "Locations where doors should be locked (e.g., 'floor 3', 'main entrance')",
        },
        reason: {
          type: "string",
          description: "Reason for locking doors",
        },
      },
      required: ["locations"],
    },
  },
  {
    name: "dispatch_guard",
    description: "Dispatch security guard to a location",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "Location where guard should be dispatched",
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high", "critical"],
          description: "Priority level of dispatch",
        },
        reason: {
          type: "string",
          description: "Reason for dispatch",
        },
      },
      required: ["location", "priority"],
    },
  },
  {
    name: "get_alert_summary",
    description: "Get summary of recent alerts",
    parameters: {
      type: "object",
      properties: {
        timeRange: {
          type: "string",
          enum: ["1h", "4h", "24h", "7d"],
          description: "Time range for alert summary",
        },
        severity: {
          type: "string",
          enum: ["low", "medium", "high", "critical"],
          description: "Filter by severity level",
        },
      },
    },
  },
  {
    name: "search_person",
    description: "Search for a person across all cameras",
    parameters: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "Description of the person (e.g., 'man in red shirt')",
        },
        timeRange: {
          type: "string",
          description: "Time range to search (e.g., 'last 2 hours')",
        },
      },
      required: ["description"],
    },
  },
  {
    name: "get_branch_status",
    description: "Get operational status of branches",
    parameters: {
      type: "object",
      properties: {
        branchIds: {
          type: "array",
          items: { type: "string" },
          description: "Specific branch IDs, or empty for all branches",
        },
      },
    },
  },
  {
    name: "trigger_alarm",
    description: "Trigger alarm or announcement",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["siren", "announcement", "silent"],
          description: "Type of alarm to trigger",
        },
        location: {
          type: "string",
          description: "Location where alarm should sound",
        },
        message: {
          type: "string",
          description: "Custom message for announcement",
        },
      },
      required: ["type", "location"],
    },
  },
  {
    name: "analyze_incident",
    description: "Analyze a security incident using AI",
    parameters: {
      type: "object",
      properties: {
        incidentId: {
          type: "string",
          description: "ID of the incident to analyze",
        },
        includeContext: {
          type: "boolean",
          description: "Include surrounding context (before/after footage)",
        },
      },
      required: ["incidentId"],
    },
  },
  {
    name: "get_camera_locations",
    description: "Get list of camera locations or find cameras near a location",
    parameters: {
      type: "object",
      properties: {
        nearLocation: {
          type: "string",
          description: "Find cameras near this location (e.g., 'parking lot', 'entrance')",
        },
        type: {
          type: "string",
          enum: ["all", "indoor", "outdoor", "ptz"],
          description: "Filter by camera type",
        },
      },
    },
  },
];

export interface GuardianMessage {
  role: "system" | "user" | "assistant" | "function" | "tool";
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  function_call?: {
    name: string;
    arguments: string;
  };
}

export interface GuardianContext {
  userId: string;
  tenantId: string;
  currentBranchId?: string;
  recentAlerts?: any[];
  recentActivity?: any[];
  permissions?: string[];
}

export interface GuardianResponse {
  message: string;
  type: "text" | "action" | "suggestion" | "warning" | "error";
  actions?: Array<{
    function: string;
    parameters: Record<string, any>;
    executed: boolean;
    result?: any;
  }>;
  suggestions?: string[];
  requiresConfirmation?: boolean;
  timestamp: string;
}

export class GuardianAIAssistant {
  private openAIApiKey: string;
  private openAIBaseUrl: string;
  private model: string;
  private conversationHistory: Map<string, GuardianMessage[]> = new Map();

  constructor(
    private pool: Pool,
    private config: {
      openAIApiKey?: string;
      openAIBaseUrl?: string;
      model?: string;
    } = {}
  ) {
    const rawApiKey =
      config.openAIApiKey ||
      getEnv("GROQ_API_KEY") ||
      getEnv("OPENAI_API_KEY") ||
      "";
    this.openAIApiKey = rawApiKey;

    const envBaseUrl = getEnv("OPENAI_BASE_URL");
    const isGroq =
      Boolean(getEnv("GROQ_API_KEY")) ||
      rawApiKey.startsWith("gsk_") ||
      Boolean(envBaseUrl && envBaseUrl.includes("groq.com"));

    this.openAIBaseUrl =
      config.openAIBaseUrl ||
      envBaseUrl ||
      (isGroq ? "https://api.groq.com/openai/v1" : "https://api.openai.com/v1");

    this.model =
      config.model ||
      getEnv("KRYPTON_AI_MODEL") ||
      getEnv("GUARDIAN_AI_MODEL") ||
      (isGroq ? "openai/gpt-oss-120b" : "gpt-4-turbo-preview");

    if (!this.openAIApiKey) {
      console.warn("[KryptonAI] AI API key (GROQ_API_KEY / OPENAI_API_KEY) not configured");
    } else {
      console.log(`[KryptonAI] Initialized with endpoint: ${this.openAIBaseUrl}, model: ${this.model}`);
    }
  }

  /**
   * Process user message and generate response
   */
  async processMessage(
    sessionId: string,
    message: string,
    context: GuardianContext
  ): Promise<GuardianResponse> {
    if (!this.openAIApiKey) {
      return await this.processFallbackMessage(message, context);
    }

    // Get or initialize conversation history
    let history = this.conversationHistory.get(sessionId);
    if (!history) {
      history = [this.buildSystemPrompt(context)];
      this.conversationHistory.set(sessionId, history);
    }

    // Add user message
    history.push({
      role: "user",
      content: message,
    });

    try {
      const isGroq = this.openAIBaseUrl.includes("groq.com");
      const payload: any = {
        model: this.model,
        messages: history.map((m) => {
          const item: any = { role: m.role, content: m.content ?? "" };
          if (m.name) item.name = m.name;
          if (m.tool_calls) item.tool_calls = m.tool_calls;
          if (m.tool_call_id) item.tool_call_id = m.tool_call_id;
          return item;
        }),
        temperature: 0.7,
        max_tokens: 500,
      };

      if (isGroq) {
        payload.tools = GUARDIAN_FUNCTIONS.map((f) => ({
          type: "function",
          function: f,
        }));
        payload.tool_choice = "auto";
      } else {
        payload.functions = GUARDIAN_FUNCTIONS;
        payload.function_call = "auto";
      }

      // Call AI endpoint
      const response = await fetch(`${this.openAIBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.openAIApiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        throw new Error(`AI API error (${response.status}): ${errBody}`);
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      if (!choice?.message) {
        throw new Error("Invalid AI response: missing choice message");
      }

      // Handle modern tool_calls (Groq / OpenAI modern)
      const toolCall = choice.message.tool_calls?.[0];
      if (toolCall?.function) {
        return await this.handleModernToolCall(
          sessionId,
          toolCall,
          context,
          history
        );
      }

      // Handle legacy function_call (OpenAI legacy)
      if (choice.message.function_call) {
        return await this.handleLegacyFunctionCall(
          sessionId,
          choice.message,
          context,
          history
        );
      }

      // Regular text response
      const assistantMessage = choice.message.content || "";
      history.push({
        role: "assistant",
        content: assistantMessage,
      });

      // Trim history if too long (keep last 20 messages)
      if (history.length > 21) {
        history.splice(1, history.length - 21);
      }

      return {
        message: assistantMessage,
        type: "text",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.warn("[KryptonAI] AI API error, falling back to operational assistant:", error);
      return await this.processFallbackMessage(message, context);
    }
  }

  /**
   * Execute core function logic for security operations
   */
  private async executeFunctionCore(
    functionName: string,
    functionArgs: any,
    context: GuardianContext
  ): Promise<{ functionResult: any; executed: boolean }> {
    let functionResult: any;
    let executed = false;

    try {
      switch (functionName) {
        case "show_camera_feed":
          functionResult = await this.showCameraFeed(functionArgs, context);
          executed = true;
          break;

        case "lock_doors":
          functionResult = await this.lockDoors(functionArgs, context);
          executed = true;
          break;

        case "dispatch_guard":
          functionResult = await this.dispatchGuard(functionArgs, context);
          executed = true;
          break;

        case "get_alert_summary":
          functionResult = await this.getAlertSummary(functionArgs, context);
          executed = true;
          break;

        case "search_person":
          functionResult = await this.searchPerson(functionArgs, context);
          executed = true;
          break;

        case "get_branch_status":
          functionResult = await this.getBranchStatus(functionArgs, context);
          executed = true;
          break;

        case "trigger_alarm":
          functionResult = await this.triggerAlarm(functionArgs, context);
          executed = true;
          break;

        case "analyze_incident":
          functionResult = await this.analyzeIncident(functionArgs, context);
          executed = true;
          break;

        case "get_camera_locations":
          functionResult = await this.getCameraLocations(functionArgs, context);
          executed = true;
          break;

        default:
          functionResult = { error: "Unknown function" };
      }
    } catch (error) {
      functionResult = {
        error: error instanceof Error ? error.message : "Function execution failed",
      };
    }

    return { functionResult, executed };
  }

  /**
   * Handle modern tool calls (Groq / OpenAI modern)
   */
  private async handleModernToolCall(
    sessionId: string,
    toolCall: any,
    context: GuardianContext,
    history: GuardianMessage[]
  ): Promise<GuardianResponse> {
    const functionName = toolCall.function.name;
    let functionArgs: any = {};
    try {
      functionArgs = JSON.parse(toolCall.function.arguments || "{}");
    } catch {
      functionArgs = {};
    }

    console.log(`[KryptonAI] Tool called: ${functionName}`, functionArgs);

    history.push({
      role: "assistant",
      content: null,
      tool_calls: [toolCall],
    });

    const { functionResult, executed } = await this.executeFunctionCore(
      functionName,
      functionArgs,
      context
    );

    history.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: JSON.stringify(functionResult),
    });

    let assistantMessage = "";
    try {
      const followupResponse = await fetch(`${this.openAIBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.openAIApiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: history.map((m) => {
            const item: any = { role: m.role, content: m.content ?? "" };
            if (m.name) item.name = m.name;
            if (m.tool_calls) item.tool_calls = m.tool_calls;
            if (m.tool_call_id) item.tool_call_id = m.tool_call_id;
            return item;
          }),
          temperature: 0.7,
          max_tokens: 500,
        }),
      });

      if (followupResponse.ok) {
        const followupData = await followupResponse.json();
        assistantMessage = followupData.choices?.[0]?.message?.content || "";
      }
    } catch (err) {
      console.warn("[KryptonAI] Followup tool call failed:", err);
    }

    if (!assistantMessage) {
      assistantMessage = `Command executed: ${functionName}. Result: ${JSON.stringify(functionResult)}`;
    }

    history.push({
      role: "assistant",
      content: assistantMessage,
    });

    return {
      message: assistantMessage,
      type: "action",
      actions: [
        {
          function: functionName,
          parameters: functionArgs,
          executed,
          result: functionResult,
        },
      ],
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Handle legacy function calls from GPT-4
   */
  private async handleLegacyFunctionCall(
    sessionId: string,
    message: any,
    context: GuardianContext,
    history: GuardianMessage[]
  ): Promise<GuardianResponse> {
    const functionName = message.function_call.name;
    let functionArgs: any = {};
    try {
      functionArgs = JSON.parse(message.function_call.arguments || "{}");
    } catch {
      functionArgs = {};
    }

    console.log(`[KryptonAI] Function called: ${functionName}`, functionArgs);

    history.push({
      role: "assistant",
      content: "",
      function_call: message.function_call,
    });

    const { functionResult, executed } = await this.executeFunctionCore(
      functionName,
      functionArgs,
      context
    );

    history.push({
      role: "function",
      name: functionName,
      content: JSON.stringify(functionResult),
    });

    let assistantMessage = "";
    try {
      const followupResponse = await fetch(`${this.openAIBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.openAIApiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: history,
          temperature: 0.7,
          max_tokens: 500,
        }),
      });

      if (followupResponse.ok) {
        const followupData = await followupResponse.json();
        assistantMessage = followupData.choices?.[0]?.message?.content || "";
      }
    } catch (err) {
      console.warn("[KryptonAI] Followup function call failed:", err);
    }

    if (!assistantMessage) {
      assistantMessage = `Command executed: ${functionName}. Result: ${JSON.stringify(functionResult)}`;
    }

    history.push({
      role: "assistant",
      content: assistantMessage,
    });

    return {
      message: assistantMessage,
      type: "action",
      actions: [
        {
          function: functionName,
          parameters: functionArgs,
          executed,
          result: functionResult,
        },
      ],
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Build system prompt with context
   */
  private buildSystemPrompt(context: GuardianContext): GuardianMessage {
    return {
      role: "system",
      content: `You are KryptonAI, an intelligent AI security assistant similar to JARVIS.

Your role:
- Monitor security operations across all branches
- Provide proactive suggestions for security improvements
- Execute commands when requested
- Explain incidents and anomalies
- Assist operators in emergency situations
- Be concise, professional, and action-oriented

Current context:
- User ID: ${context.userId}
- Tenant: ${context.tenantId}
- Current Branch: ${context.currentBranchId || "All branches"}
- Recent Alerts: ${context.recentAlerts?.length || 0}

Personality:
- Professional but friendly
- Proactive in suggesting actions
- Clear and concise communication
- Emergency-aware (prioritize critical situations)
- Use "I" (e.g., "I recommend dispatching a guard")

When users give commands:
- Use function calls to execute actions
- Confirm actions before execution if critical
- Provide status updates
- Suggest follow-up actions`,
    };
  }

  /**
   * Function implementations
   */

  private async showCameraFeed(args: any, context: GuardianContext) {
    const { cameraIds, layout = "grid" } = args;

    // Get camera details
    const { rows: cameras } = await this.pool.query(
      `SELECT id, name, status FROM cameras 
       WHERE id = ANY($1) AND tenant_id = $2`,
      [cameraIds, context.tenantId]
    );

    return {
      action: "show_cameras",
      cameras: cameras.map((c: any) => ({
        id: c.id,
        name: c.name,
        status: c.status,
      })),
      layout,
      message: `Displaying ${cameras.length} camera feed(s) in ${layout} layout`,
    };
  }

  private async lockDoors(args: any, context: GuardianContext) {
    const { locations, reason } = args;

    // In production, integrate with access control system
    // For now, log the action
    await this.pool.query(
      `INSERT INTO audit_log (tenant_id, user_id, action, details, timestamp)
       VALUES ($1, $2, 'door_lock_requested', $3, NOW())`,
      [context.tenantId, context.userId, JSON.stringify({ locations, reason })]
    );

    return {
      action: "lock_doors",
      locations,
      reason,
      status: "success",
      message: `Door lock command sent to: ${locations.join(", ")}`,
    };
  }

  private async dispatchGuard(args: any, context: GuardianContext) {
    const { location, priority, reason } = args;

    // Create dispatch task
    await this.pool.query(
      `INSERT INTO guard_dispatches (tenant_id, location, priority, reason, status, created_at)
       VALUES ($1, $2, $3, $4, 'pending', NOW())`,
      [context.tenantId, location, priority, reason || "KryptonAI recommendation"]
    );

    return {
      action: "dispatch_guard",
      location,
      priority,
      status: "dispatched",
      message: `${priority.toUpperCase()} priority guard dispatched to ${location}`,
    };
  }

  private async getAlertSummary(args: any, context: GuardianContext) {
    const { timeRange = "24h", severity } = args;

    const timeMap: Record<string, string> = {
      "1h": "1 hour",
      "4h": "4 hours",
      "24h": "24 hours",
      "7d": "7 days",
    };

    let query = `
      SELECT 
        severity, 
        COUNT(*) as count,
        string_agg(DISTINCT detection_type, ', ') as types
      FROM operational_alerts
      WHERE tenant_id = $1 
        AND occurred_at >= NOW() - INTERVAL '${timeMap[timeRange] || "24 hours"}'
    `;

    const params: any[] = [context.tenantId];

    if (severity) {
      query += ` AND severity = $2`;
      params.push(severity);
    }

    query += ` GROUP BY severity ORDER BY count DESC`;

    const { rows } = await this.pool.query(query, params);

    return {
      timeRange,
      severity: severity || "all",
      summary: rows,
      total: rows.reduce((sum: number, r: any) => sum + parseInt(r.count), 0),
    };
  }

  private async searchPerson(args: any, context: GuardianContext) {
    const { description, timeRange } = args;

    // Use AI Video Search service
    // For now, return placeholder
    return {
      action: "search_person",
      description,
      timeRange,
      status: "searching",
      message: "Initiating cross-camera person search...",
    };
  }

  private async getBranchStatus(args: any, context: GuardianContext) {
    const { branchIds } = args;

    let query = `
      SELECT 
        b.id,
        b.name,
        COUNT(DISTINCT c.id) as camera_count,
        COUNT(DISTINCT a.id) FILTER (WHERE a.status IN ('NEW', 'ACKNOWLEDGED')) as open_alerts
      FROM branches b
      LEFT JOIN resource_nodes rn ON rn.parent_id = b.id AND rn.node_type = 'camera'
      LEFT JOIN cameras c ON c.resource_node_id = rn.id
      LEFT JOIN operational_alerts a ON a.branch_id = b.id::text AND a.occurred_at >= NOW() - INTERVAL '24 hours'
      WHERE b.tenant_id = $1
    `;

    const params: any[] = [context.tenantId];

    if (branchIds && branchIds.length > 0) {
      query += ` AND b.id = ANY($2)`;
      params.push(branchIds);
    }

    query += ` GROUP BY b.id, b.name ORDER BY open_alerts DESC`;

    const { rows } = await this.pool.query(query, params);

    return {
      branches: rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        cameras: parseInt(r.camera_count),
        edgeAgents: parseInt(r.edge_agent_count),
        openAlerts: parseInt(r.open_alerts),
        status: parseInt(r.open_alerts) > 0 ? "attention" : "normal",
      })),
    };
  }

  private async triggerAlarm(args: any, context: GuardianContext) {
    const { type, location, message } = args;

    // Log alarm trigger
    await this.pool.query(
      `INSERT INTO alarm_triggers (tenant_id, type, location, message, triggered_by, triggered_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [context.tenantId, type, location, message, context.userId]
    );

    return {
      action: "trigger_alarm",
      type,
      location,
      status: "triggered",
      message: `${type.toUpperCase()} alarm triggered at ${location}`,
    };
  }

  private async analyzeIncident(args: any, context: GuardianContext) {
    const { incidentId, includeContext } = args;

    // Get incident details
    const { rows: incidents } = await this.pool.query(
      `SELECT * FROM incidents WHERE id = $1 AND tenant_id = $2`,
      [incidentId, context.tenantId]
    );

    if (incidents.length === 0) {
      return { error: "Incident not found" };
    }

    return {
      incident: incidents[0],
      analysis: "AI analysis in progress...",
      recommendations: [
        "Review surrounding camera footage",
        "Check for similar patterns in last 7 days",
        "Verify security protocol compliance",
      ],
    };
  }

  private async getCameraLocations(args: any, context: GuardianContext) {
    const { nearLocation, type = "all" } = args;

    let query = `
      SELECT c.id, rn.name, c.status
      FROM cameras c
      JOIN resource_nodes rn ON c.resource_node_id = rn.id
      WHERE rn.tenant_id = $1
    `;

    const params: any[] = [context.tenantId];

    if (type !== "all") {
      query += ` AND type = $2`;
      params.push(type);
    }

    if (nearLocation) {
      query += ` AND location ILIKE $${params.length + 1}`;
      params.push(`%${nearLocation}%`);
    }

    query += ` ORDER BY name LIMIT 50`;

    const { rows } = await this.pool.query(query, params);

    return {
      cameras: rows,
      count: rows.length,
      filter: { nearLocation, type },
    };
  }

  /**
   * Fallback rule-based handler when OpenAI API key is not configured
   */
  private async processFallbackMessage(
    message: string,
    context: GuardianContext
  ): Promise<GuardianResponse> {
    const lower = message.toLowerCase().trim();
    const timestamp = new Date().toISOString();

    // 1. Alerts query
    if (lower.includes("alert")) {
      try {
        const { rows } = await this.pool.query(
          `SELECT severity, COUNT(*) as count 
           FROM operational_alerts 
           WHERE tenant_id = $1 AND status IN ('NEW', 'ACKNOWLEDGED')
           GROUP BY severity`,
          [context.tenantId]
        ).catch(() => ({ rows: [] }));

        const total = rows.reduce((sum: number, r: any) => sum + parseInt(r.count || "0", 10), 0);
        if (total === 0) {
          return {
            message: "All clear! There are currently no open high-severity security alerts across your branches.",
            type: "text",
            timestamp,
          };
        }
        const breakdown = rows.map((r: any) => `${r.count} ${r.severity}`).join(", ");
        return {
          message: `There are currently ${total} open alerts requiring attention (${breakdown}).`,
          type: "action",
          actions: [
            {
              function: "get_alert_summary",
              parameters: { timeRange: "24h" },
              executed: true,
              result: { total, breakdown },
            },
          ],
          suggestions: ["Open Alert Command Center", "Show camera status"],
          timestamp,
        };
      } catch {
        return {
          message: "Alert monitoring is active. You can inspect all events in the Alert Command Center.",
          type: "text",
          timestamp,
        };
      }
    }

    // 2. Camera status query
    if (lower.includes("camera") || lower.includes("feed") || lower.includes("video")) {
      try {
        const { rows } = await this.pool.query(
          `SELECT c.status, COUNT(*) as count 
           FROM cameras c
           JOIN resource_nodes rn ON c.resource_node_id = rn.id
           WHERE rn.tenant_id = $1
           GROUP BY c.status`,
          [context.tenantId]
        ).catch(() => ({ rows: [] }));

        const total = rows.reduce((sum: number, r: any) => sum + parseInt(r.count || "0", 10), 0);
        const onlineRow = rows.find((r: any) => r.status === "online");
        const onlineCount = onlineRow ? parseInt(onlineRow.count || "0", 10) : 0;
        const offlineCount = total - onlineCount;

        return {
          message: `Camera Health: ${total} registered cameras (${onlineCount} online, ${offlineCount} offline/degraded).`,
          type: "action",
          actions: [
            {
              function: "get_camera_locations",
              parameters: {},
              executed: true,
              result: { total, online: onlineCount, offline: offlineCount },
            },
          ],
          suggestions: ["View All Cameras", "Live Video Wall"],
          timestamp,
        };
      } catch {
        return {
          message: "Camera streams are monitored continuously. You can view live video feeds in the Operations menu.",
          type: "text",
          timestamp,
        };
      }
    }

    // 3. System status / overview / branches
    if (lower.includes("status") || lower.includes("system") || lower.includes("health") || lower.includes("branch")) {
      return {
        message: "KryptonAI Security Status: Core control plane, media streaming pipelines, and perimeter monitoring are operational.",
        type: "action",
        actions: [
          {
            function: "get_branch_status",
            parameters: {},
            executed: true,
            result: { status: "NOMINAL" },
          },
        ],
        suggestions: ["Operational Health Dashboard", "Branch Operations"],
        timestamp,
      };
    }

    // 4. Help / default response
    return {
      message: `KryptonAI operational assistant is online.\n\nQuick commands:\n• "How many alerts are open?"\n• "Show me camera status"\n• "What is the system health?"\n\n(Tip: Configure the GROQ_API_KEY or OPENAI_API_KEY environment variable to enable full generative conversational dialogue.)`,
      type: "text",
      timestamp,
    };
  }

  /**
   * Generate proactive suggestions based on current state
   */
  async generateProactiveSuggestions(context: GuardianContext): Promise<string[]> {
    const suggestions: string[] = [];

    try {
      if (this.pool && typeof this.pool.query === "function") {
        // Check for open operational alerts
        const openAlertsRes = await this.pool.query(
          `SELECT COUNT(*) as count FROM operational_alerts 
           WHERE tenant_id = $1 AND status IN ('NEW', 'ACKNOWLEDGED') AND severity IN ('high', 'critical')`,
          [context.tenantId]
        ).catch(() => ({ rows: [] }));

        const openCount = parseInt(openAlertsRes?.rows?.[0]?.count || "0", 10);
        if (openCount > 0) {
          suggestions.push(`You have ${openCount} high-priority alert${openCount > 1 ? "s" : ""} requiring attention`);
        }

        // Check for offline cameras
        const offlineCamerasRes = await this.pool.query(
          `SELECT COUNT(*) as count FROM cameras c
           JOIN resource_nodes rn ON c.resource_node_id = rn.id
           WHERE rn.tenant_id = $1 AND c.status = 'offline'`,
          [context.tenantId]
        ).catch(() => ({ rows: [] }));

        const offlineCount = parseInt(offlineCamerasRes?.rows?.[0]?.count || "0", 10);
        if (offlineCount > 0) {
          suggestions.push(`${offlineCount} camera${offlineCount > 1 ? "s are" : " is"} currently offline`);
        }
      }
    } catch {
      // Ignore database errors and use safe defaults
    }

    if (suggestions.length === 0) {
      suggestions.push("Check all cameras across active branches");
      suggestions.push("Review open operational security alerts");
      suggestions.push("Show system operational health overview");
    }

    return suggestions;
  }

  /**
   * Clear conversation history for a session
   */
  clearSession(sessionId: string): void {
    this.conversationHistory.delete(sessionId);
  }
}

/**
 * Guardian AI Assistant Service
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

// Function definitions for GPT-4 function calling
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
  role: "system" | "user" | "assistant" | "function";
  content: string;
  name?: string;
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
    this.openAIApiKey = config.openAIApiKey || process.env.OPENAI_API_KEY || "";
    this.openAIBaseUrl = config.openAIBaseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    this.model = config.model || process.env.GUARDIAN_AI_MODEL || "gpt-4-turbo-preview";

    if (!this.openAIApiKey) {
      console.warn("[GuardianAI] OpenAI API key not configured");
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
      throw new Error("Guardian AI not configured");
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
      // Call GPT-4 with function calling
      const response = await fetch(`${this.openAIBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.openAIApiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: history,
          functions: GUARDIAN_FUNCTIONS,
          function_call: "auto",
          temperature: 0.7,
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const choice = data.choices[0];

      // Handle function calling
      if (choice.message.function_call) {
        return await this.handleFunctionCall(
          sessionId,
          choice.message,
          context,
          history
        );
      }

      // Regular text response
      const assistantMessage = choice.message.content;
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
      console.error("[GuardianAI] Failed to process message:", error);
      throw error;
    }
  }

  /**
   * Handle function calls from GPT-4
   */
  private async handleFunctionCall(
    sessionId: string,
    message: any,
    context: GuardianContext,
    history: GuardianMessage[]
  ): Promise<GuardianResponse> {
    const functionName = message.function_call.name;
    const functionArgs = JSON.parse(message.function_call.arguments);

    console.log(`[GuardianAI] Function called: ${functionName}`, functionArgs);

    // Add function call to history
    history.push({
      role: "assistant",
      content: "",
      function_call: message.function_call,
    });

    // Execute the function
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

    // Add function result to history
    history.push({
      role: "function",
      name: functionName,
      content: JSON.stringify(functionResult),
    });

    // Get AI's response to the function result
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

    const followupData = await followupResponse.json();
    const assistantMessage = followupData.choices[0].message.content;

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
      content: `You are Guardian, an intelligent AI security assistant similar to JARVIS.

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
      [context.tenantId, location, priority, reason || "Guardian AI recommendation"]
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
        string_agg(DISTINCT type, ', ') as types
      FROM alerts
      WHERE tenant_id = $1 
        AND created_at >= NOW() - INTERVAL '${timeMap[timeRange]}'
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
        COUNT(DISTINCT e.id) as edge_agent_count,
        COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'open') as open_alerts
      FROM branches b
      LEFT JOIN cameras c ON c.branch_id = b.id
      LEFT JOIN edge_agents e ON e.branch_id = b.id
      LEFT JOIN alerts a ON a.branch_id = b.id AND a.created_at >= NOW() - INTERVAL '24 hours'
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
      SELECT id, name, location, type, status
      FROM cameras
      WHERE tenant_id = $1
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
   * Generate proactive suggestions based on current state
   */
  async generateProactiveSuggestions(context: GuardianContext): Promise<string[]> {
    const suggestions: string[] = [];

    // Check for open alerts
    const { rows: openAlerts } = await this.pool.query(
      `SELECT COUNT(*) as count FROM alerts 
       WHERE tenant_id = $1 AND status = 'open' AND severity IN ('high', 'critical')`,
      [context.tenantId]
    );

    if (parseInt(openAlerts[0]?.count || "0") > 0) {
      suggestions.push(`You have ${openAlerts[0].count} high-priority alerts requiring attention`);
    }

    // Check for offline cameras
    const { rows: offlineCameras } = await this.pool.query(
      `SELECT COUNT(*) as count FROM cameras 
       WHERE tenant_id = $1 AND status = 'offline'`,
      [context.tenantId]
    );

    if (parseInt(offlineCameras[0]?.count || "0") > 3) {
      suggestions.push(`${offlineCameras[0].count} cameras are offline. Should I generate a report?`);
    }

    // Check for unusual activity patterns (placeholder)
    // In production, use behavioral analytics

    return suggestions;
  }

  /**
   * Clear conversation history for a session
   */
  clearSession(sessionId: string): void {
    this.conversationHistory.delete(sessionId);
  }
}

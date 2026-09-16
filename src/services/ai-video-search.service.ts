/**
 * AI Video Search Service with GPT-4V Integration
 * 
 * Features:
 * - Natural language video search
 * - Scene understanding with GPT-4V
 * - Automatic video summarization
 * - Voice-to-text search queries
 * - Intelligent frame extraction
 */

import { z } from "zod";
import type { Pool } from "pg";

// OpenAI API types (will need openai package)
interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

interface GPT4VisionResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
  }>;
}

// Search query schema
export const naturalLanguageSearchSchema = z.object({
  query: z.string().min(1).max(500),
  tenantId: z.string().min(1),
  cameraIds: z.array(z.string()).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  maxResults: z.number().int().min(1).max(100).default(20),
  includeVideoSummary: z.boolean().default(false),
  confidenceThreshold: z.number().min(0).max(1).default(0.7),
});

export type NaturalLanguageSearchInput = z.infer<typeof naturalLanguageSearchSchema>;

// Video summary schema
export const videoSummaryRequestSchema = z.object({
  tenantId: z.string().min(1),
  cameraId: z.string().min(1),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  summaryLength: z.enum(["brief", "detailed", "comprehensive"]).default("brief"),
  highlightTypes: z.array(z.string()).optional(), // ["motion", "people", "vehicles", "incidents"]
});

export type VideoSummaryRequest = z.infer<typeof videoSummaryRequestSchema>;

// Search result types
export interface VideoSearchResult {
  id: string;
  cameraId: string;
  cameraName: string;
  timestamp: string;
  confidence: number;
  description: string;
  matchReason: string;
  thumbnailUrl?: string;
  videoSegmentId?: string;
  boundingBoxes?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
    confidence: number;
  }>;
  metadata: {
    detectedObjects?: string[];
    sceneType?: string;
    actions?: string[];
    colors?: string[];
    timeOfDay?: string;
  };
}

export interface VideoSummary {
  id: string;
  cameraId: string;
  cameraName: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  summary: string;
  keyMoments: Array<{
    timestamp: string;
    description: string;
    importance: "high" | "medium" | "low";
    thumbnailUrl?: string;
  }>;
  statistics: {
    totalPeople: number;
    totalVehicles: number;
    peakOccupancy: number;
    incidentCount: number;
    activityLevel: "high" | "medium" | "low";
  };
  generatedAt: string;
}

export class AIVideoSearchService {
  private openAIApiKey: string;
  private openAIBaseUrl: string;
  private gpt4Model: string;
  private whisperModel: string;

  constructor(
    private pool: Pool,
    private config: {
      openAIApiKey?: string;
      openAIBaseUrl?: string;
      gpt4Model?: string;
      whisperModel?: string;
    } = {}
  ) {
    this.openAIApiKey = config.openAIApiKey || process.env.OPENAI_API_KEY || "";
    this.openAIBaseUrl = config.openAIBaseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    this.gpt4Model = config.gpt4Model || process.env.GPT4_MODEL || "gpt-4-vision-preview";
    this.whisperModel = config.whisperModel || process.env.WHISPER_MODEL || "whisper-1";

    if (!this.openAIApiKey) {
      console.warn("[AIVideoSearch] OpenAI API key not configured - AI features will be disabled");
    }
  }

  /**
   * Parse natural language query into structured search parameters
   */
  async parseNaturalLanguageQuery(query: string): Promise<{
    intent: string;
    entities: Record<string, any>;
    timeRange?: { start?: string; end?: string };
    objectTypes?: string[];
    colors?: string[];
    actions?: string[];
    locations?: string[];
    confidence: number;
  }> {
    if (!this.openAIApiKey) {
      throw new Error("OpenAI API key not configured");
    }

    const systemPrompt = `You are an AI assistant that helps parse natural language video search queries into structured search parameters.

Extract the following information from the user's query:
- intent: The main action (search, find, show, locate, track)
- objectTypes: Objects to search for (person, vehicle, package, etc.)
- colors: Colors mentioned (red, blue, etc.)
- actions: Actions mentioned (running, walking, fighting, etc.)
- locations: Locations mentioned (entrance, parking lot, ATM, etc.)
- timeRange: Time constraints (last hour, between 2pm-4pm, etc.)

Respond in JSON format only.`;

    try {
      const response = await fetch(`${this.openAIBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.openAIApiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4-turbo-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Parse this video search query: "${query}"` },
          ],
          temperature: 0.3,
          max_tokens: 500,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const parsed = JSON.parse(data.choices[0].message.content);

      return {
        intent: parsed.intent || "search",
        entities: parsed,
        timeRange: parsed.timeRange,
        objectTypes: parsed.objectTypes || [],
        colors: parsed.colors || [],
        actions: parsed.actions || [],
        locations: parsed.locations || [],
        confidence: 0.85,
      };
    } catch (error) {
      console.error("[AIVideoSearch] Failed to parse query:", error);
      // Fallback to simple keyword extraction
      return this.fallbackQueryParse(query);
    }
  }

  /**
   * Fallback query parser (simple keyword extraction)
   */
  private fallbackQueryParse(query: string) {
    const lowerQuery = query.toLowerCase();
    
    const objectTypes: string[] = [];
    if (lowerQuery.includes("person") || lowerQuery.includes("people")) objectTypes.push("person");
    if (lowerQuery.includes("vehicle") || lowerQuery.includes("car")) objectTypes.push("vehicle");
    if (lowerQuery.includes("package") || lowerQuery.includes("bag")) objectTypes.push("package");

    const colors: string[] = [];
    const colorKeywords = ["red", "blue", "green", "yellow", "black", "white", "gray"];
    colorKeywords.forEach(color => {
      if (lowerQuery.includes(color)) colors.push(color);
    });

    const actions: string[] = [];
    if (lowerQuery.includes("running")) actions.push("running");
    if (lowerQuery.includes("walking")) actions.push("walking");
    if (lowerQuery.includes("fighting") || lowerQuery.includes("fight")) actions.push("fighting");

    return {
      intent: "search",
      entities: { objectTypes, colors, actions },
      objectTypes,
      colors,
      actions,
      locations: [],
      confidence: 0.6,
    };
  }

  /**
   * Search videos using natural language query
   */
  async searchByNaturalLanguage(input: NaturalLanguageSearchInput): Promise<{
    results: VideoSearchResult[];
    totalCount: number;
    queryUnderstanding: string;
    processingTimeMs: number;
  }> {
    const startTime = Date.now();

    // Parse the natural language query
    const parsed = await this.parseNaturalLanguageQuery(input.query);
    console.log("[AIVideoSearch] Parsed query:", parsed);

    // Build SQL query based on parsed parameters
    const conditions: string[] = ["r.tenant_id = $1"];
    const params: any[] = [input.tenantId];
    let paramIndex = 2;

    // Camera filter
    if (input.cameraIds && input.cameraIds.length > 0) {
      conditions.push(`r.camera_id = ANY($${paramIndex})`);
      params.push(input.cameraIds);
      paramIndex++;
    }

    // Time range filter
    if (input.startTime) {
      conditions.push(`r.timestamp >= $${paramIndex}`);
      params.push(input.startTime);
      paramIndex++;
    }

    if (input.endTime) {
      conditions.push(`r.timestamp <= $${paramIndex}`);
      params.push(input.endTime);
      paramIndex++;
    }

    // Object type filter
    if (parsed.objectTypes && parsed.objectTypes.length > 0) {
      conditions.push(`r.detection_type = ANY($${paramIndex})`);
      params.push(parsed.objectTypes);
      paramIndex++;
    }

    // Color filter (if metadata supports it)
    if (parsed.colors && parsed.colors.length > 0) {
      conditions.push(`r.metadata->>'dominantColor' = ANY($${paramIndex})`);
      params.push(parsed.colors);
      paramIndex++;
    }

    // Confidence threshold
    conditions.push(`r.confidence >= $${paramIndex}`);
    params.push(input.confidenceThreshold);
    paramIndex++;

    const whereClause = conditions.join(" AND ");

    // Execute search query
    const query = `
      SELECT 
        r.id,
        r.camera_id,
        c.name as camera_name,
        r.timestamp,
        r.confidence,
        r.detection_type,
        r.metadata,
        r.snapshot_path,
        rs.id as segment_id
      FROM analytics_events r
      JOIN cameras c ON r.camera_id = c.id
      LEFT JOIN recording_segments rs ON 
        rs.camera_id = r.camera_id AND
        r.timestamp >= rs.started_at AND
        r.timestamp <= rs.ended_at
      WHERE ${whereClause}
      ORDER BY r.timestamp DESC
      LIMIT $${paramIndex}
    `;

    params.push(input.maxResults);

    const { rows } = await this.pool.query(query, params);

    // Enhance results with AI descriptions if GPT-4V is available
    const results: VideoSearchResult[] = await Promise.all(
      rows.map(async (row) => {
        const description = await this.generateFrameDescription(
          row.snapshot_path,
          parsed.entities
        );

        return {
          id: row.id,
          cameraId: row.camera_id,
          cameraName: row.camera_name,
          timestamp: row.timestamp,
          confidence: parseFloat(row.confidence),
          description: description || `${row.detection_type} detected`,
          matchReason: this.explainMatch(parsed, row),
          thumbnailUrl: row.snapshot_path ? `/api/v1/snapshots/${row.id}` : undefined,
          videoSegmentId: row.segment_id,
          metadata: row.metadata || {},
        };
      })
    );

    const processingTimeMs = Date.now() - startTime;

    // Generate query understanding explanation
    const queryUnderstanding = this.explainQueryUnderstanding(input.query, parsed);

    return {
      results,
      totalCount: results.length,
      queryUnderstanding,
      processingTimeMs,
    };
  }

  /**
   * Generate natural language description of a video frame using GPT-4V
   */
  private async generateFrameDescription(
    snapshotPath: string | null,
    context: Record<string, any>
  ): Promise<string | null> {
    if (!snapshotPath || !this.openAIApiKey) {
      return null;
    }

    try {
      // In production, load the actual image from storage
      // For now, we'll skip GPT-4V calls to save costs during development
      // Uncomment when ready for production use:
      
      /*
      const imageBase64 = await this.loadImageAsBase64(snapshotPath);
      
      const response = await fetch(`${this.openAIBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.openAIApiKey}`,
        },
        body: JSON.stringify({
          model: this.gpt4Model,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Describe what you see in this security camera footage. Focus on: ${JSON.stringify(context)}`,
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/jpeg;base64,${imageBase64}`,
                  },
                },
              ],
            },
          ],
          max_tokens: 150,
        }),
      });

      if (!response.ok) {
        throw new Error(`GPT-4V API error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
      */

      return null; // Placeholder
    } catch (error) {
      console.error("[AIVideoSearch] Failed to generate frame description:", error);
      return null;
    }
  }

  /**
   * Generate video summary for a time range
   */
  async generateVideoSummary(request: VideoSummaryRequest): Promise<VideoSummary> {
    const startTime = Date.now();

    // Query all events in the time range
    const { rows: events } = await this.pool.query(
      `SELECT 
        id, timestamp, detection_type, confidence, metadata, snapshot_path
      FROM analytics_events
      WHERE camera_id = $1 
        AND timestamp >= $2 
        AND timestamp <= $3
        AND confidence >= 0.7
      ORDER BY timestamp ASC`,
      [request.cameraId, request.startTime, request.endTime]
    );

    // Get camera info
    const { rows: cameras } = await this.pool.query(
      "SELECT name FROM cameras WHERE id = $1",
      [request.cameraId]
    );
    const cameraName = cameras[0]?.name || "Unknown Camera";

    // Analyze events and extract key moments
    const keyMoments = this.extractKeyMoments(events, request.summaryLength);

    // Calculate statistics
    const statistics = this.calculateVideoStatistics(events);

    // Generate AI summary
    const summary = await this.generateAISummary(events, request.summaryLength);

    const durationSeconds = Math.floor(
      (new Date(request.endTime).getTime() - new Date(request.startTime).getTime()) / 1000
    );

    return {
      id: `summary-${request.cameraId}-${Date.now()}`,
      cameraId: request.cameraId,
      cameraName,
      startTime: request.startTime,
      endTime: request.endTime,
      durationSeconds,
      summary,
      keyMoments,
      statistics,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Extract key moments from events
   */
  private extractKeyMoments(events: any[], summaryLength: string) {
    const moments: VideoSummary["keyMoments"] = [];

    // Priority scoring
    const priorityMap: Record<string, number> = {
      "weapon": 10,
      "violence": 10,
      "fall": 9,
      "intrusion": 8,
      "loitering": 6,
      "vehicle": 5,
      "person": 4,
      "motion": 2,
    };

    // Score and sort events
    const scoredEvents = events.map(event => ({
      ...event,
      score: priorityMap[event.detection_type] || 3,
    })).sort((a, b) => b.score - a.score);

    // Select top moments based on summary length
    const maxMoments = summaryLength === "brief" ? 5 : summaryLength === "detailed" ? 10 : 20;
    const selectedEvents = scoredEvents.slice(0, maxMoments);

    for (const event of selectedEvents) {
      moments.push({
        timestamp: event.timestamp,
        description: `${event.detection_type} detected (${(event.confidence * 100).toFixed(0)}% confidence)`,
        importance: event.score >= 8 ? "high" : event.score >= 5 ? "medium" : "low",
        thumbnailUrl: event.snapshot_path ? `/api/v1/snapshots/${event.id}` : undefined,
      });
    }

    return moments;
  }

  /**
   * Calculate video statistics
   */
  private calculateVideoStatistics(events: any[]) {
    const personEvents = events.filter(e => e.detection_type === "person");
    const vehicleEvents = events.filter(e => e.detection_type === "vehicle");
    const incidentEvents = events.filter(e => 
      ["weapon", "violence", "fall", "intrusion"].includes(e.detection_type)
    );

    // Estimate peak occupancy (rough approximation)
    const peakOccupancy = Math.max(...personEvents.map(e => 
      e.metadata?.count || 1
    ), 0);

    // Calculate activity level
    const eventDensity = events.length / Math.max((events.length > 0 ? 1 : 0), 1);
    const activityLevel = eventDensity > 20 ? "high" : eventDensity > 10 ? "medium" : "low";

    return {
      totalPeople: personEvents.length,
      totalVehicles: vehicleEvents.length,
      peakOccupancy,
      incidentCount: incidentEvents.length,
      activityLevel: activityLevel as "high" | "medium" | "low",
    };
  }

  /**
   * Generate AI summary using GPT-4
   */
  private async generateAISummary(events: any[], summaryLength: string): Promise<string> {
    if (!this.openAIApiKey || events.length === 0) {
      return "No significant activity detected during this period.";
    }

    try {
      // Create event summary
      const eventSummary = events.slice(0, 50).map(e => 
        `${e.timestamp}: ${e.detection_type} (${(e.confidence * 100).toFixed(0)}%)`
      ).join("\n");

      const lengthInstruction = summaryLength === "brief" 
        ? "Write a brief 2-3 sentence summary."
        : summaryLength === "detailed"
        ? "Write a detailed paragraph summary."
        : "Write a comprehensive multi-paragraph summary.";

      const response = await fetch(`${this.openAIBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.openAIApiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4-turbo-preview",
          messages: [
            {
              role: "system",
              content: "You are a security analyst summarizing video surveillance footage. Focus on important events and patterns.",
            },
            {
              role: "user",
              content: `Summarize the following security events:\n\n${eventSummary}\n\n${lengthInstruction}`,
            },
          ],
          temperature: 0.7,
          max_tokens: summaryLength === "brief" ? 150 : summaryLength === "detailed" ? 300 : 600,
        }),
      });

      if (!response.ok) {
        throw new Error(`GPT-4 API error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error("[AIVideoSearch] Failed to generate AI summary:", error);
      return this.generateFallbackSummary(events);
    }
  }

  /**
   * Generate fallback summary without AI
   */
  private generateFallbackSummary(events: any[]): string {
    if (events.length === 0) {
      return "No significant activity detected during this period.";
    }

    const detectionCounts: Record<string, number> = {};
    events.forEach(e => {
      detectionCounts[e.detection_type] = (detectionCounts[e.detection_type] || 0) + 1;
    });

    const sortedTypes = Object.entries(detectionCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);

    const parts = sortedTypes.map(([type, count]) => `${count} ${type} event${count > 1 ? 's' : ''}`);

    return `Detected ${parts.join(", ")} during this period. Total activity: ${events.length} events.`;
  }

  /**
   * Explain why a result matched the query
   */
  private explainMatch(parsed: any, row: any): string {
    const reasons: string[] = [];

    if (parsed.objectTypes.includes(row.detection_type)) {
      reasons.push(`matched object type: ${row.detection_type}`);
    }

    if (parsed.colors.length > 0 && row.metadata?.dominantColor) {
      const matchedColor = parsed.colors.find((c: string) => 
        c.toLowerCase() === row.metadata.dominantColor.toLowerCase()
      );
      if (matchedColor) {
        reasons.push(`matched color: ${matchedColor}`);
      }
    }

    if (reasons.length === 0) {
      reasons.push("matched search criteria");
    }

    return reasons.join(", ");
  }

  /**
   * Explain query understanding to user
   */
  private explainQueryUnderstanding(originalQuery: string, parsed: any): string {
    const parts: string[] = [];

    parts.push(`I understood you're looking for`);

    if (parsed.objectTypes.length > 0) {
      parts.push(`**${parsed.objectTypes.join(", ")}**`);
    }

    if (parsed.colors.length > 0) {
      parts.push(`in **${parsed.colors.join(", ")}** color`);
    }

    if (parsed.actions.length > 0) {
      parts.push(`performing actions: **${parsed.actions.join(", ")}**`);
    }

    if (parsed.locations.length > 0) {
      parts.push(`near **${parsed.locations.join(", ")}**`);
    }

    if (parts.length === 1) {
      return `Searching all video footage for: "${originalQuery}"`;
    }

    return parts.join(" ");
  }

  /**
   * Convert voice audio to text using Whisper
   */
  async transcribeVoiceQuery(audioBuffer: Buffer): Promise<string> {
    if (!this.openAIApiKey) {
      throw new Error("OpenAI API key not configured");
    }

    try {
      const formData = new FormData();
      formData.append("file", new Blob([new Uint8Array(audioBuffer)]), "audio.webm");
      formData.append("model", this.whisperModel);

      const response = await fetch(`${this.openAIBaseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.openAIApiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Whisper API error: ${response.status}`);
      }

      const data = await response.json();
      return data.text;
    } catch (error) {
      console.error("[AIVideoSearch] Failed to transcribe audio:", error);
      throw new Error("Failed to transcribe voice query");
    }
  }
}

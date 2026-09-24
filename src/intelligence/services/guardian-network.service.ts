/**
 * Guardian Network Service
 * 
 * Core service for cross-location intelligence sharing:
 * - Upload anonymized threat patterns
 * - Download global threat intelligence
 * - Real-time threat alerts via WebSocket
 * - Benchmark scoring
 * - Pattern matching
 */

import type {
  ThreatPattern,
  ThreatIntelligenceUpdate,
  BenchmarkMetrics,
  ThreatDatabaseQuery,
  PatternMatchResult,
  GuardianNetworkConfig,
  NetworkStatistics,
  IndustryIntelligenceReport,
  RealtimeThreatAlert,
  IndustryVertical,
  ThreatCategory,
} from '../guardian-network.types';
import type { LocalIncident } from './pattern-anonymizer.service';
import { PatternAnonymizerService } from './pattern-anonymizer.service';
import { EventEmitter } from 'events';
import WebSocket from 'ws';

export interface GuardianNetworkEvents {
  'threat-alert': (alert: RealtimeThreatAlert) => void;
  'intelligence-update': (update: ThreatIntelligenceUpdate) => void;
  'pattern-matched': (match: PatternMatchResult) => void;
  'sync-complete': (stats: NetworkStatistics) => void;
  'connection-status': (status: 'connected' | 'disconnected' | 'error') => void;
}

export class GuardianNetworkService extends EventEmitter {
  private config: GuardianNetworkConfig;
  private anonymizer: PatternAnonymizerService;
  private wsConnection?: WebSocket;
  private syncInterval?: NodeJS.Timeout;
  private localPatternCache: Map<string, ThreatPattern> = new Map();
  
  constructor(config: GuardianNetworkConfig) {
    super();
    this.config = config;
    this.anonymizer = new PatternAnonymizerService();
    
    if (config.enabled) {
      this.initialize();
    }
  }
  
  // ============================================================================
  // Initialization & Connection Management
  // ============================================================================
  
  private async initialize(): Promise<void> {
    console.log('[GuardianNetwork] Initializing...');
    
    // Connect to real-time updates
    if (this.config.consumptionSettings.enableRealTimeUpdates) {
      this.connectWebSocket();
    }
    
    // Start periodic sync
    this.startPeriodicSync();
    
    // Initial pattern sync
    await this.syncPatterns();
  }
  
  private connectWebSocket(): void {
    try {
      this.wsConnection = new WebSocket(this.config.networkEndpoints.realtimeUpdates, {
        headers: {
          'Authorization': `Bearer ${this.config.authentication.apiKey}`,
          'X-Deployment-Id': this.config.deploymentId,
        },
      });
      
      this.wsConnection.on('open', () => {
        console.log('[GuardianNetwork] WebSocket connected');
        this.emit('connection-status', 'connected');
      });
      
      this.wsConnection.on('message', (data: WebSocket.Data) => {
        this.handleRealtimeMessage(data.toString());
      });
      
      this.wsConnection.on('close', () => {
        console.log('[GuardianNetwork] WebSocket disconnected, reconnecting...');
        this.emit('connection-status', 'disconnected');
        setTimeout(() => this.connectWebSocket(), 5000);
      });
      
      this.wsConnection.on('error', (error) => {
        console.error('[GuardianNetwork] WebSocket error:', error);
        this.emit('connection-status', 'error');
      });
    } catch (error) {
      console.error('[GuardianNetwork] Failed to connect WebSocket:', error);
    }
  }
  
  private handleRealtimeMessage(message: string): void {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'threat-alert':
          this.emit('threat-alert', data.payload as RealtimeThreatAlert);
          break;
        case 'intelligence-update':
          this.emit('intelligence-update', data.payload as ThreatIntelligenceUpdate);
          break;
        case 'pattern-update':
          this.handlePatternUpdate(data.payload);
          break;
        default:
          console.warn('[GuardianNetwork] Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('[GuardianNetwork] Failed to parse realtime message:', error);
    }
  }
  
  private startPeriodicSync(): void {
    // Sync every 15 minutes
    this.syncInterval = setInterval(() => {
      this.syncPatterns().catch(error => {
        console.error('[GuardianNetwork] Periodic sync failed:', error);
      });
    }, 15 * 60 * 1000);
  }
  
  public async disconnect(): Promise<void> {
    if (this.wsConnection) {
      this.wsConnection.close();
    }
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
  }
  
  // ============================================================================
  // Pattern Sharing (Upload)
  // ============================================================================
  
  /**
   * Share a verified incident with the Guardian Network
   */
  async shareIncident(incident: LocalIncident): Promise<{ success: boolean; patternId?: string; error?: string }> {
    if (!this.config.enabled || !this.config.privacySettings.shareIncidentPatterns) {
      return { success: false, error: 'Pattern sharing is disabled' };
    }
    
    // Check contribution settings
    if (this.config.contributionSettings.excludedCategories?.includes(
      this.anonymizer['mapToThreatCategory'](incident.category)
    )) {
      return { success: false, error: 'Category excluded from sharing' };
    }
    
    // Anonymize the incident
    const pattern = this.anonymizer.anonymizeIncident(incident);
    
    // Verify no PII
    const piiCheck = this.anonymizer.verifyNoPII(pattern);
    if (!piiCheck.safe) {
      console.error('[GuardianNetwork] PII detected, cannot share:', piiCheck.violations);
      return { success: false, error: `PII detected: ${piiCheck.violations.join(', ')}` };
    }
    
    // Upload to network
    try {
      const response = await fetch(`${this.config.networkEndpoints.patternDatabase}/patterns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.authentication.apiKey}`,
          'X-Deployment-Id': this.config.deploymentId,
        },
        body: JSON.stringify(pattern),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to share pattern: ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log('[GuardianNetwork] Pattern shared successfully:', result.patternId);
      
      return { success: true, patternId: result.patternId };
    } catch (error) {
      console.error('[GuardianNetwork] Failed to share pattern:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
  
  /**
   * Batch share multiple incidents
   */
  async shareIncidentBatch(incidents: LocalIncident[]): Promise<{
    successful: number;
    failed: number;
    errors: string[];
  }> {
    const results = { successful: 0, failed: 0, errors: [] as string[] };
    
    for (const incident of incidents) {
      const result = await this.shareIncident(incident);
      if (result.success) {
        results.successful++;
      } else {
        results.failed++;
        results.errors.push(result.error || 'Unknown error');
      }
    }
    
    return results;
  }
  
  // ============================================================================
  // Pattern Consumption (Download)
  // ============================================================================
  
  /**
   * Query the global threat database
   */
  async queryThreatDatabase(query: ThreatDatabaseQuery): Promise<ThreatPattern[]> {
    if (!this.config.enabled) {
      return [];
    }
    
    try {
      const params = new URLSearchParams();
      if (query.categories) params.append('categories', query.categories.join(','));
      if (query.industries) params.append('industries', query.industries.join(','));
      if (query.severities) params.append('severities', query.severities.join(','));
      if (query.from) params.append('from', query.from.toISOString());
      if (query.to) params.append('to', query.to.toISOString());
      if (query.limit) params.append('limit', query.limit.toString());
      if (query.offset) params.append('offset', query.offset.toString());
      if (query.sortBy) params.append('sortBy', query.sortBy);
      
      const response = await fetch(
        `${this.config.networkEndpoints.patternDatabase}/patterns?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.authentication.apiKey}`,
            'X-Deployment-Id': this.config.deploymentId,
          },
        }
      );
      
      if (!response.ok) {
        throw new Error(`Query failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.patterns || [];
    } catch (error) {
      console.error('[GuardianNetwork] Failed to query patterns:', error);
      return [];
    }
  }
  
  /**
   * Sync latest patterns from network
   */
  private async syncPatterns(): Promise<void> {
    console.log('[GuardianNetwork] Syncing patterns...');
    
    const lastSync = await this.getLastSyncTime();
    
    // Get patterns updated since last sync
    const patterns = await this.queryThreatDatabase({
      industries: this.config.consumptionSettings.relevantIndustries,
      categories: this.config.consumptionSettings.relevantCategories,
      from: lastSync,
      limit: 1000,
      sortBy: 'recency',
    });
    
    console.log(`[GuardianNetwork] Synced ${patterns.length} patterns`);
    
    // Cache patterns locally
    for (const pattern of patterns) {
      this.localPatternCache.set(pattern.id, pattern);
    }
    
    await this.saveLastSyncTime(new Date());
    
    // Emit sync complete event
    const stats = await this.getNetworkStatistics();
    this.emit('sync-complete', stats);
  }
  
  /**
   * Match a local incident against known threat patterns
   */
  async matchIncidentToPatterns(incident: LocalIncident): Promise<PatternMatchResult | null> {
    if (!this.config.enabled || !this.config.consumptionSettings.enablePatternMatching) {
      return null;
    }
    
    const anonymizedPattern = this.anonymizer.anonymizeIncident(incident);
    
    // Find similar patterns
    const matchedPatterns: PatternMatchResult['matchedPatterns'] = [];
    
    for (const [, pattern] of this.localPatternCache) {
      const similarity = this.calculateSimilarity(anonymizedPattern, pattern);
      
      if (similarity >= 0.6) { // Threshold for meaningful match
        matchedPatterns.push({
          patternId: pattern.id,
          pattern,
          similarityScore: similarity,
          matchedAttributes: this.getMatchedAttributes(anonymizedPattern, pattern),
          confidence: pattern.confidence,
        });
      }
    }
    
    if (matchedPatterns.length === 0) {
      return null;
    }
    
    // Sort by similarity
    matchedPatterns.sort((a, b) => b.similarityScore - a.similarityScore);
    
    // Build intelligence summary
    const intelligence = this.buildIntelligenceSummary(matchedPatterns);
    
    // Generate recommendations
    const recommendedActions = this.generateRecommendations(matchedPatterns);
    
    const result: PatternMatchResult = {
      localIncidentId: incident.id,
      matchedPatterns: matchedPatterns.slice(0, 5), // Top 5 matches
      intelligence,
      recommendedActions,
    };
    
    this.emit('pattern-matched', result);
    
    return result;
  }
  
  // ============================================================================
  // Benchmark Scoring
  // ============================================================================
  
  /**
   * Get benchmark metrics for your deployment
   */
  async getBenchmarkMetrics(period: { startDate: Date; endDate: Date }): Promise<BenchmarkMetrics | null> {
    if (!this.config.enabled || !this.config.privacySettings.shareBenchmarkData) {
      return null;
    }
    
    try {
      const response = await fetch(
        `${this.config.networkEndpoints.benchmarkService}/metrics`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.authentication.apiKey}`,
            'X-Deployment-Id': this.config.deploymentId,
          },
          body: JSON.stringify({
            deploymentId: this.config.deploymentId,
            period,
            // Include your metrics for comparison
            yourMetrics: await this.gatherLocalMetrics(period),
          }),
        }
      );
      
      if (!response.ok) {
        throw new Error(`Benchmark request failed: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('[GuardianNetwork] Failed to get benchmarks:', error);
      return null;
    }
  }
  
  // ============================================================================
  // Industry Intelligence
  // ============================================================================
  
  /**
   * Get latest industry intelligence report
   */
  async getIndustryIntelligence(vertical: IndustryVertical): Promise<IndustryIntelligenceReport | null> {
    if (!this.config.enabled) {
      return null;
    }
    
    try {
      const response = await fetch(
        `${this.config.networkEndpoints.threatIntelligenceHub}/reports/${vertical}/latest`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.authentication.apiKey}`,
            'X-Deployment-Id': this.config.deploymentId,
          },
        }
      );
      
      if (!response.ok) {
        throw new Error(`Intelligence request failed: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('[GuardianNetwork] Failed to get industry intelligence:', error);
      return null;
    }
  }
  
  /**
   * Acknowledge a threat alert
   */
  async acknowledgeThreatAlert(alertId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.config.networkEndpoints.threatIntelligenceHub}/alerts/${alertId}/acknowledge`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.authentication.apiKey}`,
            'X-Deployment-Id': this.config.deploymentId,
          },
        }
      );
      
      return response.ok;
    } catch (error) {
      console.error('[GuardianNetwork] Failed to acknowledge alert:', error);
      return false;
    }
  }
  
  // ============================================================================
  // Statistics & Monitoring
  // ============================================================================
  
  async getNetworkStatistics(): Promise<NetworkStatistics> {
    try {
      const response = await fetch(
        `${this.config.networkEndpoints.threatIntelligenceHub}/statistics`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.authentication.apiKey}`,
            'X-Deployment-Id': this.config.deploymentId,
          },
        }
      );
      
      if (!response.ok) {
        throw new Error(`Statistics request failed: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('[GuardianNetwork] Failed to get statistics:', error);
      
      // Return default stats
      return {
        contribution: {
          patternsShared: 0,
          verifiedPatterns: 0,
          usefulnessScore: 0,
        },
        benefit: {
          patternsReceived: this.localPatternCache.size,
          localMatchCount: 0,
          preventedIncidents: 0,
          improvedResponseTime: 0,
        },
        network: {
          totalDeployments: 0,
          activeDeployments: 0,
          totalPatterns: 0,
          recentPatterns: 0,
          totalIndustries: 0,
          globalIncidentCount: 0,
        },
        sync: {
          lastSyncAt: await this.getLastSyncTime(),
          syncStatus: 'offline',
          pendingUploads: 0,
          pendingDownloads: 0,
        },
      };
    }
  }
  
  // ============================================================================
  // Private Helper Methods
  // ============================================================================
  
  private calculateSimilarity(pattern1: ThreatPattern, pattern2: ThreatPattern): number {
    let score = 0;
    let weights = 0;
    
    // Category match (weight: 0.3)
    if (pattern1.category === pattern2.category) {
      score += 0.3;
    }
    weights += 0.3;
    
    // Time of day match (weight: 0.1)
    if (pattern1.timeOfDay === pattern2.timeOfDay) {
      score += 0.1;
    }
    weights += 0.1;
    
    // Location category match (weight: 0.15)
    if (pattern1.locationCategory === pattern2.locationCategory) {
      score += 0.15;
    }
    weights += 0.15;
    
    // Behavioral signature similarity (weight: 0.35)
    const behavioralSim = this.compareBehavioralSignatures(
      pattern1.behavioralSignature,
      pattern2.behavioralSignature
    );
    score += behavioralSim * 0.35;
    weights += 0.35;
    
    // Detection methods overlap (weight: 0.1)
    const methodsOverlap = this.calculateArrayOverlap(
      pattern1.detectionMethods,
      pattern2.detectionMethods
    );
    score += methodsOverlap * 0.1;
    weights += 0.1;
    
    return score / weights;
  }
  
  private compareBehavioralSignatures(
    sig1: ThreatPattern['behavioralSignature'],
    sig2: ThreatPattern['behavioralSignature']
  ): number {
    let matches = 0;
    let total = 0;
    
    const fields: (keyof ThreatPattern['behavioralSignature'])[] = [
      'approachPattern',
      'targetType',
      'entryMethod',
      'vehicleInvolved',
      'coordinatedAttack',
    ];
    
    for (const field of fields) {
      if (sig1[field] !== undefined && sig2[field] !== undefined) {
        total++;
        if (sig1[field] === sig2[field]) {
          matches++;
        }
      }
    }
    
    return total > 0 ? matches / total : 0;
  }
  
  private calculateArrayOverlap(arr1: string[], arr2: string[]): number {
    if (arr1.length === 0 || arr2.length === 0) return 0;
    
    const set1 = new Set(arr1);
    const set2 = new Set(arr2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    
    return intersection.size / Math.max(set1.size, set2.size);
  }
  
  private getMatchedAttributes(pattern1: ThreatPattern, pattern2: ThreatPattern): string[] {
    const matched: string[] = [];
    
    if (pattern1.category === pattern2.category) matched.push('category');
    if (pattern1.timeOfDay === pattern2.timeOfDay) matched.push('timeOfDay');
    if (pattern1.locationCategory === pattern2.locationCategory) matched.push('locationCategory');
    if (pattern1.behavioralSignature.targetType === pattern2.behavioralSignature.targetType) {
      matched.push('targetType');
    }
    if (pattern1.behavioralSignature.entryMethod === pattern2.behavioralSignature.entryMethod) {
      matched.push('entryMethod');
    }
    
    return matched;
  }
  
  private buildIntelligenceSummary(matches: PatternMatchResult['matchedPatterns']): PatternMatchResult['intelligence'] {
    const patterns = matches.map(m => m.pattern);
    
    const affectedVerticals = [...new Set(patterns.map(p => p.industryVertical))];
    const totalOccurrences = patterns.reduce((sum, p) => sum + p.matchCount, 0);
    const lastSeen = new Date(Math.max(...patterns.map(p => p.lastMatchedAt?.getTime() || 0)));
    
    // Calculate success rate (if outcome data available)
    const withOutcome = patterns.filter(p => p.outcome !== 'unknown');
    const prevented = withOutcome.filter(p => p.outcome === 'prevented').length;
    const successRate = withOutcome.length > 0 ? prevented / withOutcome.length : 0;
    
    // Average response time
    const withResponseTime = patterns.filter(p => p.responseTime !== undefined);
    const avgResponseTime = withResponseTime.length > 0
      ? withResponseTime.reduce((sum, p) => sum + (p.responseTime || 0), 0) / withResponseTime.length
      : 0;
    
    return {
      knownTactic: matches.length > 0,
      previousOccurrences: totalOccurrences,
      lastSeenGlobally: lastSeen,
      affectedVerticals,
      successRate,
      averageResponseTime: avgResponseTime,
    };
  }
  
  private generateRecommendations(matches: PatternMatchResult['matchedPatterns']): PatternMatchResult['recommendedActions'] {
    const recommendations: PatternMatchResult['recommendedActions'] = [];
    
    // Analyze patterns for common recommendations
    const topMatches = matches.slice(0, 3);
    
    for (const match of topMatches) {
      const pattern = match.pattern;
      
      // High-confidence matches get immediate actions
      if (match.similarityScore >= 0.8) {
        if (pattern.outcome === 'prevented') {
          recommendations.push({
            action: `Deploy proven countermeasure: This tactic was successfully prevented ${pattern.matchCount} times using ${pattern.detectionMethods.join(', ')}`,
            priority: 'immediate',
            rationale: `Pattern ${pattern.id} has ${Math.round(match.similarityScore * 100)}% similarity to your incident`,
            basedOnPatternIds: [pattern.id],
          });
        }
        
        if (pattern.behavioralSignature.coordinatedAttack) {
          recommendations.push({
            action: 'Alert security: This appears to be a coordinated attack. Multiple actors detected in similar incidents.',
            priority: 'immediate',
            rationale: 'Coordinated attacks require rapid multi-team response',
            basedOnPatternIds: [pattern.id],
          });
        }
      }
    }
    
    // Add general recommendations based on category
    const category = topMatches[0]?.pattern.category;
    if (category) {
      recommendations.push({
        action: `Review ${category} prevention protocols and ensure all relevant AI capabilities are enabled`,
        priority: 'high',
        rationale: `This incident matches known ${category} patterns`,
        basedOnPatternIds: topMatches.map(m => m.patternId),
      });
    }
    
    return recommendations;
  }
  
  private async gatherLocalMetrics(period: { startDate: Date; endDate: Date }): Promise<any> {
    // This would integrate with your local analytics database
    // Placeholder implementation
    return {
      incidentCount: 0,
      preventionRate: 0,
      detectionRate: 0,
      averageResponseTime: 0,
      falsePositiveRate: 0,
    };
  }
  
  private async getLastSyncTime(): Promise<Date> {
    // Implement persistent storage (Redis, DB, etc.)
    // Placeholder: return 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return thirtyDaysAgo;
  }
  
  private async saveLastSyncTime(time: Date): Promise<void> {
    // Implement persistent storage
    console.log('[GuardianNetwork] Last sync time:', time.toISOString());
  }
  
  private handlePatternUpdate(payload: any): void {
    // Update local cache when patterns are updated globally
    if (payload.pattern && payload.pattern.id) {
      this.localPatternCache.set(payload.pattern.id, payload.pattern);
    }
  }
}

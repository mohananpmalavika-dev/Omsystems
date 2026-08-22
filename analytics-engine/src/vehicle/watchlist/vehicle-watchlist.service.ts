/**
 * Vehicle Watchlist Service
 * Manages watchlists and real-time matching
 */

import type { VehicleEvent } from '../persistence/vehicle-event.model.js';

export interface VehicleWatchlistEntry {
  id: string;
  tenantId: string;
  
  normalizedPlate: string;
  
  label?: string;
  reason?: string;
  description?: string;
  
  severity: 'low' | 'medium' | 'high' | 'critical';
  
  category?: 'stolen' | 'wanted' | 'vip' | 'blocked' | 'suspicious' | 'other';
  
  activeFrom?: Date;
  activeUntil?: Date;
  
  enabled: boolean;
  
  alertConfig?: {
    notifyEmail?: string[];
    notifySMS?: string[];
    notifyWebhook?: string;
    requireImmediateResponse?: boolean;
  };
  
  metadata?: Record<string, any>;
  
  createdAt: Date;
  createdBy?: string;
  updatedAt?: Date;
}

export interface WatchlistMatch {
  matchId: string;
  
  watchlistEntry: VehicleWatchlistEntry;
  vehicleEvent: VehicleEvent;
  
  matchedAt: Date;
  matchConfidence: number;
  
  plateMatch: {
    watchlistPlate: string;
    detectedPlate: string;
    exactMatch: boolean;
    similarity: number;
  };
  
  status: 'pending' | 'acknowledged' | 'resolved' | 'false-positive';
  
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  
  resolution?: {
    action: string;
    notes?: string;
    resolvedBy?: string;
    resolvedAt?: Date;
  };
}

export interface WatchlistMatchAlert {
  alertId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  
  title: string;
  message: string;
  
  match: WatchlistMatch;
  
  requiresAlert: boolean;
  requiresImmediateResponse: boolean;
  
  createdAt: Date;
}

export class VehicleWatchlistService {
  private watchlists = new Map<string, VehicleWatchlistEntry[]>();
  private matches: WatchlistMatch[] = [];
  
  /**
   * Load watchlist for a tenant
   */
  async loadWatchlist(tenantId: string, entries: VehicleWatchlistEntry[]): Promise<void> {
    const active = entries.filter(e => this.isActive(e));
    this.watchlists.set(tenantId, active);
    console.log(`Loaded ${active.length} active watchlist entries for tenant ${tenantId}`);
  }
  
  /**
   * Add entry to watchlist
   */
  async addEntry(entry: VehicleWatchlistEntry): Promise<void> {
    const watchlist = this.watchlists.get(entry.tenantId) || [];
    
    // Check for duplicates
    const existing = watchlist.find(
      e => e.normalizedPlate === entry.normalizedPlate
    );
    
    if (existing) {
      throw new Error(`Plate ${entry.normalizedPlate} already on watchlist`);
    }
    
    watchlist.push(entry);
    this.watchlists.set(entry.tenantId, watchlist);
  }
  
  /**
   * Remove entry from watchlist
   */
  async removeEntry(tenantId: string, entryId: string): Promise<boolean> {
    const watchlist = this.watchlists.get(tenantId);
    if (!watchlist) return false;
    
    const index = watchlist.findIndex(e => e.id === entryId);
    if (index === -1) return false;
    
    watchlist.splice(index, 1);
    return true;
  }
  
  /**
   * Update entry
   */
  async updateEntry(entry: VehicleWatchlistEntry): Promise<void> {
    const watchlist = this.watchlists.get(entry.tenantId);
    if (!watchlist) {
      throw new Error(`Watchlist not found for tenant ${entry.tenantId}`);
    }
    
    const index = watchlist.findIndex(e => e.id === entry.id);
    if (index === -1) {
      throw new Error(`Watchlist entry ${entry.id} not found`);
    }
    
    watchlist[index] = { ...entry, updatedAt: new Date() };
  }
  
  /**
   * Check vehicle event against watchlist
   */
  async check(event: VehicleEvent): Promise<WatchlistMatch | null> {
    if (!event.normalizedPlate) return null;
    
    const watchlist = this.watchlists.get(event.tenantId);
    if (!watchlist || watchlist.length === 0) return null;
    
    // Find matching entry
    const entry = watchlist.find(
      e => this.matchesPlate(e.normalizedPlate, event.normalizedPlate!)
    );
    
    if (!entry) return null;
    
    // Calculate match confidence
    const similarity = this.calculatePlateSimilarity(
      entry.normalizedPlate,
      event.normalizedPlate!
    );
    
    const plateConfidence = event.plateConfidence || 0;
    const matchConfidence = similarity * plateConfidence;
    
    // Create match record
    const match: WatchlistMatch = {
      matchId: `match_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      watchlistEntry: entry,
      vehicleEvent: event,
      matchedAt: new Date(),
      matchConfidence,
      plateMatch: {
        watchlistPlate: entry.normalizedPlate,
        detectedPlate: event.normalizedPlate!,
        exactMatch: entry.normalizedPlate === event.normalizedPlate,
        similarity,
      },
      status: 'pending',
    };
    
    this.matches.push(match);
    
    return match;
  }
  
  /**
   * Create alert from match
   */
  createAlert(match: WatchlistMatch): WatchlistMatchAlert {
    const entry = match.watchlistEntry;
    const event = match.vehicleEvent;
    
    const title = `Watchlist Match: ${entry.normalizedPlate}`;
    
    let message = `Vehicle ${event.normalizedPlate} matched watchlist entry.\n`;
    message += `Camera: ${event.cameraId}\n`;
    message += `Time: ${event.occurredAt.toISOString()}\n`;
    message += `Reason: ${entry.reason || 'N/A'}\n`;
    message += `Confidence: ${Math.round(match.matchConfidence * 100)}%`;
    
    return {
      alertId: `alert_${match.matchId}`,
      severity: entry.severity,
      title,
      message,
      match,
      requiresAlert: true,
      requiresImmediateResponse: entry.alertConfig?.requireImmediateResponse || entry.severity === 'critical',
      createdAt: new Date(),
    };
  }
  
  /**
   * Acknowledge match
   */
  async acknowledgeMatch(
    matchId: string,
    acknowledgedBy: string
  ): Promise<void> {
    const match = this.matches.find(m => m.matchId === matchId);
    if (!match) {
      throw new Error(`Match ${matchId} not found`);
    }
    
    match.status = 'acknowledged';
    match.acknowledgedBy = acknowledgedBy;
    match.acknowledgedAt = new Date();
  }
  
  /**
   * Resolve match
   */
  async resolveMatch(
    matchId: string,
    resolution: {
      action: string;
      notes?: string;
      resolvedBy: string;
      isFalsePositive?: boolean;
    }
  ): Promise<void> {
    const match = this.matches.find(m => m.matchId === matchId);
    if (!match) {
      throw new Error(`Match ${matchId} not found`);
    }
    
    match.status = resolution.isFalsePositive ? 'false-positive' : 'resolved';
    match.resolution = {
      action: resolution.action,
      notes: resolution.notes,
      resolvedBy: resolution.resolvedBy,
      resolvedAt: new Date(),
    };
  }
  
  /**
   * Get all entries for tenant
   */
  getWatchlist(tenantId: string): VehicleWatchlistEntry[] {
    return this.watchlists.get(tenantId) || [];
  }
  
  /**
   * Get pending matches for tenant
   */
  getPendingMatches(tenantId: string): WatchlistMatch[] {
    return this.matches.filter(
      m => m.vehicleEvent.tenantId === tenantId && m.status === 'pending'
    );
  }
  
  /**
   * Get all matches for a plate
   */
  getMatchesForPlate(tenantId: string, plate: string): WatchlistMatch[] {
    return this.matches.filter(
      m => m.vehicleEvent.tenantId === tenantId &&
           m.vehicleEvent.normalizedPlate === plate
    );
  }
  
  /**
   * Get match statistics
   */
  getStats(tenantId: string, since?: Date): {
    totalMatches: number;
    pendingMatches: number;
    resolvedMatches: number;
    falsePositives: number;
    bySeverity: Record<string, number>;
  } {
    let matches = this.matches.filter(m => m.vehicleEvent.tenantId === tenantId);
    
    if (since) {
      matches = matches.filter(m => m.matchedAt >= since);
    }
    
    const bySeverity: Record<string, number> = {};
    
    for (const match of matches) {
      const severity = match.watchlistEntry.severity;
      bySeverity[severity] = (bySeverity[severity] || 0) + 1;
    }
    
    return {
      totalMatches: matches.length,
      pendingMatches: matches.filter(m => m.status === 'pending').length,
      resolvedMatches: matches.filter(m => m.status === 'resolved').length,
      falsePositives: matches.filter(m => m.status === 'false-positive').length,
      bySeverity,
    };
  }
  
  /**
   * Clean up old matches
   */
  cleanup(olderThan: Date): number {
    const before = this.matches.length;
    this.matches = this.matches.filter(
      m => m.matchedAt >= olderThan || m.status === 'pending'
    );
    return before - this.matches.length;
  }
  
  /**
   * Check if entry is currently active
   */
  private isActive(entry: VehicleWatchlistEntry): boolean {
    if (!entry.enabled) return false;
    
    const now = new Date();
    
    if (entry.activeFrom && now < entry.activeFrom) return false;
    if (entry.activeUntil && now > entry.activeUntil) return false;
    
    return true;
  }
  
  /**
   * Check if plates match (with fuzzy matching)
   */
  private matchesPlate(watchlistPlate: string, detectedPlate: string): boolean {
    // Exact match
    if (watchlistPlate === detectedPlate) return true;
    
    // Allow 1 character difference for OCR errors
    if (this.levenshteinDistance(watchlistPlate, detectedPlate) <= 1) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Calculate plate similarity (0-1)
   */
  private calculatePlateSimilarity(plate1: string, plate2: string): number {
    if (plate1 === plate2) return 1.0;
    
    const distance = this.levenshteinDistance(plate1, plate2);
    const maxLen = Math.max(plate1.length, plate2.length);
    
    return maxLen > 0 ? 1 - distance / maxLen : 0;
  }
  
  /**
   * Calculate Levenshtein distance
   */
  private levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    
    const matrix: number[][] = [];
    
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= a.length; j++) {
      if (matrix[0]) {
        matrix[0][j] = j;
      }
    }
    
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        const row = matrix[i];
        const prevRow = matrix[i - 1];
        
        if (!row || !prevRow) continue;
        
        if (b[i - 1] === a[j - 1]) {
          row[j] = prevRow[j - 1]!;
        } else {
          row[j] = Math.min(
            prevRow[j - 1]! + 1,
            row[j - 1]! + 1,
            prevRow[j]! + 1
          );
        }
      }
    }
    
    const lastRow = matrix[b.length];
    return lastRow ? lastRow[a.length]! : 0;
  }
}

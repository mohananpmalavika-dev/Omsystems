/**
 * Vehicle Watchlist Service
 * Manages watchlists and real-time matching
 */
export class VehicleWatchlistService {
    watchlists = new Map();
    matches = [];
    /**
     * Load watchlist for a tenant
     */
    async loadWatchlist(tenantId, entries) {
        const active = entries.filter(e => this.isActive(e));
        this.watchlists.set(tenantId, active);
        console.log(`Loaded ${active.length} active watchlist entries for tenant ${tenantId}`);
    }
    /**
     * Add entry to watchlist
     */
    async addEntry(entry) {
        const watchlist = this.watchlists.get(entry.tenantId) || [];
        // Check for duplicates
        const existing = watchlist.find(e => e.normalizedPlate === entry.normalizedPlate);
        if (existing) {
            throw new Error(`Plate ${entry.normalizedPlate} already on watchlist`);
        }
        watchlist.push(entry);
        this.watchlists.set(entry.tenantId, watchlist);
    }
    /**
     * Remove entry from watchlist
     */
    async removeEntry(tenantId, entryId) {
        const watchlist = this.watchlists.get(tenantId);
        if (!watchlist)
            return false;
        const index = watchlist.findIndex(e => e.id === entryId);
        if (index === -1)
            return false;
        watchlist.splice(index, 1);
        return true;
    }
    /**
     * Update entry
     */
    async updateEntry(entry) {
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
    async check(event) {
        if (!event.normalizedPlate)
            return null;
        const watchlist = this.watchlists.get(event.tenantId);
        if (!watchlist || watchlist.length === 0)
            return null;
        // Find matching entry
        const entry = watchlist.find(e => this.matchesPlate(e.normalizedPlate, event.normalizedPlate));
        if (!entry)
            return null;
        // Calculate match confidence
        const similarity = this.calculatePlateSimilarity(entry.normalizedPlate, event.normalizedPlate);
        const plateConfidence = event.plateConfidence || 0;
        const matchConfidence = similarity * plateConfidence;
        // Create match record
        const match = {
            matchId: `match_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            watchlistEntry: entry,
            vehicleEvent: event,
            matchedAt: new Date(),
            matchConfidence,
            plateMatch: {
                watchlistPlate: entry.normalizedPlate,
                detectedPlate: event.normalizedPlate,
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
    createAlert(match) {
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
    async acknowledgeMatch(matchId, acknowledgedBy) {
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
    async resolveMatch(matchId, resolution) {
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
    getWatchlist(tenantId) {
        return this.watchlists.get(tenantId) || [];
    }
    /**
     * Get pending matches for tenant
     */
    getPendingMatches(tenantId) {
        return this.matches.filter(m => m.vehicleEvent.tenantId === tenantId && m.status === 'pending');
    }
    /**
     * Get all matches for a plate
     */
    getMatchesForPlate(tenantId, plate) {
        return this.matches.filter(m => m.vehicleEvent.tenantId === tenantId &&
            m.vehicleEvent.normalizedPlate === plate);
    }
    /**
     * Get match statistics
     */
    getStats(tenantId, since) {
        let matches = this.matches.filter(m => m.vehicleEvent.tenantId === tenantId);
        if (since) {
            matches = matches.filter(m => m.matchedAt >= since);
        }
        const bySeverity = {};
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
    cleanup(olderThan) {
        const before = this.matches.length;
        this.matches = this.matches.filter(m => m.matchedAt >= olderThan || m.status === 'pending');
        return before - this.matches.length;
    }
    /**
     * Check if entry is currently active
     */
    isActive(entry) {
        if (!entry.enabled)
            return false;
        const now = new Date();
        if (entry.activeFrom && now < entry.activeFrom)
            return false;
        if (entry.activeUntil && now > entry.activeUntil)
            return false;
        return true;
    }
    /**
     * Check if plates match (with fuzzy matching)
     */
    matchesPlate(watchlistPlate, detectedPlate) {
        // Exact match
        if (watchlistPlate === detectedPlate)
            return true;
        // Allow 1 character difference for OCR errors
        if (this.levenshteinDistance(watchlistPlate, detectedPlate) <= 1) {
            return true;
        }
        return false;
    }
    /**
     * Calculate plate similarity (0-1)
     */
    calculatePlateSimilarity(plate1, plate2) {
        if (plate1 === plate2)
            return 1.0;
        const distance = this.levenshteinDistance(plate1, plate2);
        const maxLen = Math.max(plate1.length, plate2.length);
        return maxLen > 0 ? 1 - distance / maxLen : 0;
    }
    /**
     * Calculate Levenshtein distance
     */
    levenshteinDistance(a, b) {
        if (a.length === 0)
            return b.length;
        if (b.length === 0)
            return a.length;
        const matrix = [];
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
                if (!row || !prevRow)
                    continue;
                if (b[i - 1] === a[j - 1]) {
                    row[j] = prevRow[j - 1];
                }
                else {
                    row[j] = Math.min(prevRow[j - 1] + 1, row[j - 1] + 1, prevRow[j] + 1);
                }
            }
        }
        const lastRow = matrix[b.length];
        return lastRow ? lastRow[a.length] : 0;
    }
}

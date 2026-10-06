/**
 * Industrial Rule Types
 *
 * Type definitions for industrial safety and compliance rules
 */
/**
 * Rule state manager for temporal confirmation
 */
export class RuleStateManager {
    states = new Map();
    /**
     * Update or create state
     */
    updateState(ruleId, key, timestamp) {
        const stateKey = `${ruleId}:${key}`;
        const existing = this.states.get(stateKey);
        if (existing) {
            existing.lastObservedAt = timestamp;
            existing.consecutiveFrames++;
            return existing;
        }
        const newState = {
            ruleId,
            key,
            firstObservedAt: timestamp,
            lastObservedAt: timestamp,
            consecutiveFrames: 1,
            confirmed: false,
        };
        this.states.set(stateKey, newState);
        return newState;
    }
    /**
     * Get state
     */
    getState(ruleId, key) {
        return this.states.get(`${ruleId}:${key}`);
    }
    /**
     * Remove state
     */
    removeState(ruleId, key) {
        return this.states.delete(`${ruleId}:${key}`);
    }
    /**
     * Clear old states (not seen recently)
     */
    clearOldStates(olderThan) {
        let removed = 0;
        for (const [key, state] of this.states.entries()) {
            if (state.lastObservedAt < olderThan) {
                this.states.delete(key);
                removed++;
            }
        }
        return removed;
    }
    /**
     * Clear all states
     */
    clearAll() {
        this.states.clear();
    }
    /**
     * Get statistics
     */
    getStatistics() {
        return {
            totalStates: this.states.size,
            confirmedStates: Array.from(this.states.values()).filter((s) => s.confirmed).length,
        };
    }
}

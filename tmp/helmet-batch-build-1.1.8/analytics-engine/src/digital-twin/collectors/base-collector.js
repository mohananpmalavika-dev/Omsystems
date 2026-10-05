/**
 * Base Collector Interface
 *
 * Common interface for all infrastructure collectors.
 */
export class BaseCollector {
    /**
     * Helper to create collector result
     */
    createResult(assets, relationships, errors = []) {
        return {
            assets,
            relationships,
            errors,
            collectedAt: new Date()
        };
    }
    /**
     * Helper to handle collector errors
     */
    handleError(error, context) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[${this.getName()}] Error in ${context}:`, message);
        return { message: `${context}: ${message}` };
    }
}

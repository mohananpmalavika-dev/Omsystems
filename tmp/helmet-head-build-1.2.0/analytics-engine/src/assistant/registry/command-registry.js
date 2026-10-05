/**
 * Command Registry
 *
 * Manages available assistant commands and their metadata.
 * Enables runtime capability discovery and dependency checking.
 */
/**
 * Command Registry
 *
 * Central registry of all available assistant commands
 */
export class AssistantCommandRegistry {
    commands = new Map();
    intentToCommand = new Map();
    /**
     * Register a command
     */
    register(metadata, command, intents) {
        // Validate metadata
        if (!metadata.id) {
            throw new Error('Command metadata must include an id');
        }
        if (this.commands.has(metadata.id)) {
            throw new Error(`Command ${metadata.id} is already registered`);
        }
        // Store command
        this.commands.set(metadata.id, {
            metadata,
            command,
            intentMapping: intents
        });
        // Map intents to command
        for (const intent of intents) {
            if (this.intentToCommand.has(intent)) {
                console.warn(`Intent ${intent} is already mapped to ${this.intentToCommand.get(intent)}, ` +
                    `overriding with ${metadata.id}`);
            }
            this.intentToCommand.set(intent, metadata.id);
        }
        console.log(`[CommandRegistry] Registered command: ${metadata.id} for intents: ${intents.join(', ')}`);
    }
    /**
     * Get command by ID
     */
    get(commandId) {
        const entry = this.commands.get(commandId);
        return entry?.command;
    }
    /**
     * Get command metadata
     */
    getMetadata(commandId) {
        const entry = this.commands.get(commandId);
        return entry?.metadata;
    }
    /**
     * Resolve command for an intent
     */
    resolveIntent(intent) {
        const commandId = this.intentToCommand.get(intent);
        if (!commandId) {
            return undefined;
        }
        const entry = this.commands.get(commandId);
        // Check if command is enabled
        if (!entry || !entry.metadata.enabled) {
            return undefined;
        }
        return entry.command;
    }
    /**
     * Get command ID for an intent
     */
    getCommandIdForIntent(intent) {
        return this.intentToCommand.get(intent);
    }
    /**
     * Check if an intent is supported
     */
    isIntentSupported(intent) {
        const commandId = this.intentToCommand.get(intent);
        if (!commandId) {
            return false;
        }
        const entry = this.commands.get(commandId);
        return entry?.metadata.enabled ?? false;
    }
    /**
     * List all registered commands
     */
    listCommands() {
        return Array.from(this.commands.values()).map(entry => entry.metadata);
    }
    /**
     * List enabled commands
     */
    listEnabledCommands() {
        return Array.from(this.commands.values())
            .filter(entry => entry.metadata.enabled)
            .map(entry => entry.metadata);
    }
    /**
     * Enable a command
     */
    enable(commandId) {
        const entry = this.commands.get(commandId);
        if (!entry) {
            throw new Error(`Command ${commandId} not found`);
        }
        entry.metadata.enabled = true;
        console.log(`[CommandRegistry] Enabled command: ${commandId}`);
    }
    /**
     * Disable a command
     */
    disable(commandId) {
        const entry = this.commands.get(commandId);
        if (!entry) {
            throw new Error(`Command ${commandId} not found`);
        }
        entry.metadata.enabled = false;
        console.log(`[CommandRegistry] Disabled command: ${commandId}`);
    }
    /**
     * Get commands by risk level
     */
    getCommandsByRisk(risk) {
        return Array.from(this.commands.values())
            .filter(entry => entry.metadata.risk === risk)
            .map(entry => entry.metadata);
    }
    /**
     * Clear all commands (for testing)
     */
    clear() {
        this.commands.clear();
        this.intentToCommand.clear();
    }
}
/**
 * Global command registry instance
 */
export const commandRegistry = new AssistantCommandRegistry();

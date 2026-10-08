/**
 * Command Registry
 * 
 * Manages available assistant commands and their metadata.
 * Enables runtime capability discovery and dependency checking.
 */

import type {
  AssistantCommand,
  CommandMetadata,
  CommandRisk,
  AssistantContext
} from '../types/index.js';
import type { IntentType } from '../types/parsed-query.js';

/**
 * Command registry entry
 */
interface CommandRegistryEntry<TInput = any, TOutput = any> {
  metadata: CommandMetadata;
  command: AssistantCommand<TInput, TOutput>;
  intentMapping: IntentType[];
}

/**
 * Command Registry
 * 
 * Central registry of all available assistant commands
 */
export class AssistantCommandRegistry {
  private commands: Map<string, CommandRegistryEntry> = new Map();
  private intentToCommand: Map<IntentType, string> = new Map();
  
  /**
   * Register a command
   */
  register<TInput, TOutput>(
    metadata: CommandMetadata,
    command: AssistantCommand<TInput, TOutput>,
    intents: IntentType[]
  ): void {
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
        console.warn(
          `Intent ${intent} is already mapped to ${this.intentToCommand.get(intent)}, ` +
          `overriding with ${metadata.id}`
        );
      }
      this.intentToCommand.set(intent, metadata.id);
    }
    
    console.log(`[CommandRegistry] Registered command: ${metadata.id} for intents: ${intents.join(', ')}`);
  }
  
  /**
   * Get command by ID
   */
  get(commandId: string): AssistantCommand<any, any> | undefined {
    const entry = this.commands.get(commandId);
    return entry?.command;
  }
  
  /**
   * Get command metadata
   */
  getMetadata(commandId: string): CommandMetadata | undefined {
    const entry = this.commands.get(commandId);
    return entry?.metadata;
  }
  
  /**
   * Resolve command for an intent
   */
  resolveIntent(intent: IntentType): AssistantCommand<any, any> | undefined {
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
  getCommandIdForIntent(intent: IntentType): string | undefined {
    return this.intentToCommand.get(intent);
  }
  
  /**
   * Check if an intent is supported
   */
  isIntentSupported(intent: IntentType): boolean {
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
  listCommands(): CommandMetadata[] {
    return Array.from(this.commands.values()).map(entry => entry.metadata);
  }
  
  /**
   * List enabled commands
   */
  listEnabledCommands(): CommandMetadata[] {
    return Array.from(this.commands.values())
      .filter(entry => entry.metadata.enabled)
      .map(entry => entry.metadata);
  }
  
  /**
   * Enable a command
   */
  enable(commandId: string): void {
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
  disable(commandId: string): void {
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
  getCommandsByRisk(risk: CommandRisk): CommandMetadata[] {
    return Array.from(this.commands.values())
      .filter(entry => entry.metadata.risk === risk)
      .map(entry => entry.metadata);
  }
  
  /**
   * Clear all commands (for testing)
   */
  clear(): void {
    this.commands.clear();
    this.intentToCommand.clear();
  }
}

/**
 * Global command registry instance
 */
export const commandRegistry = new AssistantCommandRegistry();

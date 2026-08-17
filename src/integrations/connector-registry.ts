/**
 * Integration Connector Registry
 * 
 * Central registry for all integration connectors.
 * Provides plugin discovery, registration, and lifecycle management.
 */

import type { 
  IntegrationConnector, 
  IntegrationType, 
  IntegrationConfig,
  IntegrationEvent,
  IntegrationResponse
} from './types.js';

export class ConnectorRegistry {
  private connectors: Map<IntegrationType, IntegrationConnector> = new Map();
  private instances: Map<string, IntegrationConnector> = new Map();

  /**
   * Register a connector implementation
   */
  register(connector: IntegrationConnector): void {
    this.connectors.set(connector.type, connector);
  }

  /**
   * Get connector by type
   */
  getConnector(type: IntegrationType): IntegrationConnector | undefined {
    return this.connectors.get(type);
  }

  /**
   * Get all registered connector types
   */
  getAvailableTypes(): IntegrationType[] {
    return Array.from(this.connectors.keys());
  }

  /**
   * Get all registered connectors
   */
  getAllConnectors(): IntegrationConnector[] {
    return Array.from(this.connectors.values());
  }

  /**
   * Initialize a connector instance
   */
  async initializeConnector(config: IntegrationConfig): Promise<void> {
    const connector = this.connectors.get(config.type);
    if (!connector) {
      throw new Error(`No connector registered for type: ${config.type}`);
    }

    // Create a new instance (or reuse if stateless)
    const instance = connector;
    await instance.initialize(config);
    
    this.instances.set(config.id, instance);
  }

  /**
   * Destroy a connector instance
   */
  async destroyConnector(configId: string): Promise<void> {
    const instance = this.instances.get(configId);
    if (instance) {
      await instance.destroy();
      this.instances.delete(configId);
    }
  }

  /**
   * Get connector instance
   */
  getInstance(configId: string): IntegrationConnector | undefined {
    return this.instances.get(configId);
  }

  /**
   * Test a connector's connection
   */
  async testConnection(config: IntegrationConfig): Promise<{ success: boolean; message: string; details?: any }> {
    const connector = this.connectors.get(config.type);
    if (!connector) {
      return {
        success: false,
        message: `No connector registered for type: ${config.type}`
      };
    }

    try {
      await connector.initialize(config);
      const result = await connector.testConnection();
      await connector.destroy();
      return result;
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        details: error
      };
    }
  }

  /**
   * Handle event with a connector instance
   */
  async handleEvent(configId: string, event: IntegrationEvent): Promise<IntegrationResponse> {
    const instance = this.instances.get(configId);
    if (!instance) {
      throw new Error(`No active connector instance for config: ${configId}`);
    }

    return instance.handleEvent(event);
  }
}

// Global singleton registry
export const connectorRegistry = new ConnectorRegistry();

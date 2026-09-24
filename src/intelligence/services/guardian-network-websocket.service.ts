/**
 * Guardian Network WebSocket Service
 * 
 * Handles real-time threat intelligence updates via WebSocket connection.
 * Manages reconnection, heartbeat, and message processing.
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import type {
  RealtimeThreatAlert,
  ThreatIntelligenceUpdate,
  ThreatPattern,
  GuardianNetworkConfig,
} from '../guardian-network.types';

interface WebSocketMessage {
  type: 'threat-alert' | 'intelligence-update' | 'pattern-update' | 'heartbeat' | 'connected' | 'error';
  payload?: any;
  timestamp: string;
}

export class GuardianNetworkWebSocketService extends EventEmitter {
  private ws?: WebSocket;
  private config: GuardianNetworkConfig;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000; // Start with 5 seconds
  private maxReconnectDelay = 60000; // Max 1 minute
  private heartbeatInterval?: NodeJS.Timeout;
  private heartbeatTimeout?: NodeJS.Timeout;
  private isConnecting = false;
  private shouldReconnect = true;
  
  constructor(config: GuardianNetworkConfig) {
    super();
    this.config = config;
  }
  
  /**
   * Connect to Guardian Network WebSocket server
   */
  connect(): void {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      console.log('[GuardianNetworkWS] Already connected or connecting');
      return;
    }
    
    this.isConnecting = true;
    this.shouldReconnect = true;
    
    console.log('[GuardianNetworkWS] Connecting to:', this.config.networkEndpoints.realtimeUpdates);
    
    try {
      this.ws = new WebSocket(this.config.networkEndpoints.realtimeUpdates, {
        headers: {
          'Authorization': `Bearer ${this.config.authentication.apiKey}`,
          'X-Deployment-Id': this.config.deploymentId,
          'X-Industry-Vertical': this.config.consumptionSettings.relevantIndustries.join(','),
          'X-Client-Version': '1.0.0',
        },
        handshakeTimeout: 10000,
      });
      
      this.setupEventHandlers();
    } catch (error) {
      console.error('[GuardianNetworkWS] Connection error:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }
  
  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    console.log('[GuardianNetworkWS] Disconnecting...');
    this.shouldReconnect = false;
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = undefined;
    }
    
    this.emit('disconnected');
  }
  
  /**
   * Send a message to the server
   */
  send(message: WebSocketMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[GuardianNetworkWS] Cannot send message: not connected');
      return;
    }
    
    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('[GuardianNetworkWS] Failed to send message:', error);
    }
  }
  
  /**
   * Acknowledge a threat alert
   */
  acknowledgeThreatAlert(alertId: string): void {
    this.send({
      type: 'threat-alert',
      payload: {
        action: 'acknowledge',
        alertId,
      },
      timestamp: new Date().toISOString(),
    });
  }
  
  /**
   * Request specific intelligence updates
   */
  requestIntelligenceUpdate(updateId: string): void {
    this.send({
      type: 'intelligence-update',
      payload: {
        action: 'fetch',
        updateId,
      },
      timestamp: new Date().toISOString(),
    });
  }
  
  /**
   * Get connection status
   */
  getStatus(): {
    connected: boolean;
    reconnectAttempts: number;
    readyState: number | null;
  } {
    return {
      connected: this.ws?.readyState === WebSocket.OPEN,
      reconnectAttempts: this.reconnectAttempts,
      readyState: this.ws?.readyState ?? null,
    };
  }
  
  // ============================================================================
  // Private Methods
  // ============================================================================
  
  private setupEventHandlers(): void {
    if (!this.ws) return;
    
    this.ws.on('open', () => {
      console.log('[GuardianNetworkWS] Connected successfully');
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.reconnectDelay = 5000;
      
      this.startHeartbeat();
      this.emit('connected');
      
      // Send connection confirmation with preferences
      this.send({
        type: 'connected',
        payload: {
          deploymentId: this.config.deploymentId,
          industries: this.config.consumptionSettings.relevantIndustries,
          categories: this.config.consumptionSettings.relevantCategories,
          minimumSeverity: this.config.consumptionSettings.minimumThreatSeverity,
        },
        timestamp: new Date().toISOString(),
      });
    });
    
    this.ws.on('message', (data: WebSocket.Data) => {
      this.handleMessage(data);
    });
    
    this.ws.on('close', (code, reason) => {
      console.log(`[GuardianNetworkWS] Connection closed: ${code} - ${reason.toString()}`);
      this.isConnecting = false;
      this.stopHeartbeat();
      this.emit('disconnected', { code, reason: reason.toString() });
      
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    });
    
    this.ws.on('error', (error) => {
      console.error('[GuardianNetworkWS] WebSocket error:', error);
      this.emit('error', error);
    });
    
    this.ws.on('ping', () => {
      // WebSocket automatically sends pong
      this.resetHeartbeatTimeout();
    });
    
    this.ws.on('pong', () => {
      this.resetHeartbeatTimeout();
    });
  }
  
  private handleMessage(data: WebSocket.Data): void {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());
      
      // Reset heartbeat timeout on any message
      this.resetHeartbeatTimeout();
      
      switch (message.type) {
        case 'threat-alert':
          this.handleThreatAlert(message.payload as RealtimeThreatAlert);
          break;
          
        case 'intelligence-update':
          this.handleIntelligenceUpdate(message.payload as ThreatIntelligenceUpdate);
          break;
          
        case 'pattern-update':
          this.handlePatternUpdate(message.payload);
          break;
          
        case 'heartbeat':
          // Server heartbeat received
          console.log('[GuardianNetworkWS] Heartbeat received');
          break;
          
        case 'error':
          console.error('[GuardianNetworkWS] Server error:', message.payload);
          this.emit('server-error', message.payload);
          break;
          
        default:
          console.warn('[GuardianNetworkWS] Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('[GuardianNetworkWS] Failed to parse message:', error);
    }
  }
  
  private handleThreatAlert(alert: RealtimeThreatAlert): void {
    console.log(`[GuardianNetworkWS] 🚨 Threat Alert: ${alert.title}`);
    
    // Check if alert is relevant to this deployment
    const isRelevant = this.isAlertRelevant(alert);
    if (!isRelevant) {
      console.log('[GuardianNetworkWS] Alert not relevant to this deployment, skipping');
      return;
    }
    
    this.emit('threat-alert', alert);
    
    // Auto-acknowledge if required and critical
    if (alert.acknowledgmentRequired && alert.alertLevel === 'critical') {
      setTimeout(() => {
        this.acknowledgeThreatAlert(alert.id);
      }, 1000);
    }
  }
  
  private handleIntelligenceUpdate(update: ThreatIntelligenceUpdate): void {
    console.log(`[GuardianNetworkWS] 📊 Intelligence Update: ${update.title}`);
    
    // Check relevance
    const isRelevant = this.isUpdateRelevant(update);
    if (!isRelevant) {
      console.log('[GuardianNetworkWS] Update not relevant to this deployment, skipping');
      return;
    }
    
    this.emit('intelligence-update', update);
  }
  
  private handlePatternUpdate(payload: { pattern: ThreatPattern; action: 'created' | 'updated' | 'verified' }): void {
    console.log(`[GuardianNetworkWS] Pattern ${payload.action}: ${payload.pattern.id}`);
    this.emit('pattern-update', payload);
  }
  
  private isAlertRelevant(alert: RealtimeThreatAlert): boolean {
    const { relevantIndustries, relevantCategories, minimumThreatSeverity } = this.config.consumptionSettings;
    
    // Check industry
    const industryMatch = alert.scope.industries.some(industry => 
      relevantIndustries.includes(industry)
    );
    
    if (!industryMatch) return false;
    
    // Check severity
    const severityLevels = ['critical', 'high', 'medium', 'low'];
    const minSeverityIndex = severityLevels.indexOf(minimumThreatSeverity);
    const alertSeverityIndex = severityLevels.indexOf(alert.alertLevel);
    
    if (alertSeverityIndex > minSeverityIndex) return false;
    
    return true;
  }
  
  private isUpdateRelevant(update: ThreatIntelligenceUpdate): boolean {
    const { relevantIndustries } = this.config.consumptionSettings;
    
    // Check if update affects relevant industries
    if (update.affectedVerticals && update.affectedVerticals.length > 0) {
      return update.affectedVerticals.some(vertical => relevantIndustries.includes(vertical));
    }
    
    return true; // Include updates without specific vertical targeting
  }
  
  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    // Send heartbeat every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000);
    
    this.resetHeartbeatTimeout();
  }
  
  private resetHeartbeatTimeout(): void {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
    }
    
    // Expect heartbeat response within 10 seconds
    this.heartbeatTimeout = setTimeout(() => {
      console.error('[GuardianNetworkWS] Heartbeat timeout - connection may be dead');
      this.ws?.terminate();
      this.scheduleReconnect();
    }, 10000);
  }
  
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
    
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = undefined;
    }
  }
  
  private scheduleReconnect(): void {
    if (!this.shouldReconnect) {
      console.log('[GuardianNetworkWS] Reconnection disabled');
      return;
    }
    
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[GuardianNetworkWS] Max reconnection attempts reached');
      this.emit('max-reconnect-attempts');
      return;
    }
    
    this.reconnectAttempts++;
    
    // Exponential backoff
    const delay = Math.min(
      this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );
    
    console.log(`[GuardianNetworkWS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }
}

/**
 * SIEM Export Service
 * Export security events to external SIEM platforms
 * Supports: CEF (ArcSight), Syslog RFC5424, Splunk HEC, QRadar LEF, Azure Sentinel
 */

import { Pool } from 'pg';
import dgram from 'dgram';
import { logger } from '../utils/logger.js';

export type SIEMFormat = 'cef' | 'syslog' | 'splunk-hec' | 'qradar-lef' | 'azure-sentinel' | 'json';

export interface SIEMConfiguration {
  enabled: boolean;
  format: SIEMFormat;
  
  // Syslog/CEF Configuration
  syslogHost?: string;
  syslogPort?: number;
  syslogProtocol?: 'udp' | 'tcp' | 'tls';
  facility?: number; // RFC5424 facility (default: 16 = local0)
  
  // Splunk HEC Configuration
  splunkUrl?: string;
  splunkToken?: string;
  splunkIndex?: string;
  splunkSourceType?: string;
  
  // QRadar Configuration
  qradarHost?: string;
  qradarPort?: number;
  
  // Azure Sentinel Configuration
  azureSentinelWorkspaceId?: string;
  azureSentinelSharedKey?: string;
  azureSentinelLogType?: string;
  
  // Filtering
  eventTypes?: string[]; // If specified, only export these event types
  minSeverity?: number; // 0-10, only export events with severity >= this
  
  // Batching
  batchSize?: number;
  batchIntervalMs?: number;
}

export interface SecurityEvent {
  eventId: string;
  eventType: string;
  timestamp: Date;
  tenantId: string;
  userId?: string;
  username?: string;
  sourceIp?: string;
  targetResource?: string;
  action: string;
  outcome: 'success' | 'failure' | 'unknown';
  severity: number; // 0-10 (0=info, 5=warning, 10=critical)
  message: string;
  details?: Record<string, any>;
}

export class SIEMExporter {
  private config: SIEMConfiguration;
  private pool: Pool;
  private udpSocket?: dgram.Socket;
  private eventQueue: SecurityEvent[] = [];
  private batchTimer?: NodeJS.Timeout;

  constructor(config: SIEMConfiguration, pool: Pool) {
    this.config = {
      ...config,
      facility: config.facility ?? 16, // local0
      batchSize: config.batchSize ?? 100,
      batchIntervalMs: config.batchIntervalMs ?? 5000 // 5 seconds
    };
    this.pool = pool;

    if (this.config.enabled) {
      this.initialize();
    }
  }

  /**
   * Initialize SIEM exporter
   */
  private initialize(): void {
    if (this.config.syslogProtocol === 'udp' && this.config.syslogHost) {
      this.udpSocket = dgram.createSocket('udp4');
    }

    // Start batch processor
    this.startBatchProcessor();

    logger.info('SIEM exporter initialized', {
      format: this.config.format,
      protocol: this.config.syslogProtocol
    });
  }

  /**
   * Export security event
   */
  async exportEvent(event: SecurityEvent): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    // Apply filters
    if (!this.shouldExportEvent(event)) {
      return false;
    }

    // Add to batch queue
    this.eventQueue.push(event);

    // Process immediately if batch is full
    if (this.eventQueue.length >= this.config.batchSize!) {
      await this.processBatch();
    }

    return true;
  }

  /**
   * Check if event should be exported based on filters
   */
  private shouldExportEvent(event: SecurityEvent): boolean {
    // Check event type filter
    if (this.config.eventTypes && this.config.eventTypes.length > 0) {
      if (!this.config.eventTypes.includes(event.eventType)) {
        return false;
      }
    }

    // Check severity filter
    if (this.config.minSeverity !== undefined) {
      if (event.severity < this.config.minSeverity) {
        return false;
      }
    }

    return true;
  }

  /**
   * Start batch processor
   */
  private startBatchProcessor(): void {
    this.batchTimer = setInterval(async () => {
      if (this.eventQueue.length > 0) {
        await this.processBatch();
      }
    }, this.config.batchIntervalMs);
  }

  /**
   * Process batch of events
   */
  private async processBatch(): Promise<void> {
    if (this.eventQueue.length === 0) {
      return;
    }

    const batch = this.eventQueue.splice(0, this.config.batchSize);

    try {
      switch (this.config.format) {
        case 'cef':
          await this.exportToCEF(batch);
          break;
        case 'syslog':
          await this.exportToSyslog(batch);
          break;
        case 'splunk-hec':
          await this.exportToSplunk(batch);
          break;
        case 'qradar-lef':
          await this.exportToQRadar(batch);
          break;
        case 'azure-sentinel':
          await this.exportToAzureSentinel(batch);
          break;
        case 'json':
          await this.exportAsJSON(batch);
          break;
      }

      logger.debug('SIEM batch exported', {
        format: this.config.format,
        count: batch.length
      });

    } catch (error) {
      logger.error('SIEM batch export failed', {
        format: this.config.format,
        count: batch.length,
        error
      });

      // Re-queue failed events
      this.eventQueue.unshift(...batch);
    }
  }

  /**
   * Export to CEF format (ArcSight)
   */
  private async exportToCEF(events: SecurityEvent[]): Promise<void> {
    for (const event of events) {
      const cefMessage = this.formatCEF(event);
      await this.sendSyslog(cefMessage, event.severity);
    }
  }

  /**
   * Format event as CEF
   */
  private formatCEF(event: SecurityEvent): string {
    const cefVersion = 0;
    const deviceVendor = 'Sentinel Grid';
    const deviceProduct = 'CCTV Platform';
    const deviceVersion = '1.0';
    const signatureId = event.eventType;
    const name = event.message;
    const severity = this.mapSeverityToCEF(event.severity);

    // CEF extension fields
    const extensions: string[] = [];
    extensions.push(`rt=${event.timestamp.getTime()}`);
    
    if (event.sourceIp) extensions.push(`src=${event.sourceIp}`);
    if (event.userId) extensions.push(`suid=${event.userId}`);
    if (event.username) extensions.push(`suser=${event.username}`);
    if (event.targetResource) extensions.push(`dvc=${event.targetResource}`);
    extensions.push(`act=${event.action}`);
    extensions.push(`outcome=${event.outcome}`);
    
    if (event.details) {
      extensions.push(`cs1=${JSON.stringify(event.details)}`);
      extensions.push(`cs1Label=details`);
    }

    const extensionStr = extensions.join(' ');

    return `CEF:${cefVersion}|${deviceVendor}|${deviceProduct}|${deviceVersion}|${signatureId}|${name}|${severity}|${extensionStr}`;
  }

  /**
   * Map severity to CEF scale (0-10)
   */
  private mapSeverityToCEF(severity: number): number {
    return Math.min(10, Math.max(0, severity));
  }

  /**
   * Export to RFC5424 Syslog
   */
  private async exportToSyslog(events: SecurityEvent[]): Promise<void> {
    for (const event of events) {
      const syslogMessage = this.formatSyslog(event);
      await this.sendSyslog(syslogMessage, event.severity);
    }
  }

  /**
   * Format event as RFC5424 Syslog
   */
  private formatSyslog(event: SecurityEvent): string {
    const version = 1;
    const priority = this.calculatePriority(event.severity);
    const timestamp = event.timestamp.toISOString();
    const hostname = process.env.HOSTNAME || 'sentinel-grid';
    const appName = 'sentinel-grid';
    const procId = process.pid;
    const msgId = event.eventType;

    // Structured data
    const structuredData = this.formatStructuredData(event);

    // Message
    const message = `${event.message} [user=${event.username || 'unknown'}] [action=${event.action}] [outcome=${event.outcome}]`;

    return `<${priority}>${version} ${timestamp} ${hostname} ${appName} ${procId} ${msgId} ${structuredData} ${message}`;
  }

  /**
   * Format structured data for syslog
   */
  private formatStructuredData(event: SecurityEvent): string {
    const sdElements: string[] = [];

    // Sentinel Grid specific data
    const sgData: string[] = [];
    sgData.push(`eventId="${event.eventId}"`);
    sgData.push(`tenantId="${event.tenantId}"`);
    if (event.userId) sgData.push(`userId="${event.userId}"`);
    if (event.sourceIp) sgData.push(`sourceIp="${event.sourceIp}"`);
    if (event.targetResource) sgData.push(`targetResource="${event.targetResource}"`);
    
    sdElements.push(`[sentinelgrid@32473 ${sgData.join(' ')}]`);

    return sdElements.join('');
  }

  /**
   * Calculate syslog priority
   */
  private calculatePriority(severity: number): number {
    const facility = this.config.facility!;
    const level = this.mapSeverityToSyslogLevel(severity);
    return facility * 8 + level;
  }

  /**
   * Map severity to syslog level (0-7)
   */
  private mapSeverityToSyslogLevel(severity: number): number {
    if (severity >= 9) return 0; // Emergency
    if (severity >= 8) return 1; // Alert
    if (severity >= 7) return 2; // Critical
    if (severity >= 6) return 3; // Error
    if (severity >= 4) return 4; // Warning
    if (severity >= 2) return 5; // Notice
    if (severity >= 1) return 6; // Informational
    return 7; // Debug
  }

  /**
   * Send syslog message
   */
  private async sendSyslog(message: string, severity: number): Promise<void> {
    if (!this.config.syslogHost || !this.config.syslogPort) {
      throw new Error('Syslog host/port not configured');
    }

    if (this.config.syslogProtocol === 'udp') {
      await this.sendUDP(message);
    } else if (this.config.syslogProtocol === 'tcp') {
      await this.sendTCP(message);
    } else {
      throw new Error(`Unsupported syslog protocol: ${this.config.syslogProtocol}`);
    }
  }

  /**
   * Send via UDP
   */
  private async sendUDP(message: string): Promise<void> {
    if (!this.udpSocket) {
      throw new Error('UDP socket not initialized');
    }

    return new Promise((resolve, reject) => {
      const buffer = Buffer.from(message);
      
      this.udpSocket!.send(
        buffer,
        0,
        buffer.length,
        this.config.syslogPort!,
        this.config.syslogHost!,
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Send via TCP
   */
  private async sendTCP(message: string): Promise<void> {
    const net = await import('net');
    
    return new Promise((resolve, reject) => {
      const socket = net.connect({
        host: this.config.syslogHost,
        port: this.config.syslogPort
      });

      socket.on('connect', () => {
        socket.write(message + '\n');
        socket.end();
        resolve();
      });

      socket.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Export to Splunk HTTP Event Collector
   */
  private async exportToSplunk(events: SecurityEvent[]): Promise<void> {
    if (!this.config.splunkUrl || !this.config.splunkToken) {
      throw new Error('Splunk configuration missing');
    }

    const splunkEvents = events.map(event => ({
      time: Math.floor(event.timestamp.getTime() / 1000),
      source: 'sentinel-grid',
      sourcetype: this.config.splunkSourceType || 'sentinel:security',
      index: this.config.splunkIndex,
      event: {
        eventId: event.eventId,
        eventType: event.eventType,
        tenantId: event.tenantId,
        userId: event.userId,
        username: event.username,
        sourceIp: event.sourceIp,
        targetResource: event.targetResource,
        action: event.action,
        outcome: event.outcome,
        severity: event.severity,
        message: event.message,
        details: event.details
      }
    }));

    const response = await fetch(this.config.splunkUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Splunk ${this.config.splunkToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(splunkEvents)
    });

    if (!response.ok) {
      throw new Error(`Splunk HEC request failed: ${response.status}`);
    }
  }

  /**
   * Export to QRadar Log Event Format
   */
  private async exportToQRadar(events: SecurityEvent[]): Promise<void> {
    for (const event of events) {
      const lefMessage = this.formatQRadarLEF(event);
      await this.sendSyslog(lefMessage, event.severity);
    }
  }

  /**
   * Format event as QRadar LEF
   */
  private formatQRadarLEF(event: SecurityEvent): string {
    const fields: string[] = [];
    
    fields.push(`LogSourceName=sentinel-grid`);
    fields.push(`EventName=${event.eventType}`);
    fields.push(`EventTime=${Math.floor(event.timestamp.getTime() / 1000)}`);
    fields.push(`Severity=${event.severity}`);
    fields.push(`Message=${event.message}`);
    
    if (event.sourceIp) fields.push(`SourceIP=${event.sourceIp}`);
    if (event.username) fields.push(`UserName=${event.username}`);
    if (event.targetResource) fields.push(`TargetResource=${event.targetResource}`);
    fields.push(`Action=${event.action}`);
    fields.push(`Outcome=${event.outcome}`);

    return fields.join('\t');
  }

  /**
   * Export to Azure Sentinel (Log Analytics)
   */
  private async exportToAzureSentinel(events: SecurityEvent[]): Promise<void> {
    if (!this.config.azureSentinelWorkspaceId || !this.config.azureSentinelSharedKey) {
      throw new Error('Azure Sentinel configuration missing');
    }

    const logType = this.config.azureSentinelLogType || 'SentinelGrid';
    const body = JSON.stringify(events.map(event => ({
      TimeGenerated: event.timestamp.toISOString(),
      EventId: event.eventId,
      EventType: event.eventType,
      TenantId: event.tenantId,
      UserId: event.userId,
      Username: event.username,
      SourceIp: event.sourceIp,
      TargetResource: event.targetResource,
      Action: event.action,
      Outcome: event.outcome,
      Severity: event.severity,
      Message: event.message,
      Details: JSON.stringify(event.details)
    })));

    const date = new Date().toUTCString();
    const signature = this.buildAzureSignature(body, date);

    const url = `https://${this.config.azureSentinelWorkspaceId}.ods.opinsights.azure.com/api/logs?api-version=2016-04-01`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Log-Type': logType,
        'x-ms-date': date,
        'Authorization': signature
      },
      body
    });

    if (!response.ok) {
      throw new Error(`Azure Sentinel request failed: ${response.status}`);
    }
  }

  /**
   * Build Azure Log Analytics signature
   */
  private buildAzureSignature(body: string, date: string): string {
    const crypto = require('crypto');
    
    const contentLength = Buffer.byteLength(body);
    const stringToSign = `POST\n${contentLength}\napplication/json\nx-ms-date:${date}\n/api/logs`;
    
    const key = Buffer.from(this.config.azureSentinelSharedKey!, 'base64');
    const signature = crypto
      .createHmac('sha256', key)
      .update(stringToSign, 'utf8')
      .digest('base64');

    return `SharedKey ${this.config.azureSentinelWorkspaceId}:${signature}`;
  }

  /**
   * Export as JSON to file/stream
   */
  private async exportAsJSON(events: SecurityEvent[]): Promise<void> {
    const json = JSON.stringify(events, null, 2);
    logger.info('SIEM JSON export', { json });
  }

  /**
   * Export audit events from database
   */
  async exportAuditEvents(
    tenantId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<number> {
    const result = await this.pool.query(
      `SELECT 
        id::text as "eventId",
        'audit' as "eventType",
        occurred_at as timestamp,
        tenant_id::text as "tenantId",
        actor_user_id::text as "userId",
        action,
        outcome,
        source_ip as "sourceIp",
        resource_node_id::text as "targetResource",
        details
       FROM audit_events
       WHERE tenant_id = $1
         AND occurred_at BETWEEN $2 AND $3
       ORDER BY occurred_at ASC`,
      [tenantId, fromDate, toDate]
    );

    for (const row of result.rows) {
      await this.exportEvent({
        ...row,
        severity: this.calculateAuditSeverity(row.action, row.outcome),
        message: `${row.action} ${row.outcome}`
      });
    }

    // Force flush
    await this.processBatch();

    return result.rowCount || 0;
  }

  /**
   * Calculate severity for audit events
   */
  private calculateAuditSeverity(action: string, outcome: string): number {
    if (outcome === 'failure') return 6;
    if (action.includes('delete') || action.includes('revoke')) return 5;
    if (action.includes('create') || action.includes('grant')) return 4;
    return 3;
  }

  /**
   * Cleanup
   */
  async destroy(): Promise<void> {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
    }

    // Flush remaining events
    await this.processBatch();

    if (this.udpSocket) {
      this.udpSocket.close();
    }
  }
}

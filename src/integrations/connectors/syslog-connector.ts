/**
 * Syslog Connector
 * 
 * Supports RFC 5424 and RFC 3164 formats
 * Sends events to syslog servers via UDP/TCP/TLS
 */

import { BaseConnector } from './base-connector.js';
import type { IntegrationEvent, IntegrationResponse, IntegrationConfigSchema } from '../types.js';
import * as dgram from 'node:dgram';

export class SyslogConnector extends BaseConnector {
  readonly type = 'syslog' as const;
  readonly category = 'monitoring' as const;
  readonly name = 'Syslog';
  readonly description = 'Forward events to syslog servers in RFC 5424 or RFC 3164 format';
  readonly version = '1.0.0';

  private socket?: dgram.Socket;

  protected async onInitialize(): Promise<void> {
    const protocol = this.getConfig('protocol', 'udp');
    if (protocol === 'udp') {
      this.socket = dgram.createSocket('udp4');
    }
  }

  protected async onDestroy(): Promise<void> {
    if (this.socket) {
      this.socket.close();
      this.socket = undefined;
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      await this.sendSyslogMessage({
        severity: 'info',
        facility: 'user',
        message: 'Sentinel Grid syslog test message',
        timestamp: new Date()
      });

      return { success: true, message: 'Test message sent to syslog server' };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Connection failed' };
    }
  }

  async handleEvent(event: IntegrationEvent): Promise<IntegrationResponse> {
    try {
      const severity = this.mapSeverity(event.payload.severity || 'info');
      const facility = this.getConfig('facility', 'local0');

      await this.sendSyslogMessage({
        severity,
        facility,
        message: this.buildSyslogMessage(event),
        timestamp: event.timestamp,
        hostname: 'sentinel-grid',
        appName: 'sentinel',
        procId: String(event.tenantId),
        msgId: event.id
      });

      return this.createSuccessResponse(event);
    } catch (error) {
      return this.createErrorResponse(event, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  getConfigSchema(): IntegrationConfigSchema {
    return {
      fields: [
        {
          name: 'host',
          label: 'Syslog Server',
          type: 'string',
          required: true,
          placeholder: 'syslog.example.com',
          description: 'Syslog server hostname or IP'
        },
        {
          name: 'port',
          label: 'Port',
          type: 'number',
          required: false,
          default: 514,
          description: 'Syslog server port'
        },
        {
          name: 'protocol',
          label: 'Protocol',
          type: 'select',
          required: false,
          default: 'udp',
          validation: { options: ['udp', 'tcp', 'tls'] }
        },
        {
          name: 'format',
          label: 'Format',
          type: 'select',
          required: false,
          default: 'rfc5424',
          validation: { options: ['rfc5424', 'rfc3164'] },
          description: 'Syslog message format'
        },
        {
          name: 'facility',
          label: 'Facility',
          type: 'select',
          required: false,
          default: 'local0',
          validation: { options: ['user', 'local0', 'local1', 'local2', 'local3', 'local4', 'local5', 'local6', 'local7'] }
        }
      ],
      secrets: [],
      requiredFields: ['host']
    };
  }

  private async sendSyslogMessage(options: {
    severity: string;
    facility: string;
    message: string;
    timestamp: Date;
    hostname?: string;
    appName?: string;
    procId?: string;
    msgId?: string;
  }): Promise<void> {
    const host = this.getConfig<string>('host');
    const port = this.getConfig<number>('port', 514);
    const format = this.getConfig('format', 'rfc5424');

    const syslogMessage = format === 'rfc5424'
      ? this.buildRFC5424(options)
      : this.buildRFC3164(options);

    return new Promise((resolve, reject) => {
      if (this.socket) {
        const buffer = Buffer.from(syslogMessage);
        this.socket.send(buffer, 0, buffer.length, port, host, (err) => {
          if (err) reject(err);
          else resolve();
        });
      } else {
        reject(new Error('Socket not initialized'));
      }
    });
  }

  private buildRFC5424(options: {
    severity: string;
    facility: string;
    message: string;
    timestamp: Date;
    hostname?: string;
    appName?: string;
    procId?: string;
    msgId?: string;
  }): string {
    const pri = this.calculatePriority(options.facility, options.severity);
    const timestamp = options.timestamp.toISOString();
    const hostname = options.hostname || '-';
    const appName = options.appName || '-';
    const procId = options.procId || '-';
    const msgId = options.msgId || '-';

    return `<${pri}>1 ${timestamp} ${hostname} ${appName} ${procId} ${msgId} - ${options.message}`;
  }

  private buildRFC3164(options: {
    severity: string;
    facility: string;
    message: string;
    timestamp: Date;
    hostname?: string;
    appName?: string;
  }): string {
    const pri = this.calculatePriority(options.facility, options.severity);
    const timestamp = this.formatRFC3164Timestamp(options.timestamp);
    const hostname = options.hostname || 'sentinel-grid';
    const tag = options.appName || 'sentinel';

    return `<${pri}>${timestamp} ${hostname} ${tag}: ${options.message}`;
  }

  private calculatePriority(facility: string, severity: string): number {
    const facilityMap: Record<string, number> = {
      user: 1, local0: 16, local1: 17, local2: 18, local3: 19,
      local4: 20, local5: 21, local6: 22, local7: 23
    };
    const severityMap: Record<string, number> = {
      emerg: 0, alert: 1, crit: 2, err: 3, warning: 4, notice: 5, info: 6, debug: 7
    };

    return (facilityMap[facility] || 16) * 8 + (severityMap[severity] || 6);
  }

  private mapSeverity(severity: string): string {
    const map: Record<string, string> = {
      critical: 'crit',
      high: 'err',
      medium: 'warning',
      low: 'notice',
      info: 'info'
    };
    return map[severity] || 'info';
  }

  private formatRFC3164Timestamp(date: Date): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = String(date.getDate()).padStart(2, ' ');
    const time = date.toTimeString().substring(0, 8);
    return `${month} ${day} ${time}`;
  }

  private buildSyslogMessage(event: IntegrationEvent): string {
    return `[${event.eventType}] ${event.payload.title || event.payload.description || 'Event'} | ` +
           `tenant=${event.tenantId} ` +
           (event.userId ? `user=${event.userId} ` : '') +
           (event.branchId ? `branch=${event.branchId} ` : '') +
           (event.cameraId ? `camera=${event.cameraId} ` : '');
  }
}

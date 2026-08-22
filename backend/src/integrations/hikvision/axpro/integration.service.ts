import { createHmac, timingSafeEqual } from 'node:crypto';
import { Pool } from 'pg';
import { AxProAdapter } from './adapter';
import { getConfiguredAxProCredentialResolver } from './credential-resolver';
import { parseAxProPayload } from './client';
import { extractAxProEventRecords, mapAxProEvent } from './mapper';
import { AxProConnectionConfig, AxProIntegrationSummary } from './types';
import { DiscoveredDevice, SecurityDeviceEvent } from '../../../types/security-device';

export interface CreateAxProIntegrationInput {
  name: string;
  branchId: string;
  host: string;
  port: number;
  protocol: AxProConnectionConfig['protocol'];
  credentialSecretId: string;
  pollingIntervalSeconds?: number;
  enabled?: boolean;
  timeoutMs?: number;
  allowInsecureHttp?: boolean;
  authMethod?: AxProConnectionConfig['authMethod'];
  endpointPaths?: AxProConnectionConfig['endpointPaths'];
  eventTypeMap?: AxProConnectionConfig['eventTypeMap'];
}

export class HikvisionAxProIntegrationService {
  private readonly adapter: AxProAdapter;

  constructor(private readonly pool: Pool) {
    const credentialResolver = getConfiguredAxProCredentialResolver();
    AxProAdapter.setGlobalCredentialResolver(credentialResolver);
    this.adapter = new AxProAdapter(credentialResolver);
  }

  async list(tenantId: string): Promise<AxProIntegrationSummary[]> {
    const result = await this.pool.query(
      `SELECT i.*,
              (SELECT COUNT(*)::integer FROM security_devices d
               WHERE d.tenant_id = i.tenant_id
                 AND d.metadata->>'axProIntegrationId' = i.id::text) AS managed_devices
       FROM security_device_integrations i
       WHERE i.tenant_id = $1 AND i.adapter_name = $2
       ORDER BY i.created_at DESC`,
      [tenantId, AxProAdapter.adapterName],
    );
    return result.rows.map((row) => this.mapSummary(row));
  }

  async create(tenantId: string, input: CreateAxProIntegrationInput): Promise<AxProIntegrationSummary> {
    validateInput(input);
    const config = this.toConfig(input);
    const result = await this.pool.query(
      `INSERT INTO security_device_integrations (
        tenant_id, name, description, integration_type, adapter_name,
        adapter_version, protocol, connection_config, credential_ref_id,
        status, polling_interval_seconds, auto_reconnect, max_retries
      ) VALUES ($1, $2, $3, 'DIRECT', $4, $5, 'AX_PRO', $6, $7, $8, $9, true, 3)
      RETURNING *`,
      [
        tenantId,
        input.name.trim(),
        'Hikvision AX PRO read-only ISAPI integration',
        AxProAdapter.adapterName,
        AxProAdapter.adapterVersion,
        JSON.stringify(config),
        input.credentialSecretId,
        input.enabled === false ? 'INACTIVE' : 'ACTIVE',
        config.pollingIntervalSeconds,
      ],
    );
    return this.mapSummary(result.rows[0]);
  }

  async test(tenantId: string, integrationId: string) {
    const row = await this.getRow(tenantId, integrationId);
    const config = this.rowToConfig(row);
    const result = await this.adapter.testConnection(config);
    await this.recordTestResult(tenantId, integrationId, result.success, result.errorMessage);
    return {
      ...result,
      integrationId,
      systemInfo: result.systemInfo ? {
        deviceId: result.systemInfo.deviceId,
        deviceName: result.systemInfo.deviceName,
        model: result.systemInfo.model,
        serialNumber: result.systemInfo.serialNumber,
        firmwareVersion: result.systemInfo.firmwareVersion,
      } : undefined,
    };
  }

  async discover(tenantId: string, integrationId: string) {
    const row = await this.getRow(tenantId, integrationId);
    const config = this.rowToConfig(row);
    const devices = await this.adapter.discoverDevices(config);
    const jobId = await this.stageDiscoveredDevices(tenantId, integrationId, config, devices);
    await this.pool.query(
      `UPDATE security_device_integrations
       SET status = 'ACTIVE', last_sync_at = NOW(), last_error_at = NULL, last_error_message = NULL,
           devices_managed = (SELECT COUNT(*) FROM security_devices WHERE tenant_id = $1 AND metadata->>'axProIntegrationId' = $2)
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, integrationId],
    );
    return { integrationId, jobId, devices };
  }

  async poll(tenantId: string, integrationId: string) {
    const row = await this.getRow(tenantId, integrationId);
    const devicesResult = await this.pool.query(
      `SELECT * FROM security_devices
       WHERE tenant_id = $1 AND metadata->>'axProIntegrationId' = $2
         AND enrollment_status IN ('APPROVED', 'ACTIVE')`,
      [tenantId, integrationId],
    );
    const sourceDevice = devicesResult.rows.find((device) => device.type === 'AX_PRO_HUB') || devicesResult.rows[0];
    if (!sourceDevice) return { integrationId, eventsProcessed: 0 };
    const since = row.last_sync_at ? new Date(row.last_sync_at) : undefined;
    let eventsProcessed = 0;
    try {
      const events = await this.adapter.getEvents(this.mapDeviceRow(sourceDevice), since);
      eventsProcessed = await this.persistResolvedEvents(tenantId, integrationId, events);
      await this.pool.query(
        `UPDATE security_device_integrations
         SET status = 'ACTIVE', last_sync_at = NOW(), last_error_at = NULL, last_error_message = NULL,
             events_processed_today = events_processed_today + $3,
             total_events_processed = total_events_processed + $3
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, integrationId, eventsProcessed],
      );
      return { integrationId, eventsProcessed };
    } catch (error) {
      await this.recordTestResult(tenantId, integrationId, false, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  async ingestReceiverEvent(
    tenantId: string,
    integrationId: string,
    rawBody: string,
    contentType: string,
    signature: string | null,
    timestampHeader: string | null,
  ): Promise<{ accepted: number; ignored: number }> {
    this.verifyReceiverSignature(rawBody, signature, timestampHeader);
    const row = await this.getRow(tenantId, integrationId);
    const payload = parseAxProPayload(rawBody, contentType);
    const devicesResult = await this.pool.query(
      `SELECT * FROM security_devices
       WHERE tenant_id = $1 AND metadata->>'axProIntegrationId' = $2
         AND enrollment_status IN ('APPROVED', 'ACTIVE')
       ORDER BY CASE WHEN type = 'AX_PRO_HUB' THEN 0 ELSE 1 END, created_at ASC
       LIMIT 1`,
      [tenantId, integrationId],
    );
    const sourceDevice = devicesResult.rows[0];
    if (!sourceDevice) throw new Error('No approved AX PRO device is available to receive events');
    const config = this.rowToConfig(row);
    const context = { tenantId, branchId: config.branchId, deviceId: sourceDevice.id };
    const events = extractAxProEventRecords(payload).map((event) => mapAxProEvent(event, context, config));
    const accepted = await this.persistResolvedEvents(tenantId, integrationId, events);
    return { accepted, ignored: Math.max(0, events.length - accepted) };
  }

  private async persistEvents(events: SecurityDeviceEvent[]): Promise<number> {
    let inserted = 0;
    for (const event of events) {
      const result = await this.pool.query(
        `INSERT INTO security_device_events (
          tenant_id, branch_id, device_id, event_type, severity, category,
          title, description, occurred_at, received_at, processed, acknowledged,
          payload, normalized_payload, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, false, $11, $12, $13)
        ON CONFLICT DO NOTHING`,
        [
          event.tenantId,
          event.branchId,
          event.deviceId,
          event.eventType,
          event.severity,
          event.category,
          event.title,
          event.description,
          event.occurredAt,
          event.receivedAt,
          JSON.stringify(event.payload),
          JSON.stringify(event.normalizedPayload || {}),
          JSON.stringify(event.metadata),
        ],
      );
      inserted += result.rowCount || 0;
    }
    return inserted;
  }

  private async persistResolvedEvents(tenantId: string, integrationId: string, events: SecurityDeviceEvent[]): Promise<number> {
    let resolved = 0;
    for (const event of events) {
      const deviceId = await this.resolveEventDeviceId(tenantId, integrationId, event);
      resolved += await this.persistEvents([{ ...event, deviceId }]);
    }
    return resolved;
  }

  private async resolveEventDeviceId(tenantId: string, integrationId: string, event: SecurityDeviceEvent): Promise<string> {
    const axProDeviceId = event.metadata?.axProDeviceId;
    if (!axProDeviceId) return event.deviceId;
    const result = await this.pool.query(
      `SELECT id FROM security_devices
       WHERE tenant_id = $1 AND metadata->>'axProIntegrationId' = $2
         AND metadata->>'axProDeviceId' = $3
       LIMIT 1`,
      [tenantId, integrationId, String(axProDeviceId)],
    );
    return result.rows[0]?.id || event.deviceId;
  }

  private verifyReceiverSignature(rawBody: string, signature: string | null, timestampHeader: string | null): void {
    const secret = process.env.AXPRO_RECEIVER_SHARED_SECRET;
    if (!secret) throw new Error('AXPRO_RECEIVER_SHARED_SECRET is not configured');
    if (!signature || !timestampHeader) throw new Error('AX PRO receiver signature and timestamp are required');
    const timestamp = Number(timestampHeader);
    if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp * 1000) > 300_000) {
      throw new Error('AX PRO receiver timestamp is expired');
    }
    const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
    const supplied = signature.replace(/^sha256=/i, '');
    const expectedBuffer = Buffer.from(expected, 'hex');
    const suppliedBuffer = Buffer.from(supplied, 'hex');
    if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) {
      throw new Error('AX PRO receiver signature is invalid');
    }
  }

  private async stageDiscoveredDevices(
    tenantId: string,
    integrationId: string,
    config: AxProConnectionConfig,
    devices: DiscoveredDevice[],
  ): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const jobResult = await client.query(
        `INSERT INTO security_device_discovery_jobs (
          tenant_id, branch_id, network_range, scan_type,
          include_device_types, exclude_device_types, status,
          progress_percent, devices_discovered, completed_at, metadata
        ) VALUES ($1, $2, $3, 'SCHEDULED', $4, '[]', 'COMPLETED', 100, $5, NOW(), $6)
        RETURNING id`,
        [
          tenantId,
          config.branchId,
          `${config.protocol.toLowerCase()}://${config.host}:${config.port}`,
          JSON.stringify([]),
          devices.length,
          JSON.stringify({ source: 'hikvision-ax-pro', integrationId }),
        ],
      );
      const jobId = jobResult.rows[0].id as string;

      for (const device of devices) {
        const metadata = {
          ...device.metadata,
          axProIntegrationId: integrationId,
          axProConfig: { ...config },
        };
        const identity = String(device.metadata?.axProDeviceId || '');
        const existing = await client.query(
          `SELECT id, enrollment_status FROM security_discovered_devices
           WHERE tenant_id = $1 AND branch_id = $2 AND protocol = 'AX_PRO'
             AND ($3 <> '' AND metadata->>'axProDeviceId' = $3)
           ORDER BY discovered_at DESC LIMIT 1`,
          [tenantId, config.branchId, identity],
        );
        const values = [
          tenantId, config.branchId, jobId, device.ipAddress, device.macAddress,
          device.port, device.deviceType, device.manufacturer, device.model,
          device.serialNumber, device.firmwareVersion, device.protocol,
          JSON.stringify(device.capabilities || []), JSON.stringify(metadata), device.confidence,
        ];
        if (existing.rows[0]) {
          await client.query(
            `UPDATE security_discovered_devices
             SET discovery_job_id = $1, ip_address = $2, port = $3,
                 device_type = $4, manufacturer = $5, model = $6, serial_number = $7,
                 firmware_version = $8, capabilities = $9, metadata = $10,
                 confidence = GREATEST(confidence, $11), discovered_at = NOW()
             WHERE id = $12`,
            [jobId, device.ipAddress, device.port, device.deviceType, device.manufacturer,
              device.model, device.serialNumber, device.firmwareVersion,
              JSON.stringify(device.capabilities || []), JSON.stringify(metadata), device.confidence,
              existing.rows[0].id],
          );
        } else {
          await client.query(
            `INSERT INTO security_discovered_devices (
              tenant_id, branch_id, discovery_job_id, ip_address, mac_address, port,
              device_type, manufacturer, model, serial_number, firmware_version,
              protocol, capabilities, metadata, confidence, enrollment_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'PENDING_REVIEW')`,
            values,
          );
        }
      }
      await client.query('COMMIT');
      return jobId;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async recordTestResult(tenantId: string, integrationId: string, success: boolean, errorMessage?: string): Promise<void> {
    await this.pool.query(
      `UPDATE security_device_integrations
       SET status = $3, last_error_at = CASE WHEN $3 = 'ERROR' THEN NOW() ELSE NULL END,
           last_error_message = CASE WHEN $3 = 'ERROR' THEN $4 ELSE NULL END,
           last_sync_at = CASE WHEN $3 = 'ACTIVE' THEN NOW() ELSE last_sync_at END
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, integrationId, success ? 'ACTIVE' : 'ERROR', errorMessage || null],
    );
  }

  private async getRow(tenantId: string, integrationId: string): Promise<any> {
    const result = await this.pool.query(
      `SELECT * FROM security_device_integrations
       WHERE tenant_id = $1 AND id = $2 AND adapter_name = $3`,
      [tenantId, integrationId, AxProAdapter.adapterName],
    );
    if (!result.rows[0]) throw new Error('AX PRO integration not found');
    return result.rows[0];
  }

  private toConfig(input: CreateAxProIntegrationInput): AxProConnectionConfig {
    return {
      host: input.host.trim(),
      port: input.port,
      protocol: input.protocol,
      credentialSecretId: input.credentialSecretId.trim(),
      branchId: input.branchId,
      pollingIntervalSeconds: input.pollingIntervalSeconds || 60,
      enabled: input.enabled !== false,
      timeoutMs: input.timeoutMs || 10_000,
      allowInsecureHttp: input.allowInsecureHttp === true,
      authMethod: input.authMethod || 'auto',
      endpointPaths: input.endpointPaths,
      eventTypeMap: input.eventTypeMap,
    };
  }

  private rowToConfig(row: any): AxProConnectionConfig {
    return {
      ...(row.connection_config || {}),
      credentialSecretId: row.credential_ref_id || row.connection_config?.credentialSecretId,
      branchId: row.connection_config?.branchId,
    };
  }

  private mapSummary(row: any): AxProIntegrationSummary {
    const config = row.connection_config || {};
    return {
      id: row.id,
      tenantId: row.tenant_id,
      branchId: config.branchId,
      name: row.name,
      adapterName: row.adapter_name,
      adapterVersion: row.adapter_version,
      protocol: row.protocol,
      host: config.host,
      port: config.port,
      transport: config.protocol,
      credentialSecretId: row.credential_ref_id,
      endpointPaths: config.endpointPaths || {},
      enabled: config.enabled !== false,
      status: row.status,
      lastSyncAt: row.last_sync_at,
      lastErrorAt: row.last_error_at,
      lastErrorMessage: row.last_error_message,
      pollingIntervalSeconds: row.polling_interval_seconds,
      devicesManaged: row.managed_devices ?? row.devices_managed ?? 0,
      eventsProcessedToday: row.events_processed_today || 0,
      totalEventsProcessed: row.total_events_processed || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapDeviceRow(row: any): any {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      type: row.type,
      name: row.name,
      model: row.model,
      ipAddress: row.ip_address,
      port: row.port,
      protocol: row.protocol,
      status: row.status,
      health: row.health,
      capabilities: row.capabilities || [],
      metadata: row.metadata || {},
      credentialRefId: row.credential_ref_id,
    };
  }
}

function validateInput(input: CreateAxProIntegrationInput): void {
  if (!input.name?.trim() || !input.branchId?.trim() || !input.host?.trim()) throw new Error('name, branchId, and host are required');
  if (!input.credentialSecretId?.startsWith('secret://')) throw new Error('credentialSecretId must be a secret:// reference');
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) throw new Error('port must be between 1 and 65535');
  if (!['HTTP', 'HTTPS'].includes(input.protocol)) throw new Error('protocol must be HTTP or HTTPS');
  if (input.protocol === 'HTTP' && process.env.NODE_ENV === 'production' && input.allowInsecureHttp !== true) {
    throw new Error('HTTP is disabled for AX PRO integrations in production unless allowInsecureHttp is explicitly enabled');
  }
}

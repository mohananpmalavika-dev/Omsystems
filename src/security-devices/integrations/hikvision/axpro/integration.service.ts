import { createHmac, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Pool, type PoolClient } from 'pg';
import { AxProAdapter } from './adapter.js';
import { getConfiguredAxProCredentialResolver } from './credential-resolver.js';
import { parseAxProPayload } from './client.js';
import { extractAxProEventRecords, mapAxProEvent } from './mapper.js';
import { AxProConnectionConfig, AxProIntegrationSummary } from './types.js';
import { DiscoveredDevice, SecurityDeviceEvent } from '../../../domain/security-device.types.js';
import { AxProError } from './errors.js';
import { validateAxProConnection } from './validation.js';

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
              CASE WHEN events_counter_date = CURRENT_DATE THEN events_processed_today ELSE 0 END AS current_day_events,
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
    validateAxProConnection(config);
    const branch = await this.pool.query('SELECT id FROM branches WHERE id = $1 AND tenant_id::text = $2', [config.branchId, tenantId]);
    if (!branch.rows[0]) throw new AxProError('AXPRO_BRANCH_NOT_FOUND', 'Branch not found in this tenant', 404);
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

  async setEnabled(tenantId: string, integrationId: string, enabled: boolean): Promise<AxProIntegrationSummary> {
    await this.getRow(tenantId, integrationId);
    const result = await this.pool.query(`UPDATE security_device_integrations
      SET connection_config = jsonb_set(connection_config, '{enabled}', to_jsonb($3::boolean)),
          status = CASE WHEN $3 THEN 'ACTIVE' ELSE 'INACTIVE' END, updated_at = NOW()
      WHERE tenant_id = $1 AND id = $2 AND adapter_name = $4 RETURNING *`, [tenantId, integrationId, enabled, AxProAdapter.adapterName]);
    if (!result.rows[0]) throw new AxProError('AXPRO_NOT_FOUND', 'AX PRO integration not found', 404);
    return this.mapSummary(result.rows[0]);
  }

  async discover(tenantId: string, integrationId: string) {
    const row = await this.getRow(tenantId, integrationId);
    this.requireEnabled(row);
    const config = this.rowToConfig(row);
    const devices = await this.adapter.discoverDevices(config);
    const jobId = await this.stageDiscoveredDevices(tenantId, integrationId, config, devices);
    await this.pool.query(
      `UPDATE security_device_integrations
       SET status = CASE WHEN connection_config->>'enabled' = 'false' THEN 'INACTIVE' ELSE 'ACTIVE' END,
           last_sync_at = NOW(), last_error_at = NULL, last_error_message = NULL,
           devices_managed = (SELECT COUNT(*) FROM security_devices WHERE tenant_id = $1 AND metadata->>'axProIntegrationId' = $2)
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, integrationId],
    );
    return { integrationId, jobId, devices };
  }

  async poll(tenantId: string, integrationId: string) {
    const row = await this.getRow(tenantId, integrationId);
    this.requireEnabled(row);
    const lock = await this.pool.connect();
    let locked = false;
    try {
      const lease = await lock.query('SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired', [`axpro:${tenantId}:${integrationId}`]);
      locked = lease.rows[0]?.acquired === true;
      if (!locked) return { integrationId, eventsProcessed: 0, skipped: 'already_polling' };
      await this.pool.query('UPDATE security_device_integrations SET last_poll_attempt_at = NOW() WHERE tenant_id = $1 AND id = $2', [tenantId, integrationId]);
      const devicesResult = await this.pool.query(
        `SELECT * FROM security_devices
       WHERE tenant_id = $1 AND metadata->>'axProIntegrationId' = $2
         AND branch_id = $3 AND enrollment_status IN ('APPROVED', 'ENROLLED') AND status <> 'DISABLED'`,
        [tenantId, integrationId, row.connection_config.branchId],
      );
      const sourceDevice = devicesResult.rows.find((device) => device.type === 'AX_PRO_HUB') || devicesResult.rows[0];
      if (!sourceDevice) return { integrationId, eventsProcessed: 0 };
      const current = await this.getRow(tenantId, integrationId);
      const since = current.event_cursor_at ? new Date(new Date(current.event_cursor_at).getTime() - 30_000) : undefined;
      const pollStartedAt = new Date();
      const device = this.mapDeviceRow(sourceDevice);
      device.metadata = { ...device.metadata, axProConfig: this.rowToConfig(current) };
      device.credentialRefId = current.credential_ref_id;
      let eventsProcessed = 0;
      let healthRead = false;
      try {
        const health = await this.adapter.getHealth(device);
        healthRead = true;
        await this.pool.query(
          `INSERT INTO security_device_health_snapshots (device_id, tenant_id, branch_id, health, health_score, is_online,
         response_time_ms, signal_strength_dbm, power_status, battery_level_percent, battery_voltage, error_count, warning_count, metadata, captured_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [device.id, tenantId, device.branchId, health.health, health.healthScore, health.isOnline, health.responseTimeMs,
          health.signalStrengthDbm, health.powerStatus, health.batteryLevelPercent, health.batteryVoltage,
          health.errorCount, health.warningCount, JSON.stringify(health.metadata), health.capturedAt],
        );
        await this.pool.query(`UPDATE security_devices SET status = $3, health = $4, last_seen_at = CASE WHEN $5 THEN NOW() ELSE last_seen_at END,
        last_health_check_at = NOW() WHERE tenant_id = $1 AND id = $2`, [tenantId, device.id, health.isOnline ? 'ONLINE' : 'OFFLINE', health.health, health.isOnline]);
        const events = current.connection_config?.endpointPaths?.events ? await this.adapter.getEvents(device, since) : [];
        eventsProcessed = await this.persistResolvedEvents(tenantId, integrationId, events, current.connection_config?.endpointPaths?.events ? pollStartedAt : undefined);
        return { integrationId, eventsProcessed };
      } catch (error) {
        if (!healthRead && error instanceof AxProError && ['AXPRO_TIMEOUT', 'AXPRO_NETWORK_ERROR'].includes(error.code)) await this.pool.query(`UPDATE security_devices SET status = 'OFFLINE', health = 'UNKNOWN', last_health_check_at = NOW()
        WHERE tenant_id = $1 AND id = $2`, [tenantId, sourceDevice.id]);
        await this.recordTestResult(tenantId, integrationId, false, error instanceof Error ? error.message : String(error));
        throw error;
      }
    } finally {
      try {
        if (locked) await lock.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [`axpro:${tenantId}:${integrationId}`]);
        lock.release();
      } catch { lock.release(true); }
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
    this.verifyReceiverSignature(tenantId, integrationId, rawBody, signature, timestampHeader);
    const row = await this.getRow(tenantId, integrationId);
    this.requireEnabled(row);
    const payload = parseAxProPayload(rawBody, contentType);
    const devicesResult = await this.pool.query(
      `SELECT * FROM security_devices
       WHERE tenant_id = $1 AND metadata->>'axProIntegrationId' = $2
         AND branch_id = $3 AND enrollment_status IN ('APPROVED', 'ENROLLED') AND status <> 'DISABLED'
       ORDER BY CASE WHEN type = 'AX_PRO_HUB' THEN 0 ELSE 1 END, created_at ASC
       LIMIT 1`,
      [tenantId, integrationId, row.connection_config.branchId],
    );
    const sourceDevice = devicesResult.rows[0];
    if (!sourceDevice) throw new AxProError('AXPRO_DEVICE_NOT_APPROVED', 'No approved AX PRO device is available to receive events', 409);
    const config = this.rowToConfig(row);
    const context = { tenantId, branchId: config.branchId, deviceId: sourceDevice.id };
    const records = extractAxProEventRecords(payload);
    if (!records.length || records.length > 1000) throw new AxProError('AXPRO_EVENTS_INVALID', 'Payload must contain between 1 and 1000 events', 400);
    const events = records.map((event) => mapAxProEvent(event, context, config));
    const accepted = await this.persistResolvedEvents(tenantId, integrationId, events);
    return { accepted, ignored: Math.max(0, events.length - accepted) };
  }

  private async persistEvents(events: SecurityDeviceEvent[], client: PoolClient): Promise<number> {
    let inserted = 0;
    for (const event of events) {
      const result = await client.query(
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

  private async persistResolvedEvents(tenantId: string, integrationId: string, events: SecurityDeviceEvent[], cursor?: Date): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize push/poll counters and reject a concurrent disable before commit.
      const integration = await client.query('SELECT * FROM security_device_integrations WHERE tenant_id = $1 AND id = $2 FOR UPDATE', [tenantId, integrationId]);
      if (!integration.rows[0]) throw new AxProError('AXPRO_NOT_FOUND', 'AX PRO integration not found', 404);
      this.requireEnabled(integration.rows[0]);
      let resolved = 0;
      for (const event of events) {
        const deviceId = await this.resolveEventDeviceId(tenantId, integrationId, event, client);
        resolved += await this.persistEvents([{ ...event, deviceId, metadata: { ...event.metadata, axProIntegrationId: integrationId } }], client);
      }
      await client.query(`UPDATE security_device_integrations SET
      status = 'ACTIVE', last_sync_at = NOW(), last_error_at = NULL, last_error_message = NULL,
      event_cursor_at = CASE WHEN $4::timestamptz IS NULL THEN event_cursor_at ELSE GREATEST(event_cursor_at, $4::timestamptz) END,
      events_processed_today = CASE WHEN events_counter_date = CURRENT_DATE THEN events_processed_today + $3 ELSE $3 END,
      events_counter_date = CURRENT_DATE, total_events_processed = total_events_processed + $3, updated_at = NOW()
      WHERE tenant_id = $1 AND id = $2`, [tenantId, integrationId, resolved, cursor || null]);
      await client.query('COMMIT');
      return resolved;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  private async resolveEventDeviceId(tenantId: string, integrationId: string, event: SecurityDeviceEvent, client: PoolClient): Promise<string> {
    const axProDeviceId = event.metadata?.axProDeviceId;
    if (!axProDeviceId) return event.deviceId;
    const result = await client.query(
      `SELECT id FROM security_devices
       WHERE tenant_id = $1 AND metadata->>'axProIntegrationId' = $2
         AND metadata->>'axProDeviceId' = $3
         AND branch_id = $4 AND enrollment_status IN ('APPROVED', 'ENROLLED') AND status <> 'DISABLED'
       LIMIT 1`,
      [tenantId, integrationId, String(axProDeviceId), event.branchId],
    );
    return result.rows[0]?.id || event.deviceId;
  }

  private verifyReceiverSignature(tenantId: string, integrationId: string, rawBody: string, signature: string | null, timestampHeader: string | null): void {
    let secrets: Record<string, string> = {};
    try { secrets = JSON.parse(process.env.AXPRO_RECEIVER_SECRETS || '{}'); } catch { throw new AxProError('AXPRO_RECEIVER_CONFIG', 'AX PRO receiver secrets are not configured correctly', 503); }
    const secret = secrets?.[`${tenantId}:${integrationId}`] || (process.env.NODE_ENV !== 'production' ? process.env.AXPRO_RECEIVER_SHARED_SECRET : undefined);
    if (typeof secret !== 'string' || secret.length < 32) throw new AxProError('AXPRO_RECEIVER_CONFIG', 'AX PRO receiver secret is not configured for this integration', 503);
    if (!signature || !timestampHeader || !/^\d{10}$/.test(timestampHeader)) throw new AxProError('AXPRO_SIGNATURE_INVALID', 'AX PRO receiver signature and timestamp are required', 401);
    const timestamp = Number(timestampHeader);
    if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp * 1000) > 300_000) {
      throw new AxProError('AXPRO_SIGNATURE_INVALID', 'AX PRO receiver timestamp is expired', 401);
    }
    const expected = createHmac('sha256', secret).update(`${timestampHeader}.${rawBody}`).digest('hex');
    const supplied = signature.replace(/^sha256=/i, '');
    if (!/^[a-fA-F0-9]{64}$/.test(supplied)) throw new AxProError('AXPRO_SIGNATURE_INVALID', 'AX PRO receiver signature is invalid', 401);
    const expectedBuffer = Buffer.from(expected, 'hex');
    const suppliedBuffer = Buffer.from(supplied, 'hex');
    if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) {
      throw new AxProError('AXPRO_SIGNATURE_INVALID', 'AX PRO receiver signature is invalid', 401);
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
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`axpro-discovery:${tenantId}:${integrationId}`]);
      const integration = await client.query('SELECT * FROM security_device_integrations WHERE tenant_id = $1 AND id = $2 FOR UPDATE', [tenantId, integrationId]);
      if (!integration.rows[0]) throw new AxProError('AXPRO_NOT_FOUND', 'AX PRO integration not found', 404);
      this.requireEnabled(integration.rows[0]);
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
        const address = isIP(device.ipAddress.replace(/^\[|\]$/g, '')) ? device.ipAddress.replace(/^\[|\]$/g, '') : (await lookup(device.ipAddress)).address;
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
             AND metadata->>'axProIntegrationId' = $4
           ORDER BY discovered_at DESC LIMIT 1`,
          [tenantId, config.branchId, identity, integrationId],
        );
        const values = [
          tenantId, config.branchId, jobId, address, device.macAddress,
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
            [jobId, address, device.port, device.deviceType, device.manufacturer,
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
       SET status = CASE WHEN connection_config->>'enabled' = 'false' THEN 'INACTIVE' ELSE $3 END,
           last_error_at = CASE WHEN $3 = 'ERROR' THEN NOW() ELSE NULL END,
           last_error_message = CASE WHEN $3 = 'ERROR' THEN $4 ELSE NULL END,
           updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, integrationId, success ? 'ACTIVE' : 'ERROR', errorMessage || null],
    );
  }

  private async getRow(tenantId: string, integrationId: string): Promise<any> {
    if (!/^[a-fA-F0-9]{8}-(?:[a-fA-F0-9]{4}-){3}[a-fA-F0-9]{12}$/.test(integrationId)) throw new AxProError('AXPRO_ID_INVALID', 'integrationId must be a UUID', 400);
    const result = await this.pool.query(
      `SELECT * FROM security_device_integrations
       WHERE tenant_id = $1 AND id = $2 AND adapter_name = $3`,
      [tenantId, integrationId, AxProAdapter.adapterName],
    );
    if (!result.rows[0]) throw new AxProError('AXPRO_NOT_FOUND', 'AX PRO integration not found', 404);
    return result.rows[0];
  }

  private toConfig(input: CreateAxProIntegrationInput): AxProConnectionConfig {
    return {
      host: input.host.trim(),
      port: input.port,
      protocol: input.protocol,
      credentialSecretId: input.credentialSecretId.trim(),
      branchId: input.branchId,
      pollingIntervalSeconds: input.pollingIntervalSeconds ?? 60,
      enabled: input.enabled !== false,
      timeoutMs: input.timeoutMs ?? 10_000,
      allowInsecureHttp: input.allowInsecureHttp === true,
      authMethod: input.authMethod ?? 'auto',
      endpointPaths: input.endpointPaths,
      eventTypeMap: input.eventTypeMap,
    };
  }

  private requireEnabled(row: any): void {
    if (row.connection_config?.enabled === false || ['INACTIVE', 'MAINTENANCE'].includes(row.status)) {
      throw new AxProError('AXPRO_DISABLED', 'AX PRO integration is disabled', 409);
    }
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
      eventsProcessedToday: Number(row.current_day_events ?? row.events_processed_today ?? 0),
      totalEventsProcessed: Number(row.total_events_processed || 0),
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
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') throw new AxProError('AXPRO_CONFIG_INVALID', 'enabled must be a boolean', 400);
  if (input.allowInsecureHttp !== undefined && typeof input.allowInsecureHttp !== 'boolean') throw new AxProError('AXPRO_CONFIG_INVALID', 'allowInsecureHttp must be a boolean', 400);
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200 || typeof input.branchId !== 'string' || !input.branchId.trim() || typeof input.host !== 'string' || !input.host.trim()) throw new AxProError('AXPRO_CONFIG_INVALID', 'name, branchId, and host are required', 400);
  if (!/^[a-fA-F0-9]{8}-(?:[a-fA-F0-9]{4}-){3}[a-fA-F0-9]{12}$/.test(input.branchId)) throw new AxProError('AXPRO_CONFIG_INVALID', 'branchId must be a UUID', 400);
  if (input.eventTypeMap !== undefined) {
    const allowed = new Set(['AX_PRO_EVENT_UNMAPPED', 'PANIC_BUTTON_PRESSED', 'DEVICE_TAMPER', 'DEVICE_LOW_BATTERY', 'DEVICE_POWER_LOSS', 'DEVICE_COMMUNICATION_FAILURE', 'DEVICE_ONLINE', 'MOTION_DETECTED', 'GLASS_BREAK_DETECTED', 'VIBRATION_DETECTED', 'FIRE_ALARM_TRIGGERED', 'SMOKE_DETECTED', 'WATER_LEAK_DETECTED', 'DOOR_OPENED', 'DOOR_CLOSED', 'ALARM_TRIGGERED', 'ALARM_CLEARED', 'ALARM_ARMED', 'ALARM_DISARMED']);
    if (!input.eventTypeMap || typeof input.eventTypeMap !== 'object' || Array.isArray(input.eventTypeMap) || Object.entries(input.eventTypeMap).some(([key, value]) => !key || ['__proto__', 'constructor', 'prototype'].includes(key) || !allowed.has(value))) throw new AxProError('AXPRO_CONFIG_INVALID', 'eventTypeMap must contain supported AX PRO event types', 400);
  }
  if (typeof input.credentialSecretId !== 'string' || !input.credentialSecretId.startsWith('secret://')) throw new AxProError('AXPRO_CONFIG_INVALID', 'credentialSecretId must be a secret:// reference', 400);
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) throw new Error('port must be between 1 and 65535');
  if (!['HTTP', 'HTTPS'].includes(input.protocol)) throw new Error('protocol must be HTTP or HTTPS');
  if (input.protocol === 'HTTP' && process.env.NODE_ENV === 'production' && input.allowInsecureHttp !== true) {
    throw new Error('HTTP is disabled for AX PRO integrations in production unless allowInsecureHttp is explicitly enabled');
  }
}

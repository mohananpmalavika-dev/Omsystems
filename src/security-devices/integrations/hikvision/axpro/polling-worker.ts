import type { Pool } from 'pg';
import { HikvisionAxProIntegrationService } from './integration.service.js';

interface Logger { error(details: unknown, message: string): void }

/** Runs in the control plane, never in a Next.js request/serverless lifecycle. */
export class AxProPollingWorker {
  private timer?: ReturnType<typeof setTimeout>;
  private active?: Promise<void>;
  private stopped = true;

  constructor(private readonly pool: Pool, private readonly service: HikvisionAxProIntegrationService, private readonly logger: Logger) { }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.schedule(0);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.active;
  }

  async runOnce(): Promise<void> {
    const result = await this.pool.query(`SELECT id, tenant_id FROM security_device_integrations
      WHERE adapter_name = 'HIKVISION_AX_PRO' AND status IN ('ACTIVE', 'ERROR')
        AND COALESCE(connection_config->>'enabled', 'true') = 'true'
        AND (last_poll_attempt_at IS NULL OR last_poll_attempt_at <= NOW() - make_interval(secs => polling_interval_seconds))
      ORDER BY last_poll_attempt_at ASC NULLS FIRST LIMIT 20`);
    // Four panels at once; each service call holds a database advisory lock so
    // multiple control-plane replicas/manual polls cannot race the same panel.
    const concurrency = Math.max(1, Math.min(4, Math.floor((this.pool.options?.max ?? 20) / 3)));
    for (let offset = 0; offset < result.rows.length; offset += concurrency) {
      if (this.stopped && this.active) break;
      await Promise.all(result.rows.slice(offset, offset + concurrency).map(async row => {
        try { await this.service.poll(row.tenant_id, row.id); }
        catch { this.logger.error({ integrationId: row.id, tenantId: row.tenant_id }, 'AX PRO polling failed; retry scheduled'); }
      }));
    }
  }

  private schedule(delay: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.active = this.runOnce().catch(() => { this.logger.error({}, 'AX PRO polling cycle failed'); }).finally(() => {
        this.active = undefined;
        this.schedule(10_000);
      });
    }, delay);
    this.timer.unref();
  }
}

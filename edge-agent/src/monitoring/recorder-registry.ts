import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { isIP } from 'node:net';
import type { RecorderConfig } from './recorder-probe.js';
import type { MonitoringCamera } from '../registration/gateway-client.js';
import { recorderAdapterVendor } from '../recorders/dvr-adapter.js';

/** Device credentials stay in the central credential store, never this registry. */
export class RecorderRegistry {
  private pending: Promise<void> = Promise.resolve();
  constructor(private readonly path: string, private readonly agentId: string, private readonly branchId: string) {}

  async load(): Promise<RecorderConfig[]> {
    let raw: string;
    try { raw = await readFile(this.path, 'utf8'); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const saved = JSON.parse(raw);
    if (saved.version !== 1 || saved.agentId !== this.agentId || saved.branchId !== this.branchId) return [];
    if (!Array.isArray(saved.recorders)) throw new Error('recorder_registry_invalid');
    return saved.recorders.map((item: RecorderConfig) => {
      if (!item || typeof item.id !== 'string' || typeof item.name !== 'string' ||
          !isIP(item.host) || !Number.isInteger(item.port) || item.port < 1 || item.port > 65535 ||
          !['dvr', 'nvr'].includes(item.deviceType) ||
          !['hikvision', 'dahua', 'cp-plus', 'uniview', 'tvt', 'prama', 'honeywell', 'matrix', 'secureye', 'tiandy', 'onvif', 'generic'].includes(item.vendor)) {
        throw new Error('recorder_registry_invalid');
      }
      const { username: _username, password: _password, ...safe } = item;
      return safe;
    });
  }

  save(recorders: Iterable<RecorderConfig>): Promise<void> {
    const payload = JSON.stringify({version: 1, agentId: this.agentId, branchId: this.branchId,
      recorders: [...recorders].map(({username: _username, password: _password, ...safe}) => safe)});
    const operation = this.pending.catch(() => undefined).then(async () => {
      await mkdir(dirname(this.path), {recursive: true});
      const temporary = `${this.path}.${process.pid}.tmp`;
      await writeFile(temporary, payload, {encoding: 'utf8', mode: 0o600});
      await rename(temporary, this.path);
    });
    this.pending = operation;
    return operation;
  }
}

/** Recover older installations which never saved their discovered recorders. */
export function recorderFromMonitoringCamera(camera: MonitoringCamera): RecorderConfig | undefined {
  const host = camera.ipAddress?.replace(/\/\d+$/, '').trim();
  if (!camera.recorderId || camera.sourceType === 'ip-camera' || !host || !isIP(host) ||
      camera.recorderChannel === undefined || !Number.isInteger(camera.recorderChannel) || camera.recorderChannel < 0) return undefined;
  return {id: camera.recorderId, name: `Recorder ${host}`, host, port: 80, rtspPort: 554,
    deviceType: camera.sourceType === 'nvr-channel' ? 'nvr' : 'dvr',
    vendor: recorderAdapterVendor(`${camera.vendor ?? ''} ${camera.name}`), ...(camera.branchId ? {branchId:camera.branchId} : {})};
}

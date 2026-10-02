import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { RecorderRegistry, recorderFromMonitoringCamera } from '../src/monitoring/recorder-registry.js';
import type { RecorderConfig } from '../src/monitoring/recorder-probe.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, {recursive: true, force: true}))); });
async function registry() {
  const dir = await mkdtemp(join(tmpdir(), 'recorder-registry-'));
  directories.push(dir);
  const path = join(dir, 'recorders.json');
  return {path, registry: new RecorderRegistry(path, 'agent', 'branch')};
}
const recorder: RecorderConfig = {id: 'recorder', name: 'DVR', deviceType: 'dvr', host: '192.0.2.1', port: 8080,
  vendor: 'cp-plus', username: 'operator', password: 'private-password'};

describe('recorder registry survives gateway restarts', () => {
  it('retains discovered connection details across a fresh process without saving credentials', async () => {
    const {path, registry: store} = await registry();
    await store.save([recorder]);
    const fresh = new RecorderRegistry(path, 'agent', 'branch');
    expect(await fresh.load()).toEqual([expect.objectContaining({host: recorder.host, port: 8080})]);
    expect(await readFile(path, 'utf8')).not.toContain('password');
    expect((await fresh.load())[0]?.username).toBeUndefined();
  });
  it('isolates recorder state by gateway and branch identity', async () => {
    const {path, registry: store} = await registry();
    await store.save([recorder]);
    expect(await new RecorderRegistry(path, 'another-agent', 'branch').load()).toEqual([]);
    expect(await new RecorderRegistry(path, 'agent', 'another-branch').load()).toEqual([]);
  });
  it('serializes concurrent discovery writes and keeps the latest inventory', async () => {
    const {registry: store} = await registry();
    await Promise.all([store.save([recorder]), store.save([recorder, {...recorder, id: 'recorder-2', host: '192.0.2.2'}])]);
    expect(await store.load()).toHaveLength(2);
  });
  it('surfaces corrupted state without silently discarding or overwriting it', async () => {
    const {path, registry: store} = await registry();
    await writeFile(path, '{corrupt');
    await expect(store.load()).rejects.toThrow();
    expect(await readFile(path, 'utf8')).toBe('{corrupt');
  });
  it('reconstructs approved recorder mappings without requiring discovery again', () => {
    expect(recorderFromMonitoringCamera({id: 'camera', name: 'DVR CH1', profiles: [], connectionSecretRef: 'edge://agent/camera',
      sourceType: 'analog-dvr-channel', recorderId: 'recorder', recorderChannel: 0, ipAddress: '192.0.2.1', vendor: 'cp-plus'}))
      .toMatchObject({id: 'recorder', host: '192.0.2.1', vendor: 'cp-plus', port: 80});
    expect(recorderFromMonitoringCamera({id: 'camera', name: 'CP PLUS DVR - Channel 1', profiles: [], connectionSecretRef: 'edge://agent/camera',
      sourceType: 'analog-dvr-channel', recorderId: 'recorder', recorderChannel: 1, ipAddress: '192.0.2.1', vendor: 'other'})?.vendor)
      .toBe('cp-plus');
    expect(recorderFromMonitoringCamera({id: 'camera', name: 'IP', profiles: [], connectionSecretRef: 'edge://agent/camera',
      sourceType: 'ip-camera', ipAddress: '192.0.2.1'})).toBeUndefined();
  });
});

import { spawn } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { delimiter, relative, isAbsolute } from 'node:path';
import type { Pool } from 'pg';
import type { ProtectionPolicy, RecordingCheck } from './types.js';

export interface RecordingProbe {
  check(tenantId: string, cameraId: string, policy: ProtectionPolicy, now: Date): Promise<RecordingCheck>;
}
export function recordingGaps(rows: Array<{ started_at: Date | string; ended_at: Date | string }>, from: Date, to: Date, allowed: number) {
  let cursor = from.getTime();
  const gaps: RecordingCheck['gaps'] = [];
  for (const row of [...rows].sort((a, b) => +new Date(a.started_at) - +new Date(b.started_at))) {
    const start = Math.max(from.getTime(), +new Date(row.started_at));
    const end = Math.min(to.getTime(), +new Date(row.ended_at));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    if (start - cursor > allowed * 1000) gaps.push({ from: new Date(cursor).toISOString(), to: new Date(start).toISOString(), seconds: (start - cursor) / 1000 });
    cursor = Math.max(cursor, end);
  }
  if (to.getTime() - cursor > allowed * 1000) gaps.push({ from: new Date(cursor).toISOString(), to: to.toISOString(), seconds: (to.getTime() - cursor) / 1000 });
  return gaps;
}
// Only server-managed, allowlisted local archive paths are decoded. Remote edge/cloud
// segments require a media retrieval adapter; their index alone cannot prove playback.
export class LocalArchiveRecordingProbe implements RecordingProbe {
  constructor(private readonly getPool: () => Pool | null,
    private readonly roots = (process.env.PROTECTION_ARCHIVE_ROOTS ?? '').split(delimiter).filter(Boolean),
    private readonly ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg') {}
  async check(tenantId: string, cameraId: string, policy: ProtectionPolicy, now: Date): Promise<RecordingCheck> {
    const sampleAt = new Date(now.getTime() - 120_000);
    const result: RecordingCheck = { cameraId, checkedAt: now.toISOString(), sampleAt: sampleAt.toISOString(),
      status: 'UNKNOWN', framesDecoded: 0, timestampProgressing: false, reason: 'Archive retrieval is unavailable', gaps: [], indexedRetentionDays: null };
    const db = this.getPool();
    if (!db) return result;
    const from = new Date(now.getTime() - 86400_000);
    const rows = await db.query(`SELECT id,started_at,ended_at,storage_path FROM recording_segments
      WHERE tenant_id=$1 AND camera_id=$2 AND status='ready' AND started_at<$4 AND ended_at>$3 ORDER BY started_at`, [tenantId, cameraId, from, now]);
    result.gaps = recordingGaps(rows.rows, from, now, policy.maxGapSeconds);
    const oldest = await db.query("SELECT min(started_at) AS oldest FROM recording_segments WHERE tenant_id=$1 AND camera_id=$2 AND status='ready'", [tenantId, cameraId]);
    if (oldest.rows[0]?.oldest) result.indexedRetentionDays = Math.max(0, (now.getTime() - +new Date(oldest.rows[0].oldest)) / 86400_000);
    const segment = rows.rows.find(row => +new Date(row.started_at) <= +sampleAt && +new Date(row.ended_at) > +sampleAt);
    if (!segment) return { ...result, status: rows.rows.length ? 'FAILED' : 'UNKNOWN', reason: 'No indexed recording at sample time' };
    result.segmentId = String(segment.id);
    if (!this.roots.length || !segment.storage_path) return result;
    let archivePath: string;
    try {
      archivePath = await realpath(segment.storage_path);
      const roots = await Promise.all(this.roots.map(root => realpath(root)));
      if (!roots.some(root => { const path = relative(root, archivePath); return path !== '..' && !path.startsWith(`..\\`) && !path.startsWith('../') && !isAbsolute(path); })) return { ...result, reason: 'Archive path is outside configured retrieval roots' };
    } catch { return { ...result, status: 'FAILED', reason: 'Indexed archive file is unavailable' }; }
    const offset = Math.max(0, (+sampleAt - +new Date(segment.started_at)) / 1000);
    const decode = await decodeArchiveSample(this.ffmpeg, archivePath, offset);
    return { ...result, ...decode, status: decode.framesDecoded >= 2 && decode.timestampProgressing ? 'VERIFIED' : 'FAILED',
      reason: decode.framesDecoded >= 2 && decode.timestampProgressing ? 'Archive sample decoded with progressing timestamps' : 'Archive sample could not be decoded with progressing timestamps' };
  }
}
export function decodeArchiveSample(ffmpeg: string, path: string, offset: number): Promise<{ framesDecoded: number; timestampProgressing: boolean }> {
  return new Promise(resolve => {
    const child = spawn(ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'info', '-ss', String(offset), '-i', path,
      '-map', '0:v:0', '-an', '-t', '2', '-vf', 'showinfo', '-frames:v', '30', '-f', 'null', '-'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let output = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 20_000);
    child.stderr.on('data', chunk => { output = (output + chunk.toString()).slice(-131072); });
    child.once('error', () => { clearTimeout(timer); resolve({ framesDecoded: 0, timestampProgressing: false }); });
    child.once('close', code => {
      clearTimeout(timer);
      const pts = [...output.matchAll(/\bpts_time:\s*(-?\d+(?:\.\d+)?)/g)].map(match => Number(match[1]));
      resolve({ framesDecoded: code === 0 && !timedOut ? pts.length : 0,
        timestampProgressing: code === 0 && !timedOut && pts.length >= 2 && pts.every((value, index) => index === 0 || value > pts[index - 1]!) });
    });
  });
}

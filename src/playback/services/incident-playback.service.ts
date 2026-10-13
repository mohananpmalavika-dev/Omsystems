import type { IncidentPlaybackContext, PlaybackSession } from '../domain/playback.types.js';
import { PlaybackCoordinatorService } from './playback-coordinator.service.js';

export interface ExportClipInput {
  sessionId: string; inTimestamp: string; outTimestamp: string; cameraIds: string[];
  reason: string; incidentId?: string; investigatorUserId: string;
}
export interface ClippedEvidencePackage {
  evidencePackageId: string; incidentId?: string; inTimestamp: string; outTimestamp: string;
  durationSeconds: number; cameraIds: string[]; manifestHash: string; sealedAt: string;
  investigatorUserId: string; mediaUrls: Record<string, string>;
}
export type EvidenceClipExporter = (input: ExportClipInput) => Promise<ClippedEvidencePackage>;

/** Investigation context comes from an authorized caller; exports require a real recording engine. */
export class IncidentPlaybackService {
  constructor(private readonly coordinator: PlaybackCoordinatorService, private readonly exportClip?: EvidenceClipExporter) {}

  openIncidentSession(input: {
    incidentId: string; alertTimestamp: string; primaryCameraId: string; userId: string; tenantId?: string;
    relatedCameras?: IncidentPlaybackContext['cameras']; events?: IncidentPlaybackContext['events'];
  }): { session: PlaybackSession; context: IncidentPlaybackContext } {
    const alertMs = Date.parse(input.alertTimestamp);
    if (!Number.isFinite(alertMs)) throw new Error('invalid_incident_timestamp');
    const cameras = [...new Map([
      { cameraId: input.primaryCameraId, cameraName: input.primaryCameraId, reason: 'Incident source', priority: 1 },
      ...(input.relatedCameras ?? []),
    ].map(camera => [camera.cameraId, camera])).values()];
    const session = this.coordinator.createSession({ tenantId: input.tenantId, userId: input.userId,
      cameraIds: cameras.map(camera => camera.cameraId), startTime: new Date(alertMs - 30_000).toISOString(), mode: 'INCIDENT' });
    return { session, context: { incidentId: input.incidentId, anchorTimestamp: input.alertTimestamp,
      preRollSeconds: 30, postRollSeconds: 90, cameras, events: input.events ?? [] } };
  }

  async createEvidencePackageFromClip(input: ExportClipInput): Promise<ClippedEvidencePackage> {
    const session = this.coordinator.getSession(input.sessionId);
    if (!session || session.userId !== input.investigatorUserId) throw new Error('evidence_session_access_denied');
    const start = Date.parse(input.inTimestamp), end = Date.parse(input.outTimestamp);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !input.cameraIds.length ||
        input.cameraIds.some(id => !session.cameras.some(camera => camera.cameraId === id))) throw new Error('invalid_evidence_window');
    if (!this.exportClip) throw new Error('evidence_export_engine_unavailable');
    const result = await this.exportClip(input);
    if (!result?.evidencePackageId || !/^[a-f0-9]{64}$/i.test(result.manifestHash) || !Number.isFinite(Date.parse(result.sealedAt)) ||
        result.investigatorUserId !== input.investigatorUserId || result.incidentId !== input.incidentId ||
        Date.parse(result.inTimestamp) !== start || Date.parse(result.outTimestamp) !== end ||
        result.cameraIds.length !== input.cameraIds.length ||
        input.cameraIds.some(id => !result.cameraIds.includes(id) || !result.mediaUrls[id]) ||
        !Number.isFinite(result.durationSeconds) || Math.abs(result.durationSeconds - (end - start) / 1000) > 1) {
      throw new Error('evidence_export_result_unverified');
    }
    return result;
  }
}

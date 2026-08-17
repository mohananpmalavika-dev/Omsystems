import { describe, it, expect } from 'vitest';
import { synchronizedPlaybackService, SynchronizedPlaybackService } from '../src/vms/services/synchronized-playback.service.js';
import { investigationWorkspaceService, InvestigationWorkspaceService } from '../src/incidents/services/investigation-workspace.service.js';

describe('VMS Synchronized Multi-Camera Playback & Investigation Workspace Subsystem', () => {
  it('creates synchronized playback session across multiple cameras and aligns timeline offsets', async () => {
    const service = new SynchronizedPlaybackService();
    const startTime = '2026-08-17T02:00:00.000Z';
    const endTime = '2026-08-17T03:00:00.000Z';

    const session = await service.createSession({
      tenantId: 'BANK-001',
      branchId: 'BR-118',
      title: 'Vault Security Review',
      cameraIds: ['CAM-118-01', 'CAM-118-04', 'CAM-118-14', 'CAM-118-16'],
      startTime,
      endTime,
    });

    expect(session.sessionId).toBeDefined();
    expect(session.tracks.length).toBe(4);
    expect(session.currentTime).toBe(startTime);
    expect(session.state).toBe('PAUSED');
    expect(session.playbackSpeed).toBe(1.0);

    // Seek to 15 minutes in (02:15:00)
    const targetTimestamp = '2026-08-17T02:15:00.000Z';
    const updated = await service.seek(session.sessionId, targetTimestamp);
    expect(updated.currentTime).toBe(targetTimestamp);

    // All tracks should have synchronized offset = 15 minutes (900,000 ms)
    for (const track of updated.tracks) {
      expect(track.currentOffsetMs).toBe(900000);
    }
  });

  it('controls playback states, speed multipliers, and adds timeline bookmarks', async () => {
    const service = new SynchronizedPlaybackService();
    const session = await service.createSession({
      tenantId: 'BANK-001',
      branchId: 'BR-034',
      title: 'Cash Counter Audit',
      cameraIds: ['CAM-034-01', 'CAM-034-02'],
      startTime: '2026-08-17T09:00:00.000Z',
      endTime: '2026-08-17T10:00:00.000Z',
    });

    // Change state to PLAYING at 2x speed
    const playing = await service.setPlaybackState(session.sessionId, 'PLAYING', 2.0);
    expect(playing.state).toBe('PLAYING');
    expect(playing.playbackSpeed).toBe(2.0);

    // Add bookmark
    const bookmarked = await service.addBookmark(
      session.sessionId,
      '2026-08-17T09:24:12.000Z',
      'Suspicious bag left unattended near counter 3',
      'operator-arun'
    );

    expect(bookmarked.bookmarks.length).toBe(1);
    expect(bookmarked.bookmarks[0]?.label).toContain('Suspicious bag');
    expect(bookmarked.bookmarks[0]?.createdByUser).toBe('operator-arun');
  });

  it('creates an investigation case dossier, adds investigator notes, places under Legal Hold, and attaches sealed evidence', async () => {
    const service = new InvestigationWorkspaceService();

    const caseDossier = await service.createCase({
      tenantId: 'BANK-001',
      branchId: 'BR-118',
      title: 'Investigation into Strongroom Alarm Trigger',
      description: 'Review of vault door sensors and hallway cameras following P1 alarm',
      leadInvestigator: 'senior-investigator-rao',
      cameraIds: ['CAM-118-14', 'CAM-118-16'],
      timeRangeStart: '2026-08-17T02:00:00.000Z',
      timeRangeEnd: '2026-08-17T02:30:00.000Z',
    });

    expect(caseDossier.caseId).toBeDefined();
    expect(caseDossier.caseNumber).toContain('CASE-');
    expect(caseDossier.status).toBe('OPEN');

    // Add note
    await service.addNote(
      caseDossier.caseId,
      'senior-investigator-rao',
      'Reviewed CAM-118-14 footage; verified scheduled armored guard maintenance badge swipe.'
    );

    // Place under Legal Hold
    const held = await service.placeUnderLegalHold(caseDossier.caseId);
    expect(held.status).toBe('LEGAL_HOLD');

    // Seal and attach evidence package
    const snapshotBuffer = Buffer.from('case-snapshot-bytes');
    const clipBuffer = Buffer.from('case-clip-bytes');
    const { caseDossier: updatedCase, evidencePackage } = await service.sealAndAttachEvidence(
      caseDossier.caseId,
      'CAM-118-14',
      'NVR-01',
      { snapshotBuffer, clipBuffer }
    );

    expect(updatedCase.evidencePackageIds.length).toBe(1);
    expect(evidencePackage.id).toBeDefined();
    expect(evidencePackage.manifest.signatures.length).toBeGreaterThanOrEqual(1);
    expect(evidencePackage.timeSync.clockHealthStatus).toBeDefined();
  });
});

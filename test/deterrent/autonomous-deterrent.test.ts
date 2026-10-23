/**
 * Automated Test Suite for Autonomous Voice Talk-Down AI (Active Deterrent)
 *
 * Verifies restricted zone detection matching, after-hours schedule evaluation,
 * rate-limiting anti-flood cooldowns, Level 2 strobe/siren escalation,
 * Malayalam authoritative voice templates, operator preemption, and Fastify REST API.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  DETERRENT_SPEECH_TEMPLATES,
  generateSyntheticWavBuffer,
  type DeterrentRule,
} from '../../src/deterrent/domain/deterrent.types.js';
import { DeterrentRepository } from '../../src/deterrent/repositories/deterrent.repository.js';
import { AutonomousDeterrentService } from '../../src/deterrent/services/autonomous-deterrent.service.js';
import { TalkbackRepository } from '../../src/talkback/repositories/talkback.repository.js';
import { registerAutonomousDeterrentRoutes } from '../../src/routes/autonomous-deterrent.routes.js';

describe('Synthetic Audio Generation & Malayalam Speech Templates', () => {
  it('generates valid PCM 16-bit WAV headers and byte payloads', () => {
    const wav = generateSyntheticWavBuffer(520, 1.0, 8000);
    expect(wav.length).toBeGreaterThan(44);

    // RIFF chunk descriptor
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');

    // fmt sub-chunk
    expect(wav.toString('ascii', 12, 16)).toBe('fmt ');
    expect(wav.readUInt16LE(20)).toBe(1); // AudioFormat = 1 (PCM)
    expect(wav.readUInt16LE(22)).toBe(1); // NumChannels = 1
    expect(wav.readUInt32LE(24)).toBe(8000); // SampleRate = 8000
    expect(wav.readUInt16LE(34)).toBe(16); // BitsPerSample = 16

    // data sub-chunk
    expect(wav.toString('ascii', 36, 40)).toBe('data');
    const dataSize = wav.readUInt32LE(40);
    expect(wav.length).toBe(44 + dataSize);
  });

  it('contains the exact authoritative Malayalam warning text', () => {
    const ml = DETERRENT_SPEECH_TEMPLATES.ml;
    expect(ml.standard).toContain('ശ്രദ്ധിക്കുക! നിങ്ങൾ നിരോധിത മേഖലയിലാണ്.');
    expect(ml.standard).toContain('നിങ്ങളുടെ ദൃശ്യങ്ങൾ റെക്കോർഡ് ചെയ്യപ്പെടുന്നുണ്ട്');
    expect(ml.standard).toContain('സെക്യൂരിറ്റി ടീമിന് അലർട്ട് പോയിട്ടുണ്ട്. ഉടൻ പുറത്തുപോവുക!');

    expect(ml.escalated).toContain('അടിയന്തര മുന്നറിയിപ്പ്! നിങ്ങൾ ഇപ്പോഴും നിരോധിത മേഖലയിലാണ്.');
    expect(ml.escalated).toContain('ഉടനടി സ്ഥലം വിടുക!');
  });

  it('provides English, Hindi, and Bilingual warning scripts', () => {
    expect(DETERRENT_SPEECH_TEMPLATES.en.standard).toContain('Attention! You are in a restricted security zone.');
    expect(DETERRENT_SPEECH_TEMPLATES.hi.standard).toContain('सावधान! आप प्रतिबंधित सुरक्षा क्षेत्र में हैं।');
    expect(DETERRENT_SPEECH_TEMPLATES.bilingual_ml_en.standard).toContain('ശ്രദ്ധിക്കുക!');
    expect(DETERRENT_SPEECH_TEMPLATES.bilingual_ml_en.standard).toContain('Attention!');
  });
});

describe('Autonomous Deterrent Rule Engine & Policy Evaluation', () => {
  let deterrentRepo: DeterrentRepository;
  let talkbackRepo: TalkbackRepository;
  let service: AutonomousDeterrentService;

  beforeEach(() => {
    deterrentRepo = new DeterrentRepository(); // in-memory
    talkbackRepo = new TalkbackRepository();
    service = new AutonomousDeterrentService(deterrentRepo, undefined, talkbackRepo);
  });

  it('correctly evaluates after-hours schedule windows including midnight wraparound', () => {
    const rule: DeterrentRule = {
      id: 'rule-test-schedule',
      tenant_id: 'tenant-01',
      name: 'After Hours Rule',
      enabled: true,
      zone_types: ['vault'],
      schedule_type: 'after_hours',
      schedule_start_time: '20:00',
      schedule_end_time: '06:00',
      schedule_days_of_week: [0, 1, 2, 3, 4, 5, 6],
      detection_types: ['person_detected'],
      primary_language: 'ml',
      siren_enabled: false,
      strobe_enabled: true,
      cooldown_seconds: 60,
      escalation_enabled: true,
      escalation_window_seconds: 300,
      created_at: new Date(),
      updated_at: new Date(),
    };

    // 23:30 (night) -> within schedule
    const night = new Date('2026-10-23T23:30:00.000Z');
    night.setHours(23, 30);
    expect(service.isWithinSchedule(rule, night)).toBe(true);

    // 03:15 (early morning) -> within schedule
    const earlyMorning = new Date('2026-10-24T03:15:00.000Z');
    earlyMorning.setHours(3, 15);
    expect(service.isWithinSchedule(rule, earlyMorning)).toBe(true);

    // 14:00 (broad daylight) -> outside schedule
    const daytime = new Date('2026-10-24T14:00:00.000Z');
    daytime.setHours(14, 0);
    expect(service.isWithinSchedule(rule, daytime)).toBe(false);
  });

  it('triggers Level 1 voice deterrent for vault intrusion during active hours', async () => {
    const nightDate = new Date();
    nightDate.setHours(23, 0, 0);

    const result = await service.evaluateAlert({
      tenantId: 'default-tenant',
      cameraId: 'cam-vault-01',
      branchId: 'branch-south',
      detectionType: 'person_detected',
      zoneType: 'vault',
      timestamp: nightDate,
    });

    expect(result.triggered).toBe(true);
    expect(result.status).toBe('executed');
    expect(result.escalationLevel).toBe(1);
    expect(result.speechText).toContain('ശ്രദ്ധിക്കുക! നിങ്ങൾ നിരോധിത മേഖലയിലാണ്.');
    expect(result.actionsTriggered).toContain('voice_announcement');
    expect(result.actionsTriggered).toContain('strobe_light');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('enforces anti-flood cooldown suppressing duplicate warnings within 60s', async () => {
    const t0 = new Date('2026-10-23T23:00:00.000Z');
    t0.setHours(23, 0, 0);

    // First trigger: should execute
    const first = await service.evaluateAlert({
      tenantId: 'default-tenant',
      cameraId: 'cam-vault-cooldown',
      detectionType: 'person_detected',
      zoneType: 'vault',
      timestamp: t0,
    });
    expect(first.triggered).toBe(true);
    expect(first.status).toBe('executed');

    // Second trigger 20 seconds later (within 60s cooldown): should be suppressed
    const t1 = new Date(t0.getTime() + 20_000);
    t1.setHours(23, 0, 20);

    const second = await service.evaluateAlert({
      tenantId: 'default-tenant',
      cameraId: 'cam-vault-cooldown',
      detectionType: 'person_detected',
      zoneType: 'vault',
      timestamp: t1,
    });

    expect(second.triggered).toBe(false);
    expect(second.status).toBe('cooldown_suppressed');
    expect(second.cooldownRemainingSeconds).toBe(40);
    expect(second.reason).toContain('cooldown');
  });

  it('escalates to Level 2 (Strobe + Siren + Urgent warning) when intruder remains after cooldown', async () => {
    const t0 = new Date('2026-10-23T23:00:00.000Z');
    t0.setHours(23, 0, 0);

    // Trigger 1 at 23:00:00
    await service.evaluateAlert({
      tenantId: 'default-tenant',
      cameraId: 'cam-strongroom-01',
      detectionType: 'intrusion',
      zoneType: 'strong-room',
      timestamp: t0,
    });

    // Trigger 2 at 23:01:30 (90 seconds later: outside 60s cooldown, but within 300s escalation window)
    const t2 = new Date(t0.getTime() + 90_000);
    t2.setHours(23, 1, 30);

    const escalated = await service.evaluateAlert({
      tenantId: 'default-tenant',
      cameraId: 'cam-strongroom-01',
      detectionType: 'intrusion',
      zoneType: 'strong-room',
      timestamp: t2,
    });

    expect(escalated.triggered).toBe(true);
    expect(escalated.status).toBe('executed');
    expect(escalated.escalationLevel).toBe(2);
    expect(escalated.actionsTriggered).toContain('voice_announcement');
    expect(escalated.actionsTriggered).toContain('strobe_light');
    expect(escalated.actionsTriggered).toContain('siren_pulse');
    expect(escalated.speechText).toContain('അടിയന്തര മുന്നറിയിപ്പ്! നിങ്ങൾ ഇപ്പോഴും നിരോധിത മേഖലയിലാണ്.');
  });

  it('yields when human security operator has an active push-to-talk lease', async () => {
    // Acquire a human operator talkback lease
    await talkbackRepo.acquireLease(
      'cam-vault-human-override',
      'sess-guard-01',
      'guard-user-kerala-ops',
      'default-tenant',
      30_000
    );

    const nightDate = new Date();
    nightDate.setHours(23, 0, 0);

    const result = await service.evaluateAlert({
      tenantId: 'default-tenant',
      cameraId: 'cam-vault-human-override',
      detectionType: 'person_detected',
      zoneType: 'vault',
      timestamp: nightDate,
    });

    expect(result.triggered).toBe(false);
    expect(result.status).toBe('preempted_by_operator');
    expect(result.reason).toContain('Human security operator');
  });

  it('allows central operators to broadcast manual test deterrent warnings', async () => {
    const testRes = await service.testBroadcast({
      tenantId: 'default-tenant',
      cameraId: 'cam-cash-counter-01',
      language: 'ml',
      includeStrobe: true,
      includeSiren: true,
      escalated: false,
    });

    expect(testRes.success).toBe(true);
    expect(testRes.speechText).toContain('ശ്രദ്ധിക്കുക! നിങ്ങൾ നിരോധിത മേഖലയിലാണ്.');
    expect(testRes.actions).toEqual(['voice_announcement', 'strobe_light', 'siren_pulse']);
    expect(testRes.logId).toBeDefined();
  });
});

describe('Autonomous Deterrent Fastify REST API Integration', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    const mockStore: any = {
      pool: undefined, // in-memory deterministic fallback
    };
    await registerAutonomousDeterrentRoutes(app, mockStore);
    await app.ready();
  });

  it('lists existing rules with defaults', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/deterrent/rules',
      headers: { 'x-tenant-id': 'tenant-test-01' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.count).toBeGreaterThanOrEqual(1);
    expect(body.data[0].name).toContain('Vault & Strong Room');
  });

  it('creates, updates, and deletes an active deterrent rule', async () => {
    // 1. Create
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/deterrent/rules',
      headers: { 'x-tenant-id': 'tenant-test-01' },
      payload: {
        name: 'ATM Lobby Night Loitering Deterrent',
        description: 'Auto speech deterrent for loitering in ATM lobby past midnight',
        zoneTypes: ['atm-cabin', 'lobby'],
        scheduleType: 'after_hours',
        scheduleStartTime: '22:00',
        scheduleEndTime: '05:00',
        detectionTypes: ['loitering', 'person_detected'],
        primaryLanguage: 'ml',
        cooldownSeconds: 45,
        sirenEnabled: true,
        strobeEnabled: true,
      },
    });

    expect(createRes.statusCode).toBe(201);
    const createBody = JSON.parse(createRes.body);
    expect(createBody.success).toBe(true);
    const ruleId = createBody.data.id;
    expect(createBody.data.primary_language).toBe('ml');

    // 2. Get
    const getRes = await app.inject({
      method: 'GET',
      url: `/v1/deterrent/rules/${ruleId}`,
      headers: { 'x-tenant-id': 'tenant-test-01' },
    });
    expect(getRes.statusCode).toBe(200);
    expect(JSON.parse(getRes.body).data.name).toBe('ATM Lobby Night Loitering Deterrent');

    // 3. Update
    const putRes = await app.inject({
      method: 'PUT',
      url: `/v1/deterrent/rules/${ruleId}`,
      headers: { 'x-tenant-id': 'tenant-test-01' },
      payload: {
        cooldownSeconds: 90,
      },
    });
    expect(putRes.statusCode).toBe(200);
    expect(JSON.parse(putRes.body).data.cooldown_seconds).toBe(90);

    // 4. Delete
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/v1/deterrent/rules/${ruleId}`,
      headers: { 'x-tenant-id': 'tenant-test-01' },
    });
    expect(delRes.statusCode).toBe(200);
    expect(JSON.parse(delRes.body).success).toBe(true);
  });

  it('evaluates alert and triggers deterrence over REST API', async () => {
    const night = new Date();
    night.setHours(23, 15, 0);

    const evalRes = await app.inject({
      method: 'POST',
      url: '/v1/deterrent/evaluate',
      headers: { 'x-tenant-id': 'default-tenant' },
      payload: {
        cameraId: 'cam-vault-rest-01',
        detectionType: 'vault_unauthorized_entry',
        zoneType: 'vault',
        timestamp: night.toISOString(),
      },
    });

    expect(evalRes.statusCode).toBe(200);
    const body = JSON.parse(evalRes.body);
    expect(body.success).toBe(true);
    expect(body.data.triggered).toBe(true);
    expect(body.data.speechText).toContain('ശ്രദ്ധിക്കുക! നിങ്ങൾ നിരോധിത മേഖലയിലാണ്.');
  });

  it('fires test broadcast to camera edge speaker over REST API', async () => {
    const testRes = await app.inject({
      method: 'POST',
      url: '/v1/deterrent/test-broadcast',
      headers: { 'x-tenant-id': 'default-tenant' },
      payload: {
        cameraId: 'cam-edge-horn-speaker-01',
        language: 'ml',
        includeStrobe: true,
      },
    });

    expect(testRes.statusCode).toBe(200);
    const body = JSON.parse(testRes.body);
    expect(body.success).toBe(true);
    expect(body.data.speechText).toContain('ശ്രദ്ധിക്കുക! നിങ്ങൾ നിരോധിത മേഖലയിലാണ്.');
    expect(body.data.actions).toContain('strobe_light');
  });

  it('returns binary WAV audio stream for browser preview', async () => {
    const audioRes = await app.inject({
      method: 'GET',
      url: '/v1/deterrent/audio-preview?language=ml&escalated=false',
    });

    expect(audioRes.statusCode).toBe(200);
    expect(audioRes.headers['content-type']).toBe('audio/wav');
    expect(audioRes.rawPayload.length).toBeGreaterThan(44);
    expect(audioRes.rawPayload.toString('ascii', 0, 4)).toBe('RIFF');
  });

  it('returns operational deterrence statistics', async () => {
    const statsRes = await app.inject({
      method: 'GET',
      url: '/v1/deterrent/stats',
      headers: { 'x-tenant-id': 'default-tenant' },
    });

    expect(statsRes.statusCode).toBe(200);
    const body = JSON.parse(statsRes.body);
    expect(body.success).toBe(true);
    expect(body.data.estimatedBurglaryDeterrenceRatePercent).toBeGreaterThanOrEqual(76);
  });
});

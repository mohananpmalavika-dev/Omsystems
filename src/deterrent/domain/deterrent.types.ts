/**
 * Domain Types & Voice Templates for Autonomous Voice Talk-Down AI (Active Deterrent)
 *
 * Implements real-time deterrence policies, multi-lingual voice warning templates
 * (Malayalam, English, Hindi), strobe/siren escalations, rate-limiting cooldowns,
 * and backchannel dispatch contracts.
 */

export type DeterrentLanguage = 'ml' | 'en' | 'hi' | 'bilingual_ml_en';
export type DeterrentScheduleType = '24x7' | 'after_hours' | 'custom';
export type DeterrentActionType = 'voice_announcement' | 'strobe_light' | 'siren_pulse' | 'operator_alert';
export type DeterrentExecutionStatus =
  | 'executed'
  | 'cooldown_suppressed'
  | 'preempted_by_operator'
  | 'device_offline'
  | 'failed';

/**
 * Standard voice warning scripts.
 * The Malayalam phrase is the exact authoritative banking security warning.
 */
export const DETERRENT_SPEECH_TEMPLATES: Record<
  DeterrentLanguage,
  { standard: string; escalated: string }
> = {
  ml: {
    standard:
      'ശ്രദ്ധിക്കുക! നിങ്ങൾ നിരോധിത മേഖലയിലാണ്. നിങ്ങളുടെ ദൃശ്യങ്ങൾ റെക്കോർഡ് ചെയ്യപ്പെടുന്നുണ്ട്, സെക്യൂരിറ്റി ടീമിന് അലർട്ട് പോയിട്ടുണ്ട്. ഉടൻ പുറത്തുപോവുക!',
    escalated:
      'അടിയന്തര മുന്നറിയിപ്പ്! നിങ്ങൾ ഇപ്പോഴും നിരോധിത മേഖലയിലാണ്. പോലീസ് കൺട്രോൾ റൂമിലേക്കും സുരക്ഷാ സേനയ്ക്കും അപായ സിഗ്നൽ കൈമാറി. ഉടനടി സ്ഥലം വിടുക!',
  },
  en: {
    standard:
      'Attention! You are in a restricted security zone. Your actions are being recorded and security forces have been alerted. Leave immediately!',
    escalated:
      'Emergency Warning! You have failed to vacate the restricted area. Police and armed response units have been dispatched. Exit immediately!',
  },
  hi: {
    standard:
      'सावधान! आप प्रतिबंधित सुरक्षा क्षेत्र में हैं। आपकी हर गतिविधि रिकॉर्ड की जा रही है और सुरक्षा बल को सूचित कर दिया गया है। तुरंत बाहर निकलें!',
    escalated:
      'अंतिम चेतावनी! आप अभी भी प्रतिबंधित क्षेत्र में हैं। पुलिस और त्वरित सुरक्षा दस्ते को रवाना कर दिया गया है। तुरंत बाहर जाएं!',
  },
  bilingual_ml_en: {
    standard:
      'ശ്രദ്ധിക്കുക! നിങ്ങൾ നിരോധിത മേഖലയിലാണ്. ഉടൻ പുറത്തുപോവുക! Attention! You are in a restricted security zone. Leave immediately!',
    escalated:
      'അടിയന്തര മുന്നറിയിപ്പ്! ഉടനടി സ്ഥലം വിടുക! Emergency Warning! Police have been dispatched. Exit immediately!',
  },
};

export interface DeterrentRule {
  id: string;
  tenant_id: string;
  branch_id?: string | null;
  camera_id?: string | null;
  name: string;
  description?: string | null;
  enabled: boolean;
  zone_types: string[];
  schedule_type: DeterrentScheduleType;
  schedule_start_time: string; // "HH:MM" e.g. "20:00"
  schedule_end_time: string; // "HH:MM" e.g. "06:00"
  schedule_days_of_week: number[]; // 0=Sun, 6=Sat
  detection_types: string[];
  primary_language: DeterrentLanguage;
  custom_warning_text?: string | null;
  siren_enabled: boolean;
  strobe_enabled: boolean;
  cooldown_seconds: number;
  escalation_enabled: boolean;
  escalation_window_seconds: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateDeterrentRuleInput {
  tenantId: string;
  branchId?: string | null;
  cameraId?: string | null;
  name: string;
  description?: string;
  enabled?: boolean;
  zoneTypes?: string[];
  scheduleType?: DeterrentScheduleType;
  scheduleStartTime?: string;
  scheduleEndTime?: string;
  scheduleDaysOfWeek?: number[];
  detectionTypes?: string[];
  primaryLanguage?: DeterrentLanguage;
  customWarningText?: string;
  sirenEnabled?: boolean;
  strobeEnabled?: boolean;
  cooldownSeconds?: number;
  escalationEnabled?: boolean;
  escalationWindowSeconds?: number;
}

export interface UpdateDeterrentRuleInput {
  name?: string;
  description?: string;
  enabled?: boolean;
  zoneTypes?: string[];
  scheduleType?: DeterrentScheduleType;
  scheduleStartTime?: string;
  scheduleEndTime?: string;
  scheduleDaysOfWeek?: number[];
  detectionTypes?: string[];
  primaryLanguage?: DeterrentLanguage;
  customWarningText?: string;
  sirenEnabled?: boolean;
  strobeEnabled?: boolean;
  cooldownSeconds?: number;
  escalationEnabled?: boolean;
  escalationWindowSeconds?: number;
}

export interface DeterrentLog {
  id: string;
  tenant_id: string;
  branch_id?: string | null;
  camera_id: string;
  rule_id?: string | null;
  alert_id?: string | null;
  detection_type: string;
  language: string;
  speech_text: string;
  actions_triggered: DeterrentActionType[];
  status: DeterrentExecutionStatus;
  escalation_level: number;
  latency_ms: number;
  talkback_session_id?: string | null;
  details?: Record<string, unknown>;
  created_at: Date;
}

export interface DeterrentEvaluationInput {
  tenantId: string;
  cameraId: string;
  branchId?: string;
  detectionType: string;
  zoneType?: string;
  alertId?: string;
  timestamp?: Date | string;
  confidence?: number;
}

export interface DeterrentEvaluationResult {
  triggered: boolean;
  status: DeterrentExecutionStatus;
  ruleMatched?: DeterrentRule;
  escalationLevel: number;
  speechText?: string;
  language?: DeterrentLanguage;
  actionsTriggered: DeterrentActionType[];
  latencyMs: number;
  reason?: string;
  logId?: string;
  cooldownRemainingSeconds?: number;
}

export interface TestBroadcastInput {
  tenantId: string;
  cameraId: string;
  language?: DeterrentLanguage;
  customText?: string;
  includeStrobe?: boolean;
  includeSiren?: boolean;
  escalated?: boolean;
}

export interface DeterrentStats {
  totalInterventions: number;
  successfulBroadcasts: number;
  cooldownSuppressedCount: number;
  preemptedByOperatorCount: number;
  escalatedInterventions: number;
  activeRulesCount: number;
  estimatedBurglaryDeterrenceRatePercent: number; // e.g. 82.5%
}

/**
 * Creates a valid PCM 16-bit 8000Hz mono WAV buffer.
 * Used for synthetic backchannel transmission and in-browser audio preview.
 */
export function generateSyntheticWavBuffer(
  frequencyHz: number = 440,
  durationSeconds: number = 1.0,
  sampleRate: number = 8000
): Buffer {
  const numChannels = 1;
  const bytesPerSample = 2; // 16-bit
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const dataSize = numSamples * numChannels * bytesPerSample;
  const headerSize = 44;
  const buffer = Buffer.alloc(headerSize + dataSize);

  // RIFF Chunk Descriptor
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // 'fmt ' Sub-chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // SubChunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28); // ByteRate
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32); // BlockAlign
  buffer.writeUInt16LE(16, 34); // BitsPerSample

  // 'data' Sub-chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Deterministic Audio Tone (sinusoidal pulse simulating synthesized alert speech)
  let offset = headerSize;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Layer dual tone (security chirp 880Hz + frequencyHz)
    const sampleVal = Math.sin(2 * Math.PI * frequencyHz * t) * 0.6 +
                      Math.sin(2 * Math.PI * (frequencyHz * 1.5) * t) * 0.3;
    const intSample = Math.max(-32768, Math.min(32767, Math.floor(sampleVal * 32767 * 0.7)));
    buffer.writeInt16LE(intSample, offset);
    offset += 2;
  }

  return buffer;
}

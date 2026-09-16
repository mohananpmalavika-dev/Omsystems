# Voice Authentication System - Complete Guide

## Overview

The voice authentication system enables passwordless login through speaker identification and verification. Users can enroll their voice biometrics and subsequently authenticate using their voice alone or in combination with other factors.

## Table of Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Setup and Deployment](#setup-and-deployment)
4. [API Reference](#api-reference)
5. [Security Considerations](#security-considerations)
6. [Integration Guide](#integration-guide)
7. [Troubleshooting](#troubleshooting)
8. [Privacy and Compliance](#privacy-and-compliance)

---

## Features

### Core Capabilities

✅ **Speaker Identification (1-to-N)** - Identify users from voice alone without username  
✅ **Speaker Verification (1-to-1)** - Verify claimed identity with voice  
✅ **Voice + Passphrase** - Combine voice with spoken passphrase  
✅ **Voice MFA** - Use voice as additional authentication factor  
✅ **Challenge-Response** - Liveness detection with random phrases  

### Security Features

🔒 **Anti-Spoofing Detection** - Detects replay attacks and synthetic voices  
🔒 **Audio Quality Validation** - SNR checks, clipping detection, speech validation  
🔒 **Liveness Detection** - Challenge-response to prevent replay attacks  
🔒 **Comprehensive Audit Logging** - All attempts logged with detailed metrics  
🔒 **Account Lockout Protection** - Failed attempt tracking and lockout  
🔒 **Consent Management** - Explicit user consent for biometric enrollment  

### Analytics and Monitoring

📊 **Real-time Analytics** - Success rates, spoofing attempts, quality metrics  
📊 **User-level Statistics** - Per-user authentication history  
📊 **Tenant-level Dashboards** - Organization-wide voice auth metrics  
📊 **Anti-Spoofing Logs** - Detailed spoofing detection analysis  

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     Voice Authentication System                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────┐      ┌──────────────────┐                │
│  │  Audio Capture   │─────▶│ Voice Processing │                │
│  │  (Browser/App)   │      │     Service      │                │
│  └──────────────────┘      └──────────────────┘                │
│                                     │                             │
│                                     ▼                             │
│  ┌──────────────────────────────────────────────┐               │
│  │          ONNX Runtime                        │               │
│  │  ┌────────────┐  ┌────────────┐            │               │
│  │  │  Speaker   │  │Anti-Spoofing│            │               │
│  │  │ Embedding  │  │   Model     │            │               │
│  │  │   Model    │  │             │            │               │
│  │  └────────────┘  └────────────┘            │               │
│  └──────────────────────────────────────────────┘               │
│                                     │                             │
│                                     ▼                             │
│  ┌──────────────────────────────────────────────┐               │
│  │    Voice Biometric Repository                │               │
│  │                                               │               │
│  │  ┌──────────────┐  ┌──────────────┐        │               │
│  │  │Voice Profiles│  │Auth Attempts │        │               │
│  │  │(Embeddings)  │  │  (Audit Log) │        │               │
│  │  └──────────────┘  └──────────────┘        │               │
│  └──────────────────────────────────────────────┘               │
│                                                                   │
│  ┌──────────────────────────────────────────────┐               │
│  │        Authentication Routes                  │               │
│  │  • /voice-login     • /voice-verify          │               │
│  │  • /enrollment      • /analytics              │               │
│  └──────────────────────────────────────────────┘               │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

#### Enrollment Flow

```
1. User requests enrollment → Start enrollment API
2. User records voice samples (3-10 samples)
3. Each sample is:
   a. Quality validated (SNR, speech detection)
   b. Speaker embedding extracted (512-dim vector)
   c. Stored in database
4. After sufficient samples:
   a. Embeddings aggregated (averaged)
   b. Final embedding normalized
   c. Profile marked as complete
5. User can now use voice authentication
```

#### Authentication Flow

```
1. User provides audio sample → Voice login API
2. Audio quality check (SNR, duration, speech detection)
3. Anti-spoofing detection (if enabled)
4. Speaker embedding extraction
5. Similarity search:
   a. Speaker Identification: Find matching profile (1-to-N)
   b. Speaker Verification: Compare with specific user (1-to-1)
6. If similarity >= threshold:
   a. Session created
   b. Tokens issued
   c. Success response
7. All attempts logged with detailed metrics
```

---

## Setup and Deployment

### Prerequisites

1. **PostgreSQL Database** with pgvector extension
2. **Node.js** 18+ with TypeScript support
3. **ONNX Runtime** for model inference
4. **Speaker Recognition Model** (e.g., ECAPA-TDNN)

### Step 1: Database Migration

Run the voice authentication migration:

```bash
# Apply migration
psql -U postgres -d your_database -f database/migrations/20260917_voice_biometric_authentication.sql
```

This creates:
- `voice_profiles` - User voice embeddings
- `voice_enrollment_samples` - Individual audio samples
- `voice_authentication_attempts` - Audit log
- `voice_authentication_settings` - Tenant configuration
- `voice_anti_spoofing_logs` - Security logs

### Step 2: Model Setup

Download and place speaker recognition models:

```bash
# Create models directory
mkdir -p models/voice

# Download ECAPA-TDNN model (example)
# Place your speaker embedding model at:
models/voice/ecapa-tdnn-512.onnx

# Optional: Anti-spoofing model
models/voice/anti-spoofing.onnx
```

**Recommended Models:**
- **Speaker Embedding**: ECAPA-TDNN, ResNet, x-vector, d-vector
- **Anti-Spoofing**: LA-AASIST, RawNet2
- **Format**: ONNX (for cross-platform inference)

### Step 3: Environment Configuration

Add to your `.env` file:

```env
# Voice Authentication Models
VOICE_EMBEDDING_MODEL_PATH=models/voice/ecapa-tdnn-512.onnx
VOICE_VAD_MODEL_PATH=models/voice/silero-vad.onnx
VOICE_ANTISPOOFING_MODEL_PATH=models/voice/anti-spoofing.onnx

# Audio Processing
VOICE_TARGET_SAMPLE_RATE=16000
VOICE_MIN_AUDIO_DURATION=2.0
VOICE_MAX_AUDIO_DURATION=30.0
VOICE_MIN_SNR=15.0

# Similarity Thresholds
VOICE_SIMILARITY_THRESHOLD=0.75
VOICE_LIVENESS_THRESHOLD=0.80
VOICE_QUALITY_THRESHOLD=0.60

# Storage (optional)
VOICE_AUDIO_STORAGE_PATH=/var/lib/voice-samples
VOICE_RETAIN_ENROLLMENT_SAMPLES=false
VOICE_ENCRYPT_AUDIO_FILES=true
```

### Step 4: Register Routes

In your main application file:

```typescript
import { registerVoiceEnrollmentRoutes } from "./routes/voice-enrollment.routes.js";
import { registerVoiceAuthenticationRoutes } from "./routes/voice-authentication.routes.js";

// Register routes
await registerVoiceEnrollmentRoutes(app, pool);
await registerVoiceAuthenticationRoutes(app, pool, store);
```

### Step 5: Enable for Tenant

Configure voice authentication for your tenant:

```sql
-- Enable voice authentication
UPDATE voice_authentication_settings
SET enabled = true,
    require_liveness_check = true,
    require_anti_spoofing = true,
    similarity_threshold = 0.75,
    minimum_enrollment_samples = 3,
    maximum_enrollment_samples = 10
WHERE tenant_id = '<your-tenant-id>';
```

---

## API Reference

### Enrollment APIs

#### 1. Start Enrollment

**POST** `/v1/voice/enrollment/start`

Start voice enrollment for current user.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Request Body:**
```json
{
  "consentGiven": true,
  "passphraseRequired": false
}
```

**Response:**
```json
{
  "success": true,
  "voiceProfileId": "uuid",
  "minimumSamplesRequired": 3,
  "maximumSamplesAllowed": 10,
  "message": "Voice enrollment started. Please record voice samples."
}
```

---

#### 2. Submit Sample

**POST** `/v1/voice/enrollment/sample`

Submit a voice sample for enrollment.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Request Body:**
```json
{
  "voiceProfileId": "uuid",
  "audioData": "base64-encoded-audio",
  "audioFormat": "wav",
  "sampleRateHz": 16000,
  "durationSeconds": 3.5
}
```

**Response:**
```json
{
  "success": true,
  "sampleId": "uuid",
  "sampleSequence": 1,
  "qualityPassed": true,
  "qualityScore": 0.85,
  "qualityIssues": [],
  "snrDb": 25.3,
  "samplesCompleted": 1,
  "samplesRequired": 3,
  "enrollmentComplete": false,
  "message": "Sample 1/3 recorded successfully"
}
```

**Quality Issues:**
- `Audio too short: 1.5s (minimum 2.0s)`
- `Poor audio quality: SNR 12.5dB (minimum 15.0dB)`
- `Audio clipping detected - reduce input volume`
- `Too much silence: 65%`
- `No speech detected in audio`

---

#### 3. Complete Enrollment

**POST** `/v1/voice/enrollment/complete`

Finalize enrollment after recording sufficient samples.

**Request Body:**
```json
{
  "voiceProfileId": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "voiceProfileId": "uuid",
  "enrollmentQualityScore": 0.82,
  "message": "Voice enrollment completed successfully. You can now use voice authentication."
}
```

---

#### 4. Get Enrollment Status

**GET** `/v1/voice/enrollment/status`

Get current user's enrollment status.

**Response:**
```json
{
  "enrolled": true,
  "profile": {
    "id": "uuid",
    "enrollmentStatus": "completed",
    "samplesCount": 5,
    "minimumSamplesRequired": 3,
    "enrollmentQualityScore": 0.82,
    "enrollmentCompletedAt": "2026-09-17T10:30:00Z",
    "lastUsedAt": "2026-09-17T14:20:00Z",
    "successfulAuthCount": 15,
    "failedAuthCount": 2
  },
  "isActive": true,
  "needsReEnrollment": false,
  "message": "Voice authentication is active"
}
```

---

#### 5. Revoke Voice Profile

**DELETE** `/v1/voice/enrollment/profile`

Revoke current user's voice profile.

**Request Body (optional):**
```json
{
  "reason": "User request"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Voice profile revoked successfully"
}
```

---

### Authentication APIs

#### 1. Voice Login

**POST** `/v1/auth/voice-login`

Authenticate using voice biometrics.

**Request Body:**
```json
{
  "audioData": "base64-encoded-audio",
  "audioFormat": "wav",
  "authMethod": "speaker_identification",
  "tenantSlug": "acme-corp"
}
```

**Authentication Methods:**

- **`speaker_identification`** - Identify user from voice (no username needed)
- **`speaker_verification`** - Verify specific user (requires `username`)
- **`voice_passphrase`** - Voice + passphrase (requires `username` and `passphrase`)
- **`voice_mfa`** - Voice as second factor (requires `username` and `otpCode`)
- **`challenge_response`** - With liveness check (requires `challengeResponse`)

**Response (Success):**
```json
{
  "success": true,
  "authResult": "success",
  "accessToken": "...",
  "refreshToken": "...",
  "expiresIn": 3600,
  "tokenType": "Bearer",
  "user": {
    "id": "uuid",
    "username": "john.doe",
    "email": "john@example.com",
    "displayName": "John Doe",
    "role": "operator",
    "tenantId": "uuid"
  },
  "voiceAuth": {
    "similarityScore": 0.89,
    "confidenceScore": 0.85,
    "method": "speaker_identification"
  }
}
```

**Response (Failure):**
```json
{
  "success": false,
  "authResult": "low_confidence",
  "message": "Voice authentication failed",
  "confidenceScore": 0.62
}
```

**Auth Results:**
- `success` - Authentication successful
- `rejected` - Voice didn't match any profile
- `low_confidence` - Match confidence below threshold
- `quality_failed` - Poor audio quality
- `liveness_failed` - Liveness check failed
- `replay_detected` - Replay attack detected
- `synthetic_detected` - Synthetic voice detected
- `profile_expired` - Voice profile needs re-enrollment
- `account_locked` - Account locked due to failures

---

#### 2. Voice Verify

**POST** `/v1/auth/voice-verify`

Verify user's voice (requires existing session).

**Headers:**
```
Authorization: Bearer <access-token>
```

**Request Body:**
```json
{
  "audioData": "base64-encoded-audio",
  "audioFormat": "wav",
  "userId": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "verified": true,
  "similarityScore": 0.87,
  "threshold": 0.75,
  "confidenceScore": 0.84,
  "message": "Voice verification successful"
}
```

---

#### 3. Request Challenge

**POST** `/v1/auth/voice-challenge`

Get a challenge phrase for liveness detection.

**Request Body:**
```json
{
  "username": "john.doe",
  "tenantSlug": "acme-corp"
}
```

**Response:**
```json
{
  "challenge": "Please confirm your identity with your voice 482759",
  "expiresIn": 60,
  "message": "Please speak this phrase clearly"
}
```

---

#### 4. Voice Analytics (Admin)

**GET** `/v1/voice/analytics`

Get voice authentication analytics.

**Query Parameters:**
- `startDate` - Start date (ISO 8601)
- `endDate` - End date (ISO 8601)
- `userId` - Filter by user (optional)

**Response:**
```json
{
  "success": true,
  "period": {
    "startDate": "2026-08-17T00:00:00Z",
    "endDate": "2026-09-17T23:59:59Z"
  },
  "summary": {
    "totalAttempts": 1250,
    "successfulAttempts": 1180,
    "failedAttempts": 70,
    "successRate": 0.944,
    "livenessFailures": 15,
    "spoofingAttempts": 8,
    "averageConfidenceScore": 0.852
  },
  "recentAttempts": [...]
}
```

---

#### 5. Get/Update Settings (Admin)

**GET** `/v1/voice/settings`

Get tenant voice authentication settings.

**PATCH** `/v1/voice/settings`

Update settings:

```json
{
  "enabled": true,
  "requireLivenessCheck": true,
  "requireAntiSpoofing": true,
  "similarityThreshold": 0.75,
  "minimumEnrollmentSamples": 3,
  "maximumEnrollmentSamples": 10,
  "maxFailedAttempts": 5,
  "lockoutDurationMinutes": 30
}
```

---

## Security Considerations

### Audio Quality Requirements

The system enforces strict quality requirements:

- **Minimum Duration**: 2 seconds (configurable)
- **Maximum Duration**: 30 seconds
- **Minimum SNR**: 15 dB (signal-to-noise ratio)
- **Speech Detection**: Must contain speech
- **Clipping**: Excessive clipping rejected

### Anti-Spoofing Protection

Multiple layers of spoofing detection:

1. **Replay Attack Detection**
   - Spectral analysis for unnatural consistency
   - Zero-crossing rate analysis
   - Energy variation patterns

2. **Synthetic Speech Detection**
   - Deep learning model (optional)
   - Heuristic checks on audio characteristics
   - Temporal inconsistency detection

3. **Liveness Detection**
   - Challenge-response (user speaks random phrase)
   - Active detection (user follows instructions)
   - Passive detection (natural speech patterns)

### Similarity Thresholds

**Default Threshold: 0.75** (75% similarity required)

- **0.60-0.70**: Low security (convenience)
- **0.70-0.80**: Balanced (recommended)
- **0.80-0.90**: High security (strict)
- **0.90+**: Very high security (may cause false rejections)

**Factors affecting similarity:**
- Microphone quality
- Background noise
- User health (cold, fatigue)
- Time since enrollment
- Audio format/compression

### Account Protection

- **Failed Attempt Tracking**: All failures logged
- **Account Lockout**: After N failures (default: 5)
- **Lockout Duration**: Temporary lock (default: 30 min)
- **Admin Unlock**: Support team can unlock
- **Session Timeout**: Voice sessions expire (default: 60 min)

---

## Integration Guide

### Web Application Integration

#### 1. Audio Capture

```javascript
// Request microphone permission
const stream = await navigator.mediaDevices.getUserMedia({ 
  audio: {
    sampleRate: 16000,
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true
  } 
});

// Record audio
const mediaRecorder = new MediaRecorder(stream);
const audioChunks = [];

mediaRecorder.ondataavailable = (event) => {
  audioChunks.push(event.data);
};

mediaRecorder.onstop = async () => {
  const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
  await submitVoiceSample(audioBlob);
};

// Start/stop recording
mediaRecorder.start();
setTimeout(() => mediaRecorder.stop(), 3000); // 3 second sample
```

#### 2. Enrollment Flow

```javascript
async function enrollVoice() {
  // 1. Start enrollment
  const { voiceProfileId, minimumSamplesRequired } = await fetch('/v1/voice/enrollment/start', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ consentGiven: true })
  }).then(r => r.json());

  // 2. Record samples
  for (let i = 0; i < minimumSamplesRequired; i++) {
    const audioBlob = await recordAudio(3000); // 3 seconds
    const base64Audio = await blobToBase64(audioBlob);
    
    const result = await fetch('/v1/voice/enrollment/sample', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        voiceProfileId,
        audioData: base64Audio,
        audioFormat: 'wav',
        sampleRateHz: 16000,
        durationSeconds: 3.0
      })
    }).then(r => r.json());
    
    if (!result.qualityPassed) {
      console.warn('Sample quality issues:', result.qualityIssues);
      i--; // Retry this sample
      continue;
    }
    
    console.log(`Sample ${i+1}/${minimumSamplesRequired} recorded`);
  }

  // 3. Complete enrollment
  await fetch('/v1/voice/enrollment/complete', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ voiceProfileId })
  }).then(r => r.json());
  
  console.log('Voice enrollment complete!');
}
```

#### 3. Login Flow

```javascript
async function voiceLogin() {
  // Record audio
  const audioBlob = await recordAudio(3000);
  const base64Audio = await blobToBase64(audioBlob);
  
  // Authenticate
  const response = await fetch('/v1/auth/voice-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audioData: base64Audio,
      audioFormat: 'wav',
      authMethod: 'speaker_identification',
      tenantSlug: 'acme-corp'
    })
  });
  
  const result = await response.json();
  
  if (result.success) {
    // Store tokens
    localStorage.setItem('access_token', result.accessToken);
    localStorage.setItem('refresh_token', result.refreshToken);
    
    console.log('Logged in as:', result.user.username);
    console.log('Voice match score:', result.voiceAuth.similarityScore);
    
    // Redirect to dashboard
    window.location.href = '/dashboard';
  } else {
    console.error('Voice authentication failed:', result.authResult);
    alert(`Login failed: ${result.message}`);
  }
}
```

### Mobile Application Integration

```kotlin
// Android example using AudioRecord
val audioRecord = AudioRecord(
    MediaRecorder.AudioSource.MIC,
    16000, // Sample rate
    AudioFormat.CHANNEL_IN_MONO,
    AudioFormat.ENCODING_PCM_16BIT,
    bufferSize
)

audioRecord.startRecording()
val audioData = ShortArray(bufferSize)
audioRecord.read(audioData, 0, bufferSize)
audioRecord.stop()

// Convert to Base64
val base64Audio = Base64.encodeToString(audioData.toByteArray(), Base64.DEFAULT)

// Submit to API
val response = apiService.voiceLogin(
    VoiceLoginRequest(
        audioData = base64Audio,
        audioFormat = "pcm_s16le",
        authMethod = "speaker_identification"
    )
)
```

---

## Troubleshooting

### Common Issues

#### 1. "Audio quality check failed"

**Causes:**
- Low SNR (background noise)
- Short duration
- No speech detected
- Audio clipping

**Solutions:**
- Use quiet environment
- Speak clearly and naturally
- Check microphone permissions
- Reduce microphone input volume
- Use better quality microphone

#### 2. "Voice authentication failed - low confidence"

**Causes:**
- Different microphone than enrollment
- Background noise
- User health (cold, tired)
- Enrollment quality was poor

**Solutions:**
- Re-enroll in similar environment
- Use same microphone/device
- Ensure quiet environment
- Speak naturally, don't force voice
- Lower similarity threshold (if acceptable)

#### 3. "Replay attack detected"

**Causes:**
- Playing recorded audio
- Low-quality microphone creating artifacts
- VoIP/virtual audio devices

**Solutions:**
- Use real microphone input
- Don't use virtual audio cables
- Disable screen recording software
- Contact admin if legitimate

#### 4. "Service unavailable - model not loaded"

**Causes:**
- ONNX model file missing
- Incorrect model path
- Model format incompatible
- Insufficient memory

**Solutions:**
```bash
# Check model file exists
ls -la models/voice/ecapa-tdnn-512.onnx

# Verify environment variable
echo $VOICE_EMBEDDING_MODEL_PATH

# Check server logs for loading errors
tail -f logs/voice-service.log

# Test model loading
node -e "require('./src/services/voice-processing.service.js').getVoiceProcessingService()"
```

#### 5. "Profile expired - please re-enroll"

**Causes:**
- Enrollment expiry date reached
- Voice profile manually expired
- Profile quality degraded

**Solutions:**
- Re-enroll voice profile
- Contact admin to check expiry settings
- Verify voice_authentication_settings.enrollment_expiry_days

---

## Privacy and Compliance

### Data Protection

#### What is Stored

- **Voice Embeddings**: 512-dimensional numerical vectors (NOT raw audio)
- **Audio Samples**: Only if `retainAudioSamples = true` (default: false)
- **Authentication Attempts**: Timestamps, results, confidence scores
- **Anti-Spoofing Logs**: Detection results, no personally identifiable data

#### What is NOT Stored by Default

- ❌ Raw audio recordings
- ❌ Voice waveforms
- ❌ Spectrograms
- ❌ Speech content/transcriptions

### GDPR Compliance

The system includes features for GDPR compliance:

1. **Consent Management**
   - Explicit consent required for enrollment
   - Consent timestamp and IP recorded
   - Clear consent withdrawal option

2. **Right to Access**
   - Users can view their voice profile
   - Access authentication history
   - Download personal data

3. **Right to Deletion**
   - Users can revoke voice profiles
   - Admin can delete user data
   - Cascading deletes for related records

4. **Data Minimization**
   - Only essential data stored
   - Audio samples optional
   - Embeddings instead of raw audio

5. **Purpose Limitation**
   - Used only for authentication
   - Not used for voice analysis/profiling
   - Clear purpose communication

### Retention Policies

Configure retention in settings:

```sql
UPDATE voice_authentication_settings
SET 
  audio_retention_days = 30,        -- Delete audio after 30 days
  retain_audio_samples = false,      -- Don't retain audio
  enrollment_expiry_days = 365      -- Re-enroll yearly
WHERE tenant_id = '<your-tenant>';
```

### Audit and Compliance

All voice authentication events are logged:

- Enrollment start/complete/revoke
- Authentication attempts (success/failure)
- Anti-spoofing detections
- Settings changes
- Profile access

Query audit logs:

```sql
SELECT * FROM audit_events
WHERE action LIKE 'voice_%'
  AND actor_user_id = '<user-id>'
ORDER BY created_at DESC;
```

---

## Performance Optimization

### Model Optimization

- Use quantized ONNX models (FP16 or INT8)
- Enable ONNX graph optimization
- Use appropriate execution providers (CPU/GPU)

### Caching Strategies

- Cache voice profiles in Redis
- In-memory embedding cache
- Session-based results cache

### Scaling Considerations

- Separate voice processing service
- Load balance across multiple instances
- Use message queue for async processing
- CDN for model distribution

---

## Additional Resources

### Recommended Models

- **ECAPA-TDNN**: https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb
- **ResNet**: https://github.com/clovaai/voxceleb_trainer
- **Silero VAD**: https://github.com/snakers4/silero-vad
- **LA-AASIST**: https://github.com/clovaai/aasist

### Further Reading

- [Speaker Recognition Overview](https://en.wikipedia.org/wiki/Speaker_recognition)
- [Voice Biometrics Security](https://www.nist.gov/itl/iad/mig/speaker-recognition-evaluation)
- [ONNX Runtime Documentation](https://onnxruntime.ai/docs/)

---

## Support

For issues, feature requests, or questions:

- Check the [Troubleshooting](#troubleshooting) section
- Review API error responses for specific guidance
- Check server logs: `logs/voice-service.log`
- Contact your system administrator

---

**Version:** 1.0.0  
**Last Updated:** September 17, 2026  
**Status:** Production Ready

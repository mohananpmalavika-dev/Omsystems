# Voice Authentication - Quick Start Guide

## 5-Minute Setup

### Step 1: Run Database Migration

```bash
psql -U postgres -d your_database -f database/migrations/20260917_voice_biometric_authentication.sql
```

### Step 2: Download Models

Place speaker embedding model at:
```
models/voice/ecapa-tdnn-512.onnx
```

**Where to get models:**
- Hugging Face: https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb
- Convert PyTorch to ONNX using `torch.onnx.export()`

### Step 3: Configure Environment

Add to `.env`:
```env
VOICE_EMBEDDING_MODEL_PATH=models/voice/ecapa-tdnn-512.onnx
VOICE_SIMILARITY_THRESHOLD=0.75
```

### Step 4: Register Routes

In your `src/index.ts` or `src/server.ts`:

```typescript
import { registerVoiceEnrollmentRoutes } from "./routes/voice-enrollment.routes.js";
import { registerVoiceAuthenticationRoutes } from "./routes/voice-authentication.routes.js";

// After other route registrations
await registerVoiceEnrollmentRoutes(app, pool);
await registerVoiceAuthenticationRoutes(app, pool, store);
```

### Step 5: Enable for Tenant

```sql
UPDATE voice_authentication_settings
SET enabled = true
WHERE tenant_id = (SELECT id FROM tenants LIMIT 1);
```

### Step 6: Test Enrollment

```bash
# Start enrollment
curl -X POST http://localhost:3000/v1/voice/enrollment/start \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"consentGiven": true}'

# Get voice profile ID from response, then:
# Record 3-5 voice samples (2-5 seconds each)
# Submit each sample to /v1/voice/enrollment/sample

# Complete enrollment
curl -X POST http://localhost:3000/v1/voice/enrollment/complete \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"voiceProfileId": "YOUR_PROFILE_ID"}'
```

### Step 7: Test Authentication

```bash
# Voice login (no username needed!)
curl -X POST http://localhost:3000/v1/auth/voice-login \
  -H "Content-Type: application/json" \
  -d '{
    "audioData": "BASE64_ENCODED_AUDIO",
    "audioFormat": "wav",
    "authMethod": "speaker_identification",
    "tenantSlug": "your-tenant"
  }'
```

---

## Client-Side Integration (JavaScript)

### Enrollment

```javascript
// Helper: Convert Blob to Base64
async function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(blob);
  });
}

// Helper: Record audio
async function recordAudio(durationMs = 3000) {
  const stream = await navigator.mediaDevices.getUserMedia({ 
    audio: { sampleRate: 16000, channelCount: 1 } 
  });
  
  const mediaRecorder = new MediaRecorder(stream);
  const chunks = [];
  
  return new Promise((resolve) => {
    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    mediaRecorder.onstop = () => {
      resolve(new Blob(chunks, { type: 'audio/wav' }));
      stream.getTracks().forEach(track => track.stop());
    };
    
    mediaRecorder.start();
    setTimeout(() => mediaRecorder.stop(), durationMs);
  });
}

// Enroll voice
async function enrollVoice(accessToken) {
  // 1. Start enrollment
  const startResp = await fetch('/v1/voice/enrollment/start', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ consentGiven: true })
  });
  
  const { voiceProfileId, minimumSamplesRequired } = await startResp.json();
  
  // 2. Record samples
  for (let i = 0; i < minimumSamplesRequired; i++) {
    console.log(`Recording sample ${i+1}/${minimumSamplesRequired}...`);
    
    const audioBlob = await recordAudio(3000); // 3 seconds
    const base64Audio = await blobToBase64(audioBlob);
    
    const sampleResp = await fetch('/v1/voice/enrollment/sample', {
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
    });
    
    const result = await sampleResp.json();
    
    if (!result.qualityPassed) {
      console.warn('Quality check failed:', result.qualityIssues);
      i--; // Retry
      continue;
    }
    
    console.log(`✓ Sample ${result.sampleSequence} recorded (score: ${result.qualityScore})`);
  }
  
  // 3. Complete enrollment
  await fetch('/v1/voice/enrollment/complete', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ voiceProfileId })
  });
  
  console.log('✓ Voice enrollment complete!');
}
```

### Authentication

```javascript
async function voiceLogin(tenantSlug = 'acme-corp') {
  console.log('Recording voice...');
  
  const audioBlob = await recordAudio(3000);
  const base64Audio = await blobToBase64(audioBlob);
  
  console.log('Authenticating...');
  
  const response = await fetch('/v1/auth/voice-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audioData: base64Audio,
      audioFormat: 'wav',
      authMethod: 'speaker_identification',
      tenantSlug
    })
  });
  
  const result = await response.json();
  
  if (result.success) {
    localStorage.setItem('access_token', result.accessToken);
    localStorage.setItem('refresh_token', result.refreshToken);
    
    console.log('✓ Logged in as:', result.user.username);
    console.log('  Match score:', result.voiceAuth.similarityScore);
    
    return result;
  } else {
    console.error('✗ Login failed:', result.authResult);
    throw new Error(result.message);
  }
}
```

### React Component Example

```tsx
import { useState } from 'react';

function VoiceLoginButton() {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState(null);
  
  const handleVoiceLogin = async () => {
    try {
      setRecording(true);
      setError(null);
      
      const result = await voiceLogin();
      
      // Redirect to dashboard
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err.message);
    } finally {
      setRecording(false);
    }
  };
  
  return (
    <div>
      <button 
        onClick={handleVoiceLogin}
        disabled={recording}
        className="voice-login-btn"
      >
        {recording ? (
          <>
            <span className="recording-indicator"></span>
            Recording...
          </>
        ) : (
          <>
            🎤 Login with Voice
          </>
        )}
      </button>
      
      {error && (
        <div className="error-message">{error}</div>
      )}
    </div>
  );
}
```

---

## Configuration Reference

### Tenant Settings

All settings in `voice_authentication_settings` table:

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | false | Enable/disable voice auth |
| `require_liveness_check` | true | Require challenge-response |
| `require_anti_spoofing` | true | Enable spoofing detection |
| `allow_voice_only_login` | false | Allow login without password |
| `require_mfa` | true | Require additional factor |
| `similarity_threshold` | 0.75 | Match threshold (0.0-1.0) |
| `liveness_threshold` | 0.80 | Liveness confidence threshold |
| `quality_threshold` | 0.60 | Minimum audio quality |
| `minimum_enrollment_samples` | 3 | Min samples for enrollment |
| `maximum_enrollment_samples` | 10 | Max samples allowed |
| `enrollment_expiry_days` | null | Profile expiry (null = never) |
| `max_failed_attempts` | 5 | Lockout after N failures |
| `lockout_duration_minutes` | 30 | Account lockout duration |
| `session_timeout_minutes` | 60 | Voice session timeout |
| `retain_audio_samples` | false | Keep audio after enrollment |
| `audio_retention_days` | null | Days to keep audio |

### Update Settings (SQL)

```sql
UPDATE voice_authentication_settings
SET 
  enabled = true,
  similarity_threshold = 0.75,
  minimum_enrollment_samples = 3,
  require_anti_spoofing = true,
  allow_voice_only_login = false,
  require_mfa = true
WHERE tenant_id = '<your-tenant-id>';
```

### Update Settings (API)

```bash
curl -X PATCH http://localhost:3000/v1/voice/settings \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "similarityThreshold": 0.75,
    "minimumEnrollmentSamples": 3
  }'
```

---

## Troubleshooting

### Model not loading

```bash
# Check file exists
ls -la models/voice/ecapa-tdnn-512.onnx

# Check permissions
chmod 644 models/voice/ecapa-tdnn-512.onnx

# Test loading
node -e "
  import('./src/services/voice-processing.service.js')
    .then(m => m.getVoiceProcessingService())
    .then(() => console.log('✓ Model loaded'))
    .catch(err => console.error('✗ Error:', err))
"
```

### Poor audio quality

- Use quiet environment
- Check microphone permissions
- Test with different microphone
- Reduce background noise
- Speak naturally, don't shout

### Authentication always failing

```sql
-- Check if profiles exist
SELECT u.username, vp.enrollment_status, vp.enrollment_quality_score
FROM voice_profiles vp
JOIN users u ON vp.user_id = u.id;

-- Check recent attempts
SELECT user_id, auth_result, similarity_score, confidence_score
FROM voice_authentication_attempts
ORDER BY attempted_at DESC
LIMIT 10;

-- Lower threshold temporarily for testing
UPDATE voice_authentication_settings
SET similarity_threshold = 0.65
WHERE tenant_id = '<your-tenant-id>';
```

### Database issues

```sql
-- Verify tables created
\dt voice_*

-- Check settings initialized
SELECT * FROM voice_authentication_settings;

-- If not initialized, insert default
INSERT INTO voice_authentication_settings (tenant_id)
SELECT id FROM tenants
ON CONFLICT (tenant_id) DO NOTHING;
```

---

## Production Checklist

- [ ] Database migration applied
- [ ] Speaker embedding model deployed
- [ ] Anti-spoofing model deployed (optional but recommended)
- [ ] Environment variables configured
- [ ] Routes registered in application
- [ ] Tenant settings enabled
- [ ] SSL/TLS enabled for production
- [ ] Audio quality thresholds tuned
- [ ] Similarity threshold validated with test users
- [ ] Enrollment process tested end-to-end
- [ ] Authentication tested with multiple users
- [ ] Failed attempt lockout tested
- [ ] Anti-spoofing detection tested
- [ ] Audit logs verified
- [ ] Privacy policy updated
- [ ] User consent flow implemented
- [ ] Admin dashboard configured

---

## Next Steps

1. **Test with Real Users**
   - Enroll 5-10 test users
   - Test in different environments
   - Validate similarity thresholds

2. **Optimize Performance**
   - Profile model inference time
   - Implement caching if needed
   - Monitor API response times

3. **Monitor Analytics**
   - Track success rates
   - Monitor spoofing attempts
   - Analyze quality failures

4. **User Training**
   - Document enrollment process
   - Create video tutorials
   - Provide troubleshooting tips

---

## Support

For detailed documentation, see `VOICE_AUTHENTICATION_GUIDE.md`

For issues:
1. Check logs: `logs/voice-service.log`
2. Review API error messages
3. Consult troubleshooting section
4. Contact system administrator

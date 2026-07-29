# DVR/NVR Recording State Detection

## Overview

Best-effort recording-activity detection across multiple vendors using their documented HTTP/SOAP APIs. This is not a Hikvision, Dahua, or CP PLUS SDK integration: no proprietary vendor SDK or native binary is bundled with the edge agent.

## What the status means

- `recording` is emitted only after the recorder returns media created within the last five minutes: Hikvision ISAPI archive search, Dahua/CP PLUS media-file search, or an ONVIF Search-service `GetRecordingSummary` with a recent `DataUntil` value.
- `unknown` means the recorder is reachable but the endpoint is unsupported, unavailable, unauthorized, or cannot prove recent media. It is intentionally not converted to `stopped`.
- Recording schedules and enabled track configuration are retained as recorder configuration, not treated as proof of current recording.
- `stopped` requires a vendor response that explicitly reports a stopped recorder; it is never inferred merely because no file was returned in a short window.

The endpoints below are compatibility targets. They have fixture coverage in this repository, but model and firmware support must be acceptance-tested against the customer recorder before it is marked supported.

## Supported Vendors

### 1. Hikvision (ISAPI)

#### Recording Status Endpoints

**Activity Method**: ISAPI archive search
```http
POST /ISAPI/ContentMgmt/search
Authorization: Digest username="admin", ...
```

**Response Format** (XML):
```xml
<CMSearchResult>
  <matchList>
    <searchMatchItem>
      <trackID>101</trackID>
      <timeSpan><startTime>2026-07-29T10:00:00Z</startTime></timeSpan>
    </searchMatchItem>
  </matchList>
</CMSearchResult>
```

The search is restricted to the last five minutes. A `searchMatchItem` is evidence that the recorder has written media during that period.

#### Status Mapping

| Condition | Recording Status | Reason Codes |
|-----------|------------------|--------------|
| Recent archive match | `recording` | `[]` |
| No recent archive match | `unknown` | `["hikvision_no_recent_recording_evidence"]` |
| Endpoint unavailable | `unknown` | `["hikvision_recording_search_unavailable"]` |
| Probe failed | `unknown` | `["hikvision_recording_search_failed"]` |

#### Compatibility targets (not hardware-certified)

- ✅ DS-7608NI-I2/8P (NVR, 8 channels)
- ✅ DS-7616NI-K2 (NVR, 16 channels)
- ✅ DS-9664NI-I8 (NVR, 64 channels)
- ✅ DS-7208HUHI-K1 (Hybrid DVR, 8 channels)

---

### 2. Dahua / CP PLUS (CGI API)

#### Archive activity endpoint

```http
GET /cgi-bin/mediaFileFind.cgi?action=factory.create
Authorization: Digest username="admin", ...
```

The probe creates a media-file search, limits it to the last five minutes, reads up to 128 results, and closes the search handle. `table.Record[].Enable` is a schedule setting and is not used as recording-state evidence.

**Response Format** (Key-Value):
```
found=1
items[0].Channel=0
items[0].StartTime=2026-07-29 10:00:00
```

#### Status Mapping

| Condition | Recording Status | Reason Codes |
|-----------|------------------|--------------|
| Recent archive file | `recording` | `[]` |
| No recent archive file | `unknown` | `["dahua_no_recent_recording_evidence"]` |
| Endpoint unavailable | `unknown` | `["dahua_archive_search_unavailable"]` |
| Probe failed | `unknown` | `["dahua_archive_search_failed"]` |

#### Compatibility targets (not hardware-certified)

**Dahua:**
- ✅ DHI-NVR4208-8P-4KS2 (NVR, 8 channels)
- ✅ DHI-NVR5416-16P-4KS2E (NVR, 16 channels)
- ⚠️ Older models (pre-2018) may use different CGI paths

**CP PLUS:**
- ✅ CP-UVR-0801E1-CS (DVR, 8 channels)
- ✅ CP-UNR-4K44L2-V3 (NVR, 4 channels)
- ⚠️ CP PLUS devices use Dahua OEM firmware with identical API

---

### 3. ONVIF (Standard Protocol)

#### Recording Search Service Endpoint

```http
POST {Search.XAddr returned by GetCapabilities}
Content-Type: application/soap+xml
Authorization: Digest username="admin", ...
```

**Request Body** (SOAP):
```xml
<?xml version="1.0"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
  <s:Body>
    <GetRecordingSummary xmlns="http://www.onvif.org/ver10/search/wsdl"/>
  </s:Body>
</s:Envelope>
```

The probe discovers the ONVIF Search-service address through `GetCapabilities`, then calls its empty `GetRecordingSummary` request. Only a recent `DataUntil` is treated as activity evidence.

**Response Format** (SOAP/XML):
```xml
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
  <s:Body>
    <tse:GetRecordingSummaryResponse xmlns:tse="http://www.onvif.org/ver10/search/wsdl">
      <tse:Summary>
        <tt:NumberRecordings xmlns:tt="http://www.onvif.org/ver10/schema">2</tt:NumberRecordings>
        <tt:DataUntil xmlns:tt="http://www.onvif.org/ver10/schema">2026-07-29T10:00:00Z</tt:DataUntil>
      </tse:Summary>
    </tse:GetRecordingSummaryResponse>
  </s:Body>
</s:Envelope>
```

**Fallback paths**: `/onvif/search_service`, `/onvif/recording_search_service`, and `/onvif/Search`.

#### Status Mapping

| Condition | Recording Status | Reason Codes |
|-----------|------------------|--------------|
| Recent `DataUntil` | `recording` | `[]` |
| No recent summary | `unknown` | `["onvif_no_recent_recording_evidence"]` |
| Search service unavailable | `unknown` | `["onvif_recording_search_unavailable"]` |
| Probe failed | `unknown` | `["onvif_recording_probe_failed"]` |

#### Compatibility

- ONVIF Profile G (Recording Search)
- Profile S devices may not support the Recording Search service
- ⚠️ Some vendors implement ONVIF partially

---

## Implementation Architecture

### Edge Agent Integration

**File**: `edge-agent/src/monitoring/recorder-probe.ts`

**Probe Flow**:
```
1. Detect vendor (hikvision|dahua|cp-plus|onvif)
2. Call vendor-specific probe function
3. Fetch system info (model, serial, firmware)
4. Search for recent recording evidence
5. Fetch storage/HDD info
6. Return unified probe result
```

**Probe Result Interface**:
```typescript
interface RecorderProbeResult {
  metrics: {
    name: string;
    deviceType: "dvr" | "nvr";
    vendor: string;
    model: string;
    ipAddress: string;
    reachable: boolean;
    status: "online" | "offline" | "degraded";
    latencyMs: number;
    // New fields:
    recordingStatus: "recording" | "stopped" | "partial" | "unknown";
    recordingChannels: number;
    totalCameras: number | null;
    connectedCameras: number | null;
  };
  hddStatus: Array<Record<string, unknown>>;
  reasonCodes: string[];
}
```

### Backend Integration

**Database Schema**:
```sql
ALTER TABLE recorder_telemetry ADD COLUMN recording_status TEXT;
ALTER TABLE recorder_telemetry ADD COLUMN recording_channels INT;

-- Update existing queries
UPDATE branch_health_scoring
SET recording_status = CASE
  WHEN recording_status = 'recording' THEN 'recording'
  WHEN recording_status = 'stopped' THEN 'stopped'
  WHEN recording_status = 'partial' THEN 'warning'
  ELSE 'unknown'
END;
```

**Health Scoring Impact**:
```typescript
// backend/src/services/branch-health-scoring.service.ts
const recordingScore = (recordingChannels / totalChannels) * 50;
const availabilityScore = (avgAvailability / 100) * 35;
// Recording status now affects branch health score
```

---

## API Response Examples

### Before (Returns "unknown")
```json
{
  "branchId": "abc-123",
  "recorderStatus": "unknown",
  "totalCameras": 8,
  "onlineCameras": 8
}
```

### After (Returns Actual State)
```json
{
  "branchId": "abc-123",
  "recorderStatus": "recording",
  "recordingChannels": 8,
  "totalCameras": 8,
  "onlineCameras": 8,
  "reasonCodes": []
}
```

### Partial Recording Example
```json
{
  "branchId": "def-456",
  "recorderStatus": "partial",
  "recordingChannels": 6,
  "totalCameras": 8,
  "onlineCameras": 7,
  "reasonCodes": ["some_channels_not_recording"]
}
```

---

## Configuration

### Edge Agent Configuration
```yaml
# edge-agent/config.yaml
recorders:
  - id: branch-001-nvr
    name: "Branch 001 Main NVR"
    deviceType: nvr
    vendor: hikvision
    host: 192.168.1.100
    port: 80
    secure: false
    username: admin
    password: "${NVR_PASSWORD}"
    # Optional: custom API paths
    systemPath: /ISAPI/System/deviceInfo
    storagePath: /ISAPI/ContentMgmt/Storage
    
  - id: branch-002-dvr
    name: "Branch 002 DVR"
    deviceType: dvr
    vendor: cp-plus
    host: 192.168.2.100
    port: 80
    username: admin
    password: "${DVR_PASSWORD}"
```

### Probe Intervals
```javascript
// Default: 60 seconds
const RECORDER_PROBE_INTERVAL_MS = 60_000;

// On error: exponential backoff (60s → 120s → 240s → 300s max)
const RECORDER_PROBE_ERROR_BACKOFF = "exponential";
```

---

## Monitoring & Alerts

### Recording State Alerts

**Trigger Conditions**:
1. Recording stopped unexpectedly (was `recording`, now `stopped`)
2. Partial recording detected (some channels not recording)
3. Recording state unknown for > 5 minutes

**Alert Severity**:
- P2 (High): All channels stopped
- P3 (Medium): Partial recording
- P4 (Low): Unknown state

**Sample Alert**:
```json
{
  "alertType": "recorder_stopped",
  "severity": "P2",
  "branchId": "abc-123",
  "recorderId": "branch-001-nvr",
  "message": "NVR recording stopped. 0 of 8 channels recording.",
  "detectedAt": "2026-07-29T10:30:00Z",
  "metadata": {
    "previousState": "recording",
    "currentState": "stopped",
    "recordingChannels": 0,
    "totalChannels": 8
  }
}
```

---

## Troubleshooting

### Issue: Always Returns "unknown"

**Possible Causes**:
1. ❌ Network connectivity issue to DVR/NVR
2. ❌ Incorrect credentials
3. ❌ Firewall blocking HTTP/HTTPS ports
4. ❌ Unsupported firmware version
5. ❌ API endpoint disabled in recorder settings

**Diagnosis**:
```bash
# Test connectivity
curl -I http://192.168.1.100

# Test Hikvision ISAPI
curl -u admin:password http://192.168.1.100/ISAPI/System/deviceInfo

# Test Dahua CGI
curl -u admin:password http://192.168.1.100/cgi-bin/magicBox.cgi?action=getSystemInfo

# Check edge agent logs
tail -f edge-agent/logs/recorder-probe.log | grep "recording_status"
```

### Issue: Partial Recording Status

**Possible Causes**:
1. Some cameras disconnected
2. Manual recording disabled on specific channels
3. Storage full (recorder stopped some channels)
4. Scheduled recording (only certain hours)

**Resolution**:
- Check individual camera connections
- Verify recording schedules
- Ensure sufficient storage capacity

### Issue: Credentials Rejected

**Status**: `degraded`, Reason: `["recorder_credentials_rejected"]`

**Resolution**:
1. Verify username/password in edge agent config
2. Check recorder user permissions (must have recording access)
3. Test credentials via web interface
4. Reset recorder password if needed

---

## Testing

### Unit Tests
```bash
cd edge-agent
npm test -- recorder-probe.test.ts
```

### Integration Test
```bash
# Test against real recorder
npm run test:integration -- --recorder-host=192.168.1.100
```

### Manual Verification
```bash
# Run probe manually
node -e "
const { probeRecorder } = require('./dist/monitoring/recorder-probe.js');
probeRecorder({
  id: 'test',
  name: 'Test NVR',
  deviceType: 'nvr',
  vendor: 'hikvision',
  host: '192.168.1.100',
  port: 80,
  username: 'admin',
  password: 'password'
}, 10000).then(console.log);
"
```

---

## Future Enhancements

### Planned Features
- [ ] Real-time recording event stream (webhook push)
- [ ] Recording schedule verification
- [ ] Bandwidth usage per channel
- [ ] Motion detection status integration
- [ ] Alarm input/output state

### Vendor Support Expansion
- [ ] Axis Communications (VAPIX API)
- [ ] Bosch (RCP+ protocol)
- [ ] Hanwha (Wisenet API)
- [ ] Uniview (UNV API)
- [ ] Generic RTSP-only recorders (stream probe)

---

## References

- [Hikvision ISAPI Documentation](https://www.hikvision.com/en/support/tools/hikvision-tools/isapi-specification/)
- [Dahua API Documentation](https://dahuawiki.com/CGI/API)
- [ONVIF Recording Search Specification](https://www.onvif.org/specs/2112/ONVIF-RecordingSearch-Service-Spec-v2112.pdf)
- [CP PLUS Technical Support](https://www.cpplusworld.com/support/)

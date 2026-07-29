# HDD Health Compatibility Testing Guide

## Overview

This document provides a comprehensive testing framework for validating HDD health monitoring compatibility across deployed recorder models. The system supports SMART data collection and vendor-specific storage telemetry for:

- **Hikvision** DVR/NVR (ISAPI)
- **Dahua** DVR/NVR (CGI API)
- **CP PLUS** DVR/NVR (OEM CGI API)
- **ONVIF** compatible recorders
- **Local SMART** (smartctl)

---

## Test Objectives

1. **Verify SMART data parsing** from actual recorder responses
2. **Validate status thresholds** (healthy/warning/critical)
3. **Test failure detection** (reallocated sectors, temperature, etc.)
4. **Confirm vendor compatibility** across firmware versions
5. **Document API response formats** for each recorder model

---

## Supported Recorder Models

### Hikvision Models

| Model Series | Firmware Tested | SMART Support | Notes |
|--------------|-----------------|---------------|-------|
| DS-7600 Series | V4.x | ✅ Full | ISAPI /ContentMgmt/Storage |
| DS-7700 Series | V4.x | ✅ Full | ISAPI /ContentMgmt/Storage |
| DS-7800 Series | V4.x | ✅ Full | ISAPI /ContentMgmt/Storage |
| DS-9600 Series | V4.x | ✅ Full | ISAPI /ContentMgmt/Storage |
| DS-96128/256 | V4.x | ✅ Full | High-density NVR |
| iDS-9600 Series | V4.x | ✅ Full | DeepinMind NVR |

**API Endpoint**: `http://{ip}/ISAPI/ContentMgmt/Storage`

**Response Format**:
```xml
<?xml version="1.0"?>
<CMSStorageList>
  <hdd>
    <id>1</id>
    <name>HDD 1</name>
    <capacity>4000GB</capacity>
    <freeSpace>1200GB</freeSpace>
    <status>ok</status>
    <temperature>42</temperature>
    <reallocatedSectors>0</reallocatedSectors>
    <pendingSectors>0</pendingSectors>
    <uncorrectableSectors>0</uncorrectableSectors>
  </hdd>
</CMSStorageList>
```

### Dahua Models

| Model Series | Firmware Tested | SMART Support | Notes |
|--------------|-----------------|---------------|-------|
| DHI-NVR4xxx | V4.x | ✅ Full | CGI API |
| DHI-NVR5xxx | V4.x | ✅ Full | CGI API + SMART |
| DHI-HCVR5xxx | V3.x, V4.x | ⚠️ Partial | Limited SMART fields |
| DHI-XVR5xxx | V4.x | ✅ Full | Multi-protocol recorder |
| DH-NVR808 | V4.x | ✅ Full | 8-channel compact |

**API Endpoint**: `http://{ip}/cgi-bin/storageDevice.cgi?action=getDeviceAllInfo`

**Response Format**:
```
Storage.Disk[0].Type=HDD
Storage.Disk[0].Capacity=4000000
Storage.Disk[0].FreeSpace=1200000
Storage.Disk[0].Status=Online
Storage.Disk[0].temperature=42
Storage.Disk[0].reallocated=0
Storage.Disk[0].pending=0
Storage.Disk[0].uncorrectable=0
```

### CP PLUS Models

| Model Series | Firmware Tested | SMART Support | Notes |
|--------------|-----------------|---------------|-------|
| CP-UNR-xxxx | V1.x, V2.x | ✅ Full | Dahua OEM |
| CP-UVR-xxxx | V1.x | ⚠️ Partial | Limited API |
| CP-Plus NVR | V2.x | ✅ Full | Latest firmware |

**Note**: CP PLUS uses Dahua OEM API with identical response format.

### ONVIF Recorders

| Vendor | SMART Support | Notes |
|--------|---------------|-------|
| Generic ONVIF | ❌ None | ONVIF spec doesn't include SMART |
| Axis | ❌ None | Use vendor-specific API |
| Bosch | ❌ None | Use vendor-specific API |

**Limitation**: ONVIF protocol does not include SMART data. Vendor-specific extensions may be available.

---

## Test Environment Setup

### Prerequisites

1. **Test Recorders**: At least one of each vendor (Hikvision, Dahua, CP PLUS)
2. **Network Access**: Recorders must be reachable on the network
3. **Credentials**: Admin credentials for each recorder
4. **Node.js**: Version 20+ with TypeScript support
5. **Tools**: curl, jq (for manual API testing)

### Configuration

Create test configuration file:

```bash
cp test/hdd-health/config.example.json test/hdd-health/config.json
```

Edit `config.json`:

```json
{
  "recorders": [
    {
      "id": "hik-test-01",
      "name": "Hikvision DS-7616NI-K2",
      "vendor": "hikvision",
      "model": "DS-7616NI-K2",
      "host": "192.168.1.10",
      "port": 80,
      "username": "admin",
      "password": "password123",
      "expectedDisks": 2
    },
    {
      "id": "dahua-test-01",
      "name": "Dahua DHI-NVR5216-16P-4KS2E",
      "vendor": "dahua",
      "model": "DHI-NVR5216-16P-4KS2E",
      "host": "192.168.1.11",
      "port": 80,
      "username": "admin",
      "password": "password456",
      "expectedDisks": 4
    },
    {
      "id": "cpplus-test-01",
      "name": "CP PLUS CP-UNR-4K3604-P16",
      "vendor": "cp-plus",
      "model": "CP-UNR-4K3604-P16",
      "host": "192.168.1.12",
      "port": 37777,
      "username": "admin",
      "password": "password789",
      "expectedDisks": 4
    }
  ]
}
```

---

## Test Procedures

### Test 1: Basic Connectivity

**Objective**: Verify recorder is reachable and credentials are valid.

```bash
npm run test:hdd:connectivity
```

**Expected Output**:
```
✓ hik-test-01: Connected (latency: 45ms)
✓ dahua-test-01: Connected (latency: 52ms)
✓ cpplus-test-01: Connected (latency: 38ms)
```

**Success Criteria**:
- HTTP 200 response from all recorders
- Latency < 500ms
- No authentication errors

---

### Test 2: SMART Data Collection

**Objective**: Collect SMART data from all recorders and verify parsing.

```bash
npm run test:hdd:collect
```

**Expected Output**:
```json
{
  "recorder": "hik-test-01",
  "vendor": "hikvision",
  "disks": [
    {
      "diskNo": 1,
      "devicePath": "HDD 1",
      "capacity": "4000GB",
      "freeSpace": "1200GB",
      "smartStatus": "healthy",
      "temperature": 42,
      "reallocatedSectors": 0,
      "pendingSectors": 0,
      "uncorrectableSectors": 0,
      "failureProbability": 10
    }
  ],
  "telemetrySource": "real",
  "timestamp": "2026-07-29T10:30:00Z"
}
```

**Success Criteria**:
- All disks detected (match `expectedDisks`)
- Valid temperature reading (20-60°C)
- SMART status is "healthy", "warning", or "critical"
- No "unknown" or null values

---

### Test 3: Threshold Validation

**Objective**: Verify status classification thresholds.

```bash
npm run test:hdd:thresholds
```

**Test Cases**:

| Scenario | Temperature | Reallocated | Pending | Uncorrectable | Expected Status |
|----------|-------------|-------------|---------|---------------|-----------------|
| Normal | 40°C | 0 | 0 | 0 | healthy |
| Warning - Temp | 57°C | 0 | 0 | 0 | warning |
| Warning - Sectors | 45°C | 1 | 0 | 0 | warning |
| Critical - Temp | 68°C | 0 | 0 | 0 | critical |
| Critical - Sectors | 50°C | 25 | 0 | 0 | critical |
| Critical - Uncorrectable | 45°C | 0 | 0 | 8 | critical |

**Success Criteria**:
- All scenarios correctly classified
- Thresholds consistent across vendors
- No false positives/negatives

---

### Test 4: API Response Parsing

**Objective**: Test parsing logic against real recorder responses.

```bash
npm run test:hdd:parsing
```

**Test Method**:
1. Capture real API responses from recorders
2. Save to `test/hdd-health/fixtures/` directory
3. Run parser against saved responses
4. Verify extracted values match expected

**Example Fixture** (`hikvision-ds7616-response.xml`):
```xml
<?xml version="1.0"?>
<CMSStorageList>
  <hdd>
    <id>1</id>
    <name>WDC WD40PURX-64</name>
    <capacity>4000GB</capacity>
    <freeSpace>1200GB</freeSpace>
    <status>ok</status>
    <temperature>42</temperature>
    <reallocatedSectors>0</reallocatedSectors>
    <pendingSectors>0</pendingSectors>
    <uncorrectableSectors>0</uncorrectableSectors>
  </hdd>
</CMSStorageList>
```

**Success Criteria**:
- Parser extracts all fields correctly
- No parsing errors or exceptions
- Edge cases handled (missing fields, malformed XML)

---

### Test 5: Firmware Compatibility

**Objective**: Verify compatibility across firmware versions.

**Manual Test Procedure**:

1. Record current firmware version:
   ```bash
   npm run test:hdd:firmware-info
   ```

2. Upgrade recorder firmware (if available)

3. Re-run SMART collection:
   ```bash
   npm run test:hdd:collect
   ```

4. Compare results before/after upgrade

**Document Results**:
```markdown
### Hikvision DS-7616NI-K2
- Firmware V4.30.100: ✅ Working
- Firmware V4.40.000: ✅ Working
- API Changes: None
- Notes: Backward compatible

### Dahua DHI-NVR5216
- Firmware V4.001.0000000.0: ✅ Working
- Firmware V4.002.0000000.0: ⚠️ Field name changed
- API Changes: `temperature` → `diskTemp`
- Notes: Parser updated to handle both
```

---

### Test 6: Failure Detection

**Objective**: Verify system detects disk failures correctly.

**Simulated Failure Scenarios**:

1. **High Temperature**
   - Manually edit response fixture: `<temperature>70</temperature>`
   - Expected: Status = "critical", alert triggered

2. **Reallocated Sectors**
   - Manually edit response: `<reallocatedSectors>30</reallocatedSectors>`
   - Expected: Status = "critical", alert triggered

3. **Uncorrectable Sectors**
   - Manually edit response: `<uncorrectableSectors>10</uncorrectableSectors>`
   - Expected: Status = "critical", alert triggered

```bash
npm run test:hdd:failure-scenarios
```

**Success Criteria**:
- Critical status assigned correctly
- `failureProbability` elevated (>70%)
- Alert triggered in notification system
- Dashboard shows red indicator

---

## Test Execution

### Run All Tests

```bash
npm run test:hdd:all
```

This executes all test procedures in sequence and generates a comprehensive report.

### Run Individual Tests

```bash
# Test connectivity only
npm run test:hdd:connectivity

# Test SMART collection
npm run test:hdd:collect

# Test threshold logic
npm run test:hdd:thresholds

# Test parsers with fixtures
npm run test:hdd:parsing

# Test failure detection
npm run test:hdd:failure-scenarios
```

---

## Troubleshooting

### Issue: "Connection Timeout"

**Cause**: Recorder not reachable or firewall blocking.

**Solution**:
```bash
# Test connectivity manually
ping 192.168.1.10
curl -v http://192.168.1.10

# Check firewall rules
# Ensure ports 80 (HTTP) or 37777 (CP PLUS) are open
```

### Issue: "Authentication Failed (401)"

**Cause**: Invalid credentials.

**Solution**:
1. Verify username/password in config.json
2. Test credentials via web browser
3. Check recorder user permissions (admin required)

### Issue: "No SMART Data Returned"

**Cause**: Recorder model doesn't support SMART API.

**Solution**:
1. Check model compatibility matrix above
2. Try alternate API endpoints:
   - Hikvision: `/ISAPI/System/status`
   - Dahua: `/cgi-bin/magicBox.cgi?action=getSystemInfo`
3. Contact vendor for API documentation

### Issue: "Parsing Failed"

**Cause**: Unexpected API response format.

**Solution**:
1. Capture raw response:
   ```bash
   curl -u admin:password http://192.168.1.10/ISAPI/ContentMgmt/Storage > raw-response.xml
   ```
2. Save to `test/hdd-health/fixtures/debug/`
3. Review and update parser logic
4. Submit issue with response sample (redact sensitive data)

---

## Compatibility Matrix

### Summary Table

| Vendor | Models Tested | SMART API | Temperature | Sector Counts | Firmware Range |
|--------|---------------|-----------|-------------|---------------|----------------|
| Hikvision | 6 series | ✅ Yes | ✅ Yes | ✅ Yes | V3.x - V4.x |
| Dahua | 5 series | ✅ Yes | ✅ Yes | ✅ Yes | V3.x - V4.x |
| CP PLUS | 3 series | ✅ Yes | ✅ Yes | ✅ Yes | V1.x - V2.x |
| ONVIF | Generic | ❌ No | ❌ No | ❌ No | N/A |

### Known Limitations

1. **ONVIF**: Protocol doesn't include SMART data specification
2. **Older Firmware**: V2.x and earlier may not expose SMART API
3. **Consumer Models**: Low-end recorders may lack SMART support
4. **NAS Devices**: Synology, QNAP use different APIs
5. **Cloud Recorders**: Eagle Eye, Verkada don't expose disk access

---

## Test Report Template

After completing all tests, generate a report:

```bash
npm run test:hdd:generate-report
```

**Report Structure**:

```markdown
# HDD Health Compatibility Test Report

**Test Date**: 2026-07-29  
**Tester**: [Name]  
**Environment**: Production Lab

## Summary

- Total Recorders Tested: 3
- SMART Data Collection: 3/3 (100%)
- Parser Accuracy: 100%
- Firmware Versions: 6 tested
- Issues Found: 0

## Detailed Results

### Hikvision DS-7616NI-K2
- Status: ✅ PASS
- Disks Detected: 2/2
- SMART Data: Complete
- Thresholds: Correct
- Notes: None

[... continue for each recorder ...]

## Recommendations

1. Fixture-validated models require customer-hardware acceptance before production rollout
2. Monitor Dahua firmware updates for API changes
3. Add ONVIF vendor-specific extensions in future

## Sign-Off

**QA Engineer**: _________________ Date: _________  
**Technical Lead**: _________________ Date: _________
```

---

## Maintenance

### Adding New Recorder Models

1. Add model to test configuration
2. Capture API response
3. Save to fixtures directory
4. Update parser if needed
5. Re-run test suite
6. Document in compatibility matrix

### Updating Parsers

When API format changes:

1. Capture new response format
2. Update parser logic in `smart-collector.ts`
3. Add fixture for new format
4. Run regression tests
5. Update documentation

---

## Continuous Integration

Add to CI/CD pipeline:

```yaml
# .github/workflows/hdd-health-test.yml
name: HDD Health Compatibility Tests

on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday
  workflow_dispatch:

jobs:
  test-hdd-health:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm install
      - name: Run HDD health tests
        run: npm run test:hdd:all
        env:
          TEST_CONFIG: ${{ secrets.HDD_TEST_CONFIG }}
      - name: Upload test report
        uses: actions/upload-artifact@v3
        with:
          name: hdd-health-report
          path: test/hdd-health/report.md
```

---

## References

- [Hikvision ISAPI Documentation](https://www.hikvision.com/en/support/tools/hikvision-tools/isapi-specification/)
- [Dahua HTTP API Documentation](https://dahuawiki.com/HTTP_API)
- [ONVIF Core Specification](https://www.onvif.org/specs/core/ONVIF-Core-Specification.pdf)
- [SMART Attribute Reference](https://en.wikipedia.org/wiki/S.M.A.R.T.)

---

**Document Version**: 1.0  
**Last Updated**: 2026-07-29  
**Maintained By**: VMS Engineering Team

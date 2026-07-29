# HDD Health Compatibility Tests

Automated testing suite for validating SMART data collection and parsing across multiple recorder vendors.

## Quick Start

### 1. Setup Configuration

```bash
# Copy example configuration
cp test/hdd-health/config.example.json test/hdd-health/config.json

# Edit with your recorder details
nano test/hdd-health/config.json
```

### 2. Run Tests

```bash
# Run all tests
npm run test:hdd:all

# Run specific test
npm run test:hdd:connectivity    # Test network connectivity
npm run test:hdd:collect         # Collect SMART data
npm run test:hdd:thresholds      # Test status thresholds
npm run test:hdd:parsing         # Test response parsing
npm run test:hdd:failure-scenarios # Test failure detection
```

### 3. Review Results

Test reports are saved to `test/hdd-health/reports/`:
- `hdd-health-test-report-YYYY-MM-DD.md` - Latest test results
- Captured API responses in `test/hdd-health/fixtures/`

## Test Coverage

- ✅ **Hikvision** DVR/NVR (ISAPI `/ISAPI/ContentMgmt/Storage`)
- ✅ **Dahua** DVR/NVR (CGI `/cgi-bin/storageDevice.cgi`)
- ✅ **CP PLUS** DVR/NVR (OEM CGI API)
- ⚠️ **ONVIF** (Protocol doesn't include SMART data)

## What Gets Tested

1. **Connectivity** - Network reachability and authentication
2. **SMART Collection** - Real data retrieval from recorders
3. **Threshold Validation** - healthy/warning/critical classification
4. **Response Parsing** - Vendor-specific format handling
5. **Failure Detection** - Temperature and sector count alerts

## Configuration Format

```json
{
  "recorders": [
    {
      "id": "unique-id",
      "name": "Display Name",
      "vendor": "hikvision|dahua|cp-plus",
      "model": "DS-7616NI-K2",
      "host": "192.168.1.10",
      "port": 80,
      "username": "admin",
      "password": "your_password",
      "expectedDisks": 2
    }
  ]
}
```

## Example Output

```
========================================
  HDD Health Compatibility Tests
========================================

Test 1: Basic Connectivity

  ✓ Hikvision DS-7616NI-K2: Connected (latency: 45ms)
  ✓ Dahua DHI-NVR5216: Connected (latency: 52ms)

Test 2: SMART Data Collection

  ✓ Hikvision DS-7616NI-K2:
    Status: healthy
    Temperature: 42°C
    Reallocated Sectors: 0
    Pending Sectors: 0
    Uncorrectable Sectors: 0

========================================
  Test Summary
========================================
Total Tests: 12
Passed: 12
Failed: 0
Skipped: 0
Duration: 8.42s

Report saved to: test/hdd-health/reports/hdd-health-test-report-2026-07-29.md
```

## Troubleshooting

### Connection Timeout

**Symptoms**: `Error: recorder_probe_timeout`

**Solutions**:
- Verify recorder IP address and port
- Check network connectivity: `ping 192.168.1.10`
- Ensure firewall allows HTTP/HTTPS traffic
- Try manual curl: `curl http://192.168.1.10/ISAPI/System/deviceInfo`

### Authentication Failed

**Symptoms**: `Error: recorder_credentials_rejected`

**Solutions**:
- Verify username/password in config.json
- Test credentials via web browser
- Check user has admin permissions
- Reset recorder password if needed

### No SMART Data

**Symptoms**: `telemetrySource: simulated, smartStatus: unknown`

**Solutions**:
- Verify recorder model supports SMART API
- Check firmware version (upgrade if old)
- Try alternate API endpoints
- Contact vendor for API documentation

### Parsing Failed

**Symptoms**: `Invalid structure` or missing fields

**Solutions**:
- Capture raw response: `npm run test:hdd:collect`
- Check fixture files in `test/hdd-health/fixtures/`
- Compare with expected format in documentation
- Report issue with response sample

## Continuous Testing

Add to your CI/CD pipeline:

```bash
# Weekly automated test
npm run test:hdd:all

# Email report if failures detected
if [ $? -ne 0 ]; then
  mail -s "HDD Health Test Failed" ops@company.com < test/hdd-health/reports/latest.md
fi
```

## Adding New Recorder Models

1. Add recorder to `config.json`
2. Run: `npm run test:hdd:collect`
3. Review captured response in `fixtures/`
4. Update parser if new format detected
5. Re-run all tests: `npm run test:hdd:all`
6. Document in compatibility matrix

## Documentation

- Full test guide: `test/hdd-health/HDD_HEALTH_COMPATIBILITY_TEST.md`
- Compatibility matrix: See main documentation
- API response formats: See fixtures directory

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review full test documentation
3. Examine captured API responses in fixtures
4. Contact VMS engineering team

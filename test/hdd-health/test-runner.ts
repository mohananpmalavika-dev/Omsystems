#!/usr/bin/env node

/**
 * HDD Health Compatibility Test Runner
 * 
 * Tests SMART data collection and parsing across multiple recorder vendors
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { collectSmartTelemetry, type SmartCollectorConfig, type SmartTelemetry } from '../../src/maintenance/smart-collector.js';
import { probeRecorder, type RecorderConfig } from '../../edge-agent/src/monitoring/recorder-probe.js';

interface TestConfig {
  recorders: Array<{
    id: string;
    name: string;
    vendor: 'hikvision' | 'dahua' | 'cp-plus' | 'onvif';
    model?: string;
    host: string;
    port: number;
    username?: string;
    password?: string;
    expectedDisks?: number;
    notes?: string;
  }>;
  testSettings?: {
    timeout?: number;
    retries?: number;
    captureResponses?: boolean;
    fixturesDir?: string;
    reportDir?: string;
  };
}

interface TestResult {
  recorder: string;
  vendor: string;
  test: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  duration: number;
  details?: string;
  data?: unknown;
}

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
};

class HddHealthTester {
  private config: TestConfig;
  private results: TestResult[] = [];
  private fixturesDir: string;
  private reportDir: string;

  constructor(config: TestConfig) {
    this.config = config;
    this.fixturesDir = config.testSettings?.fixturesDir ?? './test/hdd-health/fixtures';
    this.reportDir = config.testSettings?.reportDir ?? './test/hdd-health/reports';
  }

  async run(testType?: string): Promise<void> {
    console.log(`${COLORS.blue}========================================${COLORS.reset}`);
    console.log(`${COLORS.blue}  HDD Health Compatibility Tests${COLORS.reset}`);
    console.log(`${COLORS.blue}========================================${COLORS.reset}`);
    console.log();

    // Ensure directories exist
    await mkdir(this.fixturesDir, { recursive: true });
    await mkdir(this.reportDir, { recursive: true });

    const tests: Record<string, () => Promise<void>> = {
      connectivity: () => this.testConnectivity(),
      collect: () => this.testSmartCollection(),
      thresholds: () => this.testThresholds(),
      parsing: () => this.testParsing(),
      failures: () => this.testFailureScenarios(),
      all: async () => {
        await this.testConnectivity();
        await this.testSmartCollection();
        await this.testThresholds();
        await this.testParsing();
        await this.testFailureScenarios();
      },
    };

    const testToRun = testType ?? 'all';
    const testFn = tests[testToRun];

    if (!testFn) {
      console.error(`${COLORS.red}Unknown test type: ${testType}${COLORS.reset}`);
      console.log('Available tests: connectivity, collect, thresholds, parsing, failures, all');
      process.exit(1);
    }

    const startTime = Date.now();
    await testFn();
    const duration = Date.now() - startTime;

    console.log();
    await this.printSummary(duration);
    await this.generateReport();

    const failed = this.results.filter((r) => r.status === 'FAIL').length;
    process.exit(failed > 0 ? 1 : 0);
  }

  async testConnectivity(): Promise<void> {
    console.log(`${COLORS.yellow}Test 1: Basic Connectivity${COLORS.reset}`);
    console.log();

    for (const recorder of this.config.recorders) {
      const start = Date.now();
      try {
        const config: RecorderConfig = {
          id: recorder.id,
          name: recorder.name,
          deviceType: 'nvr',
          vendor: recorder.vendor,
          model: recorder.model,
          host: recorder.host,
          port: recorder.port,
          username: recorder.username,
          password: recorder.password,
        };

        const result = await probeRecorder(config, this.config.testSettings?.timeout ?? 10000);
        const duration = Date.now() - start;

        if (result.metrics.reachable) {
          console.log(`  ${COLORS.green}✓${COLORS.reset} ${recorder.name}: Connected (latency: ${result.metrics.latencyMs}ms)`);
          this.results.push({
            recorder: recorder.id,
            vendor: recorder.vendor,
            test: 'connectivity',
            status: 'PASS',
            duration,
            details: `Latency: ${result.metrics.latencyMs}ms`,
          });
        } else {
          console.log(`  ${COLORS.red}✗${COLORS.reset} ${recorder.name}: Not reachable`);
          this.results.push({
            recorder: recorder.id,
            vendor: recorder.vendor,
            test: 'connectivity',
            status: 'FAIL',
            duration,
            details: 'Recorder not reachable',
          });
        }
      } catch (error) {
        const duration = Date.now() - start;
        console.log(`  ${COLORS.red}✗${COLORS.reset} ${recorder.name}: ${error instanceof Error ? error.message : String(error)}`);
        this.results.push({
          recorder: recorder.id,
          vendor: recorder.vendor,
          test: 'connectivity',
          status: 'FAIL',
          duration,
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log();
  }

  async testSmartCollection(): Promise<void> {
    console.log(`${COLORS.yellow}Test 2: SMART Data Collection${COLORS.reset}`);
    console.log();

    for (const recorder of this.config.recorders) {
      const start = Date.now();
      try {
        const config: SmartCollectorConfig = {
          vendor: recorder.vendor,
          host: recorder.host,
          port: recorder.port,
          username: recorder.username,
          password: recorder.password,
          devicePath: recorder.host,
        };

        const telemetry = await collectSmartTelemetry(config);
        const duration = Date.now() - start;

        // Save response to fixtures
        if (this.config.testSettings?.captureResponses) {
          const filename = `${recorder.vendor}-${recorder.id}-${Date.now()}.json`;
          await writeFile(
            join(this.fixturesDir, filename),
            JSON.stringify(telemetry, null, 2)
          );
        }

        if (telemetry.telemetrySource === 'real' && telemetry.smartStatus !== 'unknown') {
          console.log(`  ${COLORS.green}✓${COLORS.reset} ${recorder.name}:`);
          console.log(`    Status: ${telemetry.smartStatus}`);
          console.log(`    Temperature: ${telemetry.temperature ?? 'N/A'}°C`);
          console.log(`    Reallocated Sectors: ${telemetry.reallocatedSectors ?? 'N/A'}`);
          console.log(`    Pending Sectors: ${telemetry.pendingSectors ?? 'N/A'}`);
          console.log(`    Uncorrectable Sectors: ${telemetry.uncorrectableSectors ?? 'N/A'}`);

          this.results.push({
            recorder: recorder.id,
            vendor: recorder.vendor,
            test: 'smart_collection',
            status: 'PASS',
            duration,
            data: telemetry,
          });
        } else {
          console.log(`  ${COLORS.red}✗${COLORS.reset} ${recorder.name}: No real SMART data (${telemetry.telemetrySource})`);
          this.results.push({
            recorder: recorder.id,
            vendor: recorder.vendor,
            test: 'smart_collection',
            status: 'FAIL',
            duration,
            details: `Telemetry source: ${telemetry.telemetrySource}`,
            data: telemetry,
          });
        }
      } catch (error) {
        const duration = Date.now() - start;
        console.log(`  ${COLORS.red}✗${COLORS.reset} ${recorder.name}: ${error instanceof Error ? error.message : String(error)}`);
        this.results.push({
          recorder: recorder.id,
          vendor: recorder.vendor,
          test: 'smart_collection',
          status: 'FAIL',
          duration,
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log();
  }

  async testThresholds(): Promise<void> {
    console.log(`${COLORS.yellow}Test 3: Threshold Validation${COLORS.reset}`);
    console.log();

    const scenarios = [
      { name: 'Normal', temp: 40, reallocated: 0, pending: 0, uncorrectable: 0, expected: 'healthy' },
      { name: 'Warning - Temp', temp: 57, reallocated: 0, pending: 0, uncorrectable: 0, expected: 'warning' },
      { name: 'Warning - Sectors', temp: 45, reallocated: 1, pending: 0, uncorrectable: 0, expected: 'warning' },
      { name: 'Critical - Temp', temp: 68, reallocated: 0, pending: 0, uncorrectable: 0, expected: 'critical' },
      { name: 'Critical - Sectors', temp: 50, reallocated: 25, pending: 0, uncorrectable: 0, expected: 'critical' },
      { name: 'Critical - Uncorrectable', temp: 45, reallocated: 0, pending: 0, uncorrectable: 8, expected: 'critical' },
    ];

    for (const scenario of scenarios) {
      const start = Date.now();
      const status = this.calculateSmartStatus(scenario.temp, scenario.reallocated, scenario.pending, scenario.uncorrectable);
      const duration = Date.now() - start;

      if (status === scenario.expected) {
        console.log(`  ${COLORS.green}✓${COLORS.reset} ${scenario.name}: ${status}`);
        this.results.push({
          recorder: 'threshold-test',
          vendor: 'generic',
          test: `threshold_${scenario.name.replace(/\s+/g, '_').toLowerCase()}`,
          status: 'PASS',
          duration,
          details: `Expected: ${scenario.expected}, Got: ${status}`,
        });
      } else {
        console.log(`  ${COLORS.red}✗${COLORS.reset} ${scenario.name}: Expected ${scenario.expected}, got ${status}`);
        this.results.push({
          recorder: 'threshold-test',
          vendor: 'generic',
          test: `threshold_${scenario.name.replace(/\s+/g, '_').toLowerCase()}`,
          status: 'FAIL',
          duration,
          details: `Expected: ${scenario.expected}, Got: ${status}`,
        });
      }
    }

    console.log();
  }

  async testParsing(): Promise<void> {
    console.log(`${COLORS.yellow}Test 4: API Response Parsing${COLORS.reset}`);
    console.log();

    // Test with saved fixtures if they exist
    try {
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(this.fixturesDir);
      const fixtureFiles = files.filter((f) => f.endsWith('.json'));

      if (fixtureFiles.length === 0) {
        console.log(`  ${COLORS.gray}⊘${COLORS.reset} No fixtures found. Run 'collect' test first.`);
        this.results.push({
          recorder: 'parsing-test',
          vendor: 'generic',
          test: 'parsing',
          status: 'SKIP',
          duration: 0,
          details: 'No fixtures available',
        });
        console.log();
        return;
      }

      for (const file of fixtureFiles.slice(0, 5)) {
        const start = Date.now();
        const content = await readFile(join(this.fixturesDir, file), 'utf-8');
        const telemetry = JSON.parse(content) as SmartTelemetry;
        const duration = Date.now() - start;

        if (telemetry.smartStatus && telemetry.devicePath) {
          console.log(`  ${COLORS.green}✓${COLORS.reset} ${file}: Parsed successfully`);
          this.results.push({
            recorder: file,
            vendor: 'fixture',
            test: 'parsing',
            status: 'PASS',
            duration,
          });
        } else {
          console.log(`  ${COLORS.red}✗${COLORS.reset} ${file}: Invalid structure`);
          this.results.push({
            recorder: file,
            vendor: 'fixture',
            test: 'parsing',
            status: 'FAIL',
            duration,
            details: 'Missing required fields',
          });
        }
      }
    } catch (error) {
      console.log(`  ${COLORS.red}✗${COLORS.reset} Error reading fixtures: ${error instanceof Error ? error.message : String(error)}`);
    }

    console.log();
  }

  async testFailureScenarios(): Promise<void> {
    console.log(`${COLORS.yellow}Test 5: Failure Detection${COLORS.reset}`);
    console.log();

    const scenarios = [
      { name: 'High Temperature', temp: 70, reallocated: 0, pending: 0, uncorrectable: 0 },
      { name: 'Reallocated Sectors', temp: 45, reallocated: 30, pending: 0, uncorrectable: 0 },
      { name: 'Uncorrectable Sectors', temp: 45, reallocated: 0, pending: 0, uncorrectable: 10 },
    ];

    for (const scenario of scenarios) {
      const start = Date.now();
      const status = this.calculateSmartStatus(scenario.temp, scenario.reallocated, scenario.pending, scenario.uncorrectable);
      const isCritical = status === 'critical';
      const duration = Date.now() - start;

      if (isCritical) {
        console.log(`  ${COLORS.green}✓${COLORS.reset} ${scenario.name}: Correctly detected as critical`);
        this.results.push({
          recorder: 'failure-test',
          vendor: 'generic',
          test: `failure_${scenario.name.replace(/\s+/g, '_').toLowerCase()}`,
          status: 'PASS',
          duration,
        });
      } else {
        console.log(`  ${COLORS.red}✗${COLORS.reset} ${scenario.name}: Not detected as critical (status: ${status})`);
        this.results.push({
          recorder: 'failure-test',
          vendor: 'generic',
          test: `failure_${scenario.name.replace(/\s+/g, '_').toLowerCase()}`,
          status: 'FAIL',
          duration,
          details: `Expected critical, got ${status}`,
        });
      }
    }

    console.log();
  }

  private calculateSmartStatus(
    temperature: number,
    reallocated: number,
    pending: number,
    uncorrectable: number
  ): 'healthy' | 'warning' | 'critical' {
    if (temperature > 65 || reallocated > 20 || pending > 5 || uncorrectable > 5) {
      return 'critical';
    }
    if (temperature > 55 || reallocated > 0 || pending > 0 || uncorrectable > 0) {
      return 'warning';
    }
    return 'healthy';
  }

  private async printSummary(duration: number): Promise<void> {
    console.log(`${COLORS.blue}========================================${COLORS.reset}`);
    console.log(`${COLORS.blue}  Test Summary${COLORS.reset}`);
    console.log(`${COLORS.blue}========================================${COLORS.reset}`);

    const passed = this.results.filter((r) => r.status === 'PASS').length;
    const failed = this.results.filter((r) => r.status === 'FAIL').length;
    const skipped = this.results.filter((r) => r.status === 'SKIP').length;

    console.log(`Total Tests: ${this.results.length}`);
    console.log(`${COLORS.green}Passed: ${passed}${COLORS.reset}`);
    console.log(`${COLORS.red}Failed: ${failed}${COLORS.reset}`);
    console.log(`${COLORS.gray}Skipped: ${skipped}${COLORS.reset}`);
    console.log(`Duration: ${(duration / 1000).toFixed(2)}s`);
    console.log();

    if (failed > 0) {
      console.log(`${COLORS.red}Failed Tests:${COLORS.reset}`);
      this.results
        .filter((r) => r.status === 'FAIL')
        .forEach((r) => {
          console.log(`  • ${r.recorder} - ${r.test}: ${r.details ?? 'No details'}`);
        });
      console.log();
    }
  }

  private async generateReport(): Promise<void> {
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `hdd-health-test-report-${timestamp}.md`;
    const filepath = join(this.reportDir, filename);

    const passed = this.results.filter((r) => r.status === 'PASS').length;
    const failed = this.results.filter((r) => r.status === 'FAIL').length;
    const skipped = this.results.filter((r) => r.status === 'SKIP').length;

    const report = `# HDD Health Compatibility Test Report

**Date**: ${new Date().toISOString()}  
**Total Tests**: ${this.results.length}  
**Passed**: ${passed}  
**Failed**: ${failed}  
**Skipped**: ${skipped}  
**Status**: ${failed === 0 ? '✅ PASS' : '❌ FAIL'}

---

## Test Results

${this.results
  .map(
    (r) => `### ${r.test} - ${r.recorder}
- **Status**: ${r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⊘'} ${r.status}
- **Duration**: ${r.duration}ms
- **Vendor**: ${r.vendor}
${r.details ? `- **Details**: ${r.details}` : ''}

`
  )
  .join('\n')}

---

## Tested Recorders

${this.config.recorders
  .map(
    (r) => `- **${r.name}** (${r.vendor})
  - Host: ${r.host}:${r.port}
  - Model: ${r.model ?? 'Unknown'}
  - Expected Disks: ${r.expectedDisks ?? 'N/A'}
`
  )
  .join('\n')}

---

**Report generated by HDD Health Test Runner**
`;

    await writeFile(filepath, report);
    console.log(`${COLORS.green}Report saved to: ${filepath}${COLORS.reset}`);
  }
}

// Main execution
(async () => {
  const testType = process.argv[2];
  const configPath = process.env.TEST_CONFIG ?? './test/hdd-health/config.json';

  try {
    const configContent = await readFile(configPath, 'utf-8');
    const config = JSON.parse(configContent) as TestConfig;

    const tester = new HddHealthTester(config);
    await tester.run(testType);
  } catch (error) {
    console.error(`${COLORS.red}Error:${COLORS.reset}`, error instanceof Error ? error.message : String(error));
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      console.log(`\nConfig file not found. Copy config.example.json to config.json and update with your recorder details.`);
    }
    process.exit(1);
  }
})();

#!/usr/bin/env node
/**
 * Phase 1: Control Plane Load Test
 * 
 * Tests 400 branches, 5,000 cameras, continuous heartbeats and status updates
 * with 100 concurrent dashboard users
 */

import { faker } from '@faker-js/faker';
import axios, { type AxiosInstance } from 'axios';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import pLimit from 'p-limit';
import { Counter, Gauge, Histogram, Registry } from 'prom-client';
import WebSocket from 'ws';
import YAML from 'yaml';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { MetricsCollector } from './utils/metrics-collector.js';
import { ReportGenerator } from './utils/report-generator.js';

interface Config {
  endpoints: {
    controlPlane: string;
    websocket: string;
  };
  auth: {
    apiKey: string;
    tenantId: string;
  };
  phase1: {
    branches: number;
    cameras: number;
    edgeAgents: number;
    concurrentDashboardUsers: number;
    testDuration: string;
    heartbeat: {
      intervalSeconds: number;
      jitterSeconds: number;
    };
    statusUpdate: {
      intervalSeconds: number;
      changePercentage: number;
    };
    tenants: {
      count: number;
      branchDistribution: number[];
    };
  };
  metrics: {
    prometheusPort: number;
    thresholds: Record<string, number>;
  };
}

interface Branch {
  id: string;
  tenantId: string;
  regionId: string;
  name: string;
  code: string;
  cameras: Camera[];
  edgeAgent: EdgeAgent;
}

interface Camera {
  id: string;
  branchId: string;
  name: string;
  status: 'online' | 'offline' | 'error' | 'recording' | 'idle';
  lastHeartbeat?: Date;
  metadata: {
    manufacturer: string;
    model: string;
    firmware: string;
    ipAddress: string;
  };
}

interface EdgeAgent {
  id: string;
  branchId: string;
  version: string;
  status: 'connected' | 'disconnected' | 'error';
  lastSeen?: Date;
}

interface TestMetrics {
  apiResponseTime: Histogram<string>;
  heartbeatsSent: Counter<string>;
  heartbeatsFailed: Counter<string>;
  statusUpdates: Counter<string>;
  dashboardConnections: Gauge<string>;
  activeWebSockets: Gauge<string>;
  databaseQueryLatency: Histogram<string>;
}

class Phase1LoadTest {
  private config: Config;
  private httpClient: AxiosInstance;
  private metricsRegistry: Registry;
  private metrics: TestMetrics;
  private metricsCollector: MetricsCollector;
  private reportGenerator: ReportGenerator;
  
  private branches: Branch[] = [];
  private cameras: Camera[] = [];
  private edgeAgents: EdgeAgent[] = [];
  private webSockets: WebSocket[] = [];
  
  private heartbeatIntervals: NodeJS.Timeout[] = [];
  private statusUpdateIntervals: NodeJS.Timeout[] = [];
  private running = false;
  
  private progressBar: cliProgress.SingleBar;

  constructor(configPath: string) {
    const configFile = readFileSync(configPath, 'utf-8');
    this.config = YAML.parse(configFile) as Config;
    
    this.httpClient = axios.create({
      baseURL: this.config.endpoints.controlPlane,
      headers: {
        'Authorization': `Bearer ${this.config.auth.apiKey}`,
        'X-Tenant-ID': this.config.auth.tenantId,
      },
      timeout: 30000,
    });
    
    // Initialize Prometheus metrics
    this.metricsRegistry = new Registry();
    this.metrics = this.initializeMetrics();
    
    this.metricsCollector = new MetricsCollector(this.metricsRegistry);
    this.reportGenerator = new ReportGenerator('phase1', this.config);
    
    this.progressBar = new cliProgress.SingleBar({
      format: 'Progress |{bar}| {percentage}% | {value}/{total} | {stage}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
    });
  }

  private initializeMetrics(): TestMetrics {
    const apiResponseTime = new Histogram({
      name: 'sentinel_api_response_time_ms',
      help: 'API response time in milliseconds',
      labelNames: ['endpoint', 'method', 'status'],
      buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000],
      registers: [this.metricsRegistry],
    });

    const heartbeatsSent = new Counter({
      name: 'sentinel_heartbeats_sent_total',
      help: 'Total heartbeats sent',
      labelNames: ['camera_id', 'branch_id'],
      registers: [this.metricsRegistry],
    });

    const heartbeatsFailed = new Counter({
      name: 'sentinel_heartbeats_failed_total',
      help: 'Total heartbeats that failed',
      labelNames: ['camera_id', 'reason'],
      registers: [this.metricsRegistry],
    });

    const statusUpdates = new Counter({
      name: 'sentinel_status_updates_total',
      help: 'Total status updates sent',
      labelNames: ['camera_id', 'old_status', 'new_status'],
      registers: [this.metricsRegistry],
    });

    const dashboardConnections = new Gauge({
      name: 'sentinel_dashboard_connections',
      help: 'Current dashboard connections',
      registers: [this.metricsRegistry],
    });

    const activeWebSockets = new Gauge({
      name: 'sentinel_websocket_connections',
      help: 'Current WebSocket connections',
      registers: [this.metricsRegistry],
    });

    const databaseQueryLatency = new Histogram({
      name: 'sentinel_db_query_latency_ms',
      help: 'Database query latency in milliseconds',
      labelNames: ['query_type'],
      buckets: [5, 10, 25, 50, 100, 250, 500, 1000],
      registers: [this.metricsRegistry],
    });

    return {
      apiResponseTime,
      heartbeatsSent,
      heartbeatsFailed,
      statusUpdates,
      dashboardConnections,
      activeWebSockets,
      databaseQueryLatency,
    };
  }

  async run(): Promise<void> {
    console.log(chalk.cyan.bold('\n🚀 Phase 1: Control Plane Load Test\n'));
    console.log(chalk.gray('═'.repeat(60)));
    console.log(chalk.white(`Target Configuration:`));
    console.log(chalk.gray(`  • Branches: ${this.config.phase1.branches}`));
    console.log(chalk.gray(`  • Cameras: ${this.config.phase1.cameras}`));
    console.log(chalk.gray(`  • Edge Agents: ${this.config.phase1.edgeAgents}`));
    console.log(chalk.gray(`  • Dashboard Users: ${this.config.phase1.concurrentDashboardUsers}`));
    console.log(chalk.gray(`  • Duration: ${this.config.phase1.testDuration}`));
    console.log(chalk.gray('═'.repeat(60)) + '\n');

    try {
      // Stage 1: Generate test data
      await this.generateTestData();
      
      // Stage 2: Register entities
      await this.registerEntities();
      
      // Stage 3: Start heartbeat simulation
      await this.startHeartbeatSimulation();
      
      // Stage 4: Start status update simulation
      await this.startStatusUpdateSimulation();
      
      // Stage 5: Simulate dashboard users
      await this.simulateDashboardUsers();
      
      // Stage 6: Run for configured duration
      await this.runTestDuration();
      
      // Stage 7: Generate report
      await this.generateReport();
      
      console.log(chalk.green.bold('\n✅ Phase 1 Test Completed Successfully\n'));
      
    } catch (error) {
      console.error(chalk.red.bold('\n❌ Phase 1 Test Failed\n'));
      console.error(error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  private async generateTestData(): Promise<void> {
    console.log(chalk.yellow('📦 Stage 1: Generating test data...'));
    this.progressBar.start(this.config.phase1.branches, 0, { stage: 'Generating' });

    const camerasPerBranch = Math.floor(this.config.phase1.cameras / this.config.phase1.branches);
    
    for (let i = 0; i < this.config.phase1.branches; i++) {
      const branchId = randomUUID();
      const regionId = `region-${Math.floor(i / 50)}`; // ~8 regions
      
      const branch: Branch = {
        id: branchId,
        tenantId: this.config.auth.tenantId,
        regionId,
        name: faker.company.name(),
        code: `BR${String(i + 1).padStart(4, '0')}`,
        cameras: [],
        edgeAgent: {
          id: randomUUID(),
          branchId,
          version: '1.2.3',
          status: 'connected',
        },
      };

      // Generate cameras for this branch
      for (let j = 0; j < camerasPerBranch; j++) {
        const camera: Camera = {
          id: randomUUID(),
          branchId,
          name: `Camera-${j + 1}`,
          status: 'online',
          metadata: {
            manufacturer: faker.helpers.arrayElement(['Hikvision', 'Dahua', 'Axis', 'Hanwha']),
            model: faker.helpers.arrayElement(['DS-2CD2143G0-I', 'IPC-HFW5831E-ZE', 'M3045-V']),
            firmware: faker.system.semver(),
            ipAddress: faker.internet.ipv4(),
          },
        };
        
        branch.cameras.push(camera);
        this.cameras.push(camera);
      }
      
      this.branches.push(branch);
      this.edgeAgents.push(branch.edgeAgent);
      
      this.progressBar.update(i + 1);
    }
    
    this.progressBar.stop();
    console.log(chalk.green(`✓ Generated ${this.branches.length} branches, ${this.cameras.length} cameras, ${this.edgeAgents.length} edge agents\n`));
  }

  private async registerEntities(): Promise<void> {
    console.log(chalk.yellow('📝 Stage 2: Registering entities with control plane...'));
    
    const limit = pLimit(50); // Concurrent API calls
    this.progressBar.start(this.branches.length, 0, { stage: 'Registering' });

    const registrationPromises = this.branches.map((branch, index) =>
      limit(async () => {
        try {
          // Register branch
          const startTime = Date.now();
          await this.httpClient.post('/v1/branches', {
            id: branch.id,
            tenantId: branch.tenantId,
            regionId: branch.regionId,
            name: branch.name,
            code: branch.code,
            metadata: {
              loadTest: true,
              phase: 1,
            },
          });
          
          this.metrics.apiResponseTime.observe(
            { endpoint: '/v1/branches', method: 'POST', status: '200' },
            Date.now() - startTime
          );

          // Register cameras for this branch
          for (const camera of branch.cameras) {
            const cameraStartTime = Date.now();
            await this.httpClient.post('/v1/cameras', {
              id: camera.id,
              branchId: camera.branchId,
              name: camera.name,
              status: camera.status,
              metadata: camera.metadata,
            });
            
            this.metrics.apiResponseTime.observe(
              { endpoint: '/v1/cameras', method: 'POST', status: '200' },
              Date.now() - cameraStartTime
            );
          }

          // Register edge agent
          const agentStartTime = Date.now();
          await this.httpClient.post('/v1/edge-agents', {
            id: branch.edgeAgent.id,
            branchId: branch.id,
            version: branch.edgeAgent.version,
            status: branch.edgeAgent.status,
          });
          
          this.metrics.apiResponseTime.observe(
            { endpoint: '/v1/edge-agents', method: 'POST', status: '200' },
            Date.now() - agentStartTime
          );
          
          this.progressBar.update(index + 1);
        } catch (error) {
          console.error(chalk.red(`Failed to register branch ${branch.code}:`), error);
        }
      })
    );

    await Promise.all(registrationPromises);
    this.progressBar.stop();
    console.log(chalk.green('✓ All entities registered\n'));
  }

  private async startHeartbeatSimulation(): Promise<void> {
    console.log(chalk.yellow('💓 Stage 3: Starting heartbeat simulation...'));
    
    this.running = true;
    
    for (const camera of this.cameras) {
      const interval = setInterval(async () => {
        if (!this.running) return;
        
        try {
          const jitter = Math.random() * this.config.phase1.heartbeat.jitterSeconds * 1000;
          await new Promise(resolve => setTimeout(resolve, jitter));
          
          const startTime = Date.now();
          await this.httpClient.post(`/v1/cameras/${camera.id}/heartbeat`, {
            timestamp: new Date().toISOString(),
            status: camera.status,
          });
          
          this.metrics.apiResponseTime.observe(
            { endpoint: '/v1/cameras/heartbeat', method: 'POST', status: '200' },
            Date.now() - startTime
          );
          
          this.metrics.heartbeatsSent.inc({ camera_id: camera.id, branch_id: camera.branchId });
          camera.lastHeartbeat = new Date();
          
        } catch (error) {
          this.metrics.heartbeatsFailed.inc({ camera_id: camera.id, reason: 'network_error' });
        }
      }, this.config.phase1.heartbeat.intervalSeconds * 1000);
      
      this.heartbeatIntervals.push(interval);
    }
    
    console.log(chalk.green(`✓ Heartbeat simulation started for ${this.cameras.length} cameras\n`));
  }

  private async startStatusUpdateSimulation(): Promise<void> {
    console.log(chalk.yellow('🔄 Stage 4: Starting status update simulation...'));
    
    const interval = setInterval(async () => {
      if (!this.running) return;
      
      const changeCount = Math.floor(
        this.cameras.length * (this.config.phase1.statusUpdate.changePercentage / 100)
      );
      
      const camerasToChange = faker.helpers.arrayElements(this.cameras, changeCount);
      
      for (const camera of camerasToChange) {
        const oldStatus = camera.status;
        const newStatus = faker.helpers.arrayElement(['online', 'offline', 'error', 'recording', 'idle']);
        
        try {
          const startTime = Date.now();
          await this.httpClient.patch(`/v1/cameras/${camera.id}`, {
            status: newStatus,
          });
          
          this.metrics.apiResponseTime.observe(
            { endpoint: '/v1/cameras', method: 'PATCH', status: '200' },
            Date.now() - startTime
          );
          
          this.metrics.statusUpdates.inc({
            camera_id: camera.id,
            old_status: oldStatus,
            new_status: newStatus,
          });
          
          camera.status = newStatus;
        } catch (error) {
          // Ignore errors in status updates
        }
      }
    }, this.config.phase1.statusUpdate.intervalSeconds * 1000);
    
    this.statusUpdateIntervals.push(interval);
    console.log(chalk.green('✓ Status update simulation started\n'));
  }

  private async simulateDashboardUsers(): Promise<void> {
    console.log(chalk.yellow('👥 Stage 5: Simulating dashboard users...'));
    
    for (let i = 0; i < this.config.phase1.concurrentDashboardUsers; i++) {
      try {
        const ws = new WebSocket(this.config.endpoints.websocket, {
          headers: {
            'Authorization': `Bearer ${this.config.auth.apiKey}`,
            'X-Tenant-ID': this.config.auth.tenantId,
          },
        });
        
        ws.on('open', () => {
          this.metrics.activeWebSockets.inc();
          this.metrics.dashboardConnections.inc();
          
          // Subscribe to branch health updates
          ws.send(JSON.stringify({
            type: 'subscribe',
            channels: ['branch-health', 'camera-status', 'alerts'],
          }));
        });
        
        ws.on('close', () => {
          this.metrics.activeWebSockets.dec();
          this.metrics.dashboardConnections.dec();
        });
        
        ws.on('error', (error) => {
          console.error(chalk.red('WebSocket error:'), error.message);
        });
        
        this.webSockets.push(ws);
        
      } catch (error) {
        console.error(chalk.red('Failed to connect dashboard user:'), error);
      }
    }
    
    console.log(chalk.green(`✓ ${this.config.phase1.concurrentDashboardUsers} dashboard users connected\n`));
  }

  private async runTestDuration(): Promise<void> {
    const duration = this.parseDuration(this.config.phase1.testDuration);
    
    console.log(chalk.yellow(`⏱️  Stage 6: Running test for ${this.config.phase1.testDuration}...`));
    console.log(chalk.gray('   Press Ctrl+C to stop early\n'));
    
    const progressInterval = setInterval(() => {
      const stats = this.metricsCollector.getCurrentStats();
      console.log(chalk.cyan(`   Heartbeats: ${stats.heartbeatsSent} | Failed: ${stats.heartbeatsFailed} | WebSockets: ${stats.activeWebSockets}`));
    }, 10000); // Log every 10 seconds
    
    await new Promise(resolve => setTimeout(resolve, duration));
    
    clearInterval(progressInterval);
    console.log(chalk.green('✓ Test duration completed\n'));
  }

  private async generateReport(): Promise<void> {
    console.log(chalk.yellow('📊 Stage 7: Generating test report...'));
    
    const metricsData = await this.metricsCollector.exportMetrics();
    const acceptanceCriteria = this.evaluateAcceptanceCriteria(metricsData);
    
    await this.reportGenerator.generate({
      metrics: metricsData,
      acceptance: acceptanceCriteria,
      testConfig: {
        branches: this.branches.length,
        cameras: this.cameras.length,
        edgeAgents: this.edgeAgents.length,
        dashboardUsers: this.config.phase1.concurrentDashboardUsers,
        duration: this.config.phase1.testDuration,
      },
    });
    
    console.log(chalk.green('✓ Report generated\n'));
    
    // Print summary
    this.printSummary(acceptanceCriteria);
  }

  private evaluateAcceptanceCriteria(metrics: any): Record<string, boolean> {
    const thresholds = this.config.metrics.thresholds;
    
    return {
      'Dashboard load time < 2s': metrics.dashboardLoadTime < 2000,
      'Branch drill-down < 3s': metrics.branchDrillDownTime < 3000,
      'Camera health update delay < 30s': metrics.healthUpdateDelay < 30000,
      'Heartbeat loss rate < 0.1%': metrics.heartbeatLossRate < thresholds.heartbeatLossRate,
      'API P95 < 500ms': metrics.apiResponseTimeP95 < thresholds.apiResponseTimeP95,
      'API P99 < 1000ms': metrics.apiResponseTimeP99 < thresholds.apiResponseTimeP99,
      'DB CPU < 70%': metrics.dbCpuUsage < thresholds.dbCpuUsage,
      'DB Memory < 80%': metrics.dbMemoryUsage < thresholds.dbMemoryUsage,
      'No cross-tenant leakage': metrics.crossTenantLeakage === 0,
    };
  }

  private printSummary(acceptance: Record<string, boolean>): void {
    console.log(chalk.cyan.bold('\n📋 Test Summary\n'));
    console.log(chalk.gray('═'.repeat(60)));
    
    const passed = Object.values(acceptance).filter(Boolean).length;
    const total = Object.keys(acceptance).length;
    const percentage = Math.round((passed / total) * 100);
    
    console.log(chalk.white(`Acceptance Criteria: ${passed}/${total} (${percentage}%)\n`));
    
    for (const [criterion, result] of Object.entries(acceptance)) {
      const icon = result ? chalk.green('✓') : chalk.red('✗');
      console.log(`${icon} ${criterion}`);
    }
    
    console.log(chalk.gray('\n═'.repeat(60)));
    
    if (percentage === 100) {
      console.log(chalk.green.bold('\n🎉 ALL ACCEPTANCE CRITERIA MET!\n'));
    } else if (percentage >= 80) {
      console.log(chalk.yellow.bold('\n⚠️  MOST CRITERIA MET - Review failures\n'));
    } else {
      console.log(chalk.red.bold('\n❌ SIGNIFICANT FAILURES - Review and fix\n'));
    }
  }

  private async cleanup(): Promise<void> {
    console.log(chalk.gray('\n🧹 Cleaning up...'));
    
    this.running = false;
    
    // Stop heartbeat intervals
    for (const interval of this.heartbeatIntervals) {
      clearInterval(interval);
    }
    
    // Stop status update intervals
    for (const interval of this.statusUpdateIntervals) {
      clearInterval(interval);
    }
    
    // Close WebSocket connections
    for (const ws of this.webSockets) {
      ws.close();
    }
    
    // Stop metrics collection
    await this.metricsCollector.stop();
    
    console.log(chalk.green('✓ Cleanup completed'));
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)([smh])$/);
    if (!match) throw new Error(`Invalid duration format: ${duration}`);
    
    const value = parseInt(match[1]!, 10);
    const unit = match[2];
    
    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      default: throw new Error(`Invalid duration unit: ${unit}`);
    }
  }
}

// CLI
const argv = yargs(hideBin(process.argv))
  .option('config', {
    alias: 'c',
    type: 'string',
    description: 'Path to config file',
    default: './config.yaml',
  })
  .help()
  .alias('help', 'h')
  .parseSync();

const test = new Phase1LoadTest(argv.config);
test.run().catch(error => {
  console.error(chalk.red('Test failed:'), error);
  process.exit(1);
});

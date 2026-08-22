/**
 * k6 Load Testing Script for 400-Branch Scalability Test
 * 
 * Simulates 100 concurrent users performing typical operations:
 * - View branch dashboard
 * - Monitor control room (live video)
 * - Search recordings
 * - Review alerts
 * - Generate reports
 * - Admin operations
 */

import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep, group } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

// Custom metrics
const apiLatency = new Trend('api_latency');
const wsConnections = new Counter('ws_connections');
const errorRate = new Rate('error_rate');
const videoStreamStart = new Trend('video_stream_start_time');

// Test configuration
export const options = {
  stages: [
    { duration: '5m', target: 20 },   // Ramp-up to 20 users
    { duration: '10m', target: 50 },  // Ramp-up to 50 users
    { duration: '10m', target: 100 }, // Ramp-up to 100 users (full load)
    { duration: '1h', target: 100 },  // Sustain 100 users for 1 hour
    { duration: '5m', target: 0 },    // Ramp-down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'], // 95% of requests < 1s
    http_req_failed: ['rate<0.01'],     // Error rate < 1%
    api_latency: ['p(95)<500'],         // 95% API calls < 500ms
    error_rate: ['rate<0.001'],         // Custom error rate < 0.1%
  },
};

// Base URL (override with -e BASE_URL=...)
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const WS_URL = __ENV.WS_URL || 'ws://localhost:3000';

// Test user credentials
const USERS = [
  { username: 'test.admin@company.com', password: 'Test123!', role: 'admin' },
  { username: 'test.operator@company.com', password: 'Test123!', role: 'operator' },
  { username: 'test.viewer@company.com', password: 'Test123!', role: 'viewer' },
];

/**
 * Setup function - runs once per VU at start
 */
export function setup() {
  console.log('Starting scalability test...');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test duration: 1 hour sustained load`);
  console.log(`Target: 100 concurrent users`);
  
  return {
    branches: generateBranchIds(400),
    cameras: generateCameraIds(6000),
  };
}

/**
 * Main test execution
 */
export default function (data) {
  const user = USERS[__VU % USERS.length];
  
  // Login and get token
  const token = login(user);
  if (!token) {
    errorRate.add(1);
    return;
  }
  
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  
  // Weighted probability of user actions
  const action = Math.random();
  
  if (action < 0.40) {
    // 40% - View branch dashboard
    viewBranchDashboard(headers, data.branches);
  } else if (action < 0.60) {
    // 20% - Monitor control room (live video)
    monitorControlRoom(headers, data.cameras);
  } else if (action < 0.75) {
    // 15% - Search recordings (playback)
    searchRecordings(headers, data.cameras);
  } else if (action < 0.85) {
    // 10% - Review alerts
    reviewAlerts(headers);
  } else if (action < 0.95) {
    // 10% - Generate reports
    generateReports(headers);
  } else {
    // 5% - Admin operations
    performAdminOperations(headers, user.role);
  }
  
  // Random think time between actions (1-5 seconds)
  sleep(Math.random() * 4 + 1);
}

/**
 * User login
 */
function login(user) {
  const startTime = Date.now();
  
  const response = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
    username: user.username,
    password: user.password,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  apiLatency.add(Date.now() - startTime);
  
  const success = check(response, {
    'login successful': (r) => r.status === 200,
    'token received': (r) => r.json('token') !== undefined,
  });
  
  if (!success) {
    errorRate.add(1);
    return null;
  }
  
  return response.json('token');
}

/**
 * View branch dashboard (400 branches)
 */
function viewBranchDashboard(headers, branches) {
  group('Branch Dashboard', () => {
    const startTime = Date.now();
    
    // Load all branch health summaries
    const response = http.get(
      `${BASE_URL}/api/health/branches?limit=400`,
      { headers }
    );
    
    apiLatency.add(Date.now() - startTime);
    
    const success = check(response, {
      'branches loaded': (r) => r.status === 200,
      'response time < 1s': (r) => r.timings.duration < 1000,
      'correct count': (r) => r.json('data')?.length <= 400,
    });
    
    if (!success) errorRate.add(1);
    
    sleep(2);
    
    // Load detailed health for a random branch
    const branchId = branches[Math.floor(Math.random() * branches.length)];
    const detailStart = Date.now();
    
    const detailResponse = http.get(
      `${BASE_URL}/api/health/branches/${branchId}`,
      { headers }
    );
    
    apiLatency.add(Date.now() - detailStart);
    
    check(detailResponse, {
      'branch detail loaded': (r) => r.status === 200,
    });
  });
}

/**
 * Monitor control room (live video streams)
 */
function monitorControlRoom(headers, cameras) {
  group('Control Room', () => {
    // Select 16-64 random cameras for viewing
    const streamCount = Math.floor(Math.random() * 48) + 16; // 16-64
    const selectedCameras = [];
    
    for (let i = 0; i < streamCount; i++) {
      selectedCameras.push(cameras[Math.floor(Math.random() * cameras.length)]);
    }
    
    // Get camera stream URLs
    const startTime = Date.now();
    const response = http.post(
      `${BASE_URL}/api/cameras/streams`,
      JSON.stringify({ cameraIds: selectedCameras }),
      { headers }
    );
    
    apiLatency.add(Date.now() - startTime);
    
    const success = check(response, {
      'streams requested': (r) => r.status === 200,
      'stream URLs received': (r) => r.json('streams')?.length === streamCount,
    });
    
    if (!success) {
      errorRate.add(1);
      return;
    }
    
    // Simulate WebSocket connection for SSE updates
    const wsStart = Date.now();
    
    ws.connect(`${WS_URL}/ws/live-updates`, { headers }, (socket) => {
      wsConnections.add(1);
      
      socket.on('open', () => {
        videoStreamStart.add(Date.now() - wsStart);
        
        // Subscribe to camera updates
        socket.send(JSON.stringify({
          type: 'subscribe',
          cameras: selectedCameras,
        }));
      });
      
      socket.on('message', (data) => {
        // Process incoming camera updates
        const message = JSON.parse(data);
        check(message, {
          'valid update': (m) => m.type && m.cameraId,
        });
      });
      
      // Keep connection open for 10-30 seconds
      socket.setTimeout(() => {
        socket.close();
      }, Math.random() * 20000 + 10000);
    });
    
    sleep(15); // Watch streams for 15 seconds
  });
}

/**
 * Search and playback recordings
 */
function searchRecordings(headers, cameras) {
  group('Recording Search', () => {
    const cameraId = cameras[Math.floor(Math.random() * cameras.length)];
    
    // Search recordings from last 7 days
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const startTime = Date.now();
    const response = http.get(
      `${BASE_URL}/api/recordings/search?` +
      `cameraId=${cameraId}&` +
      `startDate=${startDate.toISOString()}&` +
      `endDate=${endDate.toISOString()}`,
      { headers }
    );
    
    apiLatency.add(Date.now() - startTime);
    
    const success = check(response, {
      'recordings found': (r) => r.status === 200,
      'response time < 2s': (r) => r.timings.duration < 2000,
    });
    
    if (!success) {
      errorRate.add(1);
      return;
    }
    
    // Request playback URL for a random recording
    const recordings = response.json('recordings');
    if (recordings && recordings.length > 0) {
      const recording = recordings[Math.floor(Math.random() * recordings.length)];
      
      const playbackStart = Date.now();
      const playbackResponse = http.get(
        `${BASE_URL}/api/recordings/${recording.id}/playback`,
        { headers }
      );
      
      apiLatency.add(Date.now() - playbackStart);
      
      check(playbackResponse, {
        'playback URL received': (r) => r.status === 200 && r.json('url'),
      });
    }
    
    sleep(3);
  });
}

/**
 * Review alerts
 */
function reviewAlerts(headers) {
  group('Alert Review', () => {
    // Get active alerts
    const startTime = Date.now();
    const response = http.get(
      `${BASE_URL}/api/analytics/alerts?status=active&limit=50`,
      { headers }
    );
    
    apiLatency.add(Date.now() - startTime);
    
    const success = check(response, {
      'alerts loaded': (r) => r.status === 200,
      'response time < 500ms': (r) => r.timings.duration < 500,
    });
    
    if (!success) {
      errorRate.add(1);
      return;
    }
    
    // Acknowledge a random alert
    const alerts = response.json('alerts');
    if (alerts && alerts.length > 0) {
      const alert = alerts[Math.floor(Math.random() * alerts.length)];
      
      const ackStart = Date.now();
      const ackResponse = http.post(
        `${BASE_URL}/api/analytics/alerts/${alert.id}/acknowledge`,
        JSON.stringify({ notes: 'Reviewed during load test' }),
        { headers }
      );
      
      apiLatency.add(Date.now() - ackStart);
      
      check(ackResponse, {
        'alert acknowledged': (r) => r.status === 200,
      });
    }
    
    sleep(2);
  });
}

/**
 * Generate reports
 */
function generateReports(headers) {
  group('Report Generation', () => {
    const templates = [
      'comprehensive',
      'branch_health_summary',
      'camera_availability',
      'alert_summary',
      'recorder_status',
      'hdd_health',
      'retention_compliance',
    ];
    
    const template = templates[Math.floor(Math.random() * templates.length)];
    
    const startTime = Date.now();
    const response = http.post(
      `${BASE_URL}/api/reports/generate`,
      JSON.stringify({
        template,
        format: 'pdf',
        dateRange: {
          start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          end: new Date().toISOString(),
        },
      }),
      { headers }
    );
    
    apiLatency.add(Date.now() - startTime);
    
    const success = check(response, {
      'report queued': (r) => r.status === 202 || r.status === 200,
      'job ID received': (r) => r.json('jobId') !== undefined,
    });
    
    if (!success) errorRate.add(1);
    
    sleep(1);
  });
}

/**
 * Admin operations (only for admin users)
 */
function performAdminOperations(headers, role) {
  if (role !== 'admin') return;
  
  group('Admin Operations', () => {
    // Get system metrics
    const metricsStart = Date.now();
    const metricsResponse = http.get(
      `${BASE_URL}/api/system/metrics`,
      { headers }
    );
    
    apiLatency.add(Date.now() - metricsStart);
    
    check(metricsResponse, {
      'metrics loaded': (r) => r.status === 200,
    });
    
    sleep(2);
    
    // Get user activity logs
    const logsStart = Date.now();
    const logsResponse = http.get(
      `${BASE_URL}/api/admin/audit-logs?limit=100`,
      { headers }
    );
    
    apiLatency.add(Date.now() - logsStart);
    
    check(logsResponse, {
      'logs loaded': (r) => r.status === 200,
    });
    
    sleep(1);
  });
}

/**
 * Helper: Generate branch IDs
 */
function generateBranchIds(count) {
  const ids = [];
  for (let i = 1; i <= count; i++) {
    ids.push(`branch-${String(i).padStart(4, '0')}`);
  }
  return ids;
}

/**
 * Helper: Generate camera IDs
 */
function generateCameraIds(count) {
  const ids = [];
  for (let i = 1; i <= count; i++) {
    ids.push(`camera-${String(i).padStart(5, '0')}`);
  }
  return ids;
}

/**
 * Teardown function - runs once at end
 */
export function teardown(data) {
  console.log('Scalability test completed.');
}

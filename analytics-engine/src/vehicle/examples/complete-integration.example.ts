/**
 * Complete Vehicle Analytics Integration Example
 * Shows how to set up and use the complete ANPR system
 */

import { Pool } from 'pg';
import {
  VehicleAnalyticsService,
  VehicleJourneyService,
  VehicleWatchlistService,
  PostgresVehicleEventRepository,
  VehicleAnalyticsMetrics,
  InMemoryMetricsCollector,
  type VehicleAnalyticsConfig,
  type VehicleDetection,
} from '../index.js';

/**
 * Example: Complete system setup
 */
export async function setupVehicleAnalyticsSystem() {
  // 1. Set up database connection
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'vms',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  });
  
  // 2. Create repository
  const eventRepository = new PostgresVehicleEventRepository(pool);
  
  // 3. Create journey service
  const journeyService = new VehicleJourneyService(eventRepository);
  
  // 4. Create watchlist service
  const watchlistService = new VehicleWatchlistService();
  
  // 5. Load watchlist entries (from database or config)
  await watchlistService.loadWatchlist('tenant-123', [
    {
      id: 'watch-1',
      tenantId: 'tenant-123',
      normalizedPlate: 'KL01AB1234',
      reason: 'Stolen vehicle',
      severity: 'critical',
      category: 'stolen',
      enabled: true,
      createdAt: new Date(),
    },
  ]);
  
  // 6. Set up metrics
  const metricsCollector = new InMemoryMetricsCollector();
  const metrics = new VehicleAnalyticsMetrics(metricsCollector);
  
  // 7. Configure analytics service for each camera
  const cameraConfig: VehicleAnalyticsConfig = {
    cameraId: 'gate_entrance',
    tenantId: 'tenant-123',
    siteId: 'site-456',
    
    // Quality gates
    minVehicleConfidence: 0.5,
    minPlateConfidence: 0.7,
    minOcrConfidence: 0.8,
    minPlateWidth: 40,
    minBlurScore: 0.55,
    
    // OCR budget (5 OCR calls per second max)
    maxOcrPerSecond: 5,
    
    // Tracking
    trackTimeout: 5000, // 5 seconds
    
    // Region
    countryCode: 'IN',
    
    // Features
    enableAnpr: true,
    enableColorClassification: true,
    enableWatchlist: true,
  };
  
  const analyticsService = new VehicleAnalyticsService(
    cameraConfig,
    eventRepository,
    journeyService,
    watchlistService,
    process.env.PADDLE_OCR_URL
  );
  
  return {
    analyticsService,
    journeyService,
    watchlistService,
    eventRepository,
    metrics,
    metricsCollector,
  };
}

/**
 * Example: Process video frames
 */
export async function processVideoFrames() {
  const system = await setupVehicleAnalyticsSystem();
  
  // Simulate frame processing loop
  let frameCount = 0;
  
  const processFrame = async () => {
    frameCount++;
    const timestamp = new Date();
    
    // Simulate vehicle detections from YOLO
    const detections: VehicleDetection[] = [
      {
        boundingBox: { x: 100, y: 150, width: 200, height: 150 },
        confidence: 0.92,
        className: 'car',
        embedding: Array(512).fill(0).map(() => Math.random()),
      },
    ];
    
    // Process frame
    const result = await system.analyticsService.processFrame(
      detections,
      timestamp,
      // Optional: provide frame data for color/ANPR
      // {
      //   image: frameBuffer,
      //   width: 1920,
      //   height: 1080,
      // }
    );
    
    // Record metrics
    for (const detection of detections) {
      system.metrics.recordVehicleDetection(
        'gate_entrance',
        detection.className
      );
    }
    
    // Handle watchlist matches
    for (const match of result.watchlistMatches) {
      console.log('🚨 WATCHLIST MATCH:', match);
      
      system.metrics.recordWatchlistMatch(
        'gate_entrance',
        match.match.watchlistEntry.severity,
        match.match.matchConfidence
      );
      
      // Send alert (email, SMS, webhook, etc.)
      await sendWatchlistAlert(match);
    }
    
    // Handle persisted events
    for (const event of result.vehicleEvents) {
      console.log('Vehicle Event:', {
        plate: event.normalizedPlate,
        type: event.vehicleType,
        color: event.color,
        confidence: event.plateConfidence,
      });
      
      system.metrics.recordEventPersisted(
        'gate_entrance',
        !!event.normalizedPlate
      );
    }
    
    // Update active tracks gauge
    system.metrics.setActiveTracks('gate_entrance', result.activeTracks);
    
    console.log(`Frame ${frameCount}: ${result.metrics.vehiclesDetected} vehicles, ${result.metrics.platesRecognized} plates`);
  };
  
  // Process frames at ~10 FPS
  const interval = setInterval(processFrame, 100);
  
  // Stop after 60 seconds
  setTimeout(() => {
    clearInterval(interval);
    console.log('\n📊 Metrics Summary:');
    console.log(system.metricsCollector.exportPrometheus());
  }, 60000);
}

/**
 * Example: Search and query operations
 */
export async function queryOperations() {
  const system = await setupVehicleAnalyticsSystem();
  
  // 1. Search by plate number
  const plateEvents = await system.eventRepository.findByPlate(
    'tenant-123',
    'KL01AB1234',
    {
      minConfidence: 0.7,
      maxResults: 50,
    }
  );
  
  console.log(`Found ${plateEvents.length} events for plate KL01AB1234`);
  
  // 2. Get vehicle journey
  const journey = await system.journeyService.buildJourney(
    'tenant-123',
    'KL01AB1234',
    {
      from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      to: new Date(),
    }
  );
  
  if (journey) {
    console.log(`Journey: ${journey.appearances.length} appearances across ${journey.statistics.totalCameras} cameras`);
    console.log(`Route: ${journey.route?.join(' → ')}`);
    
    // Validate route
    const validation = system.journeyService.validateRoute(journey);
    if (!validation.isValid) {
      console.log('⚠️ Invalid route detected:', validation.impossibleTransitions);
    }
  }
  
  // 3. Get statistics
  const stats = await system.eventRepository.getStats(
    'tenant-123',
    {
      from: new Date(Date.now() - 24 * 60 * 60 * 1000),
      to: new Date(),
    }
  );
  
  console.log('24h Statistics:', {
    total: stats.total,
    withPlates: stats.withPlates,
    recognitionRate: `${Math.round((stats.withPlates / stats.total) * 100)}%`,
    avgConfidence: `${Math.round(stats.avgConfidence * 100)}%`,
  });
  
  // 4. Get last seen location
  const lastSeen = await system.journeyService.getLastSeen(
    'tenant-123',
    'KL01AB1234'
  );
  
  if (lastSeen) {
    console.log(`Last seen: ${lastSeen.cameraName || lastSeen.cameraId} at ${lastSeen.timestamp.toLocaleString()}`);
  }
  
  // 5. Get watchlist matches
  const pendingMatches = system.watchlistService.getPendingMatches('tenant-123');
  console.log(`${pendingMatches.length} pending watchlist matches`);
}

/**
 * Example: Watchlist management
 */
export async function watchlistManagement() {
  const system = await setupVehicleAnalyticsSystem();
  
  // Add to watchlist
  await system.watchlistService.addEntry({
    id: `watch-${Date.now()}`,
    tenantId: 'tenant-123',
    normalizedPlate: 'MH02XY9876',
    reason: 'VIP vehicle',
    severity: 'medium',
    category: 'vip',
    label: 'CEO Vehicle',
    enabled: true,
    alertConfig: {
      notifyEmail: ['security@company.com'],
      requireImmediateResponse: false,
    },
    createdAt: new Date(),
  });
  
  // Get watchlist
  const entries = system.watchlistService.getWatchlist('tenant-123');
  console.log(`Watchlist has ${entries.length} entries`);
  
  // Get watchlist statistics
  const stats = system.watchlistService.getStats('tenant-123');
  console.log('Watchlist Stats:', stats);
}

/**
 * Example: Set camera topology for journey validation
 */
export function setupCameraTopology(journeyService: VehicleJourneyService) {
  journeyService.setTopology({
    cameras: new Map([
      ['gate_entrance', {
        cameraId: 'gate_entrance',
        cameraName: 'Main Gate Entrance',
        siteId: 'site-456',
        siteName: 'Headquarters',
        location: {
          latitude: 12.9716,
          longitude: 77.5946,
        },
      }],
      ['parking_entrance', {
        cameraId: 'parking_entrance',
        cameraName: 'Parking Entrance',
        siteId: 'site-456',
        siteName: 'Headquarters',
        location: {
          latitude: 12.9720,
          longitude: 77.5950,
        },
      }],
      ['building_rear', {
        cameraId: 'building_rear',
        cameraName: 'Building Rear',
        siteId: 'site-456',
        siteName: 'Headquarters',
        location: {
          latitude: 12.9718,
          longitude: 77.5955,
        },
      }],
    ]),
    connections: [
      {
        fromCameraId: 'gate_entrance',
        toCameraId: 'parking_entrance',
        distance: 150, // meters
        typicalTransitTime: 60, // seconds
      },
      {
        fromCameraId: 'parking_entrance',
        toCameraId: 'building_rear',
        distance: 100,
        typicalTransitTime: 45,
      },
    ],
  });
}

/**
 * Example: Send watchlist alert
 */
async function sendWatchlistAlert(alert: any) {
  // Email notification
  // await sendEmail({
  //   to: alert.match.watchlistEntry.alertConfig?.notifyEmail,
  //   subject: alert.title,
  //   body: alert.message,
  // });
  
  // SMS notification
  // await sendSMS({
  //   to: alert.match.watchlistEntry.alertConfig?.notifySMS,
  //   message: alert.message,
  // });
  
  // Webhook notification
  // if (alert.match.watchlistEntry.alertConfig?.notifyWebhook) {
  //   await fetch(alert.match.watchlistEntry.alertConfig.notifyWebhook, {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify(alert),
  //   });
  // }
  
  console.log('Alert sent:', alert.title);
}

/**
 * Run examples
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🚗 Vehicle Analytics System Examples\n');
  
  // Run setup example
  setupVehicleAnalyticsSystem()
    .then(system => {
      console.log('✅ System initialized successfully');
      setupCameraTopology(system.journeyService);
      return queryOperations();
    })
    .then(() => {
      console.log('\n✅ All examples completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Error:', error);
      process.exit(1);
    });
}

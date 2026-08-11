/**
 * Digital Twin Event Integration Example
 * 
 * Example of how to integrate the Digital Twin event system
 * with your existing infrastructure.
 */

import { EventEmitter } from 'events';
import { Pool } from 'pg';
import { Server as HTTPServer } from 'http';
import { initializeTwinEvents } from './index.js';

/**
 * Example: Integrate with existing infrastructure event bus
 */
export async function integrateDigitalTwinEvents(
  pool: Pool,
  httpServer: HTTPServer
): Promise<void> {
  // Your existing infrastructure event bus
  const infrastructureEventBus = new EventEmitter();

  // Initialize Digital Twin event system
  const { eventHandler, websocketManager } = initializeTwinEvents(
    pool,
    infrastructureEventBus,
    httpServer
  );

  // Example: Emit infrastructure events that will update the twin
  // These would come from your real camera monitoring, network monitoring, etc.

  // Camera comes online
  infrastructureEventBus.emit('camera.online', {
    cameraId: 'cam_123',
    cameraName: 'Entrance Camera',
    timestamp: new Date().toISOString()
  });

  // Camera goes offline
  infrastructureEventBus.emit('camera.offline', {
    cameraId: 'cam_456',
    cameraName: 'Parking Camera',
    reason: 'Network timeout',
    timestamp: new Date().toISOString()
  });

  // Network switch degraded
  infrastructureEventBus.emit('network.device.degraded', {
    deviceType: 'switch',
    deviceId: 'sw_001',
    deviceName: 'Main Switch',
    reason: 'High packet loss',
    timestamp: new Date().toISOString()
  });

  // Storage capacity warning
  infrastructureEventBus.emit('storage.capacity.warning', {
    storageId: 'storage_primary',
    utilization: 85,
    capacityGB: 10000,
    usedGB: 8500,
    timestamp: new Date().toISOString()
  });

  // Get WebSocket stats
  setInterval(() => {
    const stats = websocketManager.getStats();
    console.log('[DigitalTwin] WebSocket stats:', stats);
  }, 60000); // Every minute

  console.log('[DigitalTwin] Event integration complete');
}

/**
 * Example: Manual event emission for testing
 */
export function emitTestEvents(infrastructureEventBus: EventEmitter): void {
  // Simulate camera going offline
  setTimeout(() => {
    infrastructureEventBus.emit('camera.offline', {
      cameraId: 'test_cam_1',
      cameraName: 'Test Camera 1',
      reason: 'Power failure'
    });
  }, 5000);

  // Simulate camera coming back online
  setTimeout(() => {
    infrastructureEventBus.emit('camera.online', {
      cameraId: 'test_cam_1',
      cameraName: 'Test Camera 1'
    });
  }, 15000);

  // Simulate network switch failure (high blast radius)
  setTimeout(() => {
    infrastructureEventBus.emit('network.device.offline', {
      deviceType: 'switch',
      deviceId: 'test_switch_1',
      deviceName: 'Test Switch 1'
    });
  }, 30000);
}

/**
 * Example: Client-side WebSocket connection
 * 
 * This is how a frontend would connect to receive real-time updates.
 */
export const clientExampleCode = `
// Frontend WebSocket client example
const ws = new WebSocket('ws://localhost:3000/ws/digital-twin');

ws.onopen = () => {
  console.log('Connected to Digital Twin');
  
  // Subscribe to specific assets
  ws.send(JSON.stringify({
    type: 'subscribe',
    assetIds: [
      'camera_cam_123',
      'switch_sw_001',
      'branch_branch_001'
    ]
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.type) {
    case 'twin.updated':
      console.log('Asset updated:', message.data);
      // Update UI with new asset state
      updateAssetInUI(message.data.assetId, message.data.newState);
      break;
      
    case 'twin.topology_changed':
      console.log('Topology changed:', message.data);
      // Refresh topology visualization
      refreshTopologyGraph();
      break;
      
    case 'twin.blast_radius':
      console.log('Blast radius alert:', message.data);
      // Show blast radius visualization
      showBlastRadiusAlert(message.data);
      break;
  }
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('Disconnected from Digital Twin');
  // Attempt reconnection
  setTimeout(connectWebSocket, 5000);
};

// Heartbeat to keep connection alive
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'ping' }));
  }
}, 30000);
`;

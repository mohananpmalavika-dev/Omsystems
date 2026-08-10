/**
 * Digital Twin Events
 * 
 * Real-time event handling and WebSocket broadcasting.
 */

export { TwinEventHandler, TwinEventPayload } from './twin-event-handler';
export { TwinWebSocketManager, WebSocketClient, TwinUpdateMessage } from './twin-websocket';

import { EventEmitter } from 'events';
import { Server as HTTPServer } from 'http';
import { Pool } from 'pg';
import { TwinEventHandler } from './twin-event-handler';
import { TwinWebSocketManager } from './twin-websocket';

/**
 * Initialize Digital Twin event system
 */
export function initializeTwinEvents(
  pool: Pool,
  infrastructureEventBus: EventEmitter,
  httpServer?: HTTPServer
): {
  eventHandler: TwinEventHandler;
  websocketManager: TwinWebSocketManager;
} {
  // Create event handler
  const eventHandler = new TwinEventHandler(pool);
  
  // Initialize event listeners for infrastructure events
  eventHandler.initialize(infrastructureEventBus);

  // Create WebSocket manager
  const websocketManager = new TwinWebSocketManager(eventHandler);

  // Initialize WebSocket server if HTTP server provided
  if (httpServer) {
    websocketManager.initialize(httpServer);
  }

  console.log('[DigitalTwin] Event system initialized');

  return {
    eventHandler,
    websocketManager
  };
}

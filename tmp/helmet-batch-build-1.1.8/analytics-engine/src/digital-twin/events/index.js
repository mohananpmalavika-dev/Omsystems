/**
 * Digital Twin Events
 *
 * Real-time event handling and WebSocket broadcasting.
 */
export { TwinEventHandler } from './twin-event-handler.js';
export { TwinWebSocketManager } from './twin-websocket.js';
import { TwinEventHandler } from './twin-event-handler.js';
import { TwinWebSocketManager } from './twin-websocket.js';
/**
 * Initialize Digital Twin event system
 */
export function initializeTwinEvents(pool, infrastructureEventBus, httpServer) {
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

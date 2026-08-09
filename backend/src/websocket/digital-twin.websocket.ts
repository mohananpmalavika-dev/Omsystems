/**
 * Digital Twin WebSocket Handler
 * Real-time updates for floor plan visualization
 * 
 * UPDATED: Supports distributed events for horizontal scaling
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import digitalTwinEventMapper from '../services/digital-twin-event-mapper.service';
import { getDistributedEventBus } from '../services/distributed-event-bus.service';
import { DigitalTwinRealtimeEvent } from '../types/digital-twin';

export class DigitalTwinWebSocket {
  private io: SocketIOServer;
  private useDistributed: boolean;

  constructor(io: SocketIOServer) {
    this.io = io;
    this.useDistributed = process.env.DISTRIBUTED_EVENTS === 'true';
    this.initializeEventListeners();
  }

  private initializeEventListeners() {
    if (this.useDistributed) {
      // Subscribe to distributed Redis events
      this.setupDistributedEventListeners();
    } else {
      // Subscribe to local in-memory events
      this.setupLocalEventListeners();
    }

    // Setup Socket.IO namespace for Digital Twin
    const digitalTwinNamespace = this.io.of('/digital-twin');
    digitalTwinNamespace.on('connection', (socket: Socket) => {
      console.log(`Digital Twin client connected: ${socket.id}`);

      // Subscribe to specific floor
      socket.on('subscribe:floor', (floorId: string) => {
        socket.join(`floor:${floorId}`);
        console.log(`Client ${socket.id} subscribed to floor ${floorId}`);
      });

      // Unsubscribe from floor
      socket.on('unsubscribe:floor', (floorId: string) => {
        socket.leave(`floor:${floorId}`);
        console.log(`Client ${socket.id} unsubscribed from floor ${floorId}`);
      });

      // Subscribe to specific building (all floors)
      socket.on('subscribe:building', (buildingId: string) => {
        socket.join(`building:${buildingId}`);
        console.log(`Client ${socket.id} subscribed to building ${buildingId}`);
      });

      // Unsubscribe from building
      socket.on('unsubscribe:building', (buildingId: string) => {
        socket.leave(`building:${buildingId}`);
        console.log(`Client ${socket.id} unsubscribed from building ${buildingId}`);
      });

      // Client requests current floor state
      socket.on('request:floor:state', async (floorId: string) => {
        try {
          const floorStateService = (await import('../services/floor-state.service')).default;
          const state = await floorStateService.getFloorState(floorId);
          socket.emit('floor:state', state);
        } catch (error) {
          console.error('Error getting floor state:', error);
          socket.emit('error', { message: 'Failed to get floor state' });
        }
      });

      socket.on('disconnect', () => {
        console.log(`Digital Twin client disconnected: ${socket.id}`);
      });
    });
  }

  /**
   * Setup distributed event listeners (Redis pub/sub)
   */
  private async setupDistributedEventListeners() {
    try {
      const eventBus = getDistributedEventBus();
      
      await eventBus.subscribe('digital-twin:event', (event: DigitalTwinRealtimeEvent) => {
        this.broadcastFloorEvent(event);
      });

      console.log('[DigitalTwinWebSocket] Subscribed to distributed digital-twin:event');
    } catch (error) {
      console.error('[DigitalTwinWebSocket] Failed to setup distributed listeners:', error);
      // Fallback to local
      this.setupLocalEventListeners();
    }
  }

  /**
   * Setup local event listeners (in-memory EventEmitter)
   */
  private setupLocalEventListeners() {
    digitalTwinEventMapper.on('digital-twin:event', (event: DigitalTwinRealtimeEvent) => {
      this.broadcastFloorEvent(event);
    });
  }

  private broadcastFloorEvent(event: DigitalTwinRealtimeEvent) {
    const digitalTwinNamespace = this.io.of('/digital-twin');
    
    // Broadcast to all clients subscribed to this floor
    digitalTwinNamespace.to(`floor:${event.floorId}`).emit('floor:event', event);
  }

  // Send alert to specific floor
  broadcastAlert(floorId: string, alert: any) {
    const digitalTwinNamespace = this.io.of('/digital-twin');
    digitalTwinNamespace.to(`floor:${floorId}`).emit('alert:triggered', alert);
  }

  // Send object status update
  broadcastObjectStatus(floorId: string, objectId: string, status: any) {
    const digitalTwinNamespace = this.io.of('/digital-twin');
    digitalTwinNamespace.to(`floor:${floorId}`).emit('object:status', {
      objectId,
      status,
      timestamp: new Date(),
    });
  }

  // Send door state update
  broadcastDoorState(floorId: string, doorId: string, state: any) {
    const digitalTwinNamespace = this.io.of('/digital-twin');
    digitalTwinNamespace.to(`floor:${floorId}`).emit('door:state', {
      doorId,
      state,
      timestamp: new Date(),
    });
  }
}

export function initializeDigitalTwinWebSocket(io: SocketIOServer): DigitalTwinWebSocket {
  return new DigitalTwinWebSocket(io);
}

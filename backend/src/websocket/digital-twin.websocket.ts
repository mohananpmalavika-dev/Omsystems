/**
 * Digital Twin WebSocket Handler
 * Real-time updates for floor plan visualization
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import digitalTwinEventMapper from '../services/digital-twin-event-mapper.service';
import { DigitalTwinRealtimeEvent } from '../types/digital-twin';

export class DigitalTwinWebSocket {
  private io: SocketIOServer;

  constructor(io: SocketIOServer) {
    this.io = io;
    this.initializeEventListeners();
  }

  private initializeEventListeners() {
    // Listen to Digital Twin events
    digitalTwinEventMapper.on('digital-twin:event', (event: DigitalTwinRealtimeEvent) => {
      this.broadcastFloorEvent(event);
    });

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

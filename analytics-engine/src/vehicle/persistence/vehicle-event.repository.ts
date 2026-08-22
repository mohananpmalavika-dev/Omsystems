/**
 * Vehicle Event Repository
 * Interface for vehicle event persistence
 */

import type {
  VehicleEvent,
  VehicleEventQuery,
  PlateHistoryOptions,
  DateRange,
  VehicleEventStats,
} from './vehicle-event.model.js';

export interface VehicleEventRepository {
  /**
   * Save a vehicle event
   */
  save(event: VehicleEvent): Promise<void>;
  
  /**
   * Save multiple vehicle events
   */
  saveMany(events: VehicleEvent[]): Promise<void>;
  
  /**
   * Search vehicle events
   */
  search(query: VehicleEventQuery): Promise<VehicleEvent[]>;
  
  /**
   * Find events by plate number
   */
  findByPlate(
    tenantId: string,
    plate: string,
    options?: PlateHistoryOptions
  ): Promise<VehicleEvent[]>;
  
  /**
   * Find recent events for a camera
   */
  findRecentByCamera(
    tenantId: string,
    cameraId: string,
    since: Date,
    limit?: number
  ): Promise<VehicleEvent[]>;
  
  /**
   * Find vehicle journey (all appearances)
   */
  findJourney(
    tenantId: string,
    normalizedPlate: string,
    range: DateRange
  ): Promise<VehicleEvent[]>;
  
  /**
   * Get event by ID
   */
  findById(tenantId: string, eventId: string): Promise<VehicleEvent | null>;
  
  /**
   * Get events by track ID
   */
  findByTrackId(tenantId: string, trackId: string): Promise<VehicleEvent[]>;
  
  /**
   * Get statistics for a time range
   */
  getStats(
    tenantId: string,
    range: DateRange,
    cameraIds?: string[]
  ): Promise<VehicleEventStats>;
  
  /**
   * Delete old events (cleanup)
   */
  deleteOlderThan(date: Date): Promise<number>;
  
  /**
   * Count events matching query
   */
  count(query: VehicleEventQuery): Promise<number>;
}

/**
 * In-memory repository for testing
 */
export class InMemoryVehicleEventRepository implements VehicleEventRepository {
  private events = new Map<string, VehicleEvent>();
  
  async save(event: VehicleEvent): Promise<void> {
    this.events.set(event.id, { ...event });
  }
  
  async saveMany(events: VehicleEvent[]): Promise<void> {
    for (const event of events) {
      await this.save(event);
    }
  }
  
  async search(query: VehicleEventQuery): Promise<VehicleEvent[]> {
    let results = Array.from(this.events.values())
      .filter(e => e.tenantId === query.tenantId);
    
    // Apply filters
    if (query.cameraIds && query.cameraIds.length > 0) {
      results = results.filter(e => query.cameraIds!.includes(e.cameraId));
    }
    
    if (query.vehicleTypes && query.vehicleTypes.length > 0) {
      results = results.filter(e => query.vehicleTypes!.includes(e.vehicleType));
    }
    
    if (query.normalizedPlate) {
      results = results.filter(e => e.normalizedPlate === query.normalizedPlate);
    }
    
    if (query.from) {
      results = results.filter(e => e.occurredAt >= query.from!);
    }
    
    if (query.to) {
      results = results.filter(e => e.occurredAt <= query.to!);
    }
    
    // Sort
    const orderBy = query.orderBy || 'occurredAt';
    const direction = query.orderDirection || 'desc';
    
    results.sort((a, b) => {
      const aVal = a[orderBy as keyof VehicleEvent] as any;
      const bVal = b[orderBy as keyof VehicleEvent] as any;
      
      if (direction === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    
    // Pagination
    const offset = query.offset || 0;
    const limit = query.limit || 100;
    
    return results.slice(offset, offset + limit);
  }
  
  async findByPlate(
    tenantId: string,
    plate: string,
    options?: PlateHistoryOptions
  ): Promise<VehicleEvent[]> {
    const minConfidence = options?.minConfidence || 0;
    const maxResults = options?.maxResults || 100;
    
    return Array.from(this.events.values())
      .filter(e =>
        e.tenantId === tenantId &&
        e.normalizedPlate === plate &&
        (e.plateConfidence || 0) >= minConfidence
      )
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, maxResults);
  }
  
  async findRecentByCamera(
    tenantId: string,
    cameraId: string,
    since: Date,
    limit?: number
  ): Promise<VehicleEvent[]> {
    return Array.from(this.events.values())
      .filter(e =>
        e.tenantId === tenantId &&
        e.cameraId === cameraId &&
        e.occurredAt >= since
      )
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, limit || 100);
  }
  
  async findJourney(
    tenantId: string,
    normalizedPlate: string,
    range: DateRange
  ): Promise<VehicleEvent[]> {
    return Array.from(this.events.values())
      .filter(e =>
        e.tenantId === tenantId &&
        e.normalizedPlate === normalizedPlate &&
        e.occurredAt >= range.from &&
        e.occurredAt <= range.to
      )
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  }
  
  async findById(tenantId: string, eventId: string): Promise<VehicleEvent | null> {
    const event = this.events.get(eventId);
    return event && event.tenantId === tenantId ? event : null;
  }
  
  async findByTrackId(tenantId: string, trackId: string): Promise<VehicleEvent[]> {
    return Array.from(this.events.values())
      .filter(e => e.tenantId === tenantId && e.trackId === trackId);
  }
  
  async getStats(
    tenantId: string,
    range: DateRange,
    cameraIds?: string[]
  ): Promise<VehicleEventStats> {
    const events = Array.from(this.events.values())
      .filter(e =>
        e.tenantId === tenantId &&
        e.occurredAt >= range.from &&
        e.occurredAt <= range.to &&
        (!cameraIds || cameraIds.includes(e.cameraId))
      );
    
    const byType: Record<string, number> = {};
    const byColor: Record<string, number> = {};
    const byCamera: Record<string, number> = {};
    let withPlates = 0;
    let totalConfidence = 0;
    
    for (const event of events) {
      byType[event.vehicleType] = (byType[event.vehicleType] || 0) + 1;
      
      if (event.color) {
        byColor[event.color] = (byColor[event.color] || 0) + 1;
      }
      
      byCamera[event.cameraId] = (byCamera[event.cameraId] || 0) + 1;
      
      if (event.normalizedPlate) {
        withPlates++;
      }
      
      totalConfidence += event.vehicleConfidence;
    }
    
    return {
      total: events.length,
      byType,
      byColor,
      byCamera,
      withPlates,
      avgConfidence: events.length > 0 ? totalConfidence / events.length : 0,
    };
  }
  
  async deleteOlderThan(date: Date): Promise<number> {
    let deleted = 0;
    for (const [id, event] of this.events.entries()) {
      if (event.createdAt < date) {
        this.events.delete(id);
        deleted++;
      }
    }
    return deleted;
  }
  
  async count(query: VehicleEventQuery): Promise<number> {
    const results = await this.search({ ...query, limit: undefined, offset: undefined });
    return results.length;
  }
}

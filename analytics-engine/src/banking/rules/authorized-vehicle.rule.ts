/**
 * Authorized Vehicle Rule
 * 
 * Verifies that the vehicle is authorized for cash van operations
 */

import { BaseRule, RuleContext, RuleResult } from './rule-engine.js';

export class AuthorizedVehicleRule extends BaseRule {
  constructor() {
    super(
      'authorized_vehicle',
      'Authorized Vehicle',
      'Vehicle must be registered and authorized for cash van operations',
      'critical'
    );
  }

  async evaluate(context: RuleContext): Promise<RuleResult> {
    const { session, monitor } = context;

    // Check if vehicle observation exists
    if (!session.vehicle) {
      return this.unknown(
        'Vehicle not yet observed',
        { reason: 'no_vehicle_data' }
      );
    }

    // Check ANPR availability
    if (!session.evidenceAvailability.anpr) {
      return this.unknown(
        'ANPR not available - cannot verify plate',
        { 
          reason: 'anpr_unavailable',
          vehicleDetected: true 
        }
      );
    }

    // Check if plate was recognized
    if (!session.plate) {
      return this.unknown(
        'License plate not recognized',
        { 
          reason: 'plate_not_recognized',
          vehicleTrackId: session.vehicleTrackId 
        }
      );
    }

    // Check plate confidence
    if (session.vehicle.plateConfidence !== undefined && session.vehicle.plateConfidence < 0.75) {
      return this.unknown(
        'License plate confidence too low for verification',
        {
          reason: 'low_plate_confidence',
          plate: session.plate,
          confidence: session.vehicle.plateConfidence,
        }
      );
    }

    // Check if vehicle is authorized
    if (!session.vehicle.authorized) {
      const match = this.checkPlateAuthorization(session.plate, monitor.allowedVehicles);
      
      if (!match) {
        return this.fail(
          `Unauthorized vehicle detected: ${session.plate}`,
          {
            plate: session.plate,
            vehicleClass: session.vehicle.vehicleClass,
            allowedVehiclesCount: monitor.allowedVehicles.length,
          },
          [
            {
              type: 'anpr',
              id: session.vehicleTrackId || session.vehicle.trackId,
              confidence: session.vehicle.plateConfidence,
              timestamp: session.vehicle.arrivedAt,
            },
          ]
        );
      }
    }

    // Vehicle is authorized
    return this.pass(
      `Authorized vehicle verified: ${session.plate}`,
      {
        plate: session.plate,
        vehicleClass: session.vehicle.vehicleClass,
        confidence: session.vehicle.plateConfidence || 1.0,
      },
      [
        {
          type: 'anpr',
          id: session.vehicleTrackId || session.vehicle.trackId,
          confidence: session.vehicle.plateConfidence,
          timestamp: session.vehicle.arrivedAt,
        },
      ]
    );
  }

  /**
   * Check if plate matches any authorization rule
   */
  private checkPlateAuthorization(plate: string, rules: any[]): boolean {
    const normalizedPlate = this.normalizePlate(plate);

    for (const rule of rules) {
      if (!rule.enabled) {
        continue;
      }

      if (rule.plate) {
        if (this.normalizePlate(rule.plate) === normalizedPlate) {
          return true;
        }
      }

      if (rule.plateRegex) {
        try {
          const regex = new RegExp(rule.plateRegex, 'i');
          if (regex.test(normalizedPlate)) {
            return true;
          }
        } catch (error) {
          // Invalid regex, skip
          console.warn(`Invalid plate regex: ${rule.plateRegex}`);
        }
      }
    }

    return false;
  }

  /**
   * Normalize plate for comparison
   */
  private normalizePlate(plate: string): string {
    return plate.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  }
}

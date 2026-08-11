/**
 * Scheduled Arrival Rule
 * 
 * Verifies that the vehicle arrived during an expected time window
 */

import { BaseRule, RuleContext, RuleResult } from './rule-engine';

export class ScheduledArrivalRule extends BaseRule {
  constructor() {
    super(
      'scheduled_arrival',
      'Scheduled Arrival',
      'Vehicle must arrive during expected time window',
      'high'
    );
  }

  async evaluate(context: RuleContext): Promise<RuleResult> {
    const { session, monitor, now } = context;

    // Check if vehicle has arrived
    if (!session.vehicleArrivedAt) {
      return this.unknown(
        'Vehicle arrival time not yet recorded',
        { reason: 'no_arrival_time' }
      );
    }

    // If linked to a scheduled visit, check against that
    if (session.scheduledVisitId) {
      return this.pass(
        'Vehicle matched to scheduled visit',
        {
          visitId: session.scheduledVisitId,
          arrivalTime: session.vehicleArrivedAt,
        }
      );
    }

    // Check against schedule rules
    if (!monitor.scheduleRules || monitor.scheduleRules.length === 0) {
      return this.unknown(
        'No schedule rules configured',
        { reason: 'no_schedule_rules' }
      );
    }

    const arrivalDate = new Date(session.vehicleArrivedAt);
    const dayOfWeek = arrivalDate.getDay(); // 0 = Sunday
    const timeString = this.formatTime(arrivalDate);

    // Find matching schedule rule
    for (const rule of monitor.scheduleRules) {
      if (!rule.enabled) {
        continue;
      }

      // Check day of week
      if (!rule.daysOfWeek.includes(dayOfWeek)) {
        continue;
      }

      // Check time window
      const inWindow = this.isTimeInWindow(
        timeString,
        rule.startTime,
        rule.endTime,
        rule.toleranceMinutes
      );

      if (inWindow) {
        return this.pass(
          `Arrival within scheduled window: ${rule.startTime} - ${rule.endTime}`,
          {
            arrivalTime: session.vehicleArrivedAt,
            scheduleWindow: `${rule.startTime} - ${rule.endTime}`,
            dayOfWeek,
            toleranceMinutes: rule.toleranceMinutes,
          }
        );
      }
    }

    // No matching schedule found
    return this.fail(
      `Vehicle arrived outside scheduled hours: ${timeString}`,
      {
        arrivalTime: session.vehicleArrivedAt,
        arrivalTimeFormatted: timeString,
        dayOfWeek,
        configuredSchedules: monitor.scheduleRules.filter(r => r.enabled).length,
      },
      [
        {
          type: 'detection',
          id: session.vehicleTrackId || 'unknown',
          timestamp: session.vehicleArrivedAt,
        },
      ]
    );
  }

  /**
   * Format date as HH:mm
   */
  private formatTime(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  /**
   * Check if time is within window (with tolerance)
   */
  private isTimeInWindow(
    time: string,
    startTime: string,
    endTime: string,
    toleranceMinutes: number
  ): boolean {
    const timeMinutes = this.timeToMinutes(time);
    const startMinutes = this.timeToMinutes(startTime) - toleranceMinutes;
    const endMinutes = this.timeToMinutes(endTime) + toleranceMinutes;

    // Handle overnight windows (e.g., 22:00 - 02:00)
    if (endMinutes < startMinutes) {
      return timeMinutes >= startMinutes || timeMinutes <= endMinutes;
    }

    return timeMinutes >= startMinutes && timeMinutes <= endMinutes;
  }

  /**
   * Convert HH:mm to minutes since midnight
   */
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }
}

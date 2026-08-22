/**
 * Duty Roster System
 * Manages on-call schedules, shift rotations, and automatic handoffs
 * Supports multiple roster types: 24x7, business hours, rotating shifts
 */

import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

export interface DutyRoster {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  type: 'rotating' | 'fixed' | 'follow-the-sun';
  timezone: string;
  enabled: boolean;
  members: RosterMember[];
  schedule: SchedulePattern;
  handoffNotificationMinutes: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RosterMember {
  userId: string;
  username: string;
  email: string;
  order: number; // For rotation
  primary: boolean;
  active: boolean;
}

export interface SchedulePattern {
  type: 'daily' | 'weekly' | 'custom';
  shiftDurationHours: number;
  shiftsPerCycle?: number;
  startDate: Date;
  weeklyPattern?: DayPattern[];
  customPattern?: CustomShift[];
}

export interface DayPattern {
  dayOfWeek: number; // 0=Sunday, 6=Saturday
  startTime: string; // HH:MM
  endTime: string;
  enabled: boolean;
}

export interface CustomShift {
  startDate: Date;
  endDate: Date;
  userId: string;
}

export interface OnCallShift {
  id: string;
  rosterId: string;
  userId: string;
  username: string;
  startTime: Date;
  endTime: Date;
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  handedOffFrom?: string;
  handedOffTo?: string;
  handoffNotes?: string;
  createdAt: Date;
}

export interface ShiftHandoff {
  id: string;
  shiftId: string;
  fromUserId: string;
  toUserId: string;
  handoffTime: Date;
  status: 'pending' | 'acknowledged' | 'completed';
  notes?: string;
  openIncidents: number;
  pendingTasks: number;
}

export class DutyRosterService {
  private pool: Pool;
  private schedulerInterval: NodeJS.Timeout | null = null;
  private readonly SCHEDULER_INTERVAL_MS = 3600000; // 1 hour

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Start roster scheduler
   */
  start(): void {
    logger.info('Starting duty roster scheduler');
    
    this.schedulerInterval = setInterval(async () => {
      await this.scheduleUpcomingShifts();
      await this.processHandoffs();
    }, this.SCHEDULER_INTERVAL_MS);

    // Initial run
    this.scheduleUpcomingShifts();
    this.processHandoffs();
  }

  /**
   * Stop roster scheduler
   */
  stop(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
    logger.info('Duty roster scheduler stopped');
  }

  /**
   * Create duty roster
   */
  async createRoster(
    roster: Omit<DutyRoster, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<DutyRoster> {
    const result = await this.pool.query(
      `INSERT INTO duty_rosters (
        tenant_id, name, description, type, timezone,
        enabled, members, schedule, handoff_notification_minutes,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING id::text, created_at, updated_at`,
      [
        roster.tenantId,
        roster.name,
        roster.description,
        roster.type,
        roster.timezone,
        roster.enabled,
        JSON.stringify(roster.members),
        JSON.stringify(roster.schedule),
        roster.handoffNotificationMinutes || 30
      ]
    );

    const created: DutyRoster = {
      ...roster,
      id: result.rows[0].id,
      createdAt: result.rows[0].created_at,
      updatedAt: result.rows[0].updated_at
    };

    logger.info('Duty roster created', {
      rosterId: created.id,
      name: created.name
    });

    // Schedule initial shifts
    await this.scheduleRosterShifts(created);

    return created;
  }

  /**
   * Get current on-call users for a roster
   */
  async getCurrentOnCall(rosterId: string): Promise<RosterMember[]> {
    const result = await this.pool.query(
      `SELECT 
        u.id::text as "userId",
        u.username,
        u.email,
        s.id::text as "shiftId",
        s.start_time as "startTime",
        s.end_time as "endTime"
       FROM on_call_shifts s
       JOIN users u ON s.user_id = u.id
       WHERE s.roster_id = $1
         AND s.status = 'active'
         AND s.start_time <= NOW()
         AND s.end_time >= NOW()
       ORDER BY u.username`,
      [rosterId]
    );

    return result.rows.map(row => ({
      userId: row.userId,
      username: row.username,
      email: row.email,
      order: 0,
      primary: true,
      active: true
    }));
  }

  /**
   * Get upcoming shifts
   */
  async getUpcomingShifts(
    rosterId: string,
    days: number = 7
  ): Promise<OnCallShift[]> {
    const result = await this.pool.query(
      `SELECT 
        s.id::text,
        s.roster_id::text as "rosterId",
        s.user_id::text as "userId",
        u.username,
        s.start_time as "startTime",
        s.end_time as "endTime",
        s.status,
        s.handed_off_from::text as "handedOffFrom",
        s.handed_off_to::text as "handedOffTo",
        s.handoff_notes as "handoffNotes",
        s.created_at as "createdAt"
       FROM on_call_shifts s
       JOIN users u ON s.user_id = u.id
       WHERE s.roster_id = $1
         AND s.start_time <= NOW() + INTERVAL '${days} days'
         AND s.status IN ('scheduled', 'active')
       ORDER BY s.start_time`,
      [rosterId]
    );

    return result.rows;
  }

  /**
   * Schedule shifts for upcoming period
   */
  private async scheduleUpcomingShifts(): Promise<void> {
    try {
      // Get all enabled rosters
      const result = await this.pool.query(
        `SELECT 
          id::text, tenant_id::text as "tenantId", name,
          type, timezone, members, schedule
         FROM duty_rosters
         WHERE enabled = true`
      );

      for (const row of result.rows) {
        const roster: DutyRoster = {
          ...row,
          members: JSON.parse(row.members || '[]'),
          schedule: JSON.parse(row.schedule || '{}'),
          enabled: true,
          handoffNotificationMinutes: 30,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await this.scheduleRosterShifts(roster);
      }

    } catch (error) {
      logger.error('Failed to schedule shifts', { error });
    }
  }

  /**
   * Schedule shifts for a specific roster
   */
  private async scheduleRosterShifts(roster: DutyRoster): Promise<void> {
    try {
      // Get last scheduled shift
      const lastShiftResult = await this.pool.query(
        `SELECT end_time FROM on_call_shifts
         WHERE roster_id = $1
         ORDER BY end_time DESC
         LIMIT 1`,
        [roster.id]
      );

      let scheduleFrom: Date;
      
      if (lastShiftResult.rows.length > 0) {
        scheduleFrom = new Date(lastShiftResult.rows[0].end_time);
      } else {
        scheduleFrom = roster.schedule.startDate || new Date();
      }

      // Schedule next 14 days
      const scheduleTo = new Date(scheduleFrom.getTime() + 14 * 24 * 60 * 60 * 1000);

      const shifts = this.generateShifts(roster, scheduleFrom, scheduleTo);

      // Insert shifts
      for (const shift of shifts) {
        // Check if shift already exists
        const existingResult = await this.pool.query(
          `SELECT id FROM on_call_shifts
           WHERE roster_id = $1
             AND user_id = $2
             AND start_time = $3`,
          [roster.id, shift.userId, shift.startTime]
        );

        if (existingResult.rows.length === 0) {
          await this.pool.query(
            `INSERT INTO on_call_shifts (
              roster_id, user_id, start_time, end_time, status, created_at
            ) VALUES ($1, $2, $3, $4, 'scheduled', NOW())`,
            [roster.id, shift.userId, shift.startTime, shift.endTime]
          );
        }
      }

      logger.debug('Shifts scheduled', {
        rosterId: roster.id,
        count: shifts.length
      });

    } catch (error) {
      logger.error('Failed to schedule roster shifts', {
        rosterId: roster.id,
        error
      });
    }
  }

  /**
   * Generate shifts based on roster schedule
   */
  private generateShifts(
    roster: DutyRoster,
    fromDate: Date,
    toDate: Date
  ): Array<{ userId: string; startTime: Date; endTime: Date }> {
    const shifts: Array<{ userId: string; startTime: Date; endTime: Date }> = [];
    const activeMembers = roster.members.filter(m => m.active);

    if (activeMembers.length === 0) {
      return shifts;
    }

    const schedule = roster.schedule;
    let currentTime = new Date(fromDate);
    let memberIndex = 0;

    while (currentTime < toDate) {
      const member = activeMembers[memberIndex % activeMembers.length];
      
      const shiftStart = new Date(currentTime);
      const shiftEnd = new Date(
        currentTime.getTime() + schedule.shiftDurationHours * 60 * 60 * 1000
      );

      shifts.push({
        userId: member.userId,
        startTime: shiftStart,
        endTime: shiftEnd
      });

      currentTime = shiftEnd;
      memberIndex++;
    }

    return shifts;
  }

  /**
   * Process shift handoffs
   */
  private async processHandoffs(): Promise<void> {
    try {
      // Find shifts ending soon (within notification window)
      const result = await this.pool.query(
        `SELECT 
          s.id::text as "shiftId",
          s.roster_id::text as "rosterId",
          s.user_id::text as "userId",
          u.username,
          u.email,
          r.handoff_notification_minutes as "notificationMinutes",
          s.end_time as "endTime"
         FROM on_call_shifts s
         JOIN users u ON s.user_id = u.id
         JOIN duty_rosters r ON s.roster_id = r.id
         WHERE s.status = 'active'
           AND s.end_time <= NOW() + (r.handoff_notification_minutes || ' minutes')::INTERVAL
           AND s.end_time > NOW()`
      );

      for (const row of result.rows) {
        await this.initiateHandoff(row.shiftId, row.rosterId);
      }

      // Complete expired shifts
      await this.pool.query(
        `UPDATE on_call_shifts
         SET status = 'completed'
         WHERE status = 'active'
           AND end_time < NOW()`
      );

      // Activate upcoming shifts
      await this.pool.query(
        `UPDATE on_call_shifts
         SET status = 'active'
         WHERE status = 'scheduled'
           AND start_time <= NOW()`
      );

    } catch (error) {
      logger.error('Failed to process handoffs', { error });
    }
  }

  /**
   * Initiate shift handoff
   */
  private async initiateHandoff(
    currentShiftId: string,
    rosterId: string
  ): Promise<void> {
    try {
      // Get next shift
      const nextShiftResult = await this.pool.query(
        `SELECT 
          id::text,
          user_id::text as "userId",
          start_time as "startTime"
         FROM on_call_shifts
         WHERE roster_id = $1
           AND status = 'scheduled'
           AND start_time > (
             SELECT end_time FROM on_call_shifts WHERE id = $2
           )
         ORDER BY start_time
         LIMIT 1`,
        [rosterId, currentShiftId]
      );

      if (nextShiftResult.rows.length === 0) {
        return;
      }

      const nextShift = nextShiftResult.rows[0];

      // Count open incidents and pending tasks
      const statsResult = await this.pool.query(
        `SELECT 
          COUNT(*) FILTER (WHERE status = 'open') as open_incidents,
          COUNT(*) FILTER (WHERE status = 'pending') as pending_tasks
         FROM analytics_alerts
         WHERE assigned_to = (
           SELECT user_id FROM on_call_shifts WHERE id = $1
         )`,
        [currentShiftId]
      );

      const stats = statsResult.rows[0] || { open_incidents: 0, pending_tasks: 0 };

      // Create handoff record
      await this.pool.query(
        `INSERT INTO shift_handoffs (
          shift_id, from_user_id, to_user_id,
          handoff_time, status, open_incidents, pending_tasks,
          created_at
        ) VALUES (
          $1,
          (SELECT user_id FROM on_call_shifts WHERE id = $1),
          $2,
          $3,
          'pending',
          $4,
          $5,
          NOW()
        )`,
        [
          currentShiftId,
          nextShift.userId,
          nextShift.startTime,
          parseInt(stats.open_incidents),
          parseInt(stats.pending_tasks)
        ]
      );

      logger.info('Shift handoff initiated', {
        currentShiftId,
        nextShiftId: nextShift.id,
        openIncidents: stats.open_incidents
      });

    } catch (error) {
      logger.error('Failed to initiate handoff', { currentShiftId, error });
    }
  }

  /**
   * Acknowledge shift handoff
   */
  async acknowledgeHandoff(
    handoffId: string,
    userId: string,
    notes?: string
  ): Promise<boolean> {
    try {
      const result = await this.pool.query(
        `UPDATE shift_handoffs
         SET status = 'acknowledged',
             notes = $1,
             acknowledged_at = NOW()
         WHERE id = $2
           AND to_user_id = $3
           AND status = 'pending'
         RETURNING id`,
        [notes, handoffId, userId]
      );

      if (result.rowCount === 0) {
        return false;
      }

      logger.info('Shift handoff acknowledged', { handoffId, userId });
      return true;

    } catch (error) {
      logger.error('Failed to acknowledge handoff', { handoffId, error });
      return false;
    }
  }

  /**
   * Get roster statistics
   */
  async getRosterStatistics(
    rosterId: string,
    days: number = 30
  ): Promise<any> {
    const result = await this.pool.query(
      `SELECT 
        COUNT(*) as total_shifts,
        COUNT(DISTINCT user_id) as unique_operators,
        AVG(EXTRACT(EPOCH FROM (end_time - start_time))/3600) as avg_shift_hours,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_shifts,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_shifts
       FROM on_call_shifts
       WHERE roster_id = $1
         AND created_at > NOW() - INTERVAL '${days} days'`,
      [rosterId]
    );

    return result.rows[0];
  }

  /**
   * Update roster member availability
   */
  async updateMemberAvailability(
    rosterId: string,
    userId: string,
    active: boolean
  ): Promise<boolean> {
    try {
      const result = await this.pool.query(
        `UPDATE duty_rosters
         SET members = jsonb_set(
           members,
           (SELECT path FROM jsonb_array_elements(members) WITH ORDINALITY arr(item, idx)
            WHERE item->>'userId' = $2
            LIMIT 1),
           jsonb_set(
             (SELECT item FROM jsonb_array_elements(members) item
              WHERE item->>'userId' = $2 LIMIT 1),
             '{active}',
             to_jsonb($3::boolean)
           )
         ),
         updated_at = NOW()
         WHERE id = $1
         RETURNING id`,
        [rosterId, userId, active]
      );

      return result.rowCount! > 0;

    } catch (error) {
      logger.error('Failed to update member availability', {
        rosterId,
        userId,
        error
      });
      return false;
    }
  }
}

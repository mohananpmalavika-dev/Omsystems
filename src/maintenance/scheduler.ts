import { setInterval } from 'node:timers';

export function startMaintenanceScheduler(store: any, logger: any) {
  // Run every 30 seconds to detect due schedules and create visits
  const tickMs = 30_000;
  const id = setInterval(async () => {
    try {
      const now = new Date().toISOString();
      const schedules = await store.listMaintenanceSchedules('omsystems');
      for (const s of schedules) {
        if (!s.nextRunAt) continue;
        if (s.nextRunAt <= now) {
          // create visit
          await store.createMaintenanceVisit({ tenantId: s.tenantId, scheduleId: s.id, dueAt: now, createdBy: 'system-scheduler' });
          // advance nextRunAt based on cadence
          const cadence = s.cadence || 'daily';
          const next = new Date(s.nextRunAt);
          if (cadence === 'daily') next.setDate(next.getDate() + 1);
          else if (cadence === 'weekly') next.setDate(next.getDate() + 7);
          else if (cadence === 'monthly') next.setMonth(next.getMonth() + 1);
          else if (cadence === 'quarterly') next.setMonth(next.getMonth() + 3);
          else if (cadence === 'annual') next.setFullYear(next.getFullYear() + 1);
          s.nextRunAt = next.toISOString();
          s.updatedAt = new Date().toISOString();
        }
      }
    } catch (err) {
      logger?.error?.('maintenance-scheduler', err);
    }
  }, tickMs);

  return () => clearInterval(id);
}

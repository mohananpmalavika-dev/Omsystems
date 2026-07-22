/**
 * Shift Management Routes
 */

import { Router } from "express";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import type { ShiftRepository } from "../database/shift-repository.js";

const shiftSchema = z.object({
  shiftName: z.string().min(1).max(100),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  daysOfWeek: z.array(z.number().min(0).max(6)).min(1),
});

const assignmentSchema = z.object({
  shiftId: z.string().uuid(),
  operatorId: z.string().uuid(),
  operatorName: z.string().min(1),
  assignedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(1000).optional(),
});

const handoverSchema = z.object({
  outgoingOperatorId: z.string().uuid(),
  outgoingOperatorName: z.string().min(1),
  incomingOperatorId: z.string().uuid(),
  incomingOperatorName: z.string().min(1),
  shiftStart: z.string(),
  shiftEnd: z.string(),
  handoverNotes: z.string().max(5000).optional(),
});

const handoverItemSchema = z.object({
  itemType: z.enum([
    "open_incident",
    "alert",
    "offline_camera",
    "storage_warning",
    "maintenance",
    "bookmark",
    "escalation",
    "system_issue",
    "other",
  ]),
  itemId: z.string().uuid().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  description: z.string().min(1).max(1000),
});

export function createShiftRoutes(
  store: ControlPlaneStore,
  shiftRepo: ShiftRepository
): Router {
  const router = Router();

  // ============ SHIFTS ============

  router.get("/v1/shifts", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const shifts = await shiftRepo.listShifts(user.tenantId);
      res.status(200).json(shifts);
    } catch (error) {
      next(error);
    }
  });

  router.post("/v1/shifts", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const input = shiftSchema.parse(req.body);

      const shift = await shiftRepo.createShift({
        tenantId: user.tenantId,
        ...input,
      });

      await store.writeAudit({
        tenantId: user.tenantId,
        eventType: "shift_created",
        userId: user.id,
        resourceType: "shift",
        resourceId: shift.id,
        action: "create",
        outcome: "success",
        metadata: { shiftName: input.shiftName },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        occurredAt: new Date().toISOString(),
      });

      res.status(201).json(shift);
    } catch (error) {
      next(error);
    }
  });

  router.patch("/v1/shifts/:id", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const { id } = req.params;
      const updates = shiftSchema.partial().parse(req.body);

      const shift = await shiftRepo.updateShift(id, user.tenantId, updates);

      if (!shift) {
        return res.status(404).json({ error: "shift_not_found" });
      }

      res.status(200).json(shift);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/v1/shifts/:id", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const { id } = req.params;
      const deleted = await shiftRepo.deleteShift(id, user.tenantId);

      if (!deleted) {
        return res.status(404).json({ error: "shift_not_found" });
      }

      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // ============ ASSIGNMENTS ============

  router.get("/v1/shifts/assignments", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const filters = {
        operatorId: req.query.operatorId as string | undefined,
        shiftId: req.query.shiftId as string | undefined,
        fromDate: req.query.fromDate as string | undefined,
        toDate: req.query.toDate as string | undefined,
        status: req.query.status as string | undefined,
      };

      const assignments = await shiftRepo.listAssignments(user.tenantId, filters);
      res.status(200).json(assignments);
    } catch (error) {
      next(error);
    }
  });

  router.post("/v1/shifts/assignments", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const input = assignmentSchema.parse(req.body);

      const assignment = await shiftRepo.createAssignment({
        tenantId: user.tenantId,
        ...input,
      });

      res.status(201).json(assignment);
    } catch (error) {
      next(error);
    }
  });

  router.post("/v1/shifts/assignments/:id/clock-in", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const { id } = req.params;
      const assignment = await shiftRepo.clockIn(id, user.tenantId);

      if (!assignment) {
        return res.status(404).json({ error: "assignment_not_found_or_already_started" });
      }

      await store.writeAudit({
        tenantId: user.tenantId,
        eventType: "shift_clock_in",
        userId: user.id,
        resourceType: "shift_assignment",
        resourceId: id,
        action: "clock_in",
        outcome: "success",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        occurredAt: new Date().toISOString(),
      });

      res.status(200).json(assignment);
    } catch (error) {
      next(error);
    }
  });

  router.post("/v1/shifts/assignments/:id/clock-out", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const { id } = req.params;
      const assignment = await shiftRepo.clockOut(id, user.tenantId);

      if (!assignment) {
        return res.status(404).json({ error: "assignment_not_found_or_not_active" });
      }

      await store.writeAudit({
        tenantId: user.tenantId,
        eventType: "shift_clock_out",
        userId: user.id,
        resourceType: "shift_assignment",
        resourceId: id,
        action: "clock_out",
        outcome: "success",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        occurredAt: new Date().toISOString(),
      });

      res.status(200).json(assignment);
    } catch (error) {
      next(error);
    }
  });

  // ============ HANDOVERS ============

  router.get("/v1/shifts/handovers", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const filters = {
        incomingOperatorId: req.query.incomingOperatorId as string | undefined,
        outgoingOperatorId: req.query.outgoingOperatorId as string | undefined,
        unacknowledged: req.query.unacknowledged === "true",
      };

      const handovers = await shiftRepo.listHandovers(user.tenantId, filters);
      res.status(200).json(handovers);
    } catch (error) {
      next(error);
    }
  });

  router.get("/v1/shifts/handovers/pending", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const handovers = await shiftRepo.listHandovers(user.tenantId, {
        incomingOperatorId: user.id,
        unacknowledged: true,
      });

      if (handovers.length === 0) {
        return res.status(404).json({ error: "no_pending_handover" });
      }

      const latestHandover = handovers[0];
      const items = await shiftRepo.listHandoverItems(latestHandover.id);

      res.status(200).json({
        ...latestHandover,
        items,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/v1/shifts/handovers/:id", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const { id } = req.params;
      const handover = await shiftRepo.getHandover(id, user.tenantId);

      if (!handover) {
        return res.status(404).json({ error: "handover_not_found" });
      }

      const items = await shiftRepo.listHandoverItems(id);

      res.status(200).json({
        ...handover,
        items,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/v1/shifts/handovers", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const input = handoverSchema.parse(req.body);

      const handover = await shiftRepo.createHandover({
        tenantId: user.tenantId,
        ...input,
      });

      await store.writeAudit({
        tenantId: user.tenantId,
        eventType: "shift_handover_created",
        userId: user.id,
        resourceType: "shift_handover",
        resourceId: handover.id,
        action: "create",
        outcome: "success",
        metadata: {
          from: input.outgoingOperatorName,
          to: input.incomingOperatorName,
        },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        occurredAt: new Date().toISOString(),
      });

      res.status(201).json(handover);
    } catch (error) {
      next(error);
    }
  });

  router.post("/v1/shifts/handovers/:id/acknowledge", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const { id } = req.params;
      const handover = await shiftRepo.acknowledgeHandover(id, user.tenantId, user.id);

      if (!handover) {
        return res.status(404).json({ error: "handover_not_found" });
      }

      await store.writeAudit({
        tenantId: user.tenantId,
        eventType: "shift_handover_acknowledged",
        userId: user.id,
        resourceType: "shift_handover",
        resourceId: id,
        action: "acknowledge",
        outcome: "success",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        occurredAt: new Date().toISOString(),
      });

      res.status(200).json(handover);
    } catch (error) {
      next(error);
    }
  });

  // ============ HANDOVER ITEMS ============

  router.post("/v1/shifts/handovers/:handoverId/items", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const { handoverId } = req.params;
      const input = handoverItemSchema.parse(req.body);

      // Verify handover exists and belongs to tenant
      const handover = await shiftRepo.getHandover(handoverId, user.tenantId);
      if (!handover) {
        return res.status(404).json({ error: "handover_not_found" });
      }

      const item = await shiftRepo.createHandoverItem({
        handoverId,
        ...input,
      });

      res.status(201).json(item);
    } catch (error) {
      next(error);
    }
  });

  router.put("/v1/shifts/handover-items/:id/status", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const { id } = req.params;
      const { status } = z
        .object({ status: z.enum(["pending", "acknowledged", "resolved", "transferred"]) })
        .parse(req.body);

      const item = await shiftRepo.updateHandoverItemStatus(
        id,
        status,
        status === "resolved" ? user.id : undefined
      );

      if (!item) {
        return res.status(404).json({ error: "item_not_found" });
      }

      res.status(200).json(item);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

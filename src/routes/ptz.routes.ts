/**
 * PTZ Control Routes
 */

import { Router } from "express";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import type { PtzRepository } from "../database/ptz-repository.js";
import { OnvifPtzService } from "../services/onvif-ptz-service.js";
import { authorize } from "../domain/authorization.js";
import type { PtzCommand } from "../domain/ptz.js";

const ptzCommandSchema = z.object({
  action: z.enum(["move", "zoom", "focus", "preset", "patrol", "home", "stop"]),
  direction: z.enum(["left", "right", "up", "down"]).optional(),
  zoomAction: z.enum(["in", "out", "stop"]).optional(),
  focusAction: z.enum(["near", "far", "auto", "stop"]).optional(),
  presetId: z.number().optional(),
  patrolId: z.number().optional(),
  speed: z.object({
    pan: z.number().min(0).max(1).optional(),
    tilt: z.number().min(0).max(1).optional(),
    zoom: z.number().min(0).max(1).optional(),
  }).optional(),
});

const ptzPresetSchema = z.object({
  presetNumber: z.number().min(1).max(256),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  position: z.object({
    pan: z.number(),
    tilt: z.number(),
    zoom: z.number(),
  }).optional(),
});

const ptzPatrolSchema = z.object({
  patrolNumber: z.number().min(1).max(32),
  name: z.string().min(1).max(100),
  presets: z.array(z.object({
    presetNumber: z.number().min(1),
    dwellSeconds: z.number().min(1).max(300),
    speed: z.number().min(0.1).max(1),
  })),
  repeat: z.boolean(),
  enabled: z.boolean(),
});

export function createPtzRoutes(
  store: ControlPlaneStore,
  ptzRepo: PtzRepository,
): Router {
  const router = Router();
  const ptzService = new OnvifPtzService();

  // ============ PTZ COMMAND EXECUTION ============

  router.post("/v1/cameras/:cameraId/ptz/command", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const { cameraId } = req.params;
      const camera = await store.getCamera(cameraId);
      if (!camera) return res.status(404).json({ error: "camera_not_found" });

      const cameraNode = await store.getNode(camera.nodeId);
      if (!cameraNode) return res.status(404).json({ error: "node_not_found" });

      const authResult = authorize(user, "ptz:operate", cameraNode, await store.listAccessibleNodes(user, "ptz:operate"), []);
      if (!authResult.allowed) {
        return res.status(403).json({ error: "forbidden", reason: authResult.reason });
      }

      if (!camera.capabilities.ptz) {
        return res.status(400).json({ error: "ptz_not_supported" });
      }

      // Check PTZ lock
      const currentLock = await ptzRepo.getCurrentLock(cameraId);
      if (currentLock && currentLock.operatorId !== user.id) {
        return res.status(409).json({
          error: "camera_locked",
          lockedBy: currentLock.operatorName,
          expiresAt: currentLock.expiresAt,
        });
      }

      const command = ptzCommandSchema.parse(req.body) as PtzCommand;
      command.cameraId = cameraId;

      const result = await ptzService.executeCommand(
        camera.connectionSecretRef,
        command,
      );

      if (!result.success) {
        return res.status(400).json({ error: "command_failed", message: result.message });
      }

      // Audit log
      await store.writeAudit({
        tenantId: user.tenantId,
        eventType: "ptz_command",
        userId: user.id,
        resourceType: "camera",
        resourceId: cameraId,
        action: "ptz:operate",
        outcome: "success",
        metadata: { command: command.action, direction: command.direction },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        occurredAt: new Date().toISOString(),
      });

      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // ============ PTZ LOCK MANAGEMENT ============

  router.post("/v1/cameras/:cameraId/ptz/lock", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const { cameraId } = req.params;
      const camera = await store.getCamera(cameraId);
      if (!camera) return res.status(404).json({ error: "camera_not_found" });

      const cameraNode = await store.getNode(camera.nodeId);
      if (!cameraNode) return res.status(404).json({ error: "node_not_found" });

      const authResult = authorize(user, "ptz:operate", cameraNode, await store.listAccessibleNodes(user, "ptz:operate"), []);
      if (!authResult.allowed) {
        return res.status(403).json({ error: "forbidden" });
      }

      const durationSeconds = z.number().min(60).max(3600).optional().parse(req.body.durationSeconds) ?? 300;
      const sessionId = z.string().min(1).parse(req.body.sessionId);

      const lock = await ptzRepo.acquireLock(
        cameraId,
        user.id,
        user.displayName,
        sessionId,
        durationSeconds,
      );

      if ("error" in lock) {
        return res.status(409).json(lock);
      }

      res.status(201).json(lock);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/v1/cameras/:cameraId/ptz/lock", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const { cameraId } = req.params;
      const released = await ptzRepo.releaseLock(cameraId, user.id);

      if (!released) {
        return res.status(404).json({ error: "lock_not_found" });
      }

      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  router.get("/v1/cameras/:cameraId/ptz/lock", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const { cameraId } = req.params;
      const camera = await store.getCamera(cameraId);
      if (!camera) return res.status(404).json({ error: "camera_not_found" });

      const lock = await ptzRepo.getCurrentLock(cameraId);
      if (!lock) {
        return res.status(404).json({ error: "no_active_lock" });
      }

      res.status(200).json(lock);
    } catch (error) {
      next(error);
    }
  });

  router.post("/v1/cameras/:cameraId/ptz/lock/extend", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const { cameraId } = req.params;
      const additionalSeconds = z.number().min(60).max(600).parse(req.body.additionalSeconds);

      const lock = await ptzRepo.extendLock(cameraId, user.id, additionalSeconds);
      if (!lock) {
        return res.status(404).json({ error: "lock_not_found" });
      }

      res.status(200).json(lock);
    } catch (error) {
      next(error);
    }
  });

  // ============ PTZ PRESETS ============

  router.get("/v1/cameras/:cameraId/ptz/presets", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const { cameraId } = req.params;
      const camera = await store.getCamera(cameraId);
      if (!camera) return res.status(404).json({ error: "camera_not_found" });

      const cameraNode = await store.getNode(camera.nodeId);
      if (!cameraNode) return res.status(404).json({ error: "node_not_found" });

      const authResult = authorize(user, "live:view", cameraNode, await store.listAccessibleNodes(user, "live:view"), []);
      if (!authResult.allowed) {
        return res.status(403).json({ error: "forbidden" });
      }

      const presets = await ptzRepo.listPresets(cameraId);
      res.status(200).json(presets);
    } catch (error) {
      next(error);
    }
  });

  router.post("/v1/cameras/:cameraId/ptz/presets", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const { cameraId } = req.params;
      const camera = await store.getCamera(cameraId);
      if (!camera) return res.status(404).json({ error: "camera_not_found" });

      const cameraNode = await store.getNode(camera.nodeId);
      if (!cameraNode) return res.status(404).json({ error: "node_not_found" });

      const authResult = authorize(user, "ptz:operate", cameraNode, await store.listAccessibleNodes(user, "ptz:operate"), []);
      if (!authResult.allowed) {
        return res.status(403).json({ error: "forbidden" });
      }

      const input = ptzPresetSchema.parse(req.body);

      const preset = await ptzRepo.createPreset({
        cameraId,
        tenantId: user.tenantId,
        ...input,
        createdBy: user.id,
      });

      res.status(201).json(preset);
    } catch (error) {
      next(error);
    }
  });

  router.patch("/v1/cameras/:cameraId/ptz/presets/:presetId", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const { presetId } = req.params;
      const updates = ptzPresetSchema.partial().parse(req.body);

      const preset = await ptzRepo.updatePreset(presetId, user.tenantId, updates);
      if (!preset) {
        return res.status(404).json({ error: "preset_not_found" });
      }

      res.status(200).json(preset);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/v1/cameras/:cameraId/ptz/presets/:presetId", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const { presetId } = req.params;
      const deleted = await ptzRepo.deletePreset(presetId, user.tenantId);

      if (!deleted) {
        return res.status(404).json({ error: "preset_not_found" });
      }

      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // ============ PTZ PATROLS ============

  router.get("/v1/cameras/:cameraId/ptz/patrols", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const { cameraId } = req.params;
      const camera = await store.getCamera(cameraId);
      if (!camera) return res.status(404).json({ error: "camera_not_found" });

      const cameraNode = await store.getNode(camera.nodeId);
      if (!cameraNode) return res.status(404).json({ error: "node_not_found" });

      const authResult = authorize(user, "live:view", cameraNode, await store.listAccessibleNodes(user, "live:view"), []);
      if (!authResult.allowed) {
        return res.status(403).json({ error: "forbidden" });
      }

      const patrols = await ptzRepo.listPatrols(cameraId);
      res.status(200).json(patrols);
    } catch (error) {
      next(error);
    }
  });

  router.post("/v1/cameras/:cameraId/ptz/patrols", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const { cameraId } = req.params;
      const camera = await store.getCamera(cameraId);
      if (!camera) return res.status(404).json({ error: "camera_not_found" });

      const cameraNode = await store.getNode(camera.nodeId);
      if (!cameraNode) return res.status(404).json({ error: "node_not_found" });

      const authResult = authorize(user, "ptz:operate", cameraNode, await store.listAccessibleNodes(user, "ptz:operate"), []);
      if (!authResult.allowed) {
        return res.status(403).json({ error: "forbidden" });
      }

      const input = ptzPatrolSchema.parse(req.body);

      const patrol = await ptzRepo.createPatrol({
        cameraId,
        tenantId: user.tenantId,
        ...input,
        createdBy: user.id,
      });

      res.status(201).json(patrol);
    } catch (error) {
      next(error);
    }
  });

  router.patch("/v1/cameras/:cameraId/ptz/patrols/:patrolId", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const { patrolId } = req.params;
      const updates = ptzPatrolSchema.partial().parse(req.body);

      const patrol = await ptzRepo.updatePatrol(patrolId, user.tenantId, updates);
      if (!patrol) {
        return res.status(404).json({ error: "patrol_not_found" });
      }

      res.status(200).json(patrol);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/v1/cameras/:cameraId/ptz/patrols/:patrolId", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const { patrolId } = req.params;
      const deleted = await ptzRepo.deletePatrol(patrolId, user.tenantId);

      if (!deleted) {
        return res.status(404).json({ error: "patrol_not_found" });
      }

      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // ============ PTZ CAPABILITIES ============

  router.get("/v1/cameras/:cameraId/ptz/capabilities", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const { cameraId } = req.params;
      const camera = await store.getCamera(cameraId);
      if (!camera) return res.status(404).json({ error: "camera_not_found" });

      const cameraNode = await store.getNode(camera.nodeId);
      if (!cameraNode) return res.status(404).json({ error: "node_not_found" });

      const authResult = authorize(user, "live:view", cameraNode, await store.listAccessibleNodes(user, "live:view"), []);
      if (!authResult.allowed) {
        return res.status(403).json({ error: "forbidden" });
      }

      if (!camera.capabilities.ptz) {
        return res.status(400).json({ error: "ptz_not_supported" });
      }

      const capabilities = await ptzService.getCapabilities(camera.connectionSecretRef);
      res.status(200).json(capabilities);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

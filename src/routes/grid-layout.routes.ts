/**
 * Grid Layout Management Routes
 */

import { Router } from "express";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import type { GridLayoutRepository } from "../database/grid-layout-repository.js";

const gridLayoutSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  gridSize: z.enum(["1x1", "2x2", "3x3", "4x4", "5x5", "6x6"]),
  cameraPositions: z.array(
    z.object({
      position: z.number().min(0),
      cameraId: z.string().uuid(),
      stream: z.enum(["main", "sub"]),
    })
  ),
  isDefault: z.boolean().optional(),
});

export function createGridLayoutRoutes(
  store: ControlPlaneStore,
  gridRepo: GridLayoutRepository
): Router {
  const router = Router();

  // List all layouts for tenant
  router.get("/v1/grids/layouts", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const layouts = await gridRepo.listLayouts(user.tenantId);
      res.status(200).json(layouts);
    } catch (error) {
      next(error);
    }
  });

  // Get specific layout
  router.get("/v1/grids/layouts/:id", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const { id } = req.params;
      const layout = await gridRepo.getLayout(id, user.tenantId);

      if (!layout) {
        return res.status(404).json({ error: "layout_not_found" });
      }

      res.status(200).json(layout);
    } catch (error) {
      next(error);
    }
  });

  // Get default layout
  router.get("/v1/grids/layouts/default", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const layout = await gridRepo.getDefaultLayout(user.tenantId);

      if (!layout) {
        return res.status(404).json({ error: "no_default_layout" });
      }

      res.status(200).json(layout);
    } catch (error) {
      next(error);
    }
  });

  // Create new layout
  router.post("/v1/grids/layouts", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const input = gridLayoutSchema.parse(req.body);

      // Verify all cameras belong to tenant
      for (const pos of input.cameraPositions) {
        const camera = await store.getCamera(pos.cameraId);
        if (!camera) {
          return res.status(400).json({
            error: "invalid_camera",
            cameraId: pos.cameraId,
          });
        }

        const cameraNode = await store.getNode(camera.nodeId);
        if (!cameraNode || cameraNode.tenantId !== user.tenantId) {
          return res.status(403).json({
            error: "forbidden",
            cameraId: pos.cameraId,
          });
        }
      }

      const layout = await gridRepo.createLayout({
        tenantId: user.tenantId,
        ...input,
        createdBy: user.id,
      });

      await store.writeAudit({
        tenantId: user.tenantId,
        eventType: "grid_layout_created",
        userId: user.id,
        resourceType: "grid_layout",
        resourceId: layout.id,
        action: "create",
        outcome: "success",
        metadata: { name: input.name, gridSize: input.gridSize },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        occurredAt: new Date().toISOString(),
      });

      res.status(201).json(layout);
    } catch (error) {
      next(error);
    }
  });

  // Update layout
  router.patch("/v1/grids/layouts/:id", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const { id } = req.params;
      const updates = gridLayoutSchema.partial().parse(req.body);

      // Verify cameras if provided
      if (updates.cameraPositions) {
        for (const pos of updates.cameraPositions) {
          const camera = await store.getCamera(pos.cameraId);
          if (!camera) {
            return res.status(400).json({
              error: "invalid_camera",
              cameraId: pos.cameraId,
            });
          }

          const cameraNode = await store.getNode(camera.nodeId);
          if (!cameraNode || cameraNode.tenantId !== user.tenantId) {
            return res.status(403).json({
              error: "forbidden",
              cameraId: pos.cameraId,
            });
          }
        }
      }

      const layout = await gridRepo.updateLayout(id, user.tenantId, updates);

      if (!layout) {
        return res.status(404).json({ error: "layout_not_found" });
      }

      await store.writeAudit({
        tenantId: user.tenantId,
        eventType: "grid_layout_updated",
        userId: user.id,
        resourceType: "grid_layout",
        resourceId: id,
        action: "update",
        outcome: "success",
        metadata: updates,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        occurredAt: new Date().toISOString(),
      });

      res.status(200).json(layout);
    } catch (error) {
      next(error);
    }
  });

  // Delete layout
  router.delete("/v1/grids/layouts/:id", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const { id } = req.params;
      const deleted = await gridRepo.deleteLayout(id, user.tenantId);

      if (!deleted) {
        return res.status(404).json({ error: "layout_not_found" });
      }

      await store.writeAudit({
        tenantId: user.tenantId,
        eventType: "grid_layout_deleted",
        userId: user.id,
        resourceType: "grid_layout",
        resourceId: id,
        action: "delete",
        outcome: "success",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        occurredAt: new Date().toISOString(),
      });

      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

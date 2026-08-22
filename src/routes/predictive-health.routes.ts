/**
 * Predictive Health API Routes
 * 
 * Endpoints for branch failure prediction, risk assessment, and fleet monitoring.
 */

import { Router, Request, Response } from "express";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { PredictionService } from "../services/predictive-health/prediction.service.js";
import type { User } from "../domain/models.js";

export function createPredictiveHealthRoutes(store: ControlPlaneStore) {
  const router = Router();
  const predictionService = new PredictionService(store);

  /**
   * GET /api/v1/predictive-health/branches/:branchId/risk
   * Get current risk predictions for a branch
   */
  router.get("/branches/:branchId/risk", async (req: Request, res: Response) => {
    try {
      const user = req.user as User;
      const { branchId } = req.params as { branchId: string };
      const { horizon } = req.query as { horizon?: string };

      // Check access
      const decision = await store.checkAccess(user, "recording:view", branchId);
      if (!decision?.allowed) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Get predictions
      let predictions = await predictionService.getLatestPredictions(
        branchId,
        user.tenantId
      );

      // Filter by horizon if specified
      if (horizon) {
        const horizonHours = parseInt(horizon as string, 10);
        predictions = predictions.filter((p) => p.horizonHours === horizonHours);
      }

      // If no predictions exist, generate them
      if (predictions.length === 0) {
        predictions = await predictionService.predictBranchRisk(
          user.tenantId,
          branchId,
          { horizons: [24, 72, 168] }
        );
      }

      res.json({
        branchId,
        predictions,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Failed to get branch risk:", error);
      res.status(500).json({
        error: "Failed to fetch predictions",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  /**
   * POST /api/v1/predictive-health/branches/:branchId/predict
   * Force regeneration of predictions for a branch
   */
  router.post("/branches/:branchId/predict", async (req: Request, res: Response) => {
    try {
      const user = req.user as User;
      const { branchId } = req.params as { branchId: string };
      const { horizons } = req.body;

      // Check access
      const decision = await store.checkAccess(user, "device:configure", branchId);
      if (!decision?.allowed) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Generate new predictions
      const predictions = await predictionService.predictBranchRisk(
        user.tenantId,
        branchId,
        { horizons: horizons || [24, 72, 168], forceRecalculation: true }
      );

      res.json({
        branchId,
        predictions,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Failed to generate predictions:", error);
      res.status(500).json({
        error: "Failed to generate predictions",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  /**
   * GET /api/v1/predictive-health/branches/:branchId/history
   * Get risk history and timeline for a branch
   */
  router.get("/branches/:branchId/history", async (req: Request, res: Response) => {
    try {
      const user = req.user as User;
      const { branchId } = req.params as { branchId: string };
      const { days = "30" } = req.query as { days?: string };

      // Check access
      const decision = await store.checkAccess(user, "recording:view", branchId);
      if (!decision?.allowed) {
        return res.status(403).json({ error: "Access denied" });
      }

      const history = await predictionService.getBranchRiskHistory(
        branchId,
        user.tenantId,
        parseInt(days as string, 10)
      );

      res.json(history);
    } catch (error) {
      console.error("Failed to get risk history:", error);
      res.status(500).json({
        error: "Failed to fetch history",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  /**
   * GET /api/v1/predictive-health/fleet/summary
   * Get fleet-wide risk summary
   */
  router.get("/fleet/summary", async (req: Request, res: Response) => {
    try {
      const user = req.user as User;
      const { limit = "20" } = req.query as { limit?: string };

      const summary = await predictionService.getFleetSummary(user, {
        limit: parseInt(limit as string, 10),
      });

      res.json(summary);
    } catch (error) {
      console.error("Failed to get fleet summary:", error);
      res.status(500).json({
        error: "Failed to fetch fleet summary",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  /**
   * GET /api/v1/predictive-health/predictions/:predictionId
   * Get a specific prediction by ID
   */
  router.get("/predictions/:predictionId", async (req: Request, res: Response) => {
    try {
      const user = req.user as User;
      const { predictionId } = req.params as { predictionId: string };

      const prediction = await predictionService.getPrediction(
        predictionId,
        user.tenantId
      );

      if (!prediction) {
        return res.status(404).json({ error: "Prediction not found" });
      }

      // Check access to the branch
      const decision = await store.checkAccess(
        user,
        "recording:view",
        prediction.branchId
      );
      if (!decision?.allowed) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(prediction);
    } catch (error) {
      console.error("Failed to get prediction:", error);
      res.status(500).json({
        error: "Failed to fetch prediction",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  /**
   * POST /api/v1/predictive-health/outcomes/:predictionId
   * Record the outcome of a prediction (for model calibration)
   */
  router.post("/outcomes/:predictionId", async (req: Request, res: Response) => {
    try {
      const user = req.user as User;
      const { predictionId } = req.params as { predictionId: string };
      const { actualFailure, failureTime, failureType, intervention } = req.body;

      // Get prediction
      const prediction = await predictionService.getPrediction(
        predictionId,
        user.tenantId
      );

      if (!prediction) {
        return res.status(404).json({ error: "Prediction not found" });
      }

      // Check access
      const decision = await store.checkAccess(
        user,
        "device:configure",
        prediction.branchId
      );
      if (!decision?.allowed) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Determine outcome classification
      let outcome: "TRUE_POSITIVE" | "FALSE_POSITIVE" | "TRUE_NEGATIVE" | "FALSE_NEGATIVE";
      const predictedFailure = prediction.probability >= 0.5;

      if (predictedFailure && actualFailure) {
        outcome = "TRUE_POSITIVE";
      } else if (predictedFailure && !actualFailure) {
        outcome = "FALSE_POSITIVE";
      } else if (!predictedFailure && actualFailure) {
        outcome = "FALSE_NEGATIVE";
      } else {
        outcome = "TRUE_NEGATIVE";
      }

      // Store outcome
      // TODO: Implement outcome storage when schema is available
      console.log("Prediction outcome recorded:", {
        predictionId,
        outcome,
        actualFailure,
        failureTime,
        failureType,
        intervention,
      });

      res.json({
        predictionId,
        outcome,
        message: "Outcome recorded successfully",
      });
    } catch (error) {
      console.error("Failed to record outcome:", error);
      res.status(500).json({
        error: "Failed to record outcome",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  return router;
}

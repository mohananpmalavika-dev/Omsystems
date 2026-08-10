/**
 * Predictive Health API Routes
 * 
 * Endpoints for branch failure prediction, risk assessment, and fleet monitoring.
 */

import { Router } from "express";
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
  router.get("/branches/:branchId/risk", async (req, res) => {
    try {
      const user = req.user as User;
      const { branchId } = req.params;
      const { horizon } = req.query;

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
  router.post("/branches/:branchId/predict", async (req, res) => {
    try {
      const user = req.user as User;
      const { branchId } = req.params;
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
  router.get("/branches/:branchId/history", async (req, res) => {
    try {
      const user = req.user as User;
      const { branchId } = req.params;
      const { days = "30" } = req.query;

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
  router.get("/fleet/summary", async (req, res) => {
    try {
      const user = req.user as User;
      const { limit = "20" } = req.query;

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
  router.get("/predictions/:predictionId", async (req, res) => {
    try {
      const user = req.user as User;
      const { predictionId } = req.params;

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
  router.post("/outcomes/:predictionId", async (req, res) => {
    try {
      const user = req.user as User;
      const { predictionId } = req.params;
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
      await store.execute(
        `INSERT INTO prediction_outcomes (
          id, prediction_id, branch_id, tenant_id,
          predicted_at, evaluated_at,
          prediction_target, prediction_horizon_hours,
          prediction_probability, prediction_risk_level, prediction_confidence,
          actual_failure, actual_failure_time, actual_failure_type,
          intervention_action_taken, intervention_action_type, intervention_action_time,
          outcome, outcome_data
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, NOW(),
          $5, $6, $7, $8, $9,
          $10, $11, $12,
          $13, $14, $15,
          $16, $17
        )`,
        [
          predictionId,
          prediction.branchId,
          prediction.tenantId,
          prediction.generatedAt,
          prediction.target,
          prediction.horizonHours,
          prediction.probability,
          prediction.riskLevel,
          prediction.confidence,
          actualFailure,
          failureTime || null,
          failureType || null,
          intervention?.actionTaken || false,
          intervention?.actionType || null,
          intervention?.actionTime || null,
          outcome,
          JSON.stringify({ actualFailure, failureTime, failureType, intervention, outcome }),
        ]
      );

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

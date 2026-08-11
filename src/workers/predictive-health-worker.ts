/**
 * Predictive Health Background Worker
 * 
 * Periodically generates branch health predictions for all active branches.
 * Runs every 10 minutes to keep predictions fresh and emits real-time updates.
 */

import type { ControlPlaneStore } from "../control-plane-store.js";
import { PredictionService } from "../services/predictive-health/prediction.service.js";

export class PredictiveHealthWorker {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private predictionService: PredictionService;

  constructor(
    private readonly store: ControlPlaneStore,
    private readonly websocketService?: any,
    private readonly config: {
      intervalMinutes?: number;
      batchSize?: number;
      horizons?: number[];
    } = {}
  ) {
    this.predictionService = new PredictionService(store);
  }

  /**
   * Start the background worker
   */
  start(): void {
    if (this.intervalId) {
      console.warn("Predictive health worker already running");
      return;
    }

    const intervalMs = (this.config.intervalMinutes || 10) * 60 * 1000;

    console.log(`Starting predictive health worker (interval: ${this.config.intervalMinutes || 10} minutes)`);

    // Run immediately on start
    void this.runPredictionCycle();

    // Then run periodically
    this.intervalId = setInterval(() => {
      void this.runPredictionCycle();
    }, intervalMs);
  }

  /**
   * Stop the background worker
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("Predictive health worker stopped");
    }
  }

  /**
   * Run a single prediction cycle for all branches
   */
  private async runPredictionCycle(): Promise<void> {
    if (this.isRunning) {
      console.warn("Prediction cycle already in progress, skipping");
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      console.log("Starting predictive health generation cycle");

      // Get all active branches that need prediction updates
      const branches = await this.getBranchesNeedingUpdate();
      
      console.log(`Found ${branches.length} branches requiring prediction updates`);

      // Process in batches to avoid overwhelming the system
      const batchSize = this.config.batchSize || 10;
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < branches.length; i += batchSize) {
        const batch = branches.slice(i, i + batchSize);
        
        const results = await Promise.allSettled(
          batch.map((branch) => this.generatePredictionsForBranch(branch))
        );

        for (const result of results) {
          if (result.status === "fulfilled") {
            successCount++;
          } else {
            errorCount++;
            console.error("Prediction generation failed:", result.reason);
          }
        }

        // Small delay between batches
        if (i + batchSize < branches.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      const durationMs = Date.now() - startTime;
      console.log(
        `Prediction cycle completed: ${successCount} success, ${errorCount} errors (${durationMs}ms)`
      );

      // Record cycle metrics
      await this.recordCycleMetrics(successCount, errorCount, durationMs);
    } catch (error) {
      console.error("Prediction cycle failed:", error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get branches that need prediction updates
   */
  private async getBranchesNeedingUpdate(): Promise<Array<{ id: string; tenantId: string; name: string }>> {
    try {
      // For MemoryStore, we need to work with the store's available methods
      // This is a simplified implementation that would work with in-memory store
      // In production with PostgresStore, this would query the database
      
      // For now, return empty array as this is a memory-store-only limitation
      // The actual implementation would use proper database queries in PostgresStore
      console.warn("Branch prediction updates not fully supported in MemoryStore");
      return [];
    } catch (error) {
      console.error("Failed to get branches needing update:", error);
      return [];
    }
  }

  /**
   * Check if a branch needs prediction update
   */
  private async branchNeedsUpdate(branchId: string, tenantId: string): Promise<boolean> {
    try {
      // For MemoryStore, we can't query prediction history
      // This would be implemented in PostgresStore
      console.warn("Branch prediction check not fully supported in MemoryStore");
      return false;
    } catch (error) {
      console.error(`Failed to check if branch ${branchId} needs update:`, error);
      return false;
    }
  }

  /**
   * Generate predictions for a single branch
   */
  private async generatePredictionsForBranch(branch: {
    id: string;
    tenantId: string;
    name: string;
  }): Promise<void> {
    const startTime = Date.now();

    try {
      // Generate predictions for configured horizons
      const horizons = this.config.horizons || [24, 72, 168];
      
      const predictions = await this.predictionService.predictBranchRisk(
        branch.tenantId,
        branch.id,
        {
          horizons,
          includeHistorical: true,
        }
      );

      const durationMs = Date.now() - startTime;

      console.log(
        `Generated ${predictions.length} predictions for branch ${branch.name} (${durationMs}ms)`
      );

      // Emit real-time updates via WebSocket
      if (this.websocketService && predictions.length > 0) {
        const primary = predictions.find((p) => p.horizonHours === 72) || predictions[0];
        
        if (primary) {
          this.websocketService.emit("branch.health.prediction.updated", {
            branchId: branch.id,
            tenantId: branch.tenantId,
            probability: primary.probability,
            riskLevel: primary.riskLevel,
            confidence: primary.confidence,
            horizonHours: primary.horizonHours,
            primaryDriver: primary.primaryRiskDriver,
            timestamp: new Date().toISOString(),
          });

          // Emit high-risk alert if needed
          if (primary.riskLevel === "CRITICAL" || primary.riskLevel === "HIGH") {
            this.websocketService.emit("branch.health.high.risk.alert", {
              branchId: branch.id,
              branchName: branch.name,
              tenantId: branch.tenantId,
              probability: primary.probability,
              riskLevel: primary.riskLevel,
              primaryDriver: primary.primaryRiskDriver,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }
    } catch (error) {
      console.error(`Failed to generate predictions for branch ${branch.name}:`, error);
      throw error;
    }
  }

  /**
   * Record cycle metrics for monitoring
   */
  private async recordCycleMetrics(
    successCount: number,
    errorCount: number,
    durationMs: number
  ): Promise<void> {
    try {
      // Store metrics for monitoring dashboard
      // This could be extended to write to a metrics table or time-series DB
      console.log("Cycle metrics:", {
        timestamp: new Date().toISOString(),
        successCount,
        errorCount,
        durationMs,
        successRate: successCount / (successCount + errorCount),
      });
    } catch (error) {
      console.error("Failed to record cycle metrics:", error);
    }
  }

  /**
   * Get worker status
   */
  getStatus(): {
    running: boolean;
    isProcessing: boolean;
    config: typeof this.config;
  } {
    return {
      running: this.intervalId !== null,
      isProcessing: this.isRunning,
      config: this.config,
    };
  }
}

/**
 * Initialize and start the predictive health worker
 */
export function initializePredictiveHealthWorker(
  store: ControlPlaneStore,
  websocketService?: any
): PredictiveHealthWorker {
  const worker = new PredictiveHealthWorker(store, websocketService, {
    intervalMinutes: parseInt(process.env.PREDICTION_INTERVAL_MINUTES || "10", 10),
    batchSize: parseInt(process.env.PREDICTION_BATCH_SIZE || "10", 10),
    horizons: [24, 72, 168], // 1 day, 3 days, 1 week
  });

  worker.start();

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("SIGTERM received, stopping predictive health worker");
    worker.stop();
  });

  process.on("SIGINT", () => {
    console.log("SIGINT received, stopping predictive health worker");
    worker.stop();
  });

  return worker;
}

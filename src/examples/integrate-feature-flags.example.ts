/**
 * Integration Guide: Adding Feature Flags to Existing Services
 * 
 * This file demonstrates how to integrate the feature flag system
 * into existing services and routes throughout the application.
 */

import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { 
  requireFeature,
  requireFeatureWithLogging,
  checkAndLogFeature 
} from "../middleware/feature-flag.middleware.js";

// ============================================================================
// Example 1: Protecting Guardian AI Routes (COMPLETED)
// ============================================================================

/*
File: src/routes/guardian-ai.routes.ts

BEFORE:
  app.post("/api/v1/guardian/chat", async (request, reply) => {

AFTER:
  import { requireFeatureWithLogging } from "../middleware/feature-flag.middleware.js";

  app.post("/api/v1/guardian/chat", {
    preHandler: requireFeatureWithLogging("guardian-ai-assistant", "chat")
  }, async (request, reply) => {
*/

// ============================================================================
// Example 2: Protecting AI Video Search Routes (COMPLETED)
// ============================================================================

/*
File: src/routes/ai-video-search-v2.routes.ts

BEFORE:
  app.post("/api/v1/video-search/natural-language", async (request, reply) => {

AFTER:
  import { requireFeatureWithLogging } from "../middleware/feature-flag.middleware.js";

  app.post("/api/v1/video-search/natural-language", {
    preHandler: requireFeatureWithLogging("ai-video-search", "search")
  }, async (request, reply) => {
*/

// ============================================================================
// Example 3: Face Recognition Routes (Biometric Features)
// ============================================================================

/*
File: analytics-engine/src/routes/face-recognition.routes.ts

Add at the top:
  import { requireAllFeatures } from "../../src/middleware/feature-flag.middleware.js";

Update watchlist routes:
  app.post("/api/v1/face/watchlists", {
    preHandler: requireAllFeatures(["face-recognition", "watchlist-management"])
  }, async (request, reply) => {
    // Watchlist creation
  });

  app.post("/api/v1/face/watchlists/:watchlistId/persons", {
    preHandler: requireAllFeatures(["face-recognition", "watchlist-management"])
  }, async (request, reply) => {
    // Enroll person to watchlist
  });

  app.post("/api/v1/face/match", {
    preHandler: requireFeatureWithLogging("face-recognition", "match")
  }, async (request, reply) => {
    // Face matching
  });
*/

// ============================================================================
// Example 4: ANPR (Vehicle) Routes
// ============================================================================

/*
File: src/routes/vehicle-analytics.routes.ts (if exists)

  import { requireFeature } from "../middleware/feature-flag.middleware.js";

  app.post("/api/v1/anpr/search", {
    preHandler: requireFeature("anpr")
  }, async (request, reply) => {
    // ANPR search
  });

  app.get("/api/v1/vehicles/:plateNumber/history", {
    preHandler: requireFeature("vehicle-reidentification")
  }, async (request, reply) => {
    // Vehicle journey history
  });
*/

// ============================================================================
// Example 5: Behavioral Analytics Routes
// ============================================================================

/*
File: src/routes/behavioral-analytics.routes.ts

  import { requireFeatureWithLogging } from "../middleware/feature-flag.middleware.js";

  app.post("/api/v1/behavioral/analyze", {
    preHandler: requireFeatureWithLogging("behavioral-analytics", "analyze")
  }, async (request, reply) => {
    // Behavioral analysis
  });

  app.get("/api/v1/behavioral/patterns/:tenantId", {
    preHandler: requireFeature("behavioral-analytics")
  }, async (request, reply) => {
    // Get patterns
  });
*/

// ============================================================================
// Example 6: Banking Analytics Routes
// ============================================================================

/*
File: src/routes/banking-analytics.routes.ts

  import { requireAnyFeature } from "../middleware/feature-flag.middleware.js";

  app.post("/api/v1/banking/vault-monitoring", {
    preHandler: requireFeature("vault-monitoring")
  }, async (request, reply) => {
    // Vault monitoring
  });

  app.post("/api/v1/banking/dual-control", {
    preHandler: requireFeature("dual-control-verification")
  }, async (request, reply) => {
    // Dual control verification
  });

  app.get("/api/v1/banking/analytics", {
    preHandler: requireAnyFeature([
      "vault-monitoring",
      "atm-security",
      "cash-counter-monitoring"
    ])
  }, async (request, reply) => {
    // Banking analytics dashboard
  });
*/

// ============================================================================
// Example 7: Conditional Service Logic
// ============================================================================

/*
File: src/services/alert.service.ts

  import { isFeatureEnabledForUser } from "../middleware/feature-flag.middleware.js";

  class AlertService {
    async createAlert(tenantId: string, alertData: any) {
      // Always create the alert
      const alert = await this.saveAlert(tenantId, alertData);

      // Check if AI incident summary is enabled
      const aiSummaryEnabled = await isFeatureEnabledForUser(
        tenantId,
        "ai-incident-summary"
      );

      if (aiSummaryEnabled) {
        // Generate AI summary asynchronously
        this.generateAISummary(alert.id).catch(err => {
          console.error("Failed to generate AI summary:", err);
        });
      }

      return alert;
    }
  }
*/

// ============================================================================
// Example 8: Analytics Engine Integration
// ============================================================================

/*
File: analytics-engine/src/detector/detector-coordinator.ts

  import { checkAndLogFeature } from "../../src/middleware/feature-flag.middleware.js";

  class DetectorCoordinator {
    async processFrame(tenantId: string, cameraId: string, frame: Buffer) {
      const detections = [];

      // Check each analytics capability before running
      const capabilities = [
        { key: "person", detector: this.personDetector },
        { key: "vehicle", detector: this.vehicleDetector },
        { key: "fire-smoke-detection", detector: this.fireDetector },
        { key: "ppe-compliance", detector: this.ppeDetector },
      ];

      for (const { key, detector } of capabilities) {
        const result = await checkAndLogFeature(
          tenantId,
          key,
          undefined,
          "detection"
        );

        if (result.enabled) {
          const detection = await detector.detect(frame);
          detections.push(...detection);
        }
      }

      return detections;
    }
  }
*/

// ============================================================================
// Example 9: Dashboard Component Protection
// ============================================================================

/*
File: dashboard/pages/ai-features.tsx

  import { FeatureGate } from "../components/feature-status-badge";

  export default function AIFeaturesPage() {
    return (
      <div>
        <FeatureGate 
          featureKey="ai-video-search" 
          featureName="AI Video Search"
        >
          <AIVideoSearchPanel />
        </FeatureGate>

        <FeatureGate 
          featureKey="guardian-ai-assistant" 
          featureName="Guardian AI"
        >
          <GuardianAIChat />
        </FeatureGate>
      </div>
    );
  }
*/

// ============================================================================
// Example 10: Navigation Menu with Feature Indicators
// ============================================================================

/*
File: dashboard/components/navigation.tsx

  import { FeatureIndicator } from "../components/feature-status-badge";

  export function Navigation() {
    return (
      <nav>
        <FeatureIndicator
          featureKey="ai-video-search"
          label="AI Search"
          icon={<SearchIcon />}
          href="/dashboard/ai-search"
        />

        <FeatureIndicator
          featureKey="guardian-ai-assistant"
          label="Guardian AI"
          icon={<SparklesIcon />}
          href="/dashboard/guardian"
        />

        <FeatureIndicator
          featureKey="behavioral-analytics"
          label="Behavioral Analytics"
          icon={<ActivityIcon />}
          href="/dashboard/behavioral"
        />
      </nav>
    );
  }
*/

// ============================================================================
// IMPLEMENTATION CHECKLIST
// ============================================================================

/*
HIGH PRIORITY (Core AI Features):
✅ Guardian AI routes - COMPLETED
✅ AI Video Search routes - COMPLETED
⬜ Face Recognition routes
⬜ Behavioral Analytics routes
⬜ AI Incident Summary routes
⬜ AI Evidence Builder routes

MEDIUM PRIORITY (Analytics Features):
⬜ ANPR routes
⬜ Vehicle Re-identification routes
⬜ Banking Analytics routes
⬜ Retail Analytics routes
⬜ Crowd Analytics routes
⬜ Journey Tracking routes

LOW PRIORITY (System Features):
⬜ Camera Health Monitoring routes
⬜ Predictive Maintenance routes
⬜ Edge AI Processing routes

DASHBOARD COMPONENTS:
⬜ Add FeatureGate to AI pages
⬜ Add FeatureIndicator to navigation
⬜ Add feature status badges to cards
⬜ Update settings page with feature list

ANALYTICS ENGINE:
⬜ Add feature checks to detector coordinator
⬜ Add feature checks to rule engine
⬜ Add feature logging to analytics processing
⬜ Update capability registry integration
*/

// ============================================================================
// TESTING GUIDELINES
// ============================================================================

/*
After adding feature flags, test:

1. With feature ENABLED:
   - Route is accessible
   - Service executes normally
   - Usage is logged
   - No performance degradation

2. With feature DISABLED:
   - Route returns 403 with clear error
   - UI components are hidden/show upgrade message
   - Navigation items show lock icon
   - No backend processing occurs

3. With usage LIMIT:
   - Usage counter increments
   - Limit enforcement works
   - Clear error when limit exceeded
   - Counter resets properly

4. With EXPIRATION:
   - Feature works before expiration
   - Feature blocks after expiration
   - Clear error message shown
   - Cleanup job removes expired features
*/

// ============================================================================
// ROLLOUT STRATEGY
// ============================================================================

/*
Phase 1: Infrastructure (Week 1)
- ✅ Database migration
- ✅ Feature service
- ✅ API routes
- ✅ Middleware
- ✅ Admin UI

Phase 2: Core Features (Week 2)
- ✅ Guardian AI
- ✅ AI Video Search
- ⬜ Face Recognition
- ⬜ Behavioral Analytics

Phase 3: Analytics Features (Week 3)
- ⬜ ANPR
- ⬜ Vehicle Analytics
- ⬜ Banking Analytics
- ⬜ Retail Analytics

Phase 4: Dashboard & Polish (Week 4)
- ⬜ Feature gates on all pages
- ⬜ Navigation indicators
- ⬜ Settings page
- ⬜ Documentation
- ⬜ User training

Phase 5: Production (Week 5)
- ⬜ Run migration on production DB
- ⬜ Enable features for existing tenants
- ⬜ Monitor usage logs
- ⬜ Customer communication
*/

// ============================================================================
// MIGRATION SCRIPT FOR EXISTING TENANTS
// ============================================================================

/*
File: scripts/enable-features-for-existing-tenants.ts

import { Pool } from "pg";
import { FeatureManagementService } from "../src/services/feature-management.service.js";

async function enableFeaturesForExistingTenants() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const featureService = new FeatureManagementService(pool);

  // Get all tenants
  const { rows: tenants } = await pool.query(`SELECT id, name FROM tenants`);

  // Define features to enable for all existing tenants
  const featuresToEnable = [
    "ai-video-search",
    "guardian-ai-assistant",
    "behavioral-analytics",
    "anpr",
    "intrusion-detection",
    "fire-smoke-detection",
    "camera-health-monitoring",
  ];

  for (const tenant of tenants) {
    console.log(`Enabling features for tenant: ${tenant.name}`);

    for (const featureKey of featuresToEnable) {
      await featureService.setTenantFeatureStatus(
        tenant.id,
        featureKey,
        true,
        {
          notes: "Enabled during feature flag migration",
        }
      );
    }
  }

  console.log("✅ All tenants upgraded successfully");
  await pool.end();
}

enableFeaturesForExistingTenants().catch(console.error);
*/

export {};

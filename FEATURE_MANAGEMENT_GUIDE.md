# Feature Management System

Complete guide for the Feature Flag Management System that enables/disables platform features at tenant and global levels.

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Middleware Usage](#middleware-usage)
- [Frontend Components](#frontend-components)
- [Admin Interface](#admin-interface)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## 🎯 Overview

The Feature Management System provides granular control over platform capabilities with:

- **Global Feature Control**: Platform-wide feature enable/disable
- **Tenant-Level Overrides**: Per-customer feature customization
- **Usage Tracking**: Monitor feature usage and billing
- **Usage Limits**: Set per-tenant usage quotas
- **Expiration Dates**: Time-limited feature access
- **Audit Logging**: Complete change history
- **Graceful Degradation**: Smooth UX when features are disabled

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend Layer                       │
│  ┌────────────────┐  ┌────────────────┐               │
│  │ Feature Gate   │  │ Feature Badge  │               │
│  │ Components     │  │ & Indicators   │               │
│  └────────────────┘  └────────────────┘               │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────┐
│                    API Layer                            │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Feature Management Routes (18 endpoints)         │  │
│  │ - Tenant endpoints                               │  │
│  │ - Admin endpoints                                │  │
│  │ - Usage stats & audit logs                       │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────┐
│                 Middleware Layer                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Feature Flag Middleware                          │  │
│  │ - requireFeature()                               │  │
│  │ - requireFeatureWithLogging()                    │  │
│  │ - checkFeature()                                 │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────┐
│                  Service Layer                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ FeatureManagementService (30+ methods)           │  │
│  │ - isFeatureEnabled()                             │  │
│  │ - canUseFeature()                                │  │
│  │ - logUsage()                                     │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────┐
│                 Database Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ global_      │  │ tenant_      │  │ feature_     │ │
│  │ features     │  │ features     │  │ usage_logs   │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### 1. Run Database Migration

```bash
# Apply the feature management schema
psql $DATABASE_URL -f migrations/020_feature_management.sql
```

### 2. Initialize Middleware

The middleware is automatically initialized in `src/app.ts`:

```typescript
import { initializeFeatureMiddleware } from "./middleware/feature-flag.middleware.js";

if (pool) {
  initializeFeatureMiddleware(pool);
}
```

### 3. Protect a Route

```typescript
import { requireFeature } from "../middleware/feature-flag.middleware.js";

app.post("/api/v1/ai/search", {
  preHandler: requireFeature("ai-video-search")
}, async (request, reply) => {
  // Only accessible if feature is enabled
  return { results: [] };
});
```

### 4. Use in Frontend

```tsx
import { FeatureGate } from "@/components/feature-status-badge";

<FeatureGate 
  featureKey="ai-video-search" 
  featureName="AI Video Search"
>
  <AISearchPanel />
</FeatureGate>
```

## 💾 Database Schema

### Core Tables

#### `global_features`
Platform-wide feature definitions:
- `feature_key`: Unique identifier (e.g., 'ai-video-search')
- `feature_name`: Display name
- `feature_category`: Grouping (ai, analytics, security, etc.)
- `enabled`: Global on/off switch
- `config`: JSON configuration

#### `tenant_features`
Per-tenant feature overrides:
- `tenant_id`: Reference to tenant
- `feature_key`: Reference to global feature
- `enabled`: Tenant-specific override
- `usage_limit`: Max usage count (NULL = unlimited)
- `usage_count`: Current usage
- `expires_at`: Optional expiration date

#### `feature_usage_logs`
Usage tracking for analytics and billing:
- `tenant_id`: Who used it
- `feature_key`: What feature
- `user_id`: Which user
- `action`: Type of usage (access, execute, etc.)
- `metadata`: Additional context

#### `feature_audit_log`
Complete change history:
- `feature_key`: What changed
- `action`: enabled, disabled, config_updated
- `old_value`: Previous state
- `new_value`: New state
- `changed_by`: Who made the change

### Helper Functions

```sql
-- Check if feature is enabled
SELECT is_feature_enabled('tenant-uuid', 'ai-video-search');

-- Log feature usage
SELECT log_feature_usage('tenant-uuid', 'ai-video-search', 'user-uuid', 'search');

-- Check usage limit
SELECT check_feature_usage_limit('tenant-uuid', 'ai-video-search');
```

## 📡 API Reference

### Tenant Endpoints

#### Get All Features
```http
GET /api/v1/features
```

Response:
```json
{
  "success": true,
  "features": [
    {
      "featureKey": "ai-video-search",
      "featureName": "AI Video Search",
      "featureCategory": "ai",
      "effectiveEnabled": true,
      "usageCount": 150,
      "usageLimit": null
    }
  ],
  "summary": {
    "total": 50,
    "enabled": 25,
    "disabled": 25
  }
}
```

#### Check Feature Status
```http
POST /api/v1/features/{featureKey}/check
```

Response:
```json
{
  "success": true,
  "enabled": true
}
```

### Admin Endpoints (Platform Admin Only)

#### Get Global Features
```http
GET /api/v1/admin/features/global
Authorization: Bearer <token>
```

#### Enable/Disable Global Feature
```http
PATCH /api/v1/admin/features/global/{featureKey}
Content-Type: application/json

{
  "enabled": true,
  "config": {
    "requires_openai": true
  }
}
```

#### Set Tenant Feature
```http
PUT /api/v1/admin/features/tenant/{tenantId}/{featureKey}
Content-Type: application/json

{
  "enabled": true,
  "usageLimit": 1000,
  "expiresAt": "2024-12-31T23:59:59Z",
  "notes": "Trial period"
}
```

#### Get Usage Statistics
```http
GET /api/v1/admin/features/usage/{featureKey}
```

Response:
```json
{
  "success": true,
  "stats": {
    "featureKey": "ai-video-search",
    "totalUsage": 5420,
    "uniqueTenants": 45,
    "uniqueUsers": 230,
    "firstUsed": "2024-01-01T00:00:00Z",
    "lastUsed": "2024-03-15T14:30:00Z"
  },
  "tenants": [
    {
      "tenantId": "uuid",
      "tenantName": "Acme Corp",
      "enabled": true,
      "usageCount": 350
    }
  ]
}
```

## 🛡️ Middleware Usage

### Basic Protection

```typescript
import { requireFeature } from "../middleware/feature-flag.middleware.js";

// Single feature
app.get("/api/v1/feature", {
  preHandler: requireFeature("feature-key")
}, handler);
```

### With Automatic Logging

```typescript
import { requireFeatureWithLogging } from "../middleware/feature-flag.middleware.js";

app.post("/api/v1/feature", {
  preHandler: requireFeatureWithLogging("feature-key", "action-name")
}, handler);
```

### Multiple Features (ANY)

```typescript
import { requireAnyFeature } from "../middleware/feature-flag.middleware.js";

app.get("/api/v1/analytics", {
  preHandler: requireAnyFeature([
    "behavioral-analytics",
    "crowd-analytics",
    "retail-analytics"
  ])
}, handler);
```

### Multiple Features (ALL)

```typescript
import { requireAllFeatures } from "../middleware/feature-flag.middleware.js";

app.post("/api/v1/face/watchlist", {
  preHandler: requireAllFeatures([
    "face-recognition",
    "watchlist-management"
  ])
}, handler);
```

### Optional Feature Check

```typescript
import { checkFeature } from "../middleware/feature-flag.middleware.js";

app.get("/api/v1/dashboard", {
  preHandler: checkFeature("ai-insights")
}, async (request, reply) => {
  const hasAI = (request as any).featureEnabled;
  
  return {
    dashboard: "data",
    aiInsights: hasAI ? await getAIInsights() : null
  };
});
```

### Service Decorators

```typescript
import { FeatureProtected, FeatureProtectedWithLogging } from "../decorators/feature-protected.decorator.js";

class AIService {
  constructor(private pool: Pool) {}

  @FeatureProtected("ai-video-search")
  async searchVideo(tenantId: string, query: string) {
    // Automatically checks feature
    // Throws FeatureNotAvailableError if disabled
    return [];
  }

  @FeatureProtectedWithLogging("ai-video-search", "search")
  async searchWithLogging(tenantId: string, userId: string, query: string) {
    // Checks feature AND logs usage
    return [];
  }
}
```

## 🎨 Frontend Components

### Feature Gate

Blocks content when feature is not available:

```tsx
import { FeatureGate } from "@/components/feature-status-badge";

<FeatureGate 
  featureKey="ai-video-search" 
  featureName="AI Video Search"
>
  <AIVideoSearchPanel />
</FeatureGate>
```

Shows upgrade message when disabled:
```
┌─────────────────────────────────────┐
│           🔒                        │
│  AI Video Search Not Available      │
│                                     │
│  This feature is not available      │
│  for your account.                  │
│                                     │
│  [ View Available Features ]        │
└─────────────────────────────────────┘
```

### Feature Status Badge

Conditionally render with badge:

```tsx
import { FeatureStatusBadge } from "@/components/feature-status-badge";

<FeatureStatusBadge featureKey="ai-video-search" showBadge>
  <AISearchButton />
</FeatureStatusBadge>
```

### Feature Indicator

Navigation menu items:

```tsx
import { FeatureIndicator } from "@/components/feature-status-badge";

<FeatureIndicator
  featureKey="guardian-ai-assistant"
  label="Guardian AI"
  icon={<SparklesIcon />}
  href="/dashboard/guardian"
/>
```

Shows:
- ✨ Sparkle icon when enabled
- 🔒 Lock icon when disabled
- Disabled state in navigation

### Feature List

Show all features to user:

```tsx
import { FeatureList } from "@/components/feature-status-badge";

<FeatureList />
```

## 👨‍💼 Admin Interface

### Feature Management Dashboard

Access at: `/dashboard/admin/features`

**Features:**
- View all platform features
- Toggle global features on/off
- Search and filter by category
- View usage statistics
- See tenant-specific overrides

**View Modes:**
1. **My Features**: Current user's enabled features
2. **Global**: Platform-wide feature management (admin only)
3. **Usage**: Usage statistics across all tenants (admin only)

**Categories:**
- AI (Sparkles icon, Indigo)
- Analytics (Activity icon, Blue)
- Biometric (Shield icon, Purple)
- Vehicle (Activity icon, Green)
- Safety (Alert icon, Red)
- Security (Shield icon, Orange)
- Banking (Building icon, Emerald)
- Industrial (Activity icon, Yellow)
- Smart City (Globe icon, Cyan)
- System (Settings icon, Slate)
- Enterprise (Building icon, Violet)
- Edge (Globe icon, Teal)
- Experimental (Sparkles icon, Pink)

## ✅ Best Practices

### 1. Feature Naming

```typescript
// ✅ Good: lowercase with hyphens
"ai-video-search"
"guardian-ai-assistant"
"face-recognition"

// ❌ Bad: mixed case or underscores
"AI_Video_Search"
"guardianAiAssistant"
```

### 2. Feature Categories

Use consistent categories:
- `ai` - AI-powered features
- `analytics` - Data analytics features
- `biometric` - Face/fingerprint features
- `security` - Security monitoring
- `enterprise` - Enterprise-only features

### 3. Usage Logging

```typescript
// Log meaningful actions
await logUsage(tenantId, "ai-video-search", userId, "search", {
  query: "person in red shirt",
  resultsCount: 15
});

// Not just "access"
```

### 4. Error Handling

```typescript
try {
  await protectedOperation();
} catch (error) {
  if (error instanceof FeatureNotAvailableError) {
    return reply.code(403).send({
      error: "feature_not_available",
      feature: error.featureKey,
      message: error.message
    });
  }
  throw error;
}
```

### 5. Graceful Degradation

```typescript
// ✅ Good: Provide fallback
const aiEnabled = await isFeatureEnabled(tenantId, "ai-insights");
const insights = aiEnabled ? await getAIInsights() : null;

// ❌ Bad: Hard fail
const insights = await getAIInsights(); // Throws if disabled
```

## 🔧 Troubleshooting

### Feature Always Shows as Disabled

**Check:**
1. Is global feature enabled?
   ```sql
   SELECT enabled FROM global_features WHERE feature_key = 'your-feature';
   ```

2. Does tenant have override?
   ```sql
   SELECT * FROM tenant_features 
   WHERE tenant_id = 'tenant-uuid' AND feature_key = 'your-feature';
   ```

3. Has feature expired?
   ```sql
   SELECT expires_at FROM tenant_features 
   WHERE tenant_id = 'tenant-uuid' AND feature_key = 'your-feature';
   ```

### Usage Limit Exceeded

Reset usage count:
```sql
UPDATE tenant_features 
SET usage_count = 0 
WHERE tenant_id = 'tenant-uuid' AND feature_key = 'your-feature';
```

Or increase limit:
```sql
UPDATE tenant_features 
SET usage_limit = 10000 
WHERE tenant_id = 'tenant-uuid' AND feature_key = 'your-feature';
```

### Feature Not Logging Usage

Ensure you're using `requireFeatureWithLogging` or manually calling `logUsage`:

```typescript
// Manual logging
await checkAndLogFeature(
  tenantId,
  featureKey,
  userId,
  "action",
  { metadata: "value" }
);
```

### Migration Failed

If migration fails midway:
```sql
-- Check what was created
SELECT table_name FROM information_schema.tables 
WHERE table_name LIKE 'feature%' OR table_name LIKE '%features';

-- Rollback if needed
DROP TABLE IF EXISTS feature_usage_logs CASCADE;
DROP TABLE IF EXISTS feature_audit_log CASCADE;
DROP TABLE IF EXISTS tenant_features CASCADE;
DROP TABLE IF EXISTS global_features CASCADE;

-- Re-run migration
\i migrations/020_feature_management.sql
```

## 📊 Available Features

The system comes pre-configured with 50+ features across 13 categories. See `migrations/020_feature_management.sql` for the complete list.

**Top Features:**
- `ai-video-search` - Natural language video search
- `guardian-ai-assistant` - JARVIS-like AI assistant
- `face-recognition` - Face recognition with consent
- `behavioral-analytics` - Advanced behavior patterns
- `anpr` - License plate recognition
- `fire-smoke-detection` - Real-time fire/smoke detection
- `vault-monitoring` - Banking vault security
- `predictive-maintenance` - Hardware failure prediction

## 🎓 Training Resources

- [Usage Examples](src/examples/feature-flag-usage.example.ts)
- [Integration Guide](src/examples/integrate-feature-flags.example.ts)
- [API Documentation](docs/api/FEATURE_MANAGEMENT.md)

## 🆘 Support

For questions or issues:
1. Check this documentation
2. Review the examples in `src/examples/`
3. Check audit logs: `SELECT * FROM feature_audit_log ORDER BY created_at DESC LIMIT 50;`
4. Contact platform team

---

**Last Updated:** March 2024  
**Version:** 1.0.0  
**Status:** Production Ready ✅

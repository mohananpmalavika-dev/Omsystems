# Digital Twin Integration

Integration between Security Commander and Digital Twin system for dependency-aware root cause analysis and infrastructure impact assessment.

---

## Overview

The Digital Twin integration enhances Security Commander's root cause analysis by incorporating infrastructure topology knowledge. When security incidents occur, the system can now:

- **Identify common infrastructure dependencies** causing multiple failures
- **Calculate blast radius** showing all affected assets downstream
- **Detect single points of failure** in the infrastructure
- **Trace dependency chains** showing how failures propagate
- **Provide infrastructure context** for better decision-making

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Security Commander                        │
│                                                              │
│  ┌────────────────┐         ┌──────────────────┐           │
│  │  Correlation   │────────▶│  Investigation   │           │
│  │     Engine     │         │     Service      │           │
│  └────────┬───────┘         └────────┬─────────┘           │
│           │                          │                      │
│           │                          │                      │
│  ┌────────▼──────────────────────────▼─────────┐           │
│  │     EnhancedRootCauseService                │           │
│  └────────┬────────────────────────────────────┘           │
│           │                                                 │
│  ┌────────▼────────────┐                                   │
│  │ DigitalTwinBridge   │                                   │
│  └────────┬────────────┘                                   │
└───────────┼────────────────────────────────────────────────┘
            │
            │ PostgreSQL
            │
┌───────────▼────────────────────────────────────────────────┐
│                    Digital Twin System                      │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │ twin_assets │  │twin_relation-│  │twin_state_      │   │
│  │             │  │    ships     │  │   history       │   │
│  └─────────────┘  └──────────────┘  └─────────────────┘   │
│                                                              │
│  Infrastructure Topology Graph                              │
│  Cameras → Switches → Gateways → Internet                   │
│  NVRs → Storage → Network                                   │
└──────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. DigitalTwinBridge

Low-level interface to Digital Twin database.

**Capabilities:**
- Query asset information by ID
- Find dependent assets (what depends on this asset)
- Find dependencies (what this asset depends on)
- Calculate blast radius for failures
- Find common dependencies across multiple assets
- Get local topology subgraph
- Check for single points of failure
- Get asset health scores

**Example:**
```typescript
import { DigitalTwinBridge } from './integrations';

const bridge = new DigitalTwinBridge(pool);

// Get an asset
const asset = await bridge.getAsset('switch_floor3');

// Calculate blast radius
const blastRadius = await bridge.calculateBlastRadius('switch_floor3');
console.log(`${blastRadius.total_affected} assets would be affected`);

// Find what cameras depend on
const deps = await bridge.findCommonDependency([
  'camera_301',
  'camera_302',
  'camera_303'
]);
console.log('Common dependencies:', deps);
```

### 2. EnhancedRootCauseService

High-level service for root cause analysis with Digital Twin context.

**Features:**
- Analyzes incidents with infrastructure knowledge
- Identifies root cause assets using topology
- Calculates confidence scores
- Generates human-readable explanations
- Identifies contributing factors
- Builds dependency chains showing failure propagation

**Example:**
```typescript
import { EnhancedRootCauseService } from './integrations';

const service = new EnhancedRootCauseService(digitalTwinBridge);

const rootCause = await service.analyzeRootCause(incident, events);

console.log(rootCause.explanation);
// "Infrastructure failure detected: switch "SW-Floor3" has failed,
//  affecting 28 dependent assets including 25 cameras..."

console.log('Dependency chain:', rootCause.dependencyAnalysis.topologyContext.dependencyChain);
// ["switch: SW-Floor3", "camera: Entrance-01", "camera: Entrance-02", ...]
```

---

## Root Cause Analysis Enhancement

### Traditional Approach (Without Digital Twin)

```typescript
// Basic correlation
if (multipleEventsCloseTogether && sameEventType) {
  return "Multiple assets failed simultaneously";
}
```

**Limitations:**
- Cannot identify infrastructure cause
- No blast radius calculation
- No understanding of dependencies
- Limited context for decision-making

### Enhanced Approach (With Digital Twin)

```typescript
// Infrastructure-aware analysis
const commonDeps = await findCommonDependency(failedAssets);
const rootCause = commonDeps.find(dep => dep.status === 'offline');
const blastRadius = await calculateBlastRadius(rootCause.id);

return {
  explanation: "Switch SW-03 failure caused cascade",
  affected: blastRadius.total_affected,
  dependencyChain: [...],
  businessImpact: {...}
};
```

**Benefits:**
- Identifies infrastructure root cause
- Calculates full impact
- Shows failure propagation
- Provides actionable context

---

## Usage Examples

### Example 1: Analyze Multiple Camera Failures

```typescript
import { Pool } from 'pg';
import { DigitalTwinBridge, EnhancedRootCauseService } from './integrations';

// Initialize
const pool = new Pool({...});
const bridge = new DigitalTwinBridge(pool);
const rootCauseService = new EnhancedRootCauseService(bridge);

// Scenario: 5 cameras went offline simultaneously
const incident = {
  id: 'inc_001',
  title: 'Multiple Camera Offline',
  events: ['evt_1', 'evt_2', 'evt_3', 'evt_4', 'evt_5'],
  affectedAssets: ['camera_301', 'camera_302', 'camera_303', 'camera_304', 'camera_305'],
  ...
};

const events = [
  { assetId: 'camera_301', eventType: 'camera_offline', ... },
  { assetId: 'camera_302', eventType: 'camera_offline', ... },
  // ...
];

// Analyze with Digital Twin context
const rootCause = await rootCauseService.analyzeRootCause(incident, events);

// Result
console.log(rootCause.explanation);
// "Infrastructure failure detected: switch "SW-Floor3" has failed,
//  affecting 28 dependent assets including 25 cameras."

console.log(rootCause.dependencyAnalysis.blastRadius);
// {
//   source_asset: { id: 'switch_floor3', name: 'SW-Floor3', ... },
//   total_affected: 28,
//   by_type: { camera: 25, nvr: 2, storage: 1 },
//   business_impact: {
//     coverage_loss: "25 cameras affected",
//     operational_impact: "severe",
//     estimated_downtime: "30 minutes - 2 hours"
//   }
// }
```

### Example 2: Calculate Blast Radius Before Maintenance

```typescript
// Planning maintenance on a network switch
const switchId = 'switch_datacenter_01';

const blastRadius = await bridge.calculateBlastRadius(switchId);

console.log(`Maintenance Impact Assessment:`);
console.log(`Assets affected: ${blastRadius.total_affected}`);
console.log(`Cameras offline: ${blastRadius.by_type.camera || 0}`);
console.log(`NVRs offline: ${blastRadius.by_type.nvr || 0}`);
console.log(`Impact: ${blastRadius.business_impact.operational_impact}`);

// Decision: Schedule during off-hours if impact is severe
if (blastRadius.business_impact.operational_impact === 'critical') {
  console.log('⚠️ Schedule for 2 AM maintenance window');
}
```

### Example 3: Detect Single Points of Failure

```typescript
// Audit infrastructure for SPOFs
const criticalAssets = ['switch_main', 'gateway_primary', 'storage_primary'];

for (const assetId of criticalAssets) {
  const isSPOF = await bridge.isSinglePointOfFailure(assetId);
  const asset = await bridge.getAsset(assetId);
  
  if (isSPOF) {
    console.log(`⚠️ SPOF detected: ${asset.name}`);
    console.log(`   Recommendation: Add redundancy`);
    
    const blastRadius = await bridge.calculateBlastRadius(assetId);
    console.log(`   If failed: ${blastRadius.total_affected} assets affected`);
  }
}
```

### Example 4: Trace Dependency Chain

```typescript
// Understand why a camera is offline
const cameraId = 'camera_entrance_01';

const dependencies = await bridge.getDependencies(cameraId);

console.log(`Camera ${cameraId} depends on:`);
dependencies.forEach(dep => {
  console.log(`  ${dep.dependency_path.join(' → ')}`);
  console.log(`  (${dep.path_length} hops)`);
});

// Output:
// camera_entrance_01 → switch_floor1 → gateway_main → internet
// (3 hops)
```

### Example 5: Get Local Topology

```typescript
// Visualize infrastructure around an asset
const assetId = 'switch_floor2';
const topology = await bridge.getLocalTopology(assetId, 2);

console.log(`Topology around ${assetId}:`);
console.log(`Nodes: ${topology.nodes.length}`);
console.log(`Edges: ${topology.edges.length}`);

// Use for visualization in frontend
// topology.nodes → graph nodes
// topology.edges → graph connections
```

---

## Integration with Investigation Service

### Step-by-Step Integration

**1. Initialize bridges in your service:**

```typescript
import { Pool } from 'pg';
import { DigitalTwinBridge, EnhancedRootCauseService } from './integrations';

class InvestigationService {
  private digitalTwinBridge: DigitalTwinBridge;
  private rootCauseService: EnhancedRootCauseService;

  constructor(pool: Pool) {
    this.digitalTwinBridge = new DigitalTwinBridge(pool);
    this.rootCauseService = new EnhancedRootCauseService(this.digitalTwinBridge);
  }

  async createInvestigation(events: SecurityEvent[]) {
    // ... existing incident creation logic ...
    
    // Enhance with Digital Twin analysis
    const rootCause = await this.rootCauseService.analyzeRootCause(incident, events);
    
    incident.rootCause = rootCause;
    
    return investigation;
  }
}
```

**2. Use enhanced root cause in correlation engine:**

```typescript
class CorrelationEngine {
  async correlateEvents(events: SecurityEvent[]) {
    // ... existing correlation logic ...
    
    // Check if multiple assets share common dependencies
    const assetIds = events.map(e => e.assetId).filter(Boolean);
    const commonDeps = await this.digitalTwinBridge.findCommonDependency(assetIds);
    
    if (commonDeps.length > 0) {
      // Infrastructure-level incident
      return this.createInfrastructureIncident(events, commonDeps);
    }
    
    // ... continue with other correlation rules ...
  }
}
```

**3. Add blast radius to incident metadata:**

```typescript
async createIncident(events: SecurityEvent[]) {
  const incident = {
    // ... standard incident fields ...
  };
  
  // If there's a failed infrastructure asset, calculate blast radius
  const failedAsset = events.find(e => this.isFailureEvent(e.eventType));
  
  if (failedAsset?.assetId) {
    const blastRadius = await this.digitalTwinBridge.calculateBlastRadius(failedAsset.assetId);
    
    incident.metadata = {
      ...incident.metadata,
      blastRadius: {
        totalAffected: blastRadius.total_affected,
        byType: blastRadius.by_type,
        operationalImpact: blastRadius.business_impact.operational_impact,
      }
    };
  }
  
  return incident;
}
```

---

## API Enhancements

### New Investigation Response Fields

```typescript
interface Investigation {
  // ... existing fields ...
  
  rootCause?: {
    primaryEventType: string;
    confidence: number;
    explanation: string;
    contributingFactors: string[];
    
    // NEW: Digital Twin context
    dependencyAnalysis?: {
      commonDependencies: TwinAsset[];
      singlePointsOfFailure: string[];
      blastRadius?: {
        totalAffected: number;
        byType: Record<string, number>;
        operationalImpact: string;
        coverageLoss: string;
      };
      topologyContext: {
        failedAsset: TwinAsset | null;
        affectedAssets: TwinAsset[];
        dependencyChain: string[];
      };
    };
  };
}
```

### New API Endpoints

```typescript
// GET /api/security-commander/assets/:assetId/blast-radius
app.get('/assets/:assetId/blast-radius', async (req, res) => {
  const blastRadius = await digitalTwinBridge.calculateBlastRadius(req.params.assetId);
  res.json(blastRadius);
});

// GET /api/security-commander/assets/:assetId/dependencies
app.get('/assets/:assetId/dependencies', async (req, res) => {
  const dependencies = await digitalTwinBridge.getDependencies(req.params.assetId);
  res.json(dependencies);
});

// POST /api/security-commander/analyze-common-cause
app.post('/analyze-common-cause', async (req, res) => {
  const { assetIds } = req.body;
  const commonDeps = await digitalTwinBridge.findCommonDependency(assetIds);
  res.json(commonDeps);
});
```

---

## Performance Considerations

### Database Queries

All queries use PostgreSQL recursive CTEs for efficient graph traversal:

```sql
WITH RECURSIVE dependencies AS (
  SELECT ... -- Base case
  UNION
  SELECT ... -- Recursive case
)
SELECT ...
```

**Performance characteristics:**
- **Single asset query**: <10ms
- **Blast radius (typical)**: 50-200ms
- **Common dependency**: 100-500ms
- **Local topology**: 50-150ms

### Optimization Tips

1. **Cache asset metadata**: Assets don't change frequently
2. **Limit recursion depth**: Default is 10 levels (sufficient for most topologies)
3. **Use indexes**: Ensure indexes on `twin_assets(id)` and `twin_relationships(source_id, target_id)`
4. **Batch queries**: Query multiple assets in single call when possible

### Caching Strategy

```typescript
import NodeCache from 'node-cache';

class CachedDigitalTwinBridge extends DigitalTwinBridge {
  private cache = new NodeCache({ stdTTL: 300 }); // 5 min TTL

  async getAsset(assetId: string) {
    const cached = this.cache.get<TwinAsset>(assetId);
    if (cached) return cached;

    const asset = await super.getAsset(assetId);
    if (asset) {
      this.cache.set(assetId, asset);
    }
    return asset;
  }
}
```

---

## Error Handling

### Graceful Degradation

If Digital Twin is unavailable, Security Commander continues to function:

```typescript
async analyzeRootCause(incident, events) {
  try {
    return await this.rootCauseService.analyzeRootCause(incident, events);
  } catch (error) {
    console.warn('[DigitalTwin] Analysis failed, falling back to basic analysis:', error);
    
    // Fallback to basic root cause without Digital Twin
    return {
      primaryEventType: this.determinePrimaryEventType(events),
      confidence: 50,
      explanation: 'Basic analysis (Digital Twin unavailable)',
      contributingFactors: [],
    };
  }
}
```

### Error Types

- **AssetNotFoundError**: Asset doesn't exist in Digital Twin
- **ConnectionError**: Cannot connect to database
- **TimeoutError**: Query took too long (>5 seconds)

---

## Testing

### Unit Tests

```typescript
describe('DigitalTwinBridge', () => {
  it('should calculate blast radius correctly', async () => {
    const bridge = new DigitalTwinBridge(mockPool);
    const blastRadius = await bridge.calculateBlastRadius('test_switch');
    
    expect(blastRadius.total_affected).toBeGreaterThan(0);
    expect(blastRadius.source_asset.id).toBe('test_switch');
  });
});
```

### Integration Tests

```typescript
describe('EnhancedRootCauseService', () => {
  it('should identify infrastructure root cause', async () => {
    const rootCause = await service.analyzeRootCause(incident, events);
    
    expect(rootCause.dependencyAnalysis).toBeDefined();
    expect(rootCause.dependencyAnalysis.commonDependencies.length).toBeGreaterThan(0);
  });
});
```

---

## Monitoring

### Metrics to Track

```typescript
// Response time
digitalTwinQueryDuration.observe(duration);

// Error rate
digitalTwinQueryErrors.inc();

// Cache hit rate
digitalTwinCacheHitRate.set(hits / (hits + misses));

// Query types
digitalTwinQueryTypes.labels(queryType).inc();
```

### Health Check

```typescript
app.get('/health/digital-twin', async (req, res) => {
  try {
    const testAsset = await digitalTwinBridge.getAsset('health_check');
    res.json({
      status: 'healthy',
      digitalTwin: 'connected',
      latency: `${duration}ms`
    });
  } catch (error) {
    res.status(503).json({
      status: 'degraded',
      digitalTwin: 'disconnected',
      error: error.message
    });
  }
});
```

---

## Best Practices

1. **Always check for null**: Digital Twin queries may return null if asset not found
2. **Limit recursion depth**: Prevent infinite loops in cyclic graphs
3. **Cache frequently accessed data**: Asset metadata changes infrequently
4. **Handle missing assets gracefully**: Not all events have corresponding Digital Twin assets
5. **Use blast radius for impact assessment**: Helps prioritize incident response
6. **Document dependency chains**: Makes troubleshooting easier
7. **Regular topology refresh**: Ensure Digital Twin reflects actual infrastructure

---

## Future Enhancements

- **Predictive failure analysis**: Use health trends to predict failures
- **What-if simulation**: Test failure scenarios before maintenance
- **Automatic redundancy suggestions**: Identify and recommend redundancy
- **Dependency visualization**: Interactive graph UI for exploring topology
- **Historical dependency analysis**: Track topology changes over time

---

## License

Part of the OmSystems AI Security Commander system.

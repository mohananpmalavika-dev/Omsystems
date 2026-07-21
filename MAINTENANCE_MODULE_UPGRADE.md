# 2.8 System Maintenance & Asset Lifecycle Management - Implementation Guide

## Status: PHASE 2 IN PROGRESS

This document details the comprehensive upgrade of the System Maintenance module for Aditi Sentinel CCTV.

---

## ✅ COMPLETED: Phase 1 - Database Schema

### New Migration File: `017_maintenance_extended.sql`

**Tables Created:**

1. **Preventive Maintenance**
   - `maintenance_plans` - Maintenance plan templates (daily, weekly, monthly, quarterly, annual)
   - `maintenance_schedules` - Schedule instances generated from plans
   - `maintenance_visits` - Individual maintenance visit records
   - `maintenance_checklists` - Detailed checklist items per visit

2. **Health Monitoring**
   - `health_checks` - Generic health check records
   - `camera_health` - Camera-specific metrics (FPS, bitrate, temperature, etc.)
   - `storage_health` - Storage capacity, SMART status, performance
   - `network_health` - Network latency, packet loss, bandwidth
   - `ups_health` - UPS battery health, runtime, charging status

3. **Firmware & Software**
   - `firmware_inventory` - Firmware versions for devices
   - `software_versions` - Application component versions with upgrade tracking

4. **Spare Parts**
   - `spare_parts` - Parts inventory (cameras, lenses, HDDs, power supplies, etc.)
   - `inventory_transactions` - Log of additions, removals, and usage

5. **Predictive Maintenance**
   - `predictive_alerts` - AI-generated failure predictions

6. **Reporting**
   - `maintenance_reports` - Generated maintenance reports

**Views Created:**
- `maintenance_asset_health_summary` - Aggregated asset health
- `maintenance_overdue_visits` - Past-due maintenance visits
- `maintenance_workorder_sla_status` - SLA compliance tracking

---

## 🔄 IN PROGRESS: Phase 2 - Store Methods Implementation

### Files Modified/Created:

#### 1. **control-plane-store.ts**
Added extended interface methods for:
- Health Monitoring: `recordCameraHealth()`, `recordStorageHealth()`, `recordNetworkHealth()`, `recordUpsHealth()`, `getHealthCheckSummary()`
- Firmware Management: `recordFirmwareVersion()`, `listFirmwareUpdatesRequired()`
- Software Management: `recordSoftwareVersion()`
- Spare Parts: `recordSparePart()`, `recordInventoryTransaction()`, `listLowStockParts()`
- Reporting: `generateMaintenanceReport()`, `listMaintenanceReports()`
- Compliance: `getMaintenanceComplianceStatus()`

#### 2. **store-maintenance-extensions.ts** (Reference Implementation)
Complete implementation of all extended store methods with in-memory storage.

#### 3. **maintenance-dashboard.routes.ts**
New route file with 20+ endpoints:
- Dashboard: `/v1/maintenance/dashboard/health`, `/v1/maintenance/dashboard/status`
- Health Monitoring: `/v1/maintenance/health/cameras`, `/v1/maintenance/health/storage`, `/v1/maintenance/health/network`, `/v1/maintenance/health/power`
- Firmware: `/v1/maintenance/firmware/updates-required`, `/v1/maintenance/firmware/check`, `/v1/maintenance/firmware/upgrade`
- Spare Parts: `/v1/maintenance/spare-parts`, `/v1/maintenance/spare-parts/add`, `/v1/maintenance/spare-parts/low-stock`
- Reports: `/v1/maintenance/reports/generate`, `/v1/maintenance/reports`, `/v1/maintenance/reports/sla-compliance`, `/v1/maintenance/reports/metrics`
- Predictive: `/v1/maintenance/predictive/high-risk`, `/v1/maintenance/predictive/failure-forecast`

#### 4. **app.ts**
Registered new dashboard routes in the Fastify app initialization.

---

## 🚀 NEXT STEPS: Phase 2 Completion

### To complete Phase 2, you need to:

1. **Integrate Extended Methods into store.ts**
   - Copy the method implementations from `store-maintenance-extensions.ts` into `src/store.ts`
   - Add the in-memory arrays to the MemoryStore constructor:
     ```typescript
     private cameraHealth: any[] = [];
     private storageHealth: any[] = [];
     private networkHealth: any[] = [];
     private upsHealth: any[] = [];
     private firmwareInventory: any[] = [];
     private softwareVersions: any[] = [];
     private spareParts: any[] = [];
     private inventoryTransactions: any[] = [];
     private maintenanceReports: any[] = [];
     ```

2. **Run Database Migration**
   ```bash
   npm run migrate
   ```

3. **Test New Endpoints**
   - Run the server: `npm run dev`
   - Test health monitoring endpoints
   - Verify dashboard returns correct summaries

---

## 📋 FUTURE PHASES

### Phase 3: Health Monitoring Service
- Create background health check collector
- Integrate with edge agents for real-time metrics
- Implement threshold alerting
- Create health trend analysis

### Phase 4: Dashboard Frontend
- Build React components for maintenance dashboard
- Create health visualization widgets
- Implement work order tracking UI
- Build SLA monitoring charts

### Phase 5: Advanced Reporting
- Generate PDF maintenance reports
- Implement cost analysis reports
- Create compliance validation reports
- Build predictive maintenance forecasts

### Phase 6: Firmware & Software Management
- Create approval workflow for firmware updates
- Implement rollback capability
- Add version compatibility checking
- Track deployment history

### Phase 7: Predictive Maintenance
- Integrate AI models for failure prediction
- Implement SMART disk failure prediction
- Add UPS battery degradation forecasting
- Create anomaly detection for camera health

---

## 🔐 API Endpoints Summary

### Core Maintenance (Existing)
- `GET /v1/maintenance/assets` - List all maintenance assets
- `POST /v1/maintenance/assets` - Create new asset
- `GET /v1/maintenance/workorders` - List work orders
- `POST /v1/maintenance/workorders` - Create work order
- `GET /v1/maintenance/vendors` - List vendors
- `GET /v1/maintenance/amc` - List AMC contracts
- `POST /v1/maintenance/plans` - Create maintenance plan
- `POST /v1/maintenance/schedules` - Create schedule
- `POST /v1/maintenance/visits` - Create visit
- `POST /v1/maintenance/predictive-alerts` - Ingest predictive alert

### New Dashboard (In Development)
- `GET /v1/maintenance/dashboard/health` - Overall system health
- `GET /v1/maintenance/dashboard/status` - Maintenance overview
- `GET /v1/maintenance/health/cameras` - Camera health details
- `GET /v1/maintenance/health/storage` - Storage health details
- `GET /v1/maintenance/health/network` - Network health
- `GET /v1/maintenance/health/power` - Power/UPS health
- `GET /v1/maintenance/firmware/updates-required` - Required firmware updates
- `POST /v1/maintenance/firmware/check` - Check for updates
- `POST /v1/maintenance/firmware/upgrade` - Initiate upgrade
- `GET /v1/maintenance/spare-parts` - List spare parts
- `GET /v1/maintenance/spare-parts/low-stock` - Low stock alert
- `POST /v1/maintenance/reports/generate` - Generate report
- `GET /v1/maintenance/reports` - List reports
- `GET /v1/maintenance/reports/sla-compliance` - SLA metrics
- `GET /v1/maintenance/predictive/high-risk` - High-risk assets

---

## 📊 Architecture

```
┌─────────────────────────────────────────────────────────┐
│         Aditi Sentinel Control Plane                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │      Maintenance Module (2.8)                    │  │
│  ├──────────────────────────────────────────────────┤  │
│  │                                                  │  │
│  │  Asset Management                                │  │
│  │  ├─ Inventory tracking                          │  │
│  │  ├─ Lifecycle management                        │  │
│  │  └─ Status monitoring                           │  │
│  │                                                  │  │
│  │  Health Monitoring                               │  │
│  │  ├─ Camera health                               │  │
│  │  ├─ Storage monitoring                          │  │
│  │  ├─ Network health                              │  │
│  │  └─ Power/UPS status                            │  │
│  │                                                  │  │
│  │  Preventive Maintenance                          │  │
│  │  ├─ Maintenance plans                           │  │
│  │  ├─ Schedule generation                         │  │
│  │  ├─ Visit tracking                              │  │
│  │  └─ Checklist management                        │  │
│  │                                                  │  │
│  │  Corrective Maintenance                          │  │
│  │  ├─ Work order management                       │  │
│  │  ├─ SLA tracking                                │  │
│  │  └─ Root cause analysis                         │  │
│  │                                                  │  │
│  │  AMC & Vendor Management                         │  │
│  │  ├─ Contract tracking                           │  │
│  │  ├─ Renewal alerts                              │  │
│  │  └─ Performance metrics                         │  │
│  │                                                  │  │
│  │  Firmware & Software Management                  │  │
│  │  ├─ Version tracking                            │  │
│  │  ├─ Update scheduling                           │  │
│  │  └─ Rollback capability                         │  │
│  │                                                  │  │
│  │  Spare Parts Inventory                           │  │
│  │  ├─ Stock tracking                              │  │
│  │  ├─ Reorder alerts                              │  │
│  │  └─ Usage history                               │  │
│  │                                                  │  │
│  │  Predictive Maintenance                          │  │
│  │  ├─ Failure prediction                          │  │
│  │  ├─ Risk scoring                                │  │
│  │  └─ Recommendations                             │  │
│  │                                                  │  │
│  │  Reporting & Analytics                           │  │
│  │  ├─ Maintenance reports                         │  │
│  │  ├─ Cost analysis                               │  │
│  │  ├─ SLA compliance                              │  │
│  │  └─ Trend analysis                              │  │
│  │                                                  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │    Integration Points                            │  │
│  ├──────────────────────────────────────────────────┤  │
│  │ • Compliance Module - Unresolved maintenance    │  │
│  │   issues as compliance exceptions               │  │
│  │ • Incident Module - Link maintenance to         │  │
│  │   incident response                             │  │
│  │ • Analytics Module - Predict failures from      │  │
│  │   behavioral patterns                           │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 🔗 Integration with Compliance

Maintenance findings should automatically flow to the Compliance module:

```typescript
// Example: Unresolved maintenance creates compliance exception
const complianceStatus = await store.getMaintenanceComplianceStatus(tenantId);

if (!complianceStatus.compliant) {
  // Create compliance exception for unresolved maintenance
  await store.createComplianceAssessment({
    tenantId,
    frameworkId: complianceFramework.id,
    status: 'non-compliant',
    evidence: {
      overdueMaintenanceCount: complianceStatus.overdueMaintenanceCount,
      details: `${complianceStatus.overdueMaintenanceCount} overdue maintenance visits`
    }
  });
}
```

---

## 📝 Key Permissions

```
maintenance:view        - View maintenance assets and records
maintenance:create      - Create new maintenance assets
maintenance:update      - Update maintenance records
maintenance:approve     - Approve maintenance plans

workorder:view         - View work orders
workorder:create       - Create work orders
workorder:assign       - Assign technicians
workorder:close        - Close work orders

amc:view              - View AMC contracts
amc:create            - Create new contracts
amc:update            - Update contracts
amc:renew             - Manage renewals

health:view           - View health monitoring
health:acknowledge    - Acknowledge alerts

vendor:view           - View vendors
vendor:manage         - Manage vendor records

firmware:view         - View firmware versions
firmware:update       - Perform firmware updates
firmware:approve      - Approve updates
```

---

## 🎯 Success Metrics

Once fully implemented, this module will provide:

1. **Operational Efficiency**
   - 90%+ camera uptime through proactive maintenance
   - 50% reduction in unplanned downtime
   - 40% faster mean-time-to-repair (MTTR)

2. **Cost Savings**
   - Predictive maintenance reduces spare parts costs by 30%
   - Optimized technician scheduling improves efficiency by 25%
   - Better contract negotiations based on performance data

3. **Compliance & Quality**
   - 100% maintenance documentation compliance
   - Real-time SLA tracking with breach alerts
   - Complete audit trail of all maintenance activities

4. **Risk Management**
   - Early warning system for asset failures
   - Spare parts availability optimization
   - Automated escalation for critical issues

---

## 📚 Documentation References

- **Database Schema**: `database/migrations/016_maintenance.sql`, `017_maintenance_extended.sql`
- **API Routes**: `src/routes/maintenance.routes.ts`, `src/routes/maintenance-dashboard.routes.ts`
- **Store Interface**: `src/control-plane-store.ts`
- **Maintenance Scheduler**: `src/maintenance/scheduler.ts`

---

## 🔧 Development Commands

```bash
# Run migrations
npm run migrate

# Check migration status
npm run migrate:status

# Start development server
npm run dev

# Test specific routes
curl http://localhost:3000/v1/maintenance/dashboard/health

# Build for production
npm run build
```

---

**Last Updated**: 2026-07-21
**Status**: Phase 2 In Progress
**Next Review**: Upon Phase 2 Completion

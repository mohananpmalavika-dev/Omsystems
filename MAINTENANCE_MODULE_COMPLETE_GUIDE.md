# Aditi Sentinel - System Maintenance & Asset Lifecycle Management Module

## Module 2.8: Complete Implementation Guide

**Status**: ✅ Ready for Enhancement  
**Version**: 2.8.1  
**Last Updated**: 2026-07-22

---

## Executive Summary

This guide documents the complete **System Maintenance & Asset Lifecycle Management** module for Aditi Sentinel CCTV. The module ensures maximum uptime, reduces failures, and manages vendor contracts through comprehensive preventive, predictive, and corrective maintenance capabilities.

### Current Status

| Component | Status | Coverage |
|-----------|--------|----------|
| Database Schema | ✅ Complete | 100% |
| Core APIs | ✅ Complete | 100% |
| Store Methods | ✅ Complete | 100% |
| Dashboard APIs | ✅ Complete | 100% |
| Health Monitoring | 🔨 Enhancement Ready | 60% |
| Preventive Maintenance | ✅ Complete | 90% |
| Corrective Maintenance | ✅ Complete | 90% |
| AMC Management | ✅ Complete | 90% |
| Vendor Management | ✅ Complete | 90% |
| Firmware Management | 🔨 Enhancement Ready | 50% |
| Spare Parts Inventory | ✅ Complete | 90% |
| Predictive Analytics | 🔨 Enhancement Ready | 40% |
| Reporting Engine | ✅ Complete | 80% |

---

## Architecture Overview

```
                      Assets & Inventory
                             │
                             ▼
                    Health Monitoring
                  (Real-time Metrics)
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
    Preventive          Predictive         Corrective
    Maintenance         Maintenance        Maintenance
    (Scheduled)         (AI-Based)         (On-Demand)
          │                  │                  │
          └──────────────────┼──────────────────┘
                             ▼
                  Work Order Management
                    (SLA Tracking)
                             │
                             ▼
                     AMC Management
                  (Vendor Contracts)
                             │
                             ▼
                Reports & Compliance
               (Dashboards & Analytics)
```

---

## Table of Contents

1. [Asset Management](#1-asset-management)
2. [Health Monitoring](#2-health-monitoring)
3. [Preventive Maintenance](#3-preventive-maintenance)
4. [Corrective Maintenance](#4-corrective-maintenance)
5. [AMC & Vendor Management](#5-amc--vendor-management)
6. [Firmware & Software Management](#6-firmware--software-management)
7. [Spare Parts Inventory](#7-spare-parts-inventory)
8. [Predictive Maintenance](#8-predictive-maintenance)
9. [Reporting & Analytics](#9-reporting--analytics)
10. [API Reference](#10-api-reference)
11. [Implementation Roadmap](#11-implementation-roadmap)
12. [Integration Guide](#12-integration-guide)

---

## 1. Asset Management

Every physical component in the CCTV infrastructure is tracked as an asset.

### Asset Categories

| Category | Types | Tracking Requirements |
|----------|-------|----------------------|
| **Cameras** | IP, Analog, PTZ, Dome | Serial, Model, Firmware, GPS Location |
| **Recorders** | DVR, NVR, Edge Recorder, Recording Server | CPU, RAM, Storage, RAID Config |
| **Storage** | HDD, SSD, NAS, SAN, Cloud | Capacity, SMART Status, Lifetime |
| **Network** | Switches, PoE, Routers, Firewall, Fiber | Ports, Bandwidth, Firmware |
| **Power** | UPS, Battery, Generator, Power Adapter | Runtime, Battery Health, Load |
| **Accessories** | Mounts, Cables, Junction Boxes, Racks | Warranty, Installation Date |

### Asset Lifecycle States

```
Purchase → Installation → Operational → Degraded → Maintenance → Retired
```

### Database Schema

**Table: `maintenance_assets`**

```sql
- id: uuid PRIMARY KEY
- tenant_id: uuid (tenant isolation)
- category: text (camera/recorder/storage/network/power/accessory)
- asset_type: text (specific type within category)
- serial_number: text
- make: text
- model: text
- firmware_version: text
- warranty_expires_at: date
- purchase_date: date
- installation_date: date
- vendor_id: uuid (FK to maintenance_vendors)
- branch_node_id: uuid (FK to resource_nodes)
- location: text (physical location description)
- mounting_height: text (for cameras)
- status: text (operational/degraded/maintenance_due/offline/retired)
- notes: text
- created_by: uuid
- created_at: timestamptz
- updated_at: timestamptz
```

### API Endpoints

```http
GET    /v1/maintenance/assets              # List all assets
POST   /v1/maintenance/assets              # Create new asset
GET    /v1/maintenance/assets/:id          # Get asset details
PATCH  /v1/maintenance/assets/:id          # Update asset
DELETE /v1/maintenance/assets/:id          # Retire asset

# Query Parameters
?category=camera                            # Filter by category
?status=operational                         # Filter by status
?branch_node_id=xxx                         # Filter by branch
```

### Asset Creation Example

```json
POST /v1/maintenance/assets
{
  "category": "camera",
  "asset_type": "PTZ Dome Camera",
  "serial_number": "CAM-2024-001",
  "make": "Hikvision",

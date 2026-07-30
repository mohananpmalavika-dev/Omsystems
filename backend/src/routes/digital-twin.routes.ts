/**
 * Digital Twin API Routes
 * REST endpoints for Digital Twin operations
 */

import { Router } from 'express';
import multer from 'multer';
import { authenticate, requirePermission } from '../middleware/auth';
import digitalTwinService from '../services/digital-twin.service';
import floorPlanService from '../services/floor-plan.service';
import twinObjectService from '../services/twin-object.service';
import deviceBindingService from '../services/device-binding.service';
import zoneService from '../services/zone.service';
import spatialAlertService from '../services/spatial-alert.service';
import floorStateService from '../services/floor-state.service';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PNG, JPEG, SVG, and PDF are allowed.'));
    }
  },
});

// ==================== Sites ====================

// Create site
router.post('/sites', authenticate, async (req, res) => {
  try {
    const site = await digitalTwinService.createSite(req.body, req.user.id);
    res.status(201).json(site);
  } catch (error) {
    console.error('Error creating site:', error);
    res.status(500).json({ error: 'Failed to create site' });
  }
});

// Get site
router.get('/sites/:siteId', authenticate, async (req, res) => {
  try {
    const site = await digitalTwinService.getSite(req.params.siteId);
    if (!site) {
      return res.status(404).json({ error: 'Site not found' });
    }
    res.json(site);
  } catch (error) {
    console.error('Error getting site:', error);
    res.status(500).json({ error: 'Failed to get site' });
  }
});

// List sites for organization
router.get('/organizations/:organizationId/sites', authenticate, async (req, res) => {
  try {
    const sites = await digitalTwinService.listSites(req.params.organizationId);
    res.json(sites);
  } catch (error) {
    console.error('Error listing sites:', error);
    res.status(500).json({ error: 'Failed to list sites' });
  }
});

// Update site
router.patch('/sites/:siteId', authenticate, async (req, res) => {
  try {
    const site = await digitalTwinService.updateSite(req.params.siteId, req.body, req.user.id);
    res.json(site);
  } catch (error) {
    console.error('Error updating site:', error);
    res.status(500).json({ error: 'Failed to update site' });
  }
});

// Delete site
router.delete('/sites/:siteId', authenticate, async (req, res) => {
  try {
    await digitalTwinService.deleteSite(req.params.siteId, req.user.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting site:', error);
    res.status(500).json({ error: 'Failed to delete site' });
  }
});

// ==================== Buildings ====================

// Create building
router.post('/buildings', authenticate, async (req, res) => {
  try {
    const building = await digitalTwinService.createBuilding(req.body, req.user.id);
    res.status(201).json(building);
  } catch (error) {
    console.error('Error creating building:', error);
    res.status(500).json({ error: 'Failed to create building' });
  }
});

// Get building
router.get('/buildings/:buildingId', authenticate, async (req, res) => {
  try {
    const building = await digitalTwinService.getBuilding(req.params.buildingId);
    if (!building) {
      return res.status(404).json({ error: 'Building not found' });
    }
    res.json(building);
  } catch (error) {
    console.error('Error getting building:', error);
    res.status(500).json({ error: 'Failed to get building' });
  }
});

// List buildings for site
router.get('/sites/:siteId/buildings', authenticate, async (req, res) => {
  try {
    const buildings = await digitalTwinService.listBuildings(req.params.siteId);
    res.json(buildings);
  } catch (error) {
    console.error('Error listing buildings:', error);
    res.status(500).json({ error: 'Failed to list buildings' });
  }
});

// Get building by branch
router.get('/branches/:branchId/building', authenticate, async (req, res) => {
  try {
    const building = await digitalTwinService.getBuildingByBranch(req.params.branchId);
    if (!building) {
      return res.status(404).json({ error: 'Building not found for this branch' });
    }
    res.json(building);
  } catch (error) {
    console.error('Error getting building by branch:', error);
    res.status(500).json({ error: 'Failed to get building' });
  }
});

// Update building
router.patch('/buildings/:buildingId', authenticate, async (req, res) => {
  try {
    const building = await digitalTwinService.updateBuilding(req.params.buildingId, req.body, req.user.id);
    res.json(building);
  } catch (error) {
    console.error('Error updating building:', error);
    res.status(500).json({ error: 'Failed to update building' });
  }
});

// Delete building
router.delete('/buildings/:buildingId', authenticate, async (req, res) => {
  try {
    await digitalTwinService.deleteBuilding(req.params.buildingId, req.user.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting building:', error);
    res.status(500).json({ error: 'Failed to delete building' });
  }
});

// ==================== Floors ====================

// Create floor
router.post('/floors', authenticate, async (req, res) => {
  try {
    const floor = await digitalTwinService.createFloor(req.body, req.user.id);
    res.status(201).json(floor);
  } catch (error) {
    console.error('Error creating floor:', error);
    res.status(500).json({ error: 'Failed to create floor' });
  }
});

// Get floor
router.get('/floors/:floorId', authenticate, async (req, res) => {
  try {
    const floor = await digitalTwinService.getFloor(req.params.floorId);
    if (!floor) {
      return res.status(404).json({ error: 'Floor not found' });
    }
    res.json(floor);
  } catch (error) {
    console.error('Error getting floor:', error);
    res.status(500).json({ error: 'Failed to get floor' });
  }
});

// List floors for building
router.get('/buildings/:buildingId/floors', authenticate, async (req, res) => {
  try {
    const floors = await digitalTwinService.listFloors(req.params.buildingId);
    res.json(floors);
  } catch (error) {
    console.error('Error listing floors:', error);
    res.status(500).json({ error: 'Failed to list floors' });
  }
});

// Update floor
router.patch('/floors/:floorId', authenticate, async (req, res) => {
  try {
    const floor = await digitalTwinService.updateFloor(req.params.floorId, req.body, req.user.id);
    res.json(floor);
  } catch (error) {
    console.error('Error updating floor:', error);
    res.status(500).json({ error: 'Failed to update floor' });
  }
});

// Delete floor
router.delete('/floors/:floorId', authenticate, async (req, res) => {
  try {
    await digitalTwinService.deleteFloor(req.params.floorId, req.user.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting floor:', error);
    res.status(500).json({ error: 'Failed to delete floor' });
  }
});

// ==================== Floor Plans ====================

// Upload floor plan
router.post('/floor-plans', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const request = {
      floorId: req.body.floorId,
      fileType: req.body.fileType || req.file.mimetype.split('/')[1],
      scaleMetersPerPixel: req.body.scaleMetersPerPixel ? parseFloat(req.body.scaleMetersPerPixel) : undefined,
      originX: req.body.originX ? parseFloat(req.body.originX) : undefined,
      originY: req.body.originY ? parseFloat(req.body.originY) : undefined,
      rotationDegrees: req.body.rotationDegrees ? parseFloat(req.body.rotationDegrees) : undefined,
      metadata: req.body.metadata ? JSON.parse(req.body.metadata) : undefined,
    };

    const floorPlan = await floorPlanService.uploadFloorPlan(
      request,
      req.file.buffer,
      req.file.originalname,
      req.user.id
    );

    res.status(201).json(floorPlan);
  } catch (error) {
    console.error('Error uploading floor plan:', error);
    res.status(500).json({ error: 'Failed to upload floor plan' });
  }
});

// Get active floor plan
router.get('/floors/:floorId/floor-plan', authenticate, async (req, res) => {
  try {
    const floorPlan = await floorPlanService.getActiveFloorPlan(req.params.floorId);
    if (!floorPlan) {
      return res.status(404).json({ error: 'No floor plan found' });
    }
    res.json(floorPlan);
  } catch (error) {
    console.error('Error getting floor plan:', error);
    res.status(500).json({ error: 'Failed to get floor plan' });
  }
});

// List floor plan versions
router.get('/floors/:floorId/floor-plan-versions', authenticate, async (req, res) => {
  try {
    const versions = await floorPlanService.listFloorPlanVersions(req.params.floorId);
    res.json(versions);
  } catch (error) {
    console.error('Error listing floor plan versions:', error);
    res.status(500).json({ error: 'Failed to list versions' });
  }
});

// Update floor plan transform
router.patch('/floor-plans/:planId/transform', authenticate, async (req, res) => {
  try {
    const floorPlan = await floorPlanService.updateFloorPlanTransform(
      req.params.planId,
      req.body,
      req.user.id
    );
    res.json(floorPlan);
  } catch (error) {
    console.error('Error updating floor plan transform:', error);
    res.status(500).json({ error: 'Failed to update transform' });
  }
});

// Activate floor plan version
router.post('/floor-plans/:planId/activate', authenticate, async (req, res) => {
  try {
    const floorPlan = await floorPlanService.activateFloorPlanVersion(
      req.params.planId,
      req.body.floorId,
      req.user.id
    );
    res.json(floorPlan);
  } catch (error) {
    console.error('Error activating floor plan:', error);
    res.status(500).json({ error: 'Failed to activate floor plan' });
  }
});

// Delete floor plan
router.delete('/floor-plans/:planId', authenticate, async (req, res) => {
  try {
    await floorPlanService.deleteFloorPlan(req.params.planId, req.user.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting floor plan:', error);
    res.status(500).json({ error: 'Failed to delete floor plan' });
  }
});

// ==================== Objects ====================

// Create object
router.post('/objects', authenticate, async (req, res) => {
  try {
    const object = await twinObjectService.createObject(req.body, req.user.id);
    res.status(201).json(object);
  } catch (error) {
    console.error('Error creating object:', error);
    res.status(500).json({ error: 'Failed to create object' });
  }
});

// Bulk create objects
router.post('/objects/bulk', authenticate, async (req, res) => {
  try {
    const objects = await twinObjectService.bulkCreateObjects(req.body.objects, req.user.id);
    res.status(201).json(objects);
  } catch (error) {
    console.error('Error bulk creating objects:', error);
    res.status(500).json({ error: 'Failed to create objects' });
  }
});

// Get object
router.get('/objects/:objectId', authenticate, async (req, res) => {
  try {
    const object = await twinObjectService.getObject(req.params.objectId);
    if (!object) {
      return res.status(404).json({ error: 'Object not found' });
    }
    res.json(object);
  } catch (error) {
    console.error('Error getting object:', error);
    res.status(500).json({ error: 'Failed to get object' });
  }
});

// List objects for floor
router.get('/floors/:floorId/objects', authenticate, async (req, res) => {
  try {
    const objectType = req.query.type as any;
    const objects = await twinObjectService.listObjects(req.params.floorId, objectType);
    res.json(objects);
  } catch (error) {
    console.error('Error listing objects:', error);
    res.status(500).json({ error: 'Failed to list objects' });
  }
});

// Search objects
router.get('/floors/:floorId/objects/search', authenticate, async (req, res) => {
  try {
    const searchTerm = req.query.q as string;
    if (!searchTerm) {
      return res.status(400).json({ error: 'Search term required' });
    }
    const objects = await twinObjectService.searchObjects(req.params.floorId, searchTerm);
    res.json(objects);
  } catch (error) {
    console.error('Error searching objects:', error);
    res.status(500).json({ error: 'Failed to search objects' });
  }
});

// Update object
router.patch('/objects/:objectId', authenticate, async (req, res) => {
  try {
    const object = await twinObjectService.updateObject(req.params.objectId, req.body, req.user.id);
    res.json(object);
  } catch (error) {
    console.error('Error updating object:', error);
    res.status(500).json({ error: 'Failed to update object' });
  }
});

// Update object position
router.patch('/objects/:objectId/position', authenticate, async (req, res) => {
  try {
    const object = await twinObjectService.updateObjectPosition(
      req.params.objectId,
      req.body,
      req.user.id
    );
    res.json(object);
  } catch (error) {
    console.error('Error updating object position:', error);
    res.status(500).json({ error: 'Failed to update position' });
  }
});

// Delete object
router.delete('/objects/:objectId', authenticate, async (req, res) => {
  try {
    await twinObjectService.deleteObject(req.params.objectId, req.user.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting object:', error);
    res.status(500).json({ error: 'Failed to delete object' });
  }
});

// ==================== Device Bindings ====================

// Create device binding
router.post('/device-bindings', authenticate, async (req, res) => {
  try {
    const binding = await deviceBindingService.createBinding(req.body, req.user.id);
    res.status(201).json(binding);
  } catch (error) {
    console.error('Error creating device binding:', error);
    res.status(500).json({ error: 'Failed to create binding' });
  }
});

// Get binding by object
router.get('/objects/:objectId/binding', authenticate, async (req, res) => {
  try {
    const binding = await deviceBindingService.getBindingByObject(req.params.objectId);
    if (!binding) {
      return res.status(404).json({ error: 'Binding not found' });
    }
    res.json(binding);
  } catch (error) {
    console.error('Error getting binding:', error);
    res.status(500).json({ error: 'Failed to get binding' });
  }
});

// Get binding by device
router.get('/devices/:deviceType/:deviceId/binding', authenticate, async (req, res) => {
  try {
    const binding = await deviceBindingService.getBindingByDevice(
      req.params.deviceType as any,
      req.params.deviceId
    );
    if (!binding) {
      return res.status(404).json({ error: 'Binding not found' });
    }
    res.json(binding);
  } catch (error) {
    console.error('Error getting binding by device:', error);
    res.status(500).json({ error: 'Failed to get binding' });
  }
});

// List bindings for floor
router.get('/floors/:floorId/bindings', authenticate, async (req, res) => {
  try {
    const bindings = await deviceBindingService.listBindingsByFloor(req.params.floorId);
    res.json(bindings);
  } catch (error) {
    console.error('Error listing bindings:', error);
    res.status(500).json({ error: 'Failed to list bindings' });
  }
});

// Update binding
router.patch('/device-bindings/:bindingId', authenticate, async (req, res) => {
  try {
    const binding = await deviceBindingService.updateBinding(
      req.params.bindingId,
      req.body,
      req.user.id
    );
    res.json(binding);
  } catch (error) {
    console.error('Error updating binding:', error);
    res.status(500).json({ error: 'Failed to update binding' });
  }
});

// Delete binding
router.delete('/device-bindings/:bindingId', authenticate, async (req, res) => {
  try {
    await deviceBindingService.deleteBinding(req.params.bindingId, req.user.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting binding:', error);
    res.status(500).json({ error: 'Failed to delete binding' });
  }
});

// ==================== Zones ====================

// Create zone
router.post('/zones', authenticate, async (req, res) => {
  try {
    const zone = await zoneService.createZone(req.body, req.user.id);
    res.status(201).json(zone);
  } catch (error) {
    console.error('Error creating zone:', error);
    res.status(500).json({ error: 'Failed to create zone' });
  }
});

// Get zone
router.get('/zones/:zoneId', authenticate, async (req, res) => {
  try {
    const zone = await zoneService.getZone(req.params.zoneId);
    if (!zone) {
      return res.status(404).json({ error: 'Zone not found' });
    }
    res.json(zone);
  } catch (error) {
    console.error('Error getting zone:', error);
    res.status(500).json({ error: 'Failed to get zone' });
  }
});

// List zones for floor
router.get('/floors/:floorId/zones', authenticate, async (req, res) => {
  try {
    const zoneType = req.query.type as string;
    const zones = await zoneService.listZones(req.params.floorId, zoneType);
    res.json(zones);
  } catch (error) {
    console.error('Error listing zones:', error);
    res.status(500).json({ error: 'Failed to list zones' });
  }
});

// Find zones containing point
router.post('/floors/:floorId/zones/find-point', authenticate, async (req, res) => {
  try {
    const { x, y } = req.body;
    if (x === undefined || y === undefined) {
      return res.status(400).json({ error: 'Point coordinates required' });
    }
    const zones = await zoneService.findZonesContainingPoint(req.params.floorId, { x, y });
    res.json(zones);
  } catch (error) {
    console.error('Error finding zones:', error);
    res.status(500).json({ error: 'Failed to find zones' });
  }
});

// Get restricted zones
router.get('/floors/:floorId/zones/restricted', authenticate, async (req, res) => {
  try {
    const zones = await zoneService.getRestrictedZones(req.params.floorId);
    res.json(zones);
  } catch (error) {
    console.error('Error getting restricted zones:', error);
    res.status(500).json({ error: 'Failed to get restricted zones' });
  }
});

// Update zone
router.patch('/zones/:zoneId', authenticate, async (req, res) => {
  try {
    const zone = await zoneService.updateZone(req.params.zoneId, req.body, req.user.id);
    res.json(zone);
  } catch (error) {
    console.error('Error updating zone:', error);
    res.status(500).json({ error: 'Failed to update zone' });
  }
});

// Delete zone
router.delete('/zones/:zoneId', authenticate, async (req, res) => {
  try {
    await zoneService.deleteZone(req.params.zoneId, req.user.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting zone:', error);
    res.status(500).json({ error: 'Failed to delete zone' });
  }
});

// ==================== Alerts ====================

// Create alert marker
router.post('/alerts', authenticate, async (req, res) => {
  try {
    const alert = await spatialAlertService.createAlertMarker(req.body);
    res.status(201).json(alert);
  } catch (error) {
    console.error('Error creating alert:', error);
    res.status(500).json({ error: 'Failed to create alert' });
  }
});

// Get alert
router.get('/alerts/:alertId', authenticate, async (req, res) => {
  try {
    const alert = await spatialAlertService.getAlertMarker(req.params.alertId);
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    res.json(alert);
  } catch (error) {
    console.error('Error getting alert:', error);
    res.status(500).json({ error: 'Failed to get alert' });
  }
});

// List active alerts
router.get('/floors/:floorId/alerts/active', authenticate, async (req, res) => {
  try {
    const alerts = await spatialAlertService.listActiveAlerts(req.params.floorId);
    res.json(alerts);
  } catch (error) {
    console.error('Error listing active alerts:', error);
    res.status(500).json({ error: 'Failed to list alerts' });
  }
});

// List alert history
router.get('/floors/:floorId/alerts/history', authenticate, async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const alerts = await spatialAlertService.listAlertHistory(req.params.floorId, limit);
    res.json(alerts);
  } catch (error) {
    console.error('Error listing alert history:', error);
    res.status(500).json({ error: 'Failed to list alert history' });
  }
});

// Get alerts by severity
router.get('/floors/:floorId/alerts/severity/:severity', authenticate, async (req, res) => {
  try {
    const alerts = await spatialAlertService.getAlertsBySeverity(
      req.params.floorId,
      req.params.severity as any
    );
    res.json(alerts);
  } catch (error) {
    console.error('Error getting alerts by severity:', error);
    res.status(500).json({ error: 'Failed to get alerts' });
  }
});

// Get alerts by type
router.get('/floors/:floorId/alerts/type/:type', authenticate, async (req, res) => {
  try {
    const alerts = await spatialAlertService.getAlertsByType(
      req.params.floorId,
      req.params.type as any
    );
    res.json(alerts);
  } catch (error) {
    console.error('Error getting alerts by type:', error);
    res.status(500).json({ error: 'Failed to get alerts' });
  }
});

// Get alerts by incident
router.get('/incidents/:incidentId/alerts', authenticate, async (req, res) => {
  try {
    const alerts = await spatialAlertService.getAlertsByIncident(req.params.incidentId);
    res.json(alerts);
  } catch (error) {
    console.error('Error getting alerts by incident:', error);
    res.status(500).json({ error: 'Failed to get alerts' });
  }
});

// Acknowledge alert
router.post('/alerts/:alertId/acknowledge', authenticate, async (req, res) => {
  try {
    const alert = await spatialAlertService.acknowledgeAlert(req.params.alertId, req.user.id);
    res.json(alert);
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

// Resolve alert
router.post('/alerts/:alertId/resolve', authenticate, async (req, res) => {
  try {
    const alert = await spatialAlertService.resolveAlert(req.params.alertId, req.user.id);
    res.json(alert);
  } catch (error) {
    console.error('Error resolving alert:', error);
    res.status(500).json({ error: 'Failed to resolve alert' });
  }
});

// Delete alert
router.delete('/alerts/:alertId', authenticate, async (req, res) => {
  try {
    await spatialAlertService.deleteAlertMarker(req.params.alertId);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting alert:', error);
    res.status(500).json({ error: 'Failed to delete alert' });
  }
});

// ==================== Floor State ====================

// Get complete floor state
router.get('/floors/:floorId/state', authenticate, async (req, res) => {
  try {
    const state = await floorStateService.getFloorState(req.params.floorId);
    res.json(state);
  } catch (error) {
    console.error('Error getting floor state:', error);
    res.status(500).json({ error: 'Failed to get floor state' });
  }
});

// Get multi-floor state
router.get('/buildings/:buildingId/state', authenticate, async (req, res) => {
  try {
    const state = await floorStateService.getMultiFloorState(req.params.buildingId);
    res.json(state);
  } catch (error) {
    console.error('Error getting multi-floor state:', error);
    res.status(500).json({ error: 'Failed to get multi-floor state' });
  }
});

export default router;

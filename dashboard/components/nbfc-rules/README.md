# NBFC Rules & Zone Configuration System

## Overview

This directory contains the comprehensive AI Rules & Automation workspace for NBFC surveillance systems, including advanced zone configuration with camera live view integration.

## Components

### `nbfc-rules-workspace.tsx`
Main workspace component providing:
- **AI Rules Management**: Create, edit, delete, and manage surveillance rules
- **Zone Designer**: Visual polygon and tripwire drawing on camera feed
- **Template Library**: Pre-configured rule and zone templates
- **Real-time Validation**: Comprehensive validation system
- **Multi-Camera Support**: Switch between cameras with live feed
- **Rule Engine Integration**: Direct integration with analytics engine

### `zone-enhancement-utils.ts`
Validation and utility functions:
- Polygon self-intersection detection
- Area and perimeter calculations
- Zone conflict detection
- Template management
- Import/export functionality

## Features

### 1. Camera Live View Integration
- **Multi-endpoint fallback**: Automatically tries multiple snapshot sources
- **Real-time loading**: Snapshot updates when camera changes
- **Graceful fallback**: Grid background if snapshot unavailable
- **Visual overlay**: Semi-transparent overlay for zone visibility

### 2. Zone Validation System
- **Polygon validation**: Self-intersection, minimum area, convexity checks
- **Tripwire validation**: Length, orientation, direction validation
- **Real-time feedback**: Visual errors and success indicators
- **Save prevention**: Invalid zones cannot be saved

### 3. Advanced Drawing UX
- **Undo/Redo**: Full history stack with button and keyboard controls
- **Keyboard shortcuts**: Ctrl+Z, Ctrl+Y, ESC, Enter, Backspace
- **Snap to grid**: Optional 5% grid alignment
- **Real-time measurements**: Area, perimeter, length display
- **Visual hints**: Close-polygon circle, vertex numbering, direction arrows

### 4. Zone Management
- **Edit zones**: Load existing zones into canvas for modification
- **Duplicate zones**: Quick copy with offset positioning
- **Delete zones**: Confirmation dialog before removal
- **Visual overlay**: See existing zones while drawing new ones

### 5. Template Library
Six built-in templates plus extensible system:
- 🔒 Vault - Gold locker cage boundary
- 💵 Counter - Teller cash drawer zone
- ⚡ Door - Entrance tripwire
- 👥 Queue - Customer waiting area
- 🏧 ATM - ATM lobby monitoring
- ⚠️ Restricted - Staff-only high-security zone

### 6. Rule Engine Integration
- **NBFC-specific rules**: Banking and gold loan compliance templates
- **Shadow mode**: Test rules before activation
- **Multi-scope**: Branch, camera, or global rules
- **Severity levels**: Critical, High, Medium, Low, Info
- **Action matrix**: Alerts, incidents, evidence capture, notifications

## Usage

### Basic Zone Creation

```typescript
// 1. Select camera from dropdown
// 2. Choose Polygon or Tripwire mode
// 3. Click on canvas to draw points
// 4. Press Enter or click near first point to close polygon
// 5. Configure zone name and type
// 6. Click "Save Zone"
```

### Applying Templates

```typescript
// Click any template button (e.g., "🔒 Vault")
// Zone instantly appears on canvas
// Modify if needed
// Save
```

### Editing Existing Zones

```typescript
// In zone list, click Edit icon (✏️)
// Zone loads into canvas
// Modify vertices, name, or type
// Click "Update Zone"
// OR click "Cancel Edit" to discard changes
```

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Z` | Undo last point |
| `Ctrl+Y` or `Ctrl+Shift+Z` | Redo |
| `ESC` | Cancel and clear canvas |
| `Enter` | Complete polygon (when ≥3 points) |
| `Backspace` or `Delete` | Remove last point |

## API Endpoints

### Zone Operations
```typescript
GET    /api/ai/zones?cameraId={id}     // List zones
POST   /api/ai/zones                   // Create zone
PATCH  /api/ai/zones/:id               // Update zone
DELETE /api/ai/zones/:id               // Delete zone
```

### Camera Feed
```typescript
GET /api/media/snapshots/{cameraId}.jpg           // Primary
GET /api/v1/media/snapshots/{cameraId}.jpg        // Fallback 1
GET /api/cameras/{cameraId}/snapshot              // Fallback 2
```

### Rules Operations
```typescript
GET    /api/ai/rules                   // List rules
POST   /api/ai/rules                   // Create rule
PATCH  /api/ai/rules/:id               // Update rule
DELETE /api/ai/rules/:id               // Delete rule
POST   /api/ai/rules/:id/enable        // Enable rule
POST   /api/ai/rules/:id/disable       // Disable rule
POST   /api/ai/rules/:id/shadow        // Toggle shadow mode
```

## Data Models

### AnalyticsZone
```typescript
interface AnalyticsZone {
  id: string;
  tenantId: string;
  branchId: string;
  cameraId: string;
  name: string;
  type: AnalyticsZoneType;
  polygon: NormalizedPoint[];
  enabled: boolean;
  createdBy: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
```

### NormalizedPoint
```typescript
interface NormalizedPoint {
  x: number; // 0.0 to 1.0
  y: number; // 0.0 to 1.0
}
```

### AnalyticsZoneType
```typescript
type AnalyticsZoneType =
  | "CUSTOMER_AREA"
  | "QUEUE_AREA"
  | "CASH_COUNTER"
  | "STAFF_AREA"
  | "RESTRICTED_AREA"
  | "LOCKER"
  | "STRONG_ROOM"
  | "SERVER_ROOM"
  | "ENTRANCE"
  | "EXIT"
  | "CASH_VAN_AREA"
  | "ATM_AREA"
  | "CUSTOM";
```

## Validation Rules

### Polygon Zones
- **Minimum vertices**: 3 points
- **Minimum area**: 0.1% of frame (0.001 normalized)
- **No self-intersection**: Edges cannot cross
- **Coordinate range**: 0.0 to 1.0 (normalized)
- **Vertex spacing**: Warning if points < 1% apart

### Tripwire Lines
- **Exact vertices**: 2 points
- **Minimum length**: 5% of frame width (0.05 normalized)
- **Maximum length**: 150% of frame diagonal
- **Coordinate range**: 0.0 to 1.0 (normalized)
- **Orientation**: Warning for near-horizontal/vertical

## State Management

```typescript
// Camera & Snapshot
const [cameraSnapshot, setCameraSnapshot] = useState<string | null>(null);
const [imageRef] = useRef<HTMLImageElement | null>(null);

// Drawing
const [drawnPoints, setDrawnPoints] = useState<Point[]>([]);
const [undoStack, setUndoStack] = useState<Point[][]>([]);
const [redoStack, setRedoStack] = useState<Point[][]>([]);

// Validation
const [validationErrors, setValidationErrors] = useState<string[]>([]);

// UX Options
const [snapToGrid, setSnapToGrid] = useState(false);
const [showMeasurements, setShowMeasurements] = useState(true);

// Edit Mode
const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
```

## Styling

Uses Tailwind CSS with custom color scheme:
- **Primary**: Red (#ef4444, #dc2626)
- **Success**: Emerald (#10b981, #059669)
- **Warning**: Amber (#f59e0b, #d97706)
- **Info**: Blue (#3b82f6, #2563eb)
- **Background**: Dark grays (#0b0f19, #1a1f2e)

## Performance Considerations

### Optimization Strategies
1. **Debounced canvas rendering**: Limits redraws during rapid interactions
2. **Lazy snapshot loading**: Only loads when zone tab active
3. **Cleanup**: Blob URLs revoked when camera changes
4. **Limited undo history**: Max 50 states to prevent memory bloat
5. **Conditional validation**: Only runs when points change

### Memory Usage
- **Snapshot cache**: ~500KB per camera
- **Undo stack**: ~10KB per state × 50 states = ~500KB
- **Total typical**: < 10MB for normal usage

## Browser Support

| Browser | Version | Status |
|---------|---------|--------|
| Chrome  | 90+     | ✅ Full support |
| Edge    | 90+     | ✅ Full support |
| Firefox | 88+     | ✅ Full support |
| Safari  | 14+     | ✅ Full support |

**Requirements:**
- Canvas API
- ES6+ JavaScript
- Fetch API
- localStorage

## Troubleshooting

### Camera Snapshot Not Loading
**Symptoms:** Black canvas or "Camera snapshot not available" message

**Solutions:**
1. Check camera is online in camera list
2. Verify camera has snapshot endpoint configured
3. Check network console for CORS errors
4. Verify authentication token is valid
5. Try different camera to isolate issue

### Validation Errors Persist
**Symptoms:** Cannot save valid-looking zone

**Solutions:**
1. Check validation error panel below canvas
2. Verify polygon has no self-intersections
3. Ensure area > 0.1% of frame
4. Check all coordinates are 0.0-1.0
5. Try clearing and redrawing

### Undo/Redo Not Working
**Symptoms:** Buttons disabled or no effect

**Solutions:**
1. Verify points have been drawn (stack not empty)
2. Check browser console for JavaScript errors
3. Try keyboard shortcuts (Ctrl+Z/Y)
4. Refresh page if state corrupted

### Template Not Applying
**Symptoms:** Click template button, nothing happens

**Solutions:**
1. Check console for errors
2. Verify template definition exists
3. Ensure camera is selected
4. Try different template

## Testing

See `ZONE_FEATURE_TESTING_GUIDE.md` for comprehensive testing procedures.

### Quick Smoke Test
1. ✅ Load page, select camera
2. ✅ Snapshot loads (or fallback grid)
3. ✅ Draw 4-point polygon
4. ✅ See green validation checkmark
5. ✅ Save zone successfully
6. ✅ Zone appears in list
7. ✅ Edit zone, modify, update
8. ✅ Undo/redo works
9. ✅ Template applies
10. ✅ Delete zone

## Development

### Adding New Templates
```typescript
// In zone-enhancement-utils.ts
export const ZONE_TEMPLATES: ZoneTemplate[] = [
  // ... existing templates
  {
    id: "new-template",
    name: "New Template Name",
    description: "Description of the zone",
    type: "ZONE_TYPE",
    polygon: [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.1, y: 0.9 },
    ],
    icon: "🆕",
  },
];
```

### Adding New Validation Rules
```typescript
// In zone-enhancement-utils.ts
export function validateCustomRule(points: Point[]): ZoneValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Your validation logic here
  
  return { isValid: errors.length === 0, errors, warnings };
}
```

### Extending Zone Types
```typescript
// In src/domain/nbfc-analytics.types.ts
export type AnalyticsZoneType =
  | /* ... existing types */
  | "NEW_ZONE_TYPE";
```

## Dependencies

- React 18+
- Lucide React (icons)
- Tailwind CSS 3+
- TypeScript 4.9+

## Contributing

When adding new features:
1. Add validation if needed
2. Update types in `nbfc-analytics.types.ts`
3. Add tests to testing guide
4. Update this README
5. Follow existing code style
6. Test on multiple browsers

## License

Proprietary - OM Systems Surveillance Platform

## Support

For issues or questions:
- Check troubleshooting section above
- Review testing guide for validation
- Contact platform team
- File GitHub issue with bug template

---

**Last Updated:** 2026-09-23
**Version:** 2.0.0 (Enhanced with camera live view)
**Author:** OM Systems Development Team

# Zone Configuration System - Testing Guide

## Quick Start Testing

### 1. Camera Live View Integration Test

**Steps:**
1. Navigate to "AI Rules & Automation" page
2. Click on "Zone Manager" tab
3. Select a camera from the dropdown
4. **Expected:** Camera snapshot should load on the canvas within 2-3 seconds
5. **Expected:** If snapshot unavailable, see amber warning: "Camera snapshot not available. Drawing on blank canvas."

**Test Cases:**
- ✅ Valid camera with snapshot available
- ✅ Valid camera without snapshot (fallback to grid)
- ✅ Camera switch (new snapshot loads)
- ✅ Loading spinner appears during fetch
- ✅ Error message displays on failure

---

### 2. Zone Validation System Test

#### Polygon Tests

**Test A: Valid Polygon**
1. Click 4 points to form a rectangle
2. **Expected:** Green shading, checkmark, area percentage displayed
3. Click "Save Zone"
4. **Expected:** Zone saves successfully

**Test B: Invalid - Self-Intersecting**
1. Click points that cross over: [0.2,0.2] → [0.8,0.2] → [0.2,0.8] → [0.8,0.8]
2. **Expected:** Red error panel: "Polygon edges intersect themselves"
3. Save button disabled

**Test C: Invalid - Too Small**
1. Click 3 very close points (within 5% of each other)
2. **Expected:** Red error: "Polygon area is too small"
3. Save button disabled

#### Tripwire Tests

**Test D: Valid Tripwire**
1. Switch to "Virtual Tripwire" mode
2. Click 2 points across the frame
3. **Expected:** Blue dashed line with arrow, length percentage shown
4. **Expected:** Save button enabled

**Test E: Invalid - Too Short**
1. Switch to "Virtual Tripwire" mode
2. Click 2 very close points
3. **Expected:** Red error: "Tripwire is too short"
4. Save button disabled

---

### 3. Zone Editing Capabilities Test

**Test A: Edit Existing Zone**
1. Create and save a zone
2. Click the edit icon (✏️) on the zone card
3. **Expected:** Zone loads into canvas
4. **Expected:** "Editing Mode" indicator appears
5. **Expected:** Zone name and type pre-filled
6. Modify zone by adding/removing points
7. Click "Update Zone"
8. **Expected:** Zone updates, "Editing Mode" clears

**Test B: Duplicate Zone**
1. Click duplicate icon (📋) on any zone
2. **Expected:** Zone copies with offset position
3. **Expected:** Name appended with " (Copy)"
4. Modify and save as new zone

**Test C: Cancel Editing**
1. Start editing a zone
2. Make some changes
3. Click "Cancel Edit" button
4. **Expected:** Canvas clears, editing mode exits, original zone unchanged

---

### 4. Undo/Redo and Keyboard Shortcuts Test

**Test A: Undo/Redo Buttons**
1. Click 5 points on canvas
2. Click "Undo" button 2 times
3. **Expected:** Last 2 points removed
4. Click "Redo" button once
5. **Expected:** One point restored
6. **Expected:** Undo/redo buttons disabled when stack empty

**Test B: Keyboard Shortcuts**
1. Click 3 points
2. Press **Ctrl+Z**
3. **Expected:** Last point removed
4. Press **Ctrl+Y**
5. **Expected:** Point restored
6. Press **ESC**
7. **Expected:** Canvas clears completely
8. Click 4 points to form polygon
9. Press **Enter**
10. **Expected:** Polygon completes (no new points added)
11. Click 2 points
12. Press **Backspace**
13. **Expected:** Last point removed

---

### 5. Drawing UX Enhancements Test

**Test A: Snap to Grid**
1. Enable "Snap to Grid (5%)" checkbox
2. Click anywhere on canvas
3. **Expected:** Point snaps to nearest 5% grid intersection
4. **Expected:** Coordinates are multiples of 0.05 (e.g., 0.25, 0.50, 0.75)

**Test B: Show Measurements**
1. Ensure "Show Measurements" is enabled
2. Draw a polygon with 4 points
3. **Expected:** "Area: X.X%" displayed in center of polygon
4. Switch to tripwire mode, draw 2 points
5. **Expected:** "XX.X%" length displayed above line
6. Disable "Show Measurements"
7. **Expected:** Measurements disappear

**Test C: Visual Feedback**
1. Draw polygon with 3+ points
2. **Expected:** Green circle appears around first vertex (close hint)
3. **Expected:** Each vertex numbered (1, 2, 3, ...)
4. Switch to tripwire mode
5. Draw 2 points
6. **Expected:** Direction arrow appears at midpoint

---

### 6. Zone Templates Library Test

**Test A: Apply Polygon Templates**
1. Click "🔒 Vault" preset
2. **Expected:** Rectangle zone appears, name="Gold Locker Cage Boundary", type=LOCKER
3. Click "💵 Counter" preset
4. **Expected:** Zone changes to counter position
5. Click "👥 Queue" preset
6. **Expected:** Vertical rectangle for queue area
7. Click "🏧 ATM" preset
8. **Expected:** Right-side rectangle
9. Click "⚠️ Restricted" preset
10. **Expected:** Top-left small rectangle

**Test B: Apply Tripwire Template**
1. Switch to "Virtual Tripwire" mode
2. Click "⚡ Door" preset
3. **Expected:** Horizontal line across middle, name="Main Ingress Doorway Tripwire"

**Test C: Customize Template**
1. Apply any template
2. Immediately edit by adding/removing points
3. Change name and type
4. Save
5. **Expected:** Custom zone saved (not template version)

---

### 7. Conflict Detection and Visual Overlay Test

**Test A: Existing Zones Visible**
1. Create and save 2 zones for the same camera
2. Start drawing a new zone
3. **Expected:** Existing zones shown in dimmed blue on canvas
4. **Expected:** Zone names labeled at center of each existing zone
5. Switch to different camera
6. **Expected:** Existing zones disappear (only same-camera zones shown)

**Test B: Overlap Detection (Visual)**
1. Draw a new zone that overlaps an existing zone
2. **Expected:** Can see the overlap area visually (both colors visible)
3. Complete and save
4. **Expected:** Both zones exist (system allows overlap, shows warning visually)

---

## Advanced Testing Scenarios

### Scenario 1: Multi-Camera Workflow
1. Select Camera A
2. Create 3 zones
3. Switch to Camera B
4. **Expected:** Canvas clears, new snapshot loads
5. Create 2 zones
6. Switch back to Camera A
7. **Expected:** Original 3 zones visible in the list and on canvas

### Scenario 2: Edit During Active Drawing
1. Start drawing new zone (2 points placed)
2. Click edit on existing zone
3. **Expected:** Current drawing discarded, existing zone loads
4. **Expected:** "Editing Mode" indicator appears
5. Cancel editing
6. **Expected:** Returns to blank canvas (previous partial drawing lost)

### Scenario 3: Rapid Camera Switching
1. Select Camera A (wait for snapshot)
2. Immediately select Camera B
3. Immediately select Camera C
4. **Expected:** Only Camera C snapshot loads (previous requests cancelled)
5. **Expected:** No hanging loading states

### Scenario 4: Validation During Editing
1. Edit an existing valid zone
2. Modify to make it invalid (e.g., move points to make area too small)
3. **Expected:** Validation errors appear
4. **Expected:** "Update Zone" button disabled
5. Fix the error
6. **Expected:** Errors clear, button enabled

### Scenario 5: Template Over Existing Drawing
1. Manually draw 3 points
2. Click a template preset
3. **Expected:** Manual drawing replaced by template
4. **Expected:** Undo stack preserves manual drawing (can Ctrl+Z back)

---

## Performance Testing

### Test 1: Large Number of Zones
1. Create 20+ zones on a single camera
2. Switch to zone designer
3. **Expected:** All zones render on canvas without lag
4. **Expected:** Canvas interaction remains responsive

### Test 2: Rapid Undo/Redo
1. Draw 10 points rapidly
2. Press Ctrl+Z 10 times rapidly
3. Press Ctrl+Y 10 times rapidly
4. **Expected:** All operations complete smoothly
5. **Expected:** No visual glitches

### Test 3: Snapshot Loading Performance
1. Switch between 5 different cameras
2. Time each snapshot load
3. **Expected:** Each load completes within 3 seconds
4. **Expected:** If timeout, fallback grid appears

---

## Browser Compatibility Testing

### Chrome/Edge (Chromium)
- ✅ All features should work
- ✅ Canvas rendering smooth
- ✅ Keyboard shortcuts functional

### Firefox
- ✅ All features should work
- ⚠️ Possible slight rendering differences
- ✅ Keyboard shortcuts functional

### Safari
- ✅ Core features work
- ⚠️ Check canvas image loading (CORS)
- ✅ Keyboard shortcuts functional

---

## Error Scenario Testing

### Scenario 1: Network Failure During Snapshot Load
1. Disconnect network
2. Switch camera
3. **Expected:** Error message appears after timeout
4. **Expected:** Grid background shown
5. **Expected:** Can still draw zones

### Scenario 2: Save Failure
1. Draw a valid zone
2. Disconnect network
3. Click "Save Zone"
4. **Expected:** Alert with error message
5. **Expected:** Zone remains on canvas (not cleared)
6. Reconnect network
7. Click "Save Zone" again
8. **Expected:** Zone saves successfully

### Scenario 3: Invalid Camera ID
1. Manually set invalid camera ID in URL/state
2. Load zone designer
3. **Expected:** Graceful error, no crash
4. **Expected:** Dropdown shows "No cameras enrolled" or error state

---

## Accessibility Testing

### Keyboard Navigation
1. Tab through all controls
2. **Expected:** Focus visible on all interactive elements
3. **Expected:** Buttons reachable via keyboard
4. **Expected:** Can trigger undo/redo via keyboard

### Screen Reader Testing
1. Navigate with screen reader
2. **Expected:** Button labels announced
3. **Expected:** Zone count announced
4. **Expected:** Error messages announced

---

## Data Integrity Testing

### Test 1: Coordinate Precision
1. Draw a zone
2. Check saved coordinates in API/DB
3. **Expected:** Coordinates stored as 0.000 to 1.000 (3 decimal precision)
4. **Expected:** No coordinate > 1.0 or < 0.0

### Test 2: Zone Type Validation
1. Select zone type "LOCKER"
2. Save zone
3. Check API response
4. **Expected:** Type stored exactly as "LOCKER" (matching enum)
5. **Expected:** No type transformation or normalization

### Test 3: Branch/Camera Association
1. Select branch B, camera C (from branch B)
2. Create zone
3. **Expected:** Zone associated with both branch B and camera C
4. Query zones by branch
5. **Expected:** Zone appears in branch B zones
6. Query zones by camera
7. **Expected:** Zone appears in camera C zones

---

## Regression Testing Checklist

After any code changes, verify:

- [ ] Camera snapshot loads on valid cameras
- [ ] Validation errors prevent invalid zone saves
- [ ] Undo/redo works correctly
- [ ] Keyboard shortcuts functional
- [ ] Templates apply without errors
- [ ] Edit/duplicate/delete work
- [ ] Multiple zones on same camera display correctly
- [ ] Save/update API calls succeed
- [ ] No console errors during normal operation
- [ ] Zone list updates after CRUD operations
- [ ] Canvas clears properly on mode switch
- [ ] Direction arrows visible for tripwires
- [ ] Measurements display accurately

---

## Bug Reporting Template

When reporting issues, include:

**Environment:**
- Browser: [Chrome/Firefox/Safari] version
- OS: [Windows/Mac/Linux]
- Screen resolution: [1920x1080, etc.]

**Steps to Reproduce:**
1. 
2. 
3. 

**Expected Behavior:**


**Actual Behavior:**


**Screenshots/Video:**


**Console Errors:**


**Network Tab (if relevant):**


---

## Success Criteria

All features pass testing when:

1. ✅ Camera snapshots load reliably (or graceful fallback)
2. ✅ Invalid zones are caught and prevented
3. ✅ Undo/redo preserves drawing history accurately
4. ✅ All keyboard shortcuts work as documented
5. ✅ Templates apply correctly and are editable
6. ✅ Edit mode loads zones accurately
7. ✅ Duplicate creates valid copies
8. ✅ Visual overlays show existing zones clearly
9. ✅ Measurements are mathematically correct
10. ✅ No crashes or unhandled errors occur
11. ✅ Performance is smooth with realistic zone counts
12. ✅ All browsers render correctly
13. ✅ Data integrity maintained through CRUD operations
14. ✅ Error states handled gracefully
15. ✅ Accessibility standards met

**Test Coverage Goal:** 100% of user-facing features tested and passing

---

## Automated Testing Recommendations

For future CI/CD integration:

```typescript
// Unit Tests
- validatePolygonZone() with various inputs
- validateTripwire() with edge cases
- calculatePolygonArea() accuracy
- checkSelfIntersection() correctness
- detectZoneConflicts() overlap detection

// Integration Tests
- API endpoint responses (GET/POST/PATCH/DELETE /api/ai/zones)
- Camera snapshot endpoint fallback logic
- Zone CRUD workflows
- Template application and customization

// E2E Tests (Playwright/Cypress)
- Complete zone creation workflow
- Edit and update existing zone
- Undo/redo interaction sequence
- Keyboard shortcut functionality
- Multi-camera workflow
- Error state handling
```

---

## Performance Benchmarks

**Target Metrics:**
- Snapshot load: < 3 seconds
- Canvas render: < 100ms per frame
- Validation: < 50ms per check
- Save operation: < 500ms
- Undo/redo: < 50ms per step

**Memory:**
- Undo stack: Max 50 states (~10KB per state)
- Image cache: One snapshot per camera (~500KB each)
- Total memory: < 50MB for typical usage

---

**Testing Completed:** [ ] Yes [ ] No
**Tested By:** _________________
**Date:** _________________
**Issues Found:** _________________
**Status:** [ ] Pass [ ] Fail [ ] Needs Fixes

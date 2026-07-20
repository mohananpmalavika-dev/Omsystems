# CCTV Infrastructure Standards

## Overview

This document defines the comprehensive CCTV infrastructure standards for the Sentinel Grid platform, covering camera installation requirements, technical specifications, and compliance tracking for 500 branches with 3,000-4,000 mixed-vendor cameras.

---

## Camera Installation Locations

### Mandatory High-Priority Locations (Priority 1-2)

#### Branch Entrance/Exit
- **Purpose**: Monitor all personnel and customer entry/exit
- **Requirements**:
  - Minimum 2MP (1920x1080) resolution
  - 25-30 fps frame rate
  - Face-level coverage (1.5-1.8m height)
  - License plate recognition for vehicle entry
  - Night vision with minimum 20m IR distance
- **Camera Type**: Dome or bullet outdoor cameras
- **Weatherproof Rating**: IP66 minimum
- **Coverage**: Wide-angle view capturing both door and approach area

#### Cash Counter/Teller Area
- **Purpose**: Record all cash transactions and customer interactions
- **Requirements**:
  - Minimum 2MP resolution
  - 25-30 fps frame rate
  - Clear view of currency exchange
  - Audio recording (where permitted)
  - PTZ capability for focused zoom
- **Camera Type**: Indoor dome cameras with PTZ
- **Coverage**: Multiple angles recommended (overhead + face-level)

#### Strong Room/Vault
- **Purpose**: Monitor access and activities in high-security areas
- **Requirements**:
  - Minimum 2MP resolution
  - 30 fps frame rate
  - 24/7 continuous recording
  - Motion detection and analytics
  - Tamper-resistant installation
- **Camera Type**: Fixed dome cameras (vandal-resistant)
- **Coverage**: Complete room coverage with no blind spots
- **Retention**: Extended retention period (90+ days)

#### ATM Cabin
- **Purpose**: Monitor ATM usage and detect fraud/tampering
- **Requirements**:
  - Minimum 2MP resolution
  - 25-30 fps frame rate
  - Night vision capability
  - Wide dynamic range (WDR) for varying lighting
  - Vandal-resistant
- **Camera Type**: Dome cameras (indoor/outdoor based on location)
- **Coverage**: ATM front view + user face + surrounding area

### Important Locations (Priority 3)

#### Manager Cabin
- **Requirements**: 2MP, 25 fps, audio optional
- **Camera Type**: Indoor dome
- **Privacy Considerations**: May require privacy mode during non-business hours

#### Locker Room/Safe Deposit Area
- **Requirements**: 2MP, 25-30 fps, motion detection
- **Camera Type**: Indoor dome
- **Coverage**: Entry points and corridor, not individual boxes

#### Server Room
- **Requirements**: 2MP, 25 fps, environmental monitoring integration
- **Camera Type**: Fixed indoor camera
- **Additional**: Temperature/humidity sensors recommended

### Standard Locations (Priority 4-5)

#### Parking Area
- **Requirements**:
  - 2MP minimum
  - License plate recognition
  - Wide coverage
  - Night vision (30m+ IR)
- **Camera Type**: Bullet cameras or LPR-specific cameras
- **Weatherproof Rating**: IP66

#### Perimeter Fencing
- **Requirements**:
  - 2MP minimum
  - Long-range night vision (50m+)
  - Motion detection with analytics
  - Thermal cameras for large perimeters
- **Camera Type**: Bullet or PTZ cameras
- **Coverage**: Overlapping zones to eliminate blind spots

#### Staircase/Corridors
- **Requirements**: 2MP, 25 fps, wide-angle lens
- **Camera Type**: Dome cameras
- **Coverage**: Full corridor length, minimal blind spots

---

## Camera Types and Specifications

### Dome Cameras (Indoor)

**Use Cases**: Cash counters, lobbies, manager cabins, corridors

**Specifications**:
- Resolution: Minimum 2MP (1920x1080)
- Frame Rate: 25-30 fps
- Lens: 2.8-12mm varifocal
- Field of View: 90-110° horizontal
- Night Vision: 15-20m IR distance
- Features: Wide dynamic range, 3D-DNR
- Mounting: Ceiling or wall mount
- Vandal Rating: IK08+ for public areas

**Recommended Models**:
- Hikvision DS-2CD2125FWD-I
- CP Plus CP-UNC-TA20L2-DS
- Dahua IPC-HDBW4231E-AS

### Bullet Cameras (Outdoor)

**Use Cases**: Perimeter, parking, building exterior

**Specifications**:
- Resolution: Minimum 2MP (1920x1080)
- Frame Rate: 25-30 fps
- Lens: 2.8-12mm or 6-22mm for long range
- Field of View: 70-100° horizontal
- Night Vision: 30-50m IR distance
- Weatherproof: IP66 or IP67
- Operating Temperature: -30°C to +60°C
- Features: Smart IR, 3D-DNR, WDR

**Recommended Models**:
- Hikvision DS-2CD2T26G1-4I
- CP Plus CP-UNC-TB20FL4-VMD
- Dahua IPC-HFW4431T-ASE

### PTZ (Pan-Tilt-Zoom) Cameras

**Use Cases**: Large open areas, parking lots, critical monitoring points

**Specifications**:
- Resolution: 2MP minimum (4MP recommended)
- Frame Rate: 25-30 fps
- Optical Zoom: 20x-30x
- Pan Range: 360° continuous
- Tilt Range: -15° to +90°
- Pan/Tilt Speed: High-speed preset positions
- Night Vision: 100m+ IR distance
- Weatherproof: IP66
- Presets: Minimum 256 preset positions
- Auto-tracking: Optional but recommended

**Use Cases**: Perimeter monitoring, large parking areas, critical entry points

### License Plate Recognition (LPR) Cameras

**Use Cases**: Vehicle entry/exit points, parking areas

**Specifications**:
- Resolution: 2MP specialized sensor
- Frame Rate: 30 fps minimum
- Shutter Speed: 1/1000s or faster
- Field of View: Narrow (20-30°)
- Night Vision: IR with specialized filtering
- Analytics: Built-in LPR software
- Capture Rate: 99%+ accuracy
- Speed: Up to 180 km/h capture

### Thermal Cameras

**Use Cases**: Large perimeter areas, night detection

**Specifications**:
- Resolution: 384×288 or higher
- Thermal Sensitivity: <50mK
- Detection Range: 100m+ for human
- Weatherproof: IP66
- Integration: Alarm triggers with visible camera

---

## Minimum Technical Requirements

### Resolution Standards

| Location Type | Minimum Resolution | Recommended Resolution | Pixels Per Foot (PPF) |
|---------------|-------------------|------------------------|----------------------|
| Cash Counter | 2MP (1080p) | 4MP (2K) | 80-100 |
| Entrance/Exit | 2MP (1080p) | 4MP (2K) | 60-80 |
| Strong Room | 2MP (1080p) | 4MP (2K) | 80-100 |
| ATM | 2MP (1080p) | 2MP (1080p) | 80-100 |
| Parking | 2MP (1080p) | 4MP (2K) | 40-60 |
| Perimeter | 2MP (1080p) | 4MP (2K) | 40-60 |
| Corridors | 2MP (1080p) | 2MP (1080p) | 40-60 |

### Frame Rate Requirements

- **Critical Areas** (cash counters, vaults, ATM): 25-30 fps
- **Standard Areas** (corridors, parking): 15-25 fps
- **Perimeter** (low activity): 10-15 fps

**Note**: Lower frame rates reduce storage requirements but must meet minimum standards for evidence quality.

### Field of View

- **Cash Counter/Teller**: 90-110° horizontal, 2.8-4mm lens
- **Entrance/Exit**: 90-110° horizontal, 2.8-6mm lens
- **Corridors**: 110-120° horizontal, 2.8mm lens
- **Parking/Perimeter**: 70-90° horizontal, 6-12mm lens
- **Strong Room**: 90-110° horizontal, 2.8-4mm lens

### Night Vision Requirements

| Location | IR Distance | Type |
|----------|-------------|------|
| Indoor Areas | 15-20m | Standard IR LED |
| Building Entrance | 20-30m | Smart IR |
| Parking Area | 30-50m | Long-range IR |
| Perimeter | 50-100m | High-power IR or thermal |
| ATM (outdoor) | 20-30m | WDR + IR |

### Weatherproof Ratings

- **Indoor**: No rating required (or IP20)
- **Outdoor covered**: IP44 minimum
- **Outdoor exposed**: IP65 minimum
- **Critical outdoor**: IP66 or IP67
- **Submersible areas**: IP68

### Operating Temperature Ranges

- **Indoor**: 0°C to +50°C
- **Outdoor (temperate)**: -10°C to +50°C
- **Outdoor (extreme)**: -30°C to +60°C
- **Server Room**: 10°C to +35°C (with climate control)

---

## Storage Requirements

### Retention Periods

| Location Type | Minimum Retention | Recommended Retention |
|---------------|-------------------|----------------------|
| Cash Counter | 90 days | 180 days |
| Strong Room/Vault | 90 days | 365 days |
| ATM | 90 days | 180 days |
| Entrance/Exit | 30 days | 90 days |
| Parking Area | 30 days | 60 days |
| Perimeter | 30 days | 60 days |
| Corridors | 30 days | 60 days |

### Storage Calculation

**Formula**: 
```
Storage (GB) = Bitrate (Mbps) × 3,600 × 24 × Days × Cameras ÷ 8,192
```

**Example**: 2MP camera at 4 Mbps for 30 days
```
Storage = 4 × 3,600 × 24 × 30 ÷ 8,192 = ~1,266 GB per camera
```

**Branch Storage Estimate** (8 cameras per branch, mixed retention):
- High-priority cameras (3): 180 days @ 4 Mbps = 7,596 GB
- Standard cameras (5): 60 days @ 3 Mbps = 4,736 GB
- **Total per branch**: ~12 TB
- **500 branches**: ~6 PB total storage

**Optimization Strategies**:
- H.265/H.265+ compression (reduces bitrate by 30-50%)
- Variable bitrate (VBR) recording
- Motion-triggered higher quality
- Edge storage with selective cloud backup

---

## Installation Standards

### Camera Placement Height

- **Facial Recognition**: 1.5-1.8m (eye level)
- **General Monitoring**: 2.5-3.5m
- **Overhead**: 3.0-4.0m
- **Perimeter**: 3.5-5.0m
- **PTZ**: 5.0-8.0m

### Coverage Guidelines

- **Overlap**: 20-30% overlap between camera views
- **Blind Spots**: Maximum 2m² uncovered area in critical zones
- **Entry Points**: Dual coverage (redundancy)
- **Critical Assets**: 360° coverage

### Lighting Considerations

- **Indoor**: 200-500 lux for color recording
- **Low Light**: <1 lux cameras with IR
- **Backlighting**: WDR cameras (120dB+)
- **Direct Sun**: Avoid or use extreme WDR (140dB)

### Cabling Standards

- **Network**: Cat6 or Cat6a (PoE+)
- **Maximum Distance**: 100m per Ethernet run
- **Power**: PoE+ (25.5W) for PTZ and high-end cameras
- **Backup Power**: UPS for critical cameras (4-8 hours)

### Mounting

- **Secure**: Anti-tamper brackets for accessible areas
- **Accessible**: Maintenance access without special equipment
- **Protected**: Conduit for cables in accessible areas
- **Weatherproof**: Proper sealing for outdoor installations

---

## Compliance and Regulatory Requirements

### Privacy Requirements

1. **Audio Recording**: Requires explicit consent and signage
2. **Privacy Zones**: Configure privacy masks for:
   - Restrooms
   - Changing areas
   - Private offices (upon request)
   - Neighboring properties
3. **Signage**: Visible CCTV warning signs at all entry points
4. **Data Protection**: Encrypted storage, access controls
5. **Access Logs**: Audit trail for all video access

### Inspection Schedule

- **Initial Installation**: Full compliance check
- **Quarterly**: Camera health and coverage check
- **Semi-Annual**: Cleaning, alignment, firmware updates
- **Annual**: Comprehensive compliance audit
- **Post-Incident**: Coverage and quality verification

### Compliance Tracking

The system tracks the following compliance metrics per camera:
- ✓ Meets minimum resolution requirement
- ✓ Meets minimum frame rate requirement
- ✓ Provides required coverage for location type
- ✓ Meets retention period requirement
- ✓ Proper lighting conditions
- ✓ Proper installation angle
- ✓ Audio recording compliance (if applicable)
- ✓ Privacy mask configured (if required)
- ✓ Warning signage installed

---

## Camera Vendor Recommendations

### Preferred Vendors

1. **Hikvision** (Tier 1)
   - Excellent ONVIF support
   - Wide model range
   - Competitive pricing
   - Good night vision
   - Caution: Some regions restrict government use

2. **CP Plus** (Tier 1)
   - Strong presence in India
   - Good value proposition
   - Local support network
   - ONVIF compliant

3. **Dahua** (Tier 1)
   - Excellent image quality
   - Advanced analytics
   - Wide product range
   - Good ONVIF support

4. **Axis Communications** (Premium)
   - Superior image quality
   - Industry-leading reliability
   - Advanced analytics
   - Higher cost

5. **Bosch** (Premium)
   - Excellent build quality
   - Outstanding low-light performance
   - High reliability
   - Premium pricing

### Compatibility Requirements

All cameras must support:
- ✓ ONVIF Profile S (streaming) - minimum
- ✓ ONVIF Profile T (analytics) - recommended
- ✓ RTSP protocol
- ✓ H.264 baseline compression (minimum)
- ✓ H.265 compression (recommended)
- ✓ NTP time synchronization
- ✓ HTTPS configuration interface
- ✓ Firmware update capability

---

## Network Requirements

### Bandwidth Calculation

**Per Camera**:
- 2MP @ H.264 @ 25fps: 3-5 Mbps
- 2MP @ H.265 @ 25fps: 1.5-2.5 Mbps
- 4MP @ H.264 @ 25fps: 6-8 Mbps
- 4MP @ H.265 @ 25fps: 3-4 Mbps

**Per Branch** (8 cameras average):
- Conservative (H.264): 40-64 Mbps
- Optimized (H.265): 20-32 Mbps

**Upload Bandwidth** (to central for live/evidence):
- Peak (4 concurrent streams): 12-20 Mbps
- Average: 5-10 Mbps

### Network Segregation

- **Camera VLAN**: Isolated from corporate network
- **Management VLAN**: Separate admin access
- **Firewall Rules**: Strict outbound-only from cameras
- **No Internet**: Cameras should not have direct internet access

### Network Security

- Change default passwords immediately
- Disable unnecessary services (UPnP, SNMP v1/v2)
- Use strong authentication (WPA2-Enterprise for wireless)
- Regular firmware updates
- Certificate-based authentication where supported

---

## Implementation Checklist

### New Branch Setup

- [ ] **Site Survey**
  - [ ] Identify all required camera locations
  - [ ] Measure coverage areas and distances
  - [ ] Assess lighting conditions
  - [ ] Identify network/power availability
  - [ ] Check for obstructions

- [ ] **Design Phase**
  - [ ] Create camera placement diagram
  - [ ] Calculate storage requirements
  - [ ] Design network topology
  - [ ] Plan cabling routes
  - [ ] Obtain necessary approvals

- [ ] **Procurement**
  - [ ] Select appropriate camera models
  - [ ] Order network equipment (switches, PoE)
  - [ ] Order cabling and conduits
  - [ ] Order storage system
  - [ ] Order mounting hardware

- [ ] **Installation**
  - [ ] Install network infrastructure
  - [ ] Mount cameras according to plan
  - [ ] Run and terminate cables
  - [ ] Configure camera settings
  - [ ] Test each camera

- [ ] **Commissioning**
  - [ ] Verify coverage for all zones
  - [ ] Configure recording schedules
  - [ ] Set retention policies
  - [ ] Configure motion detection
  - [ ] Set up analytics (if applicable)
  - [ ] Test night vision
  - [ ] Configure privacy masks
  - [ ] Install signage

- [ ] **Documentation**
  - [ ] Record camera locations and IDs
  - [ ] Document network configuration
  - [ ] Record credentials (securely)
  - [ ] Create maintenance schedule
  - [ ] Compliance certification

- [ ] **Training**
  - [ ] Train branch staff on monitoring
  - [ ] Train on incident response
  - [ ] Train on evidence export
  - [ ] Train on basic troubleshooting

### Existing Branch Upgrade

- [ ] Audit current installation
- [ ] Identify compliance gaps
- [ ] Plan upgrade schedule
- [ ] Coordinate with branch operations
- [ ] Minimize service disruption
- [ ] Update documentation
- [ ] Re-certify compliance

---

## Maintenance and Monitoring

### Regular Maintenance Tasks

**Monthly**:
- Check camera online status
- Verify recording quality
- Review storage capacity
- Check for firmware updates

**Quarterly**:
- Clean camera lenses and housings
- Check cable connections
- Verify night vision functionality
- Test motion detection

**Semi-Annual**:
- Comprehensive health check
- Adjust camera angles if needed
- Update firmware
- Test disaster recovery

**Annual**:
- Full compliance audit
- Replace aging equipment
- Update documentation
- Review and optimize storage

### Health Monitoring

The system automatically monitors:
- Camera online/offline status
- Frame rate and bitrate
- Storage capacity and health
- Network connectivity
- Recording gaps
- Edge agent health

**Alerts Generated For**:
- Camera offline > 5 minutes
- Recording failure
- Storage >85% full
- Frame rate drop >20%
- Network packet loss >5%
- Edge agent disconnect

---

## Best Practices

1. **Always specify camera purpose and location** during installation
2. **Document all installations** with photos and diagrams
3. **Test night vision** during actual night conditions
4. **Configure NTP** for accurate timestamps on all devices
5. **Use edge storage** with cloud backup for critical cameras
6. **Implement redundancy** for critical monitoring points
7. **Regular testing** of video export and evidence retrieval
8. **Train operators** on system capabilities and limitations
9. **Maintain spare cameras** for quick replacement
10. **Keep firmware updated** for security and features

---

## Related Documents

- [Architecture](./architecture.md) - System architecture and boundaries
- [Product Roadmap](./product-roadmap.md) - Feature development timeline
- [Database Schema](../database/migrations/004_cctv_infrastructure.sql) - Infrastructure data model

---

## Appendix: Quick Reference Tables

### Resolution Quick Reference
| Resolution | Megapixels | Dimensions | Use Case |
|------------|-----------|------------|----------|
| 720p HD | 1MP | 1280×720 | Basic monitoring |
| 1080p Full HD | 2MP | 1920×1080 | Standard (minimum) |
| 1440p 2K | 4MP | 2560×1440 | Recommended |
| 4K Ultra HD | 8MP | 3840×2160 | Premium/critical |

### Lens Selection Guide
| Focal Length | Field of View | Distance | Use Case |
|--------------|---------------|----------|----------|
| 2.8mm | 110° | 3-10m | Wide corridors |
| 4mm | 90° | 5-15m | General monitoring |
| 6mm | 60° | 10-25m | Focused areas |
| 8mm | 45° | 15-35m | Perimeter |
| 12mm | 30° | 25-50m | Long range |

### Compression Comparison
| Codec | Bitrate (2MP @ 25fps) | Storage Efficiency | Compatibility |
|-------|-----------------------|--------------------|---------------|
| MJPEG | 20-40 Mbps | Poor | Universal |
| MPEG-4 | 4-6 Mbps | Fair | Good |
| H.264 | 3-5 Mbps | Good | Excellent |
| H.265 | 1.5-2.5 Mbps | Excellent | Good |
| H.265+ | 1-1.5 Mbps | Superior | Fair |

---

**Document Version**: 1.0  
**Last Updated**: 2026-07-21  
**Author**: Sentinel Grid Platform Team  
**Review Date**: 2027-01-21

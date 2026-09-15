# Frequently Asked Questions (FAQ)

**KryptoVision Sentinel Grid - Common Questions and Answers**  
Version 1.0.0-rc.2 | Last Updated: September 15, 2026

---

## Table of Contents

1. [General Questions](#general-questions)
2. [Getting Started](#getting-started)
3. [Cameras and Video](#cameras-and-video)
4. [Alerts and Notifications](#alerts-and-notifications)
5. [Recording and Storage](#recording-and-storage)
6. [AI Analytics](#ai-analytics)
7. [Evidence and Compliance](#evidence-and-compliance)
8. [Mobile App](#mobile-app)
9. [Administration](#administration)
10. [Technical Issues](#technical-issues)
11. [Security and Privacy](#security-and-privacy)
12. [Billing and Licensing](#billing-and-licensing)

---

## General Questions

### What is KryptoVision Sentinel Grid?

KryptoVision is an enterprise video management system (VMS) with advanced AI-powered analytics. It provides:
- Live camera monitoring across multiple locations
- Intelligent video recording with flexible retention
- AI-powered threat detection (intrusion, fire, PPE violations, etc.)
- Forensic investigation tools with chain-of-custody
- Mobile access for on-the-go monitoring
- Compliance-ready audit trails

**Industries served:** Banking, Retail, Manufacturing, Healthcare, Education, Government, Smart Cities

---

### How is KryptoVision different from other VMS platforms?

**Key Differentiators:**

✅ **14 AI Analytics Modules** - More comprehensive than competitors  
✅ **100% Local Processing** - No cloud dependency, zero ongoing AI costs  
✅ **Cost Savings** - $200K-600K/year savings vs enterprise VMS platforms  
✅ **BFSI Compliant** - Banking-grade security and compliance  
✅ **Open Architecture** - Works with any ONVIF camera brand  
✅ **Forensic Grade Evidence** - Chain-of-custody with cryptographic verification  
✅ **Edge-First Design** - Operates even with internet outages

**vs Genetec, Milestone, Avigilon:**
- Lower licensing costs (no per-camera fees)
- More AI features included (not expensive add-ons)
- Better privacy controls (local processing)
- Open-source AI models (no vendor lock-in)

---

### What camera brands are supported?

**Fully Supported (Tested):**
- Hikvision
- Dahua
- Axis Communications
- Hanwha (Samsung)
- Uniview
- Vivotek
- Bosch
- Sony
- Pelco
- Panasonic

**ONVIF Compatibility:**
Any camera supporting ONVIF Profile S (basic), Profile T (H.265), or Profile G (edge storage) will work with KryptoVision.

**Analog Cameras:**
Supported via DVR/NVR with ONVIF or RTSP output.

---

### Can I use my existing cameras?

**Yes!** KryptoVision works with your existing cameras if they support:
- ONVIF (most modern IP cameras do)
- RTSP streaming protocol
- Or connected via compatible DVR/NVR

**To Check Compatibility:**
1. Check camera manual for "ONVIF" support
2. Or access camera web interface → Settings → look for ONVIF settings
3. Or try automatic discovery - KryptoVision will find compatible cameras

---

### Is internet required?

**Short Answer:** No, for local operations.

**Detailed:**
- **Local Monitoring:** Works without internet (cameras → edge agent → local displays)
- **Recording:** Works without internet (local storage)
- **AI Analytics:** Works without internet (models run locally)
- **Remote Access:** Requires internet (view from home/mobile)
- **Cloud Features:** Optional (cloud storage backup, remote notifications)

**During Internet Outages:**
- ✅ Cameras continue recording locally
- ✅ AI analytics continue working
- ✅ Local monitoring works
- ❌ Remote access unavailable
- ❌ Email/SMS alerts unavailable (resume when internet restored)

---

## Getting Started

### How long does setup take?

**Quick Setup:** 15-30 minutes
- Basic installation
- First branch
- First 5-10 cameras
- Start monitoring

**Full Deployment:** 1-2 days
- Multiple branches
- 50+ cameras
- AI analytics configuration
- User training
- Integration with other systems

**Enterprise Deployment:** 1-2 weeks
- 500+ cameras
- Multi-site coordination
- Custom integrations
- Security hardening
- Compliance setup
- Full training program

---

### Do I need IT knowledge to use KryptoVision?

**For Operators (Monitoring):** No
- Intuitive web interface
- Point-and-click operation
- Training provided (30 minutes)
- Similar to using any website

**For Administrators (Setup):** Basic IT knowledge helpful
- Understanding of networks/IP addresses
- Camera connectivity basics
- Web browser configuration
- Full documentation and support provided

**For Advanced Features:** IT skills recommended
- LDAP/Active Directory integration
- Custom API integrations
- Advanced network configuration
- Professional services available

---

### What hardware do I need?

**Minimum Requirements:**

**For Viewing (Operator Workstation):**
- Computer: Any PC/Mac from last 5 years
- RAM: 4GB minimum, 8GB recommended
- Browser: Chrome 90+, Firefox 88+, Edge 90+
- Internet: 5 Mbps for 4-camera view, 10 Mbps for 16-camera view

**For Edge Agent (Branch Server):**
- Small Branch (5-10 cameras):
  - CPU: Intel i5 or equivalent
  - RAM: 8GB
  - Storage: 2TB HDD (for 30-day retention)
  - Network: Gigabit Ethernet
  
- Medium Branch (20-50 cameras):
  - CPU: Intel i7 or Xeon E-2100
  - RAM: 16GB
  - Storage: 10TB HDD or 4TB SSD
  - Network: Gigabit Ethernet
  
- Large Branch (100+ cameras):
  - CPU: Xeon Silver or higher
  - RAM: 32GB+
  - Storage: 40TB+ RAID array
  - Network: 10 Gigabit Ethernet

**For AI Analytics (Optional, can run on edge agent):**
- GPU: NVIDIA GTX 1660 or better (for real-time processing)
- CPU only: Works but slower (1-2 FPS vs 30+ FPS with GPU)

---

### How much does it cost?

**Pricing Model:**
- **License:** One-time perpetual license + optional annual maintenance
- **No Per-Camera Fees:** Unlimited cameras per license
- **No Cloud Costs:** All processing local (optional cloud backup charged separately)

**Typical Costs:**
```
Small Deployment (10-50 cameras):
  - License: $5,000-15,000 one-time
  - Maintenance: $1,000-3,000/year (optional, includes support + updates)
  
Medium Deployment (50-200 cameras):
  - License: $15,000-50,000 one-time
  - Maintenance: $3,000-10,000/year
  
Enterprise (500+ cameras):
  - Custom pricing
  - Volume discounts available
  - Multi-year maintenance discounts
```

**vs Competitors:**
- Genetec: ~$500/camera + 20% annual maintenance = $100K/year for 100 cameras
- Milestone: ~$300/camera + licenses = $60K/year for 100 cameras
- **KryptoVision:** ~$25K one-time + $5K/year maintenance = **$20K-40K savings annually**

**Contact Sales:** sales@kryptonlogic.com or 1-800-SALES-VMS

---

## Cameras and Video

### Why can't I see video from a camera?

**Most Common Causes:**

1. **Camera Offline**
   - Check power and network cables
   - Ping camera IP address
   - Solution: [Troubleshooting Guide - Camera Offline](./TROUBLESHOOTING.md#camera-shows-offline-or-no-video)

2. **Wrong Credentials**
   - Camera password changed but not updated in KryptoVision
   - Solution: Update credentials in Camera Settings

3. **Network Issues**
   - Firewall blocking camera ports (usually 554)
   - Camera on different VLAN
   - Solution: Verify network connectivity

4. **Browser Issues**
   - Cache problem or codec incompatibility
   - Solution: Clear cache (Ctrl+Shift+Del) or try different browser

**Quick Test:**
Can you access camera web interface? Open browser: `http://[camera-ip-address]`
- If yes: Check KryptoVision credentials
- If no: Check camera power and network

---

### How can I improve video quality?

**For Live View:**
1. Right-click camera → Quality → High
2. Check your internet speed (need 2-4 Mbps per camera for 1080p)
3. Use wired connection instead of Wi-Fi

**For Recorded Video:**
1. Admin: Cameras → [Camera] → Recording → Stream Profile → Main Stream
2. Increase camera bitrate: Access camera web interface → Video Settings → Bitrate: 4-6 Mbps
3. Increase resolution to 1920x1080 (1080p) or 2592x1944 (4MP)

**For AI Analytics:**
1. Ensure camera resolution is 1080p minimum
2. Adjust camera exposure (not too dark or bright)
3. Enable WDR (Wide Dynamic Range) for backlit scenes
4. Clean camera lens regularly

---

### Can I control PTZ cameras?

**Yes!** For Pan-Tilt-Zoom cameras:

**Manual Control:**
- Live View → Click PTZ button on camera
- Use arrow keys or click-and-drag
- Mouse wheel or +/- buttons to zoom

**Presets:**
- Save favorite positions (up to 255 per camera)
- One-click jump to preset views
- Automatic tours/patrols

**PTZ Tours:**
- Create automatic patrol patterns
- Configure dwell time at each position
- Schedule tours for after-hours monitoring

**Requirements:**
- Camera must support PTZ (obviously!)
- Correct PTZ protocol configured (ONVIF, Pelco-D, Pelco-P)
- Appropriate user permissions

---

### How many cameras can I view at once?

**Live View Grid Layouts:**
- 1x1 (1 camera) - Fullscreen
- 2x2 (4 cameras)
- 3x3 (9 cameras)
- 4x4 (16 cameras) - Typical SOC setup
- 5x5 (25 cameras) - Large displays
- Custom layouts available

**Performance Depends On:**
- Your computer specs (more powerful = more cameras)
- Internet bandwidth (faster = more cameras)
- Video quality settings (lower = more cameras)

**Recommendations:**
- Standard PC: 4-9 cameras comfortable
- High-end workstation: 16-25 cameras
- SOC with large displays: 25-100 cameras (multiple monitors)

**Pro Tip:** Use sub-streams for live viewing (saves bandwidth) and main streams for recording.

---

### Can I watch video from my phone?

**Yes!** Use the KryptoVision mobile app.

**Download:**
- iOS: App Store - Search "KryptoVision"
- Android: Google Play - Search "KryptoVision"

**Features:**
- Live camera viewing (1-4 cameras)
- Alert notifications
- Quick video export
- PTZ control (basic)
- Incident management
- Two-way audio (if camera supports)

**Limitations:**
- No multi-camera synchronized playback
- No advanced video editing
- Limited to 4 cameras simultaneously (bandwidth)

**Data Usage:**
- Low quality: ~300 KB/min per camera
- Medium quality: ~1 MB/min per camera
- High quality: ~3 MB/min per camera

---

## Alerts and Notifications

### Why am I not receiving alerts?

**Check These:**

1. **Alert Rules Enabled?**
   - AI Analytics → Rules → Verify rule is enabled (green status)

2. **Notification Settings?**
   - Profile → Notifications → Email/SMS enabled?

3. **Email in Spam?**
   - Check spam/junk folder
   - Whitelist: alerts@your-kryptovision-domain.com

4. **Browser Notifications Blocked?**
   - Chrome: Look for 🔔 icon in address bar → Allow

5. **Status Set to "Do Not Disturb"?**
   - Top right corner → Change status to "Available"

**Test:**
- Admin: Settings → Alerts → Send Test Alert
- Should receive alert within 1-2 minutes

---

### How do I reduce false alarms?

**Common Causes and Solutions:**

**1. Environmental Triggers**
- Problem: Shadows, trees, reflections
- Solution: Exclude problem areas from detection zone

**2. Sensitivity Too High**
- Problem: Detecting minor movements
- Solution: Increase confidence threshold from 75% to 85-90%

**3. Brief Movements**
- Problem: Birds, cars passing by
- Solution: Increase minimum duration from 2s to 5s

**4. Normal Business Activity**
- Problem: Alerts during business hours
- Solution: Schedule rules for after-hours only

**5. Camera Issues**
- Problem: Camera shake, dirty lens
- Solution: Secure camera mount, clean lens

**AI Learning:**
When you mark alerts as "False Alarm" and provide reasons, the AI learns and reduces similar false alarms over time.

---

### What's the difference between an alert and an incident?

**Alert:**
- Real-time notification of detected event
- May or may not be real (requires verification)
- Temporary (archived after resolution)
- Anyone with alert permissions can handle

**Example:** "Motion detected in vault area"

**Incident:**
- Confirmed security event requiring investigation
- Formal documentation and evidence collection
- Permanent record (never deleted)
- Assigned to specific investigators
- Legal/compliance significance

**Example:** "Unauthorized vault access on Sept 15, 2026 - Case #2026-09-15-0847"

**Workflow:**
Alert → Operator verifies → If real, creates Incident → Investigation → Resolution

---

### Can alerts trigger other actions?

**Yes!** Alerts can trigger:

**Notifications:**
- Email
- SMS
- Voice call
- Push notifications (mobile app)
- Desktop notifications

**Recording Actions:**
- Start recording (if motion-only mode)
- Extend pre/post-roll
- Mark as evidence (protected from deletion)

**Camera Actions:**
- PTZ camera moves to preset
- Zoom in on detection area
- Switch sub-stream to main stream (higher quality)

**Integration Actions (via webhooks):**
- Trigger external alarm systems
- Activate lights/sirens
- Lock/unlock doors (with proper access control)
- Send to external SIEM/SOC platform
- Create ticket in ITSM system

**Custom Actions:**
- Execute custom scripts
- Call external APIs
- Send to Message Queue (RabbitMQ, Kafka)

**Configuration:**
Admin: AI Analytics → Rules → [Rule] → Actions → Configure

---

## Recording and Storage

### How long can I keep recordings?

**Depends On:**
- Storage capacity
- Camera count and quality
- Recording mode (continuous vs motion)

**Typical Configurations:**

**Standard Security:**
- 30-90 days continuous recording
- Adequate for most businesses

**Compliance (Banking, Healthcare):**
- 180-365 days continuous recording
- Some regulations require up to 7 years

**Forensic Evidence:**
- Marked evidence: Never auto-deleted (manual deletion only)
- Protected from retention policies
- Stored indefinitely until manually removed

**Storage Calculator:**
Dashboard → Tools → Storage Calculator
- Enter camera count, resolution, retention period
- Get storage requirement estimate

---

### How much storage do I need?

**Quick Estimate:**
```
1 camera @ 1080p, 24/7 recording:
  - Per Day: ~100 GB
  - 30 days: ~3 TB
  - 90 days: ~9 TB

10 cameras @ 1080p, 24/7:
  - 30 days: ~30 TB
  - 90 days: ~90 TB

50 cameras @ 1080p, 24/7:
  - 30 days: ~150 TB
  - 90 days: ~450 TB
```

**Factors Affecting Storage:**
- Resolution: 720p (50GB/day) vs 1080p (100GB/day) vs 4K (400GB/day)
- Frame Rate: 15 FPS vs 30 FPS (double storage)
- Compression: H.265 (50% less storage than H.264)
- Recording Mode: Continuous (most) vs Motion (70% less) vs Scheduled (varies)

**Storage Types:**
- **Hot Storage (NVMe/SSD):** Last 7-30 days, instant access
- **Warm Storage (HDD):** 31-90 days, fast access
- **Cold Storage (Archive/Tape/Cloud):** 91+ days, slower access but cheap

---

### What happens when storage is full?

**Automatic Actions:**

**1. Alert Generated**
- Warning at 80% full
- Critical alert at 90% full
- Predictive alert when exhaustion forecasted

**2. Oldest Recordings Deleted (FIFO)**
- Non-evidence recordings deleted first
- Evidence-marked recordings protected
- Deletes until back to 75% capacity

**3. Recording Continues**
- Never stops recording (unless 100% full)
- Always makes room for new footage

**Prevent Issues:**
- Monitor storage dashboard regularly
- Plan expansion before reaching 80%
- Use tiered storage (move old footage to cheaper storage)
- Reduce retention for non-critical cameras

**Emergency Actions:**
- Admin can manually delete non-critical footage
- Temporarily reduce recording quality
- Disable recording for non-essential cameras

---

### Can I export to USB drive?

**Yes!** Evidence can be exported to:
- Download to computer → Copy to USB drive
- Direct export to mapped network drive
- Cloud storage (if configured)

**Export Process:**
1. Playback → Mark start/end times
2. Export → Select format (MP4, AVI)
3. Download file
4. Copy to USB drive

**File Formats:**
- **MP4** - Most compatible (plays on any device)
- **AVI** - Larger files, good for editing
- **Native** - Original camera format (smallest, may need special player)

**Include:**
- Video file
- SHA-256 hash (for verification)
- Chain-of-custody certificate
- Thumbnails
- Metadata (JSON)

**USB Recommendations:**
- USB 3.0 or higher (faster transfers)
- 32GB+ capacity (stores ~8 hours of 1080p video)
- Use read-only mode after copying (prevents tampering)

---

## AI Analytics

### What AI analytics features are included?

**14 Complete Modules:**

1. **Human Analytics** - Person tracking, behavior, occupancy
2. **Vehicle Analytics** - ANPR, traffic, parking
3. **Face Analytics** - Recognition, watchlists, attributes
4. **Safety Analytics** - PPE, fire, smoke, hazards
5. **Security Analytics** - Intrusion, loitering, line crossing
6. **Retail Analytics** - Footfall, queues, heat maps
7. **Banking Analytics** - Vault, ATM, teller monitoring
8. **Industrial Analytics** - Equipment, worker safety
9. **Smart City Analytics** - Traffic, congestion, incidents
10. **AI Camera Health** - Quality monitoring, diagnostics
11. **AI Search** - Attribute and natural language search
12. **AI Investigation** - Cross-camera tracking, route reconstruction
13. **AI Prediction** - Failure forecasting, risk scoring
14. **AI Reporting** - Automated daily/weekly/monthly reports

**200+ Detection Types** across all modules

**Zero Cloud Costs** - All processing local using free ONNX models

---

### Do I need to pay extra for AI features?

**No!** All 14 AI modules included in base license.

**What's Included:**
✅ All detection types  
✅ Unlimited AI rules  
✅ All AI models (free open-source)  
✅ Real-time processing  
✅ Historical analysis  
✅ AI-powered search  
✅ Automated reports  

**No Hidden Costs:**
- ❌ No per-detection fees
- ❌ No cloud API costs
- ❌ No per-camera AI licensing
- ❌ No separate module purchases

**Optional (Paid):**
- GPU hardware (for faster processing, optional - works with CPU)
- Professional services (custom model training)
- Extended support

**vs Competitors:**
- Genetec: $200-500/camera/year for AI features
- Milestone: $150-300/camera/year for analytics
- **KryptoVision: $0 ongoing** ✨

---

### How accurate is the AI?

**Accuracy Rates (Typical):**

**Person Detection:** 95-98% accuracy
- Very reliable
- Few false positives
- Misses occur in extreme conditions (fog, night, distant)

**Vehicle Detection:** 93-96% accuracy
- High accuracy for standard vehicles
- May miss motorcycles/bicycles in poor conditions

**ANPR (License Plates):** 85-95% accuracy
- Depends on camera angle, lighting, plate condition
- Best at gates/entrances (direct view)
- Lower on highway (high speed, distance)

**Face Recognition:** 92-98% accuracy
- Excellent under good conditions (front view, good lighting)
- Lower with masks, sunglasses, hats
- Requires 1080p+ resolution for reliable identification

**PPE Detection:** 88-93% accuracy
- Good for helmets, vests (high contrast)
- Lower for gloves, glasses (smaller objects)

**Fire/Smoke:** 90-95% accuracy
- Very reliable for visible fire
- Some false positives (steam, fog)
- Rapid response time (5-10 seconds)

**Factors Affecting Accuracy:**
- Camera quality (1080p better than 720p)
- Lighting (day better than night)
- Camera angle (straight-on better than oblique)
- Distance (closer better than far)
- Weather (clear better than rain/fog)

**Improving Accuracy:**
- Use 1080p+ cameras
- Proper lighting (add lights if needed)
- Camera positioning (face-height for face recognition)
- Regular calibration
- Mark false alarms (AI learns!)

---

### Can I customize AI detection sensitivity?

**Yes!** Every rule is configurable:

**Confidence Threshold:**
- 50-60%: Very sensitive (many alerts, more false positives)
- 70-80%: Balanced (recommended)
- 90-95%: Very selective (fewer alerts, may miss events)

**Minimum Duration:**
- 1-2 seconds: Detect brief events
- 5-10 seconds: Ignore quick movements
- 30+ seconds: Only sustained activity

**Cooldown Period:**
- 0 seconds: Alert every detection (use for critical events)
- 60 seconds: One alert per minute (reduce spam)
- 300 seconds: Maximum 1 alert per 5 minutes

**Detection Zone:**
- Draw custom polygons
- Exclude non-relevant areas
- Multiple zones per camera

**Schedule:**
- Business hours only
- After-hours only
- Weekends and holidays
- Custom schedules

**Object Filters:**
- Detect only persons (ignore vehicles)
- Detect only vehicles (ignore persons)
- Minimum/maximum object size
- Direction filters (left-to-right only)

**Configuration:**
AI Analytics → Rules → [Rule] → Settings → Adjust parameters

---

## Evidence and Compliance

### Is video evidence legally admissible?

**Yes!** KryptoVision provides forensically sound evidence with:

**Chain-of-Custody:**
- Every access logged (who, when, why)
- Immutable audit trail
- Court-compliant documentation

**Tamper Detection:**
- SHA-256 cryptographic hashes
- Digital signatures (Ed25519/RSA)
- Verify evidence hasn't been altered

**Metadata:**
- Exact timestamps (NTP-synchronized)
- Camera information
- Recording settings
- Export details
- Handling history

**Evidence Certification:**
- Automatically generated certificates
- Operator identification
- Purpose and recipient tracking
- Case number association

**Requirements Met:**
- Chain-of-custody documentation
- Provable authenticity
- Accurate timestamps
- Proper handling procedures

**Best Practices:**
1. Export evidence as soon as possible
2. Verify hash immediately after export
3. Store on read-only media (DVD, write-protected USB)
4. Document all handling
5. Provide certificate with evidence

---

### How long are audit logs kept?

**Audit Log Types and Retention:**

**Security Events:** 7 years minimum
- User login/logout
- Failed login attempts
- Permission changes
- Evidence access
- Configuration changes

**Operational Events:** 365 days
- Alert acknowledgments
- Camera reboots
- Recording gaps
- System health events

**Access Logs:** 180 days
- Video playback
- Live view sessions
- Report generation
- API access

**Compliance Override:**
Some regulations require longer:
- GDPR: May require shorter (right to erasure)
- Financial regulations: Often 7+ years
- Healthcare (HIPAA): 6 years
- Check your local requirements

**Audit logs are:**
- ✅ Immutable (write-once)
- ✅ Encrypted at rest
- ✅ Tamper-evident (cryptographic chain)
- ✅ Searchable and exportable
- ❌ Cannot be deleted manually (only via retention policy)

---

### Are we GDPR/CCPA compliant?

**Yes!** KryptoVision includes compliance tools for:

**GDPR (Europe):**
- ✅ Data minimization (only necessary data)
- ✅ Privacy by design (built-in controls)
- ✅ Subject access requests (30-day response)
- ✅ Right to erasure ("right to be forgotten")
- ✅ Data portability (export in standard formats)
- ✅ Breach notification (automated alerts)
- ✅ Consent management (face recognition)
- ✅ Privacy impact assessments (DPIA tools)

**CCPA (California):**
- ✅ Consumer rights (access, delete, opt-out)
- ✅ Privacy policy disclosure
- ✅ No data sale (we don't sell customer data)
- ✅ Non-discrimination

**BFSI (Banking/Financial):**
- ✅ Biometric consent management
- ✅ Liveness detection (anti-spoofing)
- ✅ Temporal confirmation
- ✅ Human review workflows
- ✅ Audit trails

**Features:**
- Privacy zones (auto-blur sensitive areas)
- Access control (restrict who sees what)
- Data retention policies (auto-delete old data)
- Subject request portal (automated responses)
- Compliance reporting

**Your Responsibilities:**
- Document legitimate purpose for video surveillance
- Post notices informing people they're being recorded
- Implement reasonable retention periods
- Respond to subject access requests
- Conduct privacy impact assessments

**Professional Services:**
We offer compliance consulting to ensure your deployment meets all requirements.

---

## Mobile App

### Is there a mobile app?

**Yes!** Available for iOS and Android.

**Download:**
- **iOS:** App Store - Search "KryptoVision"
- **Android:** Google Play - Search "KryptoVision"

**Free** with your KryptoVision license (no additional cost)

**Features:**
- Live camera viewing (1-4 cameras)
- Push notifications for alerts
- Quick incident response
- Evidence export
- PTZ camera control
- Two-way audio (if camera supports)
- Dark mode

**Requirements:**
- iOS 13+ or Android 8+
- Internet connection
- Active KryptoVision account

---

### Does the mobile app work offline?

**Partially:**

**Works Offline:**
- View recent notifications (cached)
- View incident details (cached)
- Browse camera list
- Access saved evidence (downloaded)

**Requires Internet:**
- Live video viewing
- Playback
- Acknowledge/respond to alerts
- Export evidence
- Create incidents
- Sync new alerts

**Recommended:**
- Download critical evidence while on Wi-Fi
- Enable mobile data for alerts (low data usage: ~1 KB per alert notification)
- Use Wi-Fi for video viewing (high data usage)

---

### How much data does the app use?

**Data Usage Estimates:**

**Alerts/Notifications:**
- Alert notification: ~1 KB each
- 100 alerts/day = ~100 KB/day = ~3 MB/month

**Live Video:**
- Low quality: ~300 KB/min (~18 MB/hour)
- Medium quality: ~1 MB/min (~60 MB/hour)
- High quality: ~3 MB/min (~180 MB/hour)

**Playback:**
- Same as live video

**Evidence Export:**
- 1 minute of 1080p video: ~100 MB

**Recommendations:**
- Use Wi-Fi for video viewing
- Use mobile data only for alerts and critical checks
- Set video quality to "Low" or "Auto" on mobile data
- Download large evidence exports on Wi-Fi

**Data Saving Tips:**
- Profile → Settings → Mobile Data Settings
- ☑ Low quality on mobile data
- ☑ Only critical push notifications
- ☐ Disable auto-refresh in background

---

## Administration

### How do I add more users?

**Requirements:** Admin or Org Admin role

**Steps:**
1. Navigate to: **Settings** → **Users** → **Add User**
2. Fill in:
   - Email address
   - Name
   - Role (Admin, Operator, Viewer, etc.)
   - Assigned branches
3. Click **Send Welcome Email**
4. User receives email with temporary password
5. User logs in and must change password

**Bulk Import:**
- Settings → Users → Import Users
- Download CSV template
- Fill in user details
- Upload CSV
- All users receive welcome emails

**LDAP/Active Directory:**
- Settings → System → LDAP Configuration
- Connect to your AD
- Map groups to roles
- Users auto-provisioned on first login

---

### How do I back up the system?

**Automatic Backups:**
System automatically backs up:
- Database: Daily at 1:00 AM
- Configuration: Daily at 2:00 AM
- Retention: 30 days

**Manual Backup:**
1. Settings → System → Backup
2. Click "Create Backup Now"
3. Download backup file (.tar.gz)
4. Store securely offsite

**What's Backed Up:**
- ✅ User accounts and permissions
- ✅ Branch and camera configurations
- ✅ AI analytics rules
- ✅ Incidents and evidence metadata
- ✅ Audit logs
- ❌ Video recordings (too large - use separate backup for this)

**Recording Backup:**
- Critical recordings marked as "Evidence": Auto-backed up to remote location
- Regular recordings: Configure tiered storage (archive to tape/cloud)

**Disaster Recovery:**
1. Reinstall KryptoVision
2. Settings → System → Restore from Backup
3. Upload backup file
4. System restored (cameras reconnect automatically)

**RTO (Recovery Time Objective):** < 2 hours  
**RPO (Recovery Point Objective):** < 15 minutes

---

### Can I integrate with other systems?

**Yes!** Multiple integration methods:

**RESTful API:**
- Complete REST API for all functions
- OpenAPI 3.0 specification provided
- Authentication: JWT tokens or API keys
- Rate limiting: 1000 requests/minute

**Webhooks:**
- Send alerts to external systems
- Real-time event notifications
- Custom payloads (JSON)

**LDAP/Active Directory:**
- User authentication
- Group synchronization
- Single Sign-On (SSO)

**SMTP/Email:**
- Alert notifications
- Report delivery

**SMS/Voice Providers:**
- Twilio, Msg91, TextLocal, Exotel
- Alert notifications

**SIEM Integration:**
- Splunk
- QRadar
- ArcSight
- Syslog export

**Access Control Integration:**
- Sync with badge systems
- Trigger recording on door events
- Watchlist integration

**ITSM Integration:**
- ServiceNow
- Jira Service Management
- Create tickets from incidents

**Custom Integrations:**
- Message Queue (RabbitMQ, Kafka)
- GraphQL API (coming soon)
- WebSocket streaming (real-time)

**Documentation:**
[API Reference](../ADMIN_GUIDE.md) or contact integration@kryptonlogic.com

---

## Technical Issues

### The system is slow. How do I improve performance?

**Quick Fixes:**

1. **Clear Browser Cache**
   - Chrome: Ctrl+Shift+Del
   - Select "Cached images and files"
   - Clear

2. **Reduce Camera Grid**
   - Viewing 16 cameras → reduce to 4-9
   - Use camera rotation instead

3. **Lower Video Quality**
   - Right-click cameras → Quality → Medium or Auto

4. **Close Other Applications**
   - Each browser tab uses memory
   - Close unused programs

5. **Restart Browser**
   - Clears memory leaks

**Long-Term Solutions:**

1. **Upgrade Computer**
   - 8GB+ RAM
   - SSD instead of HDD
   - Better CPU/GPU

2. **Improve Network**
   - Use wired connection (not Wi-Fi)
   - Upgrade to 100+ Mbps internet

3. **Optimize Database**
   - Admin: Settings → Maintenance → Database → Vacuum

4. **Scale Infrastructure**
   - Add more edge agents (distribute load)
   - Upgrade edge agent hardware
   - Use dedicated encoding servers

---

### How do I reset my password?

**If You Remember Current Password:**
1. Login
2. Click your name (top right) → Profile
3. Security tab → Change Password
4. Enter current password and new password
5. Click "Change Password"

**If You Forgot Password:**
1. Click "Forgot Password" on login screen
2. Enter your email address
3. Check email for reset link (arrives in 2-3 minutes)
4. Click link (valid for 1 hour)
5. Enter new password (twice)
6. Click "Reset Password"
7. Login with new password

**If Email Not Received:**
- Check spam/junk folder
- Wait 5 minutes (may be delayed)
- Contact administrator to reset manually

**Administrator Reset (for others):**
1. Settings → Users
2. Click user name
3. Click "Reset Password"
4. Choose: Send reset email OR Set temporary password
5. User must change password on next login

**Security:**
- Reset links expire after 1 hour
- Can only be used once
- Passwords must be 12+ characters with complexity requirements

---

## Security and Privacy

### How secure is KryptoVision?

**Security Features:**

**Authentication:**
- ✅ Strong password requirements
- ✅ Two-factor authentication (2FA)
- ✅ Session management (auto-logout)
- ✅ Account lockout (after 5 failed attempts)
- ✅ Single Sign-On (SSO) support

**Authorization:**
- ✅ Role-based access control (RBAC)
- ✅ Attribute-based access control (ABAC)
- ✅ Granular permissions (camera-level access)
- ✅ Least privilege principle

**Data Protection:**
- ✅ Encryption at rest (AES-256)
- ✅ Encryption in transit (TLS 1.3)
- ✅ Database encryption
- ✅ Secure credential storage

**Network Security:**
- ✅ Firewall-friendly (specific ports)
- ✅ VPN support
- ✅ IP whitelisting
- ✅ mTLS (mutual TLS) for edge agents

**Application Security:**
- ✅ Input validation
- ✅ SQL injection protection
- ✅ XSS prevention
- ✅ CSRF protection
- ✅ Security headers

**Audit and Compliance:**
- ✅ Comprehensive audit logging
- ✅ Tamper-evident logs
- ✅ GDPR/CCPA compliance tools
- ✅ Regular security updates

**Security Certifications:**
- SOC 2 Type II (in progress)
- ISO 27001 (planned)
- Regular penetration testing

**Responsible Disclosure:**
Found a security issue? security@kryptonlogic.com  
We take security seriously and respond quickly.

---

### Can I restrict who sees which cameras?

**Yes!** Granular access control at multiple levels:

**By Branch:**
- User can only see assigned branches
- Example: Branch Manager sees only their branch

**By Camera Group:**
- User can only see cameras in assigned groups
- Example: Operator sees only "Public Areas" group, not "Cash Handling"

**By Individual Camera:**
- User can access specific cameras only
- Example: Executive sees only their office camera

**By Action:**
- View Live: Watch real-time video
- Playback: Review recordings
- Export: Download evidence
- PTZ Control: Move PTZ cameras
- Configure: Change camera settings

**Role-Based:**
- **Super Admin:** All access
- **Org Admin:** All cameras in their organization
- **Branch Admin:** All cameras in their branch
- **Security Operator:** View and playback, no configuration
- **Viewer:** View live only, no playback
- **Auditor:** View logs and reports, no video access
- **Custom:** Define your own roles

**Configuration:**
Settings → Users → [User] → Access Scope → Select branches/cameras

**Use Cases:**
- Branch managers see only their branch
- HR sees only interview rooms (privacy)
- Executives see only executive areas
- External auditors see only audit-relevant areas
- Contractors have temporary time-limited access

---

## Billing and Licensing

### What's included in the license?

**Base License Includes:**
- ✅ Unlimited users
- ✅ Unlimited cameras (per license tier)
- ✅ All 14 AI analytics modules
- ✅ Mobile app access
- ✅ Web interface
- ✅ REST API access
- ✅ Standard support (business hours)
- ✅ Software updates (during maintenance period)
- ✅ Documentation and training materials

**Optional Add-Ons:**
- Extended support (24/7)
- Professional services (custom development)
- Additional storage
- Cloud backup
- Advanced integrations
- Custom model training

**Not Included:**
- Hardware (cameras, servers, storage)
- Network infrastructure
- Installation services (can be purchased)
- On-site training (can be purchased)

---

### Do I need to renew annually?

**License:** Perpetual (one-time purchase, use forever)

**Maintenance (Optional but Recommended):**
- Annual renewal
- 20% of license cost
- Includes: Software updates, bug fixes, technical support

**Without Maintenance:**
- ✅ Software continues working
- ✅ Existing features function
- ❌ No new features
- ❌ No bug fixes
- ❌ No security patches
- ❌ No technical support

**Recommendation:** Maintain active maintenance for:
- Security updates (critical)
- New features (AI improvements, integrations)
- Technical support when needed
- Compliance updates (changing regulations)

**Grace Period:**
- 90 days after maintenance expires
- Can renew without penalty
- After 90 days: Reinstatement fee may apply

---

### Can I try before buying?

**Yes!** Multiple options:

**Free Trial:**
- 30-day full-featured trial
- Up to 10 cameras
- All AI analytics enabled
- Technical support included
- No credit card required

**Request Trial:**
- Visit: kryptonlogic.com/trial
- Or email: sales@kryptonlogic.com
- Or call: 1-800-SALES-VMS

**Live Demo:**
- Schedule personalized demo with sales engineer
- See your use case in action
- Q&A session
- Book demo: sales@kryptonlogic.com

**Proof of Concept (POC):**
- For enterprise deployments
- 60-90 day evaluation
- Real cameras in your environment
- Technical assistance provided
- Contact: enterprise@kryptonlogic.com

**Money-Back Guarantee:**
- 90 days from purchase
- If not satisfied, full refund
- No questions asked

---

## Still Have Questions?

### Contact Support

**Email:** support@kryptonlogic.com  
**Phone:** 1-800-KRYPTON (1-800-579-7866)  
**Hours:** 
- Critical Issues (P1): 24/7
- General Support: Mon-Fri 9 AM - 6 PM EST

**Online Resources:**
- Knowledge Base: support.kryptonlogic.com/kb
- Video Tutorials: academy.kryptonlogic.com
- Community Forum: community.kryptonlogic.com
- Documentation: All guides in `docs/user/` folder

### Sales Inquiries

**Email:** sales@kryptonlogic.com  
**Phone:** 1-800-SALES-VMS  
**Website:** kryptonlogic.com

### Professional Services

**Email:** services@kryptonlogic.com  
**Phone:** 1-800-KRYPTON  
**Services:**
- Custom integrations
- On-site installation
- Training programs
- Compliance consulting
- Custom AI model development

---

**Document Version:** 1.0.0  
**Last Updated:** September 15, 2026  
**Questions not answered here?** Email: docs@kryptonlogic.com

© 2026 KryptonLogic. All rights reserved.

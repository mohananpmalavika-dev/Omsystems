# Admin User Guide

**KryptoVision Sentinel Grid - Administrator Documentation**  
Version 1.0.0-rc.2 | Last Updated: September 15, 2026

---

## Table of Contents

1. [Introduction](#introduction)
2. [Initial System Setup](#initial-system-setup)
3. [User Management](#user-management)
4. [Organization Structure](#organization-structure)
5. [Branch Management](#branch-management)
6. [Camera Management](#camera-management)
7. [AI Analytics Configuration](#ai-analytics-configuration)
8. [Recording and Storage](#recording-and-storage)
9. [Alert Configuration](#alert-configuration)
10. [Maintenance and Monitoring](#maintenance-and-monitoring)
11. [Security and Compliance](#security-and-compliance)
12. [Backup and Recovery](#backup-and-recovery)

---

## Introduction

### Who This Guide Is For

This guide is for **System Administrators** responsible for:
- Installing and configuring KryptoVision
- Managing users, roles, and permissions
- Setting up branches and cameras
- Configuring AI analytics and alerts
- Maintaining system health and security

### What You'll Learn

By the end of this guide, you'll be able to:
- ✅ Set up a complete KryptoVision deployment
- ✅ Manage users and access control
- ✅ Configure branches, cameras, and AI analytics
- ✅ Monitor system health and resolve issues
- ✅ Ensure security and regulatory compliance

### Prerequisites

- **Access Level:** Super Admin or Organization Admin role
- **Technical Skills:** Basic networking, Windows/Linux administration
- **Browser:** Chrome 90+, Firefox 88+, Edge 90+
- **Network Access:** Access to control plane and branch networks

---

## Initial System Setup

### First-Time Login

1. **Access the Control Plane**
   ```
   https://your-domain.com
   ```

2. **Super Admin Account**
   - The first user created during installation is the **Super Admin**
   - Email: Configured during setup
   - Password: Set during installation (change immediately)

3. **Change Default Password**
   - Navigate to: **Profile** → **Security** → **Change Password**
   - Requirements:
     - Minimum 12 characters
     - At least 1 uppercase, 1 lowercase, 1 number, 1 special character
     - Cannot reuse last 5 passwords

4. **Enable Two-Factor Authentication (Recommended)**
   - Navigate to: **Profile** → **Security** → **Two-Factor Authentication**
   - Scan QR code with authenticator app (Google Authenticator, Authy)
   - Enter verification code to confirm

### System Configuration

#### 1. Configure SMTP for Email Alerts

Navigate to: **Settings** → **System** → **Email Configuration**

```yaml
SMTP Server: smtp.gmail.com
Port: 587
Security: STARTTLS
Username: alerts@your-company.com
Password: [App Password]
From Address: KryptoVision Alerts <alerts@your-company.com>
```

**Test Email:**
- Click "Send Test Email"
- Check your inbox (may take 1-2 minutes)

#### 2. Configure SMS/Voice Alerts (Optional)

Navigate to: **Settings** → **System** → **Notification Providers**

**Supported Providers:**
- Twilio (Recommended for US/International)
- Msg91 (Recommended for India)
- TextLocal (UK)
- Exotel (India - Voice calls)

**Example: Twilio Configuration**
```
Provider: Twilio
Account SID: AC****************************
Auth Token: ********************************
From Number: +1-555-123-4567
```

#### 3. Configure Time Zone

Navigate to: **Settings** → **System** → **General**

- **System Time Zone:** America/New_York
- **Date Format:** MM/DD/YYYY or DD/MM/YYYY
- **Time Format:** 12-hour or 24-hour
- **Week Start:** Sunday or Monday

#### 4. Configure Storage

Navigate to: **Settings** → **System** → **Storage**

**Storage Types:**
- **Local Disk** - On-premises storage (default)
- **Network Storage (NFS/SMB)** - Shared storage
- **S3 Compatible** - AWS S3, MinIO, Wasabi

**Example: Network Storage**
```
Type: SMB/CIFS
Server: \\storage-server\recordings
Username: sentinel-svc
Password: ********
Mount Path: /mnt/recordings
```

**Storage Health Alerts:**
- ✅ Enable "Alert when storage exceeds 80%"
- ✅ Enable "Alert when storage exceeds 90%" (Critical)
- ✅ Enable "Predict storage exhaustion"

---

## User Management

### Understanding Roles

| Role | Permissions | Typical Users |
|------|-------------|---------------|
| **Super Admin** | Full system access, all tenants | IT Directors, System Admins |
| **Org Admin** | Full access within organization | Security Managers |
| **Branch Admin** | Manage single branch | Branch Managers |
| **Security Operator** | Monitor, respond to alerts | SOC Operators, Guards |
| **Viewer** | View live feeds only | Executives, Managers |
| **Auditor** | View logs and reports only | Compliance Officers |
| **Investigator** | Access recordings, evidence export | Security Investigators |

### Creating Users

Navigate to: **Settings** → **Users** → **Add User**

**Step 1: Basic Information**
```
First Name: John
Last Name: Doe
Email: john.doe@company.com
Phone: +1-555-123-4567
```

**Step 2: Role Assignment**
- Select role from dropdown
- For custom permissions, select "Custom" and configure individual permissions

**Step 3: Access Scope**
- **Global Access:** All branches (for Org Admins)
- **Branch-Specific:** Select branches from list
- **Camera-Specific:** Advanced - select individual cameras

**Step 4: Initial Password**
- ☑ Send welcome email with temporary password
- ☑ Require password change on first login
- Temporary password is valid for 7 days

**Step 5: Additional Settings**
- **Session Timeout:** 30 minutes (default) to 24 hours
- **IP Whitelist:** Optional - restrict access to specific IPs
- **Active Hours:** Optional - restrict login to business hours

### Managing Existing Users

#### Editing Users
1. Navigate to: **Settings** → **Users**
2. Click on user's name
3. Modify details (role, access scope, contact info)
4. Click **Save Changes**

#### Deactivating Users
1. Navigate to: **Settings** → **Users**
2. Click on user's name
3. Click **Deactivate User**
4. Confirm action

**Note:** Deactivated users:
- Cannot log in
- Retain audit history
- Can be reactivated later
- Do not count toward license limits

#### Deleting Users (Permanent)
1. Navigate to: **Settings** → **Users**
2. Click on user's name
3. Click **Delete User** (bottom right, red button)
4. Type user's email to confirm
5. Click **Permanently Delete**

**⚠️ Warning:** This action cannot be undone. Audit logs referencing this user will show [Deleted User].

### Bulk User Management

#### Importing Users via CSV

Navigate to: **Settings** → **Users** → **Import Users**

**CSV Format:**
```csv
email,first_name,last_name,role,phone,branches
john.doe@company.com,John,Doe,security-operator,+1-555-1234,branch-001;branch-002
jane.smith@company.com,Jane,Smith,viewer,+1-555-5678,branch-001
```

**Steps:**
1. Download CSV template
2. Fill in user details
3. Upload CSV file
4. Review import preview
5. Confirm import
6. Users receive welcome emails

#### Exporting User List

Navigate to: **Settings** → **Users** → **Export**

**Formats:** CSV, Excel, PDF
**Includes:** Name, email, role, branches, last login, status

### LDAP/Active Directory Integration

Navigate to: **Settings** → **System** → **LDAP Configuration**

**Step 1: Connection Settings**
```
LDAP Server: ldap://ad.company.com:389
Base DN: DC=company,DC=com
Bind DN: CN=svc-kryptovision,OU=Service Accounts,DC=company,DC=com
Bind Password: ********
```

**Step 2: User Mapping**
```
Username Attribute: sAMAccountName
Email Attribute: mail
First Name Attribute: givenName
Last Name Attribute: sn
Group Attribute: memberOf
```

**Step 3: Group Mapping**
```
Admin Group: CN=VMS-Admins,OU=Security,DC=company,DC=com
Operator Group: CN=VMS-Operators,OU=Security,DC=company,DC=com
Viewer Group: CN=VMS-Viewers,OU=Security,DC=company,DC=com
```

**Step 4: Sync Settings**
- ☑ Enable automatic user provisioning
- ☑ Sync every 4 hours
- ☑ Disable users removed from AD
- ☑ Update user details on each login

**Test Connection:**
- Click "Test LDAP Connection"
- Enter your AD credentials
- Verify role mapping is correct

---

## Organization Structure

### Understanding Hierarchies

KryptoVision uses a hierarchical structure:

```
Company (Tenant)
 └── Divisions (Optional)
      └── Regions (Optional)
           └── Branches
                └── Camera Groups (Optional)
                     └── Cameras
```

### Creating Organizations

Navigate to: **Settings** → **Organizations** → **Add Organization**

**Required Information:**
```
Organization Name: ACME Corporation
Organization Slug: acme-corp (used in URLs)
Industry: Banking | Retail | Manufacturing | Government | Other
Country: United States
Time Zone: America/New_York
```

**Optional Settings:**
- **Logo:** Upload company logo (PNG, max 2MB)
- **Primary Color:** Brand color for UI theming
- **Support Email:** Organization-specific support contact
- **License Information:** Cameras, users, retention limits

### Creating Divisions/Regions

Navigate to: **Organizations** → [Your Org] → **Divisions** → **Add Division**

**Example Structure:**
```
ACME Corporation
 ├── North America
 │    ├── East Region
 │    └── West Region
 └── Europe
      ├── UK
      └── Germany
```

**Use Cases:**
- Multi-national corporations with regional structure
- Large organizations with business units
- Franchises with corporate/franchise split

---

## Branch Management

### What Is a Branch?

A **branch** represents a physical location:
- Retail store
- Bank branch
- Manufacturing facility
- Office building
- Warehouse

Each branch can have:
- Multiple cameras
- Local recording storage
- Branch-specific users
- Custom alert rules
- AI analytics configuration

### Creating a Branch

Navigate to: **Branches** → **Add Branch**

**Step 1: Basic Information**
```
Branch Name: Downtown Branch #101
Branch Code: DTN-101 (used in reporting)
Division/Region: [Select from dropdown]
```

**Step 2: Address**
```
Street Address: 123 Main Street
City: New York
State/Province: NY
Postal Code: 10001
Country: United States
GPS Coordinates: 40.7128° N, 74.0060° W (optional, auto-detected)
```

**Step 3: Contact Information**
```
Branch Manager: John Smith
Contact Phone: +1-555-123-4567
Contact Email: downtown@acme.com
```

**Step 4: Technical Configuration**
```
Time Zone: America/New_York
Network Mode: Edge Agent (Recommended) | Direct Connection | Cloud Gateway
Recording Storage: Local | Central | Hybrid
```

**Step 5: Business Hours**
```
Monday-Friday: 09:00 - 18:00
Saturday: 09:00 - 14:00
Sunday: Closed

Holidays: [Configure holiday schedule]
```

**Step 6: Advanced Settings**
- **Health Monitoring:** ☑ Enable 24/7 health checks
- **Auto-Provisioning:** ☑ Auto-approve discovered cameras
- **Internet Health:** ☑ Monitor internet connectivity
- **Alert Escalation:** Critical alerts after 5 minutes if unacknowledged

### Edge Agent Installation

**What is an Edge Agent?**
- Lightweight software installed at branch
- Manages cameras locally
- Enables remote access through secure tunnel
- Provides local recording backup
- Reduces bandwidth usage

**Installation Steps:**

**Option 1: Windows Installation**

1. **Download Edge Agent**
   - Navigate to: **Branches** → [Your Branch] → **Edge Agent** → **Download**
   - Select: **Windows Installer (x64)**

2. **Run Installer on Branch Server/PC**
   ```powershell
   # As Administrator
   kryptovision-edge-agent-setup.exe
   ```

3. **Enter Activation Code**
   - Copy activation code from dashboard
   - Paste into installer
   - Agent connects automatically

4. **Verify Connection**
   - Dashboard shows: ✅ Edge Agent: Connected
   - Last Seen: Just now

**Option 2: Linux Installation**

```bash
# Ubuntu/Debian
wget https://your-domain.com/edge-agent/install.sh
sudo bash install.sh --activation-code "YOUR_CODE_HERE"

# Verify status
sudo systemctl status kryptovision-edge-agent
```

**Option 3: Docker Installation**

```bash
docker run -d \
  --name kryptovision-edge-agent \
  --restart unless-stopped \
  -v /recordings:/recordings \
  -v /config:/config \
  -e ACTIVATION_CODE="YOUR_CODE_HERE" \
  kryptonlogic/edge-agent:latest
```

### Branch Health Monitoring

Navigate to: **Branches** → [Your Branch] → **Health**

**Health Indicators:**

| Indicator | Status | Meaning |
|-----------|--------|---------|
| ✅ Healthy | Green | All systems operational |
| ⚠️ Degraded | Yellow | Some cameras offline or issues detected |
| ❌ Critical | Red | Major failure, immediate attention required |
| ⚪ Unknown | Gray | No recent data, connection may be lost |

**Health Metrics:**
- **Camera Health:** 45/50 cameras online (90%)
- **Recording Health:** All recordings current
- **Storage Health:** 2.5TB used of 10TB (25%)
- **Network Health:** 98.5% uptime (last 7 days)
- **Internet Health:** 150 Mbps available (min: 50 Mbps)
- **Edge Agent:** Connected, last seen 30 seconds ago

**Health Alerts:**
Configure alerts for:
- Camera offline > 5 minutes
- Recording gap detected
- Storage > 80% full
- Internet speed < 10 Mbps
- Edge agent disconnected > 2 minutes

---

## Camera Management

### Adding Cameras

**Discovery Methods:**

#### 1. Automatic Discovery (Recommended)

Navigate to: **Branches** → [Your Branch] → **Cameras** → **Discover Cameras**

**Steps:**
1. Click "Start Discovery Scan"
2. System scans network for ONVIF cameras
3. Review discovered cameras
4. Select cameras to add
5. Enter credentials (if required)
6. Click "Add Selected Cameras"

**Discovery Settings:**
- **Network Range:** 192.168.1.0/24 (auto-detected)
- **ONVIF Ports:** 80, 8000, 8080 (configurable)
- **Discovery Timeout:** 60 seconds
- **Credential Try List:** Common default credentials (optional)

#### 2. Manual Camera Addition

Navigate to: **Branches** → [Your Branch] → **Cameras** → **Add Camera**

**Required Information:**
```
Camera Name: Front Entrance Camera
Location: Main entrance, facing parking lot
IP Address: 192.168.1.100
Port: 554
Protocol: RTSP
```

**Credentials:**
```
Username: admin
Password: ********
```

**Stream Configuration:**
```
Main Stream URL: rtsp://192.168.1.100:554/stream1
Sub Stream URL: rtsp://192.168.1.100:554/stream2

☑ Auto-detect stream profiles
☑ Test connection before saving
```

**Recording Settings:**
```
Recording Mode: Continuous
Quality: High (Main Stream)
Retention: 90 days
Pre-Roll: 30 seconds
Post-Roll: 30 seconds
```

#### 3. Bulk Import via CSV

Navigate to: **Branches** → [Your Branch] → **Cameras** → **Bulk Import**

**CSV Format:**
```csv
name,ip_address,port,username,password,location,protocol
Front Door,192.168.1.100,554,admin,pass123,Main Entrance,rtsp
Back Door,192.168.1.101,554,admin,pass123,Back Exit,rtsp
Parking Lot,192.168.1.102,554,admin,pass123,Parking Area,rtsp
```

### Camera Configuration

#### Stream Profiles

Navigate to: **Cameras** → [Camera Name] → **Streams**

**Main Stream (Recording):**
- Resolution: 1920x1080 (1080p)
- Frame Rate: 25 FPS
- Bitrate: 4 Mbps
- Codec: H.265 (HEVC) preferred, H.264 (AVC) compatible

**Sub Stream (Live View):**
- Resolution: 704x576 (D1) or 640x480 (VGA)
- Frame Rate: 15 FPS
- Bitrate: 512 Kbps
- Codec: H.264

**Why Two Streams?**
- Main stream: High quality for recording/evidence
- Sub stream: Low bandwidth for live monitoring and mobile

#### PTZ (Pan-Tilt-Zoom) Configuration

For PTZ cameras:

Navigate to: **Cameras** → [Camera Name] → **PTZ**

**Preset Positions:**
1. Click "Add Preset"
2. Move camera to desired position using controls
3. Name the preset (e.g., "Main Entrance", "Parking Lot View")
4. Save

**PTZ Tours:**
- Create automatic patrol patterns
- Configure dwell time at each preset
- Set tour schedule

**PTZ Permissions:**
- Control who can operate PTZ
- Lock PTZ to prevent unauthorized movement

#### Camera Groups

Organize cameras logically:

Navigate to: **Cameras** → **Camera Groups** → **Add Group**

**Example Groups:**
- Perimeter Cameras
- Cash Handling Areas
- Public Areas
- Loading Dock
- Restricted Areas

**Benefits:**
- Apply rules to multiple cameras
- Bulk configuration changes
- Simplified monitoring views
- Permission management

### Camera Maintenance

#### Reboot Camera

Navigate to: **Cameras** → [Camera Name] → **Actions** → **Reboot**

⚠️ **Warning:** Camera will be offline for 30-60 seconds

#### Update Firmware

Navigate to: **Cameras** → [Camera Name] → **Firmware**

**Steps:**
1. Check current firmware version
2. Click "Check for Updates"
3. Review release notes
4. Click "Update Firmware"
5. Monitor update progress
6. Verify camera reconnects

**Best Practices:**
- Update during maintenance window
- Update 1-2 cameras first (test)
- Never update all cameras simultaneously
- Keep backup of camera configuration

#### Replace Camera

Navigate to: **Cameras** → [Camera Name] → **Actions** → **Replace Camera**

**Scenario:** Physical camera failed, replacing with new unit

**Steps:**
1. Click "Replace Camera"
2. Enter new camera's IP address
3. Enter credentials
4. System transfers configuration automatically
5. Verify video feed
6. Old camera marked as "Decommissioned"

**Preserved:**
- ✅ Camera name and location
- ✅ Recording history
- ✅ AI rules and analytics
- ✅ Permissions and access control
- ✅ Audit logs

---

## AI Analytics Configuration

### Overview

KryptoVision includes 14 AI analytics modules:
- Human Analytics (person tracking, behavior)
- Vehicle Analytics (ANPR, traffic)
- Face Analytics (watchlists, recognition)
- Safety Analytics (PPE, fire, smoke)
- Security Analytics (intrusion, loitering)
- Retail Analytics (footfall, queue)
- Banking Analytics (vault, ATM, teller)
- Industrial Analytics (equipment, safety)
- Smart City Analytics (traffic, incidents)
- AI Search & Investigation
- Predictive Analytics
- AI Reporting
- AI Assistant

### Enabling AI Analytics

Navigate to: **AI Analytics** → **Configuration**

**System Requirements:**
- Edge agent with GPU (recommended) or CPU
- Minimum 8GB RAM
- AI models deployed

**Steps:**
1. Click "Enable AI Analytics"
2. Select modules to enable
3. System downloads required AI models (5-15 minutes)
4. Verify model status: ✅ Loaded

### Creating Analytics Rules

Navigate to: **Cameras** → [Camera Name] → **AI Rules** → **Add Rule**

#### Example 1: Intrusion Detection

**Rule Configuration:**
```
Rule Name: After-Hours Intrusion in Vault Area
Detection Type: Intrusion
Enabled: ☑ Yes
```

**Zone Configuration:**
1. Draw polygon on video preview
2. Name zone: "Vault Area"
3. Set zone type: Restricted

**Conditions:**
```
Object Types: Person
Minimum Confidence: 75%
Minimum Duration: 2 seconds
Cooldown Period: 60 seconds
```

**Schedule:**
```
Active: Monday-Friday, 18:00 - 08:00
Active: Saturday-Sunday, All Day
Holidays: All Day
```

**Alert Configuration:**
```
Severity: P1 (Critical)
Alert Channels:
  ☑ Dashboard notification
  ☑ Email to: security@company.com
  ☑ SMS to: +1-555-911-HELP
  ☑ Voice call to: +1-555-911-HELP (if no acknowledgment in 2 mins)

Evidence Capture:
  ☑ Record 30 seconds before event
  ☑ Record 30 seconds after event
  ☑ Capture snapshot
  ☑ Create incident automatically
```

#### Example 2: PPE Compliance (Industrial)

**Rule Configuration:**
```
Rule Name: Missing Safety Helmet in Warehouse
Detection Type: No Helmet
Enabled: ☑ Yes
```

**Zone Configuration:**
1. Draw polygon covering warehouse floor
2. Name zone: "Warehouse Operations Area"
3. Set zone type: Hazard Zone

**Conditions:**
```
Object Types: Person without helmet
Minimum Confidence: 80%
Minimum Duration: 3 seconds
Cooldown Period: 300 seconds (5 minutes)
```

**Schedule:**
```
Active: Monday-Friday, 06:00 - 22:00
Active: Saturday, 08:00 - 16:00
```

**Alert Configuration:**
```
Severity: P2 (High)
Alert Channels:
  ☑ Dashboard notification
  ☑ Email to: safety@company.com
  
Evidence Capture:
  ☑ Record 10 seconds before event
  ☑ Record 10 seconds after event
  ☑ Capture snapshot with bounding box
  
Actions:
  ☑ Trigger warning message on display
  ☑ Log to safety compliance system
```

#### Example 3: Vehicle ANPR (License Plate Recognition)

**Rule Configuration:**
```
Rule Name: Capture All Vehicle Plates at Entrance
Detection Type: ANPR
Enabled: ☑ Yes
```

**Zone Configuration:**
1. Draw line across entrance/exit
2. Name line: "Vehicle Entry Point"
3. Set direction: Entering

**Conditions:**
```
Object Types: Vehicle
Minimum Confidence: 85%
Capture: All vehicles (no filtering)
```

**Schedule:**
```
Active: 24/7
```

**Processing:**
```
☑ Extract license plate number
☑ Capture vehicle make/model/color
☑ Record timestamp and direction
☑ Check against watchlists:
   - VIP vehicles (generate welcome alert)
   - Blacklisted vehicles (generate security alert)
   - Authorized vehicles (log entry only)
```

**Alert Configuration:**
```
Severity: P3 (Normal) - unless watchlist match
Alert Channels:
  ☑ Dashboard notification (for watchlist matches)
  ☑ Email summary report (daily)
  
Storage:
  ☑ Store in vehicle database
  ☑ Retention: 180 days
```

### Face Recognition Configuration

⚠️ **Important:** Face recognition requires compliance with privacy laws (GDPR, CCPA, BFSI).

Navigate to: **AI Analytics** → **Face Recognition** → **Configuration**

#### Creating Watchlists

Navigate to: **AI Analytics** → **Face Recognition** → **Watchlists** → **Add Watchlist**

**Watchlist Types:**
- **VIP Watchlist** - Important visitors, executives
- **Employee Watchlist** - Staff access control
- **Blacklist** - Security threats, banned individuals
- **Visitor Watchlist** - Expected visitors

**Example: Employee Watchlist**

**Step 1: Create Watchlist**
```
Watchlist Name: Branch Employees
Watchlist Type: Employee
Purpose: Employee access control and time tracking
Active: ☑ Yes
```

**Step 2: Configure Consent**
```
☑ Require biometric consent for all subjects
☑ Allow subjects to revoke consent
☑ Auto-delete inactive entries after 90 days
☑ Log all face matches for audit
```

**Step 3: Configure Matching**
```
Matching Threshold: 0.75 (75% similarity)
Temporal Confirmation: 3 frames minimum
Liveness Detection: ☑ Enabled (prevents photo spoofing)
```

**Step 4: Add Persons**

For each employee:
```
Full Name: John Smith
Employee ID: EMP-12345
Department: Operations
Photo Requirements:
  - Front-facing, neutral expression
  - Good lighting
  - No glasses/hat/mask (preferred)
  - Multiple angles (recommended: 3-5 photos)

Consent:
  ☑ Biometric consent obtained on: 2026-09-01
  ☑ Consent form signed and stored
  ☑ Employee informed of data usage and rights
```

#### Privacy and Compliance

Navigate to: **AI Analytics** → **Face Recognition** → **Privacy Settings**

**Data Retention:**
```
Face Embeddings: 180 days after person removed from watchlist
Face Images: 90 days (encrypted at rest)
Match Events: 365 days
Audit Logs: 7 years (compliance requirement)
```

**Access Control:**
```
Who can view face match events: Security Managers, SOC Operators
Who can add persons to watchlists: HR Managers, Security Admins
Who can delete persons: HR Managers only
Audit trail: All access logged
```

**Subject Rights:**
```
☑ Enable data access request portal
☑ Enable right to erasure (within 30 days)
☑ Enable right to object to processing
☑ Automated notification of data breaches
```

---

## Recording and Storage

### Recording Modes

Navigate to: **Cameras** → [Camera Name] → **Recording**

**Available Modes:**

**1. Continuous Recording**
```
Description: Record 24/7 non-stop
Use Case: High-security areas, compliance requirements
Storage Impact: ~4 GB/hour per camera at 1080p
Pros: Complete coverage, no gaps
Cons: Highest storage usage
```

**2. Motion-Based Recording**
```
Description: Record only when motion detected
Use Case: Low-traffic areas, storage optimization
Storage Impact: ~0.5-2 GB/hour per camera (varies by traffic)
Pros: Significant storage savings
Cons: May miss events with minimal motion
```

**3. Scheduled Recording**
```
Description: Record during specific hours
Use Case: Business hours only, after-hours security
Storage Impact: Depends on schedule
Example: Record Mon-Fri 08:00-18:00 only
```

**4. Event-Triggered Recording**
```
Description: Record when AI analytics detect events
Use Case: AI-first deployments, intelligent storage
Storage Impact: Minimal, only captures important events
Pros: Lowest storage, focused on relevant content
Cons: Depends on AI accuracy
```

**5. Manual Recording**
```
Description: Operator initiates recording
Use Case: Special investigations, temporary monitoring
Storage Impact: Minimal
```

### Storage Configuration

Navigate to: **Settings** → **Storage** → **Configuration**

#### Storage Tiers

**Hot Storage** (Fast access, expensive)
- Duration: Last 30 days
- Storage: NVMe SSD or fast HDDs
- Access Time: < 1 second
- Use: Recent footage, active investigations

**Warm Storage** (Balanced)
- Duration: 31-90 days
- Storage: Standard HDDs
- Access Time: < 5 seconds
- Use: Recent archived footage

**Cold Storage** (Archival, cheap)
- Duration: 91+ days
- Storage: Tape, cloud, slow HDDs
- Access Time: Minutes to hours
- Use: Compliance retention

#### Storage Calculation

Navigate to: **Tools** → **Storage Calculator**

**Example Calculation:**
```
Cameras: 50
Resolution: 1920x1080 (1080p)
Frame Rate: 25 FPS
Recording: 24/7 continuous
Retention: 90 days

Estimated Storage:
- Per Camera: ~96 GB/day
- All Cameras: 4.8 TB/day
- 90-Day Retention: 432 TB total

Recommended:
- RAID 6 with hot spares
- 480 TB raw capacity (usable ~360 TB)
- 20% overhead for metadata/index
```

### Storage Health Monitoring

Navigate to: **Storage** → **Health**

**Metrics Monitored:**
- **Disk Usage:** 45% (195 TB used of 432 TB)
- **Write Speed:** 2.5 GB/s (healthy)
- **Read Speed:** 3.2 GB/s (healthy)
- **IOPS:** 12,500 (healthy)
- **Disk Temperature:** 38°C (healthy)
- **SMART Status:** ✅ All disks healthy
- **RAID Status:** ✅ RAID 6 operational, no degraded drives

**Predictive Analytics:**
```
Storage Exhaustion Forecast: 145 days
Recommended Action: Plan expansion in 4 months
Predicted Disk Failures (30 days): 0 disks
```

---

## Alert Configuration

### Understanding Alert Severity

| Severity | Priority | Response Time | Examples |
|----------|----------|---------------|----------|
| **P1** | Critical | Immediate (< 5 min) | Intrusion, fire, weapon detected |
| **P2** | High | Urgent (< 15 min) | PPE violation, loitering, tailgating |
| **P3** | Normal | Standard (< 1 hour) | Queue length, occupancy threshold |
| **P4** | Low | Next business day | Heat map anomaly, minor device health |
| **P5** | Info | No action required | Daily reports, system updates |

### Creating Alert Rules

Navigate to: **Alerts** → **Rules** → **Add Rule**

#### Example: Critical Intrusion Alert

```yaml
Rule Name: After-Hours Vault Intrusion
Trigger: Intrusion detection in "Vault Area" zone
Severity: P1 (Critical)

Conditions:
  - Time: After business hours (18:00 - 08:00)
  - Location: Branch #101, Vault Area
  - Object: Person detected
  - Confidence: > 75%
  - Duration: > 2 seconds

Actions:
  1. Dashboard Alert (Immediate)
     - Pop-up notification
     - Audio alarm in SOC
     - Live video preview
  
  2. Email Notification (Immediate)
     - To: security@company.com, manager@company.com
     - Subject: [CRITICAL] Intrusion in Vault - Branch #101
     - Include: Snapshot, video clip link, location map
  
  3. SMS Notification (Immediate)
     - To: +1-555-SECURITY, +1-555-MANAGER
     - Message: "CRITICAL: Person detected in vault after hours at Branch #101. Respond immediately."
  
  4. Voice Call (If no ACK in 2 minutes)
     - To: +1-555-SECURITY
     - Message: "This is an urgent security alert from KryptoVision..."
  
  5. Evidence Capture
     - Record: 30 seconds pre-roll, 60 seconds post-roll
     - Snapshot: Every 5 seconds
     - Create incident with all evidence
  
  6. Escalation (If no ACK in 5 minutes)
     - Notify: Director of Security
     - Voice call: +1-555-DIRECTOR
     - SMS: All security managers

Notification Channels:
  ☑ In-App Dashboard
  ☑ Email
  ☑ SMS
  ☑ Voice Call (escalation only)
  ☑ Push Notification (mobile app)
  ☑ Webhook (integrate with other systems)

Suppression:
  Cooldown: 5 minutes
  Max Alerts: 3 per hour (prevent alert storm)
```

### Alert Channels Configuration

Navigate to: **Settings** → **Alerts** → **Notification Channels**

#### Email Configuration

Already configured in System Setup. Verify:
- Test email delivery
- Check spam folders
- Whitelist sender address

#### SMS Configuration

```yaml
Provider: Twilio
Default Sender: +1-555-ALERTS
Daily Limit: 1000 SMS (cost control)
Rate Limit: 10 SMS per minute

Message Template:
  "[{severity}] {alert_type} at {branch_name}. {details}. Respond via app."
  
Cost Control:
  ☑ Limit P3-P5 alerts to business hours
  ☑ Batch multiple low-priority alerts
  ☑ Use email for P4-P5, SMS for P1-P3 only
```

#### Voice Call Configuration

```yaml
Provider: Twilio
Default Caller ID: +1-555-SECURITY
Max Call Duration: 2 minutes
Retry: 2 times if no answer

Voice Message Template:
  "This is an urgent security alert from KryptoVision.
   {alert_type} has been detected at {branch_name}.
   Press 1 to acknowledge this alert.
   Press 2 to escalate to your manager.
   Press 9 to repeat this message."

Cost Control:
  ☑ Voice calls for P1 alerts only
  ☑ Only call during escalation path
  ☑ Max 10 voice calls per day per phone number
```

### Alert Recipients

Navigate to: **Alerts** → **Recipients** → **Manage Recipients**

#### Individual Recipients

```yaml
Name: John Smith
Email: john.smith@company.com
Phone: +1-555-123-4567
Mobile: +1-555-MOBILE-1

Notification Preferences:
  P1 (Critical): Email + SMS + Voice Call
  P2 (High): Email + SMS
  P3 (Normal): Email only
  P4 (Low): Email daily digest
  P5 (Info): Dashboard only

Schedule:
  On-Duty Hours: Mon-Fri 08:00-18:00
  After-Hours: Voice call for P1 only
  Vacation Mode: Disabled (notifications forwarded to backup)

Escalation:
  If no acknowledgment: Escalate to Manager after 10 minutes
```

#### Recipient Groups

```yaml
Group Name: Security Operations Team
Members:
  - John Smith (Primary)
  - Jane Doe (Primary)
  - Bob Johnson (Backup)
  - Alice Williams (Manager)

Notification Logic:
  Step 1: Alert John and Jane simultaneously (Email + SMS)
  Step 2: If no ACK in 5 minutes, alert Bob (Email + SMS + Voice)
  Step 3: If no ACK in 10 minutes, alert Alice (Voice Call)
  Step 4: If no ACK in 15 minutes, alert all + Director

Schedule:
  24/7 coverage with rotation schedule
  Auto-switch to next on-duty operator
```

---

## Maintenance and Monitoring

### Daily Health Checks

Navigate to: **Dashboard** → **System Health**

**Daily Checklist:**
- [ ] All branches showing ✅ Healthy status
- [ ] Storage < 80% capacity
- [ ] No cameras offline > 1 hour
- [ ] No recording gaps in last 24 hours
- [ ] Internet connectivity healthy (all branches)
- [ ] No critical alerts unacknowledged
- [ ] Edge agents connected (all branches)
- [ ] AI analytics running (check model status)

### System Maintenance

Navigate to: **Settings** → **Maintenance**

#### Scheduled Maintenance Windows

**Configure low-impact maintenance periods:**

```yaml
Maintenance Window: Sunday 02:00 - 06:00 AM

Allowed Activities:
  ☑ Software updates
  ☑ Database optimization
  ☑ Cache clearing
  ☑ Disk cleanup
  ☑ Report generation
  ☑ Backup verification

Not Allowed:
  ☒ Camera reboots (unless critical)
  ☒ Storage maintenance (recording interruption)
  ☒ Network changes

Notification:
  ☑ Email notification 24 hours before
  ☑ Dashboard banner during maintenance
  ☑ Alert suppression during window
```

#### Database Maintenance

Navigate to: **Settings** → **Maintenance** → **Database**

**Tasks:**
- **Vacuum:** Weekly (optimizes database)
- **Reindex:** Monthly (improves query performance)
- **Analyze:** Daily (updates statistics)
- **Backup:** Daily at 01:00 AM

**Manual Operations:**
```
Last Vacuum: 2 days ago
Database Size: 247 GB
Estimated Vacuum Time: 15 minutes

☑ Vacuum during next maintenance window
☑ Create backup before vacuum
```

#### Log Management

Navigate to: **Settings** → **Logs**

**Log Retention:**
```
Application Logs: 90 days
Audit Logs: 7 years (compliance)
Access Logs: 180 days
Error Logs: 365 days
Debug Logs: 30 days
```

**Log Rotation:**
```
Rotate: Daily
Compress: After 7 days
Archive: After 30 days
Delete: After retention period
```

---

## Security and Compliance

### Security Best Practices

#### Password Policy

Navigate to: **Settings** → **Security** → **Password Policy**

```yaml
Minimum Length: 12 characters
Complexity Requirements:
  ☑ At least 1 uppercase letter
  ☑ At least 1 lowercase letter
  ☑ At least 1 number
  ☑ At least 1 special character

Restrictions:
  ☑ Cannot contain username
  ☑ Cannot contain company name
  ☑ Cannot reuse last 5 passwords
  ☑ Cannot be common password (dictionary check)

Expiration:
  Password expires: Every 90 days
  Warning: 7 days before expiration
  Grace period: 3 days after expiration

Lockout Policy:
  Failed attempts: 5 attempts
  Lockout duration: 30 minutes
  Admin override: Allowed
```

#### Session Management

Navigate to: **Settings** → **Security** → **Session Management**

```yaml
Session Timeout:
  Idle timeout: 30 minutes
  Absolute timeout: 12 hours
  Warning before timeout: 5 minutes

Session Security:
  ☑ Bind session to IP address
  ☑ Bind session to user agent
  ☑ Invalidate old sessions on password change
  ☑ Single sign-on (SSO) support
  ☑ Remember device (optional, 30 days)

Multi-Device:
  Max concurrent sessions: 3 per user
  Action on limit: Logout oldest session
```

#### Audit Logging

Navigate to: **Settings** → **Security** → **Audit Logging**

**Events Logged:**
- ✅ User login/logout
- ✅ Failed login attempts
- ✅ Password changes
- ✅ User creation/modification/deletion
- ✅ Permission changes
- ✅ Camera configuration changes
- ✅ Recording access (playback, export)
- ✅ Evidence export
- ✅ Alert acknowledgment/resolution
- ✅ System configuration changes
- ✅ AI rule changes
- ✅ Face watchlist access

**Audit Log Immutability:**
- ✅ Write-once, tamper-evident
- ✅ Cryptographic hash chain
- ✅ Cannot be deleted (retention policy only)
- ✅ Separate database (air-gapped)

**Compliance Reports:**
```
Generate Audit Report:
  Period: Last 30 days
  Include: All security events
  Format: PDF (signed), CSV
  Recipient: compliance@company.com
  Schedule: Monthly, first day of month
```

### Privacy Compliance

Navigate to: **Settings** → **Privacy**

#### GDPR Compliance

```yaml
Data Subject Rights:
  ☑ Right to access (within 30 days)
  ☑ Right to erasure ("right to be forgotten")
  ☑ Right to rectification
  ☑ Right to data portability
  ☑ Right to object to processing
  ☑ Automated decision-making transparency

Data Processing Records:
  ☑ Purpose of processing documented
  ☑ Legal basis identified (consent, legitimate interest, etc.)
  ☑ Data retention periods defined
  ☑ Third-party processors listed
  ☑ International transfers documented

Privacy by Design:
  ☑ Minimal data collection
  ☑ Pseudonymization where possible
  ☑ Encryption at rest and in transit
  ☑ Access control and audit trails
  ☑ Data protection impact assessment (DPIA)
```

#### CCPA Compliance (California)

```yaml
Consumer Rights:
  ☑ Right to know what data is collected
  ☑ Right to delete personal information
  ☑ Right to opt-out of sale (N/A - we don't sell data)
  ☑ Right to non-discrimination

Notice Requirements:
  ☑ Privacy policy visible on website
  ☑ "Do Not Sell My Personal Information" link (N/A)
  ☑ Data collection disclosure at point of collection
  ☑ Notice of changes to privacy practices
```

#### BFSI Compliance (Banking)

```yaml
Biometric Data Protection:
  ☑ Explicit consent required
  ☑ Consent can be withdrawn anytime
  ☑ Liveness detection mandatory
  ☑ Temporal confirmation (anti-spoofing)
  ☑ Human review for critical matches
  ☑ Audit trail for all biometric operations

Data Security:
  ☑ End-to-end encryption
  ☑ Role-based access control
  ☑ Multi-factor authentication
  ☑ Air-gapped audit storage
  ☑ Regular security audits

Compliance Reporting:
  ☑ Quarterly compliance report to board
  ☑ Annual third-party security audit
  ☑ Incident response plan documented
  ☑ Data breach notification procedures
```

---

## Backup and Recovery

### Backup Strategy

Navigate to: **Settings** → **Backup**

#### Database Backup

```yaml
Backup Schedule:
  Full Backup: Daily at 01:00 AM
  Incremental: Every 6 hours
  Retention: 30 days
  
Backup Location:
  Primary: /backups/database/
  Remote: s3://kryptovision-backups/database/
  Offsite: Tape (monthly, stored offsite)

Backup Verification:
  ☑ Automated restore test (weekly)
  ☑ Checksum verification
  ☑ Backup size monitoring
  ☑ Alert on backup failure
  
Encryption:
  ☑ AES-256 encryption
  Encryption Key: Stored in HSM
```

#### Recording Backup

```yaml
Critical Recordings:
  Marked as "Evidence": Real-time backup to remote
  P1 Alert Recordings: Backup within 1 hour
  P2 Alert Recordings: Backup within 24 hours
  
Backup Strategy:
  Primary Storage: Local (branch)
  Secondary Storage: Central (data center)
  Tertiary Storage: Cloud (S3-compatible)
  
Bandwidth Management:
  ☑ Backup during off-peak hours
  ☑ Bandwidth limit: 50% of available
  ☑ Priority: Evidence > P1 > P2 > Standard
```

### Disaster Recovery

Navigate to: **Settings** → **Disaster Recovery**

#### Recovery Time Objective (RTO)

```yaml
RTO Targets:
  Control Plane: < 1 hour
  Database: < 2 hours
  Single Branch: < 4 hours
  All Branches: < 24 hours
  
Cold Standby:
  Location: Secondary data center
  Sync: Real-time database replication
  Activation: Manual (15-30 minutes)
```

#### Recovery Point Objective (RPO)

```yaml
RPO Targets:
  Database: < 15 minutes (incremental backups)
  Critical Recordings: < 5 minutes (real-time sync)
  Standard Recordings: < 24 hours (daily sync)
  Configuration: < 1 hour (continuous backup)
```

#### Disaster Recovery Procedures

**Scenario 1: Control Plane Failure**

```bash
# Step 1: Assess damage
./scripts/dr-assess.sh

# Step 2: Activate standby
./scripts/dr-activate-standby.sh

# Step 3: Update DNS
./scripts/dr-update-dns.sh standby-control-plane.company.com

# Step 4: Verify all services
./scripts/dr-verify-services.sh

# Step 5: Notify users
./scripts/dr-notify-users.sh --status active
```

**Scenario 2: Branch Total Loss**

```yaml
Impact: 
  - Local recordings lost (if not backed up)
  - Cameras offline
  - Edge agent offline
  
Recovery Steps:
  1. Spin up new edge agent (cloud or temporary hardware)
  2. Restore branch configuration from backup
  3. Redirect cameras to new edge agent
  4. Restore recent recordings from central backup
  5. Verify camera connectivity
  
Time: 2-4 hours
```

---

## Appendix

### Keyboard Shortcuts

| Action | Shortcut | Description |
|--------|----------|-------------|
| **Navigation** |
| Dashboard | `Alt + 1` | Go to main dashboard |
| Live View | `Alt + 2` | Go to live view |
| Playback | `Alt + 3` | Go to playback |
| Alerts | `Alt + 4` | Go to alerts |
| Search | `Ctrl + K` or `/` | Global search |
| **Live View** |
| Fullscreen | `F` | Toggle fullscreen |
| Next Camera | `→` or `N` | Next camera in sequence |
| Previous Camera | `←` or `P` | Previous camera |
| PTZ Mode | `Ctrl + P` | Enable PTZ controls |
| Snapshot | `S` | Capture snapshot |
| **Playback** |
| Play/Pause | `Space` | Toggle playback |
| Speed 2x | `2` | 2x speed |
| Speed 4x | `4` | 4x speed |
| Normal Speed | `1` | Normal speed |
| Jump Back 10s | `J` | Jump backwards |
| Jump Forward 10s | `L` | Jump forwards |
| Frame Step Back | `,` | Previous frame |
| Frame Step Forward | `.` | Next frame |
| Export | `Ctrl + E` | Export clip |
| **General** |
| Help | `?` | Show help |
| Logout | `Ctrl + Shift + L` | Logout |

### Glossary

**Analytics Engine** - AI-powered video analysis service that detects objects, behaviors, and events

**ANPR** - Automatic Number Plate Recognition, AI system that reads vehicle license plates

**Branch** - Physical location with cameras (retail store, bank branch, office, etc.)

**Codec** - Video compression format (H.264, H.265/HEVC)

**Edge Agent** - Software installed at branch to manage local cameras and recording

**Embedding** - Mathematical representation of a face used for recognition

**Evidence** - Video/images marked for legal/compliance purposes with chain-of-custody

**FPS** - Frames Per Second, video frame rate (typically 15-30 FPS)

**HSM** - Hardware Security Module, secure cryptographic key storage

**Intrusion** - Unauthorized entry into defined zone

**Liveness Detection** - AI technique to detect real person vs photo/video

**Main Stream** - High-quality video stream used for recording

**ONVIF** - Open Network Video Interface Forum, camera compatibility standard

**PTZ** - Pan-Tilt-Zoom camera with remote movement control

**RTSP** - Real Time Streaming Protocol, video stream protocol

**SOC** - Security Operations Center, centralized monitoring facility

**Sub Stream** - Lower-quality stream for live viewing and bandwidth optimization

**Temporal Confirmation** - Requiring multiple detections over time to confirm event

**Tenant** - Organization in multi-tenant system

**Watchlist** - List of known persons for face recognition (VIP, employee, blacklist)

### Support Information

**Technical Support:**
- Email: support@kryptonlogic.com
- Phone: 1-800-KRYPTON
- Portal: https://support.kryptonlogic.com

**Sales and Licensing:**
- Email: sales@kryptonlogic.com
- Phone: 1-800-SALES-VMS

**Training:**
- Email: training@kryptonlogic.com
- Academy: https://academy.kryptonlogic.com

**Security Issues:**
- Email: security@kryptonlogic.com
- PGP Key: https://kryptonlogic.com/security/pgp-key.txt

---

**Document Version:** 1.0.0  
**Last Updated:** September 15, 2026  
**Next Review:** December 15, 2026

© 2026 KryptonLogic. All rights reserved.

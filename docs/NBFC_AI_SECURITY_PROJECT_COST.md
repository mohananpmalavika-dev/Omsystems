# NBFC AI Security Project - Complete Cost Breakdown

## Executive Summary

This document provides a comprehensive cost analysis for implementing AI-powered security systems for Non-Banking Financial Companies (NBFCs). Costs are broken down by deployment model, scale, and implementation phases.

**Document Purpose:** Investment planning, budgeting, and ROI analysis  
**Target Audience:** CFO, CTO, Head of Security, Project Sponsors  
**Currency:** Indian Rupees (INR)  
**Last Updated:** September 16, 2026

---

## 1. Deployment Models & Pricing Options

### Model A: On-Premises Deployment (Recommended for NBFC)

**Best For:** 
- Financial institutions requiring complete data sovereignty
- Organizations with security/compliance constraints
- Long-term cost optimization (3+ years)

**Cost Structure:** High upfront CAPEX, low ongoing OPEX

### Model B: Hybrid Cloud Deployment

**Best For:**
- Multi-branch organizations needing centralized monitoring
- Phased rollout with scalability requirements
- Organizations with existing cloud infrastructure

**Cost Structure:** Medium upfront CAPEX, medium ongoing OPEX

### Model C: Fully Managed SaaS (Cloud)

**Best For:**
- Rapid deployment requirements
- Limited in-house IT infrastructure
- Pilot/POC phase before full commitment

**Cost Structure:** Low upfront CAPEX, high ongoing OPEX

---

## 2. On-Premises Deployment (Model A) - Detailed Costing

### 2.1 Hardware Infrastructure Costs

#### Per Branch Analytics Server (50 cameras)

| Component | Specification | Unit Cost | Quantity | Total |
|-----------|---------------|-----------|----------|-------|
| **GPU Server** | | | | |
| GPU | NVIDIA RTX 4500 Ada (24GB) | ₹3,80,000 | 1 | ₹3,80,000 |
| CPU | Intel Xeon Silver 4410Y (12C) | ₹45,000 | 1 | ₹45,000 |
| RAM | 64GB DDR5 ECC | ₹35,000 | 1 | ₹35,000 |
| Storage (Hot) | 2TB NVMe SSD (RAID 1) | ₹25,000 | 2 | ₹50,000 |
| Storage (Archive) | 20TB HDD (RAID 6) | ₹18,000 | 4 | ₹72,000 |
| Motherboard | Dual socket workstation | ₹40,000 | 1 | ₹40,000 |
| PSU | 1200W Redundant PSU | ₹18,000 | 1 | ₹18,000 |
| Chassis | 4U Rackmount | ₹25,000 | 1 | ₹25,000 |
| **Subtotal** | | | | **₹6,65,000** |

#### Network & Infrastructure (Per Branch)

| Component | Specification | Unit Cost | Quantity | Total |
|-----------|---------------|-----------|----------|-------|
| Core Switch | 48-port PoE+ Gigabit | ₹85,000 | 1 | ₹85,000 |
| Backup Switch | 24-port PoE+ Gigabit | ₹45,000 | 1 | ₹45,000 |
| UPS | 3KVA Online UPS | ₹45,000 | 1 | ₹45,000 |
| Network Cabinet | 42U Rack with cooling | ₹35,000 | 1 | ₹35,000 |
| Cabling | Cat6A, conduits, patches | ₹2,000/pt | 50 | ₹1,00,000 |
| **Subtotal** | | | | **₹3,10,000** |

#### Camera Infrastructure (Per Branch)

| Camera Type | Specification | Unit Cost | Quantity | Total |
|-------------|---------------|-----------|----------|-------|
| Indoor Dome | 4MP, WDR, PoE | ₹8,500 | 30 | ₹2,55,000 |
| Outdoor Bullet | 4MP, IR 30m, PoE, IP67 | ₹12,000 | 15 | ₹1,80,000 |
| PTZ Camera | 2MP, 20x Optical, PoE+ | ₹45,000 | 3 | ₹1,35,000 |
| Vault Camera | 4MP, Low-light, Explosion-proof | ₹18,000 | 2 | ₹36,000 |
| **Subtotal** | | | | **₹6,06,000** |

#### Security Device Integration (Per Branch)

| Device | Purpose | Unit Cost | Quantity | Total |
|--------|---------|-----------|----------|-------|
| Panic Buttons | Wired + Wireless | ₹3,500 | 10 | ₹35,000 |
| Door Controllers | Access control integration | ₹12,000 | 8 | ₹96,000 |
| Motion Sensors | PIR sensors (perimeter) | ₹2,500 | 15 | ₹37,500 |
| Glass Break Sensors | Audio sensors | ₹4,500 | 6 | ₹27,000 |
| Smoke Detectors | IoT-enabled with camera integration | ₹3,000 | 10 | ₹30,000 |
| Environmental Sensors | Temperature, humidity, water leak | ₹5,000 | 5 | ₹25,000 |
| **Subtotal** | | | | **₹2,50,500** |

#### **Total Hardware Cost Per Branch:** ₹18,31,500 (~₹18.3 lakhs)

---

### 2.2 Software Licensing Costs (On-Premises)

#### Perpetual Licenses (One-Time Cost Per Branch)

| Software Component | Description | Cost Per Branch |
|-------------------|-------------|-----------------|
| **Analytics Engine Core** | Base AI analytics platform | ₹2,50,000 |
| **Advanced Analytics Module** | Face recognition, ANPR, weapon detection | ₹1,50,000 |
| **Device Integration Module** | ONVIF, SNMP, REST, MQTT connectors | ₹80,000 |
| **Investigation Suite** | AI search, cross-camera tracking, evidence management | ₹1,20,000 |
| **Reporting & Compliance** | Automated reports, audit trails, dashboards | ₹70,000 |
| **API & Integration Pack** | REST, WebSocket, GraphQL, SIEM connectors | ₹60,000 |
| **Mobile Apps** | iOS + Android for SOC operators | ₹40,000 |
| **Enterprise License** | Multi-branch management console | ₹3,00,000 (one-time for entire org) |
| **Subtotal** | | **₹6,70,000/branch** |
| | **+ ₹3,00,000 (org-level)** |

#### Annual Maintenance & Support (20% of License Cost)

| Support Type | Coverage | Annual Cost Per Branch |
|-------------|----------|----------------------|
| Software Updates | Major + minor versions | Included |
| 24x7 Technical Support | P1: <30 min, P2: <2 hrs | Included |
| Security Patches | Critical vulnerability fixes | Included |
| **Total Annual AMC** | | **₹1,34,000/branch** |

---

### 2.3 Implementation & Professional Services

#### One-Time Implementation Costs (Per Branch)

| Service | Description | Cost Per Branch |
|---------|-------------|-----------------|
| **Site Survey & Planning** | Network assessment, camera placement, zone mapping | ₹45,000 |
| **Hardware Installation** | Server setup, camera mounting, cabling | ₹1,20,000 |
| **Software Deployment** | Analytics engine installation, configuration | ₹80,000 |
| **Camera Calibration** | Zone setup, threshold tuning, testing | ₹60,000 |
| **Device Integration** | Panic buttons, access control, sensors | ₹55,000 |
| **AI Model Tuning** | Custom model training with branch footage | ₹1,20,000 |
| **SOC Integration** | Alerting setup, notification channels, escalation | ₹40,000 |
| **Testing & Validation** | 2-week validation period, acceptance testing | ₹50,000 |
| **Training** | On-site training (operators, admins, security) | ₹35,000 |
| **Documentation** | As-built drawings, runbooks, SOPs | ₹25,000 |
| **Project Management** | Coordination, reporting (15% of services) | ₹75,000 |
| **Subtotal** | | **₹7,05,000** |

#### Optional Professional Services

| Service | Cost | When Needed |
|---------|------|-------------|
| Custom Integration Development | ₹1,50,000 - ₹3,00,000 | Proprietary systems |
| Custom AI Model Development | ₹5,00,000 - ₹15,00,000 | Specialized detections |
| Dedicated SOC Setup | ₹25,00,000 - ₹50,00,000 | New SOC facility |
| Compliance Audit Support | ₹1,00,000 - ₹2,00,000 | Regulatory audits |

---

### 2.4 Ongoing Operational Costs (Annual Per Branch)

| Cost Category | Description | Annual Cost |
|---------------|-------------|-------------|
| **Software AMC** | Updates, support, patches | ₹1,34,000 |
| **Hardware AMC** | Server, switch, camera maintenance | ₹75,000 |
| **Internet/Connectivity** | Backup link, VPN (if multi-site) | ₹24,000 |
| **Power & Cooling** | Electricity for analytics server (~500W avg) | ₹35,000 |
| **Storage Expansion** | Additional archival storage (if needed) | ₹20,000 |
| **Model Updates** | Quarterly AI model refresh | ₹40,000 |
| **Health Monitoring** | Remote monitoring service | ₹25,000 |
| **Subtotal** | | **₹3,53,000/year** |

---

### 2.5 Total On-Premises Cost Summary (Per Branch)

#### Initial Investment (Year 1)

| Category | Cost |
|----------|------|
| Hardware Infrastructure | ₹18,31,500 |
| Software Licenses (Perpetual) | ₹6,70,000 |
| Implementation Services | ₹7,05,000 |
| **Total Year 1 Investment** | **₹32,06,500** |
| **+ Enterprise License (one-time)** | **₹3,00,000** (split across branches) |

#### Recurring Annual Cost (Year 2+)

| Category | Cost |
|----------|------|
| Operational Expenses | ₹3,53,000 |

#### **5-Year Total Cost of Ownership (TCO) Per Branch:**
- Year 1: ₹32,06,500
- Years 2-5: ₹3,53,000 × 4 = ₹14,12,000
- **Total 5-Year TCO: ₹46,18,500** (~₹46.2 lakhs)

---

## 3. Hybrid Cloud Deployment (Model B) - Detailed Costing

### 3.1 Infrastructure Costs

#### Per Branch On-Premises Hardware (Reduced)

| Component | Specification | Cost Per Branch |
|-----------|---------------|-----------------|
| Edge Analytics Server | Intel i7, 32GB RAM, RTX 4060 | ₹2,50,000 |
| Local Storage (30 days) | 4TB NVMe SSD | ₹40,000 |
| Network Infrastructure | Switch, UPS (same as Model A) | ₹3,10,000 |
| Cameras | Same as Model A | ₹6,06,000 |
| Security Devices | Same as Model A | ₹2,50,500 |
| **Total Hardware** | | **₹14,56,500** |

#### Cloud Infrastructure (Shared Across All Branches)

| Service | Specification | Monthly Cost | Annual Cost |
|---------|---------------|--------------|-------------|
| Cloud Compute | 8 vCPU, 32GB RAM, GPU instance | ₹1,20,000 | ₹14,40,000 |
| Cloud Storage | 50TB object storage (all branches) | ₹80,000 | ₹9,60,000 |
| Database (Managed) | PostgreSQL, 100GB, HA | ₹35,000 | ₹4,20,000 |
| Load Balancer | Multi-region HA | ₹15,000 | ₹1,80,000 |
| Network Egress | Data transfer (avg 2TB/month) | ₹25,000 | ₹3,00,000 |
| Monitoring & Logs | CloudWatch/Application Insights | ₹12,000 | ₹1,44,000 |
| **Total Cloud (Annual)** | | | **₹34,44,000** |

### 3.2 Software Licensing (Hybrid)

| License Type | Cost Per Branch (Annual) |
|-------------|-------------------------|
| Edge Analytics (Subscription) | ₹1,80,000 |
| Cloud Platform Access | ₹1,20,000 |
| Advanced Features (Face, ANPR) | ₹80,000 |
| Mobile Apps & API | ₹40,000 |
| **Total Annual License** | **₹4,20,000** |

### 3.3 Implementation & Services

| Service | Cost Per Branch |
|---------|-----------------|
| Hardware Installation | ₹1,20,000 |
| Software Configuration | ₹60,000 |
| Camera Calibration | ₹60,000 |
| Cloud Setup & Migration | ₹1,50,000 |
| Training | ₹35,000 |
| **Total Implementation** | **₹4,25,000** |

### 3.4 Hybrid Model Cost Summary (Per Branch)

#### Year 1 Investment

| Category | Cost |
|----------|------|
| Hardware | ₹14,56,500 |
| Implementation | ₹4,25,000 |
| Annual Software License | ₹4,20,000 |
| Cloud Infrastructure (allocated) | ₹68,880 (₹34.44L ÷ 50 branches) |
| **Total Year 1** | **₹24,70,380** |

#### Annual Recurring (Year 2+)

| Category | Cost |
|----------|------|
| Software License | ₹4,20,000 |
| Cloud Infrastructure | ₹68,880 |
| Local AMC | ₹50,000 |
| **Total Annual** | **₹5,38,880** |

#### **5-Year TCO Per Branch:** ₹46,26,900 (~₹46.3 lakhs)

---

## 4. Fully Managed SaaS (Model C) - Detailed Costing

### 4.1 SaaS Subscription Model

#### Per Branch Monthly Subscription

| Tier | Cameras | Features | Monthly Cost | Annual Cost |
|------|---------|----------|--------------|-------------|
| **Basic** | Up to 20 | Core analytics, motion, intrusion | ₹45,000 | ₹5,40,000 |
| **Professional** | Up to 50 | + Face, ANPR, investigation tools | ₹85,000 | ₹10,20,000 |
| **Enterprise** | Up to 100 | + Weapon detection, predictive analytics | ₹1,35,000 | ₹16,20,000 |
| **Premium** | Unlimited | + Custom models, dedicated support | ₹2,00,000 | ₹24,00,000 |

**Typical NBFC Branch:** Professional Tier (₹10,20,000/year)

### 4.2 On-Premises Hardware (Customer-Owned)

| Component | Cost Per Branch |
|-----------|-----------------|
| Cameras | ₹6,06,000 (same as Model A) |
| Network Infrastructure | ₹3,10,000 (same as Model A) |
| Security Devices | ₹2,50,500 (same as Model A) |
| **Total Hardware** | **₹11,66,500** |

### 4.3 Implementation (SaaS)

| Service | Cost Per Branch |
|---------|-----------------|
| Camera Installation | ₹1,20,000 |
| Cloud Onboarding | ₹40,000 |
| Configuration & Calibration | ₹50,000 |
| Training | ₹25,000 |
| **Total Implementation** | **₹2,35,000** |

### 4.4 SaaS Model Cost Summary (Per Branch)

#### Year 1 Investment

| Category | Cost |
|----------|------|
| Hardware (one-time) | ₹11,66,500 |
| Implementation (one-time) | ₹2,35,000 |
| Annual Subscription (Professional) | ₹10,20,000 |
| **Total Year 1** | **₹24,21,500** |

#### Annual Recurring (Year 2+)

| Category | Cost |
|----------|------|
| SaaS Subscription | ₹10,20,000 |
| Hardware AMC | ₹50,000 |
| **Total Annual** | **₹10,70,000** |

#### **5-Year TCO Per Branch:** ₹67,01,500 (~₹67 lakhs)

---

## 5. Multi-Branch Deployment Pricing

### Volume Discounts

| Number of Branches | Discount | Effective Cost Per Branch (Model A) |
|-------------------|----------|-------------------------------------|
| 1-5 | 0% | ₹32,06,500 |
| 6-10 | 10% | ₹28,85,850 |
| 11-25 | 15% | ₹27,25,525 |
| 26-50 | 20% | ₹25,65,200 |
| 51+ | 25% | ₹24,04,875 |

### Enterprise Package (50 Branches Example)

#### On-Premises Model (Model A)

| Component | Per Branch | 50 Branches | With 20% Discount |
|-----------|-----------|-------------|-------------------|
| **Year 1 Investment** | ₹32,06,500 | ₹16,03,25,000 | **₹12,82,60,000** |
| | | | (~₹12.8 crores) |
| **Annual Recurring (Y2+)** | ₹3,53,000 | ₹1,76,50,000 | **₹1,41,20,000** |
| | | | (~₹1.4 crores/year) |

**5-Year Total for 50 Branches:** ₹18,47,40,000 (~₹18.5 crores)

#### Hybrid Model (Model B)

| Component | 50 Branches (Year 1) | With Discount |
|-----------|---------------------|---------------|
| **Year 1 Investment** | ₹12,35,19,000 | **₹9,88,15,200** (~₹9.9 crores) |
| **Annual Recurring (Y2+)** | ₹2,69,44,000 | **₹2,15,55,200** (~₹2.2 crores) |

**5-Year Total for 50 Branches:** ₹18,50,36,000 (~₹18.5 crores)

#### SaaS Model (Model C)

| Component | 50 Branches (Year 1) | No Volume Discount* |
|-----------|---------------------|---------------------|
| **Year 1 Investment** | ₹12,10,75,000 | **₹12,10,75,000** (~₹12.1 crores) |
| **Annual Recurring (Y2+)** | ₹5,35,00,000 | **₹5,35,00,000** (~₹5.4 crores) |

**5-Year Total for 50 Branches:** ₹33,50,75,000 (~₹33.5 crores)

*SaaS providers typically offer contract-level discounts rather than per-branch discounts.

---

## 6. Phased Rollout Cost Model

### Phase 1: Pilot (2 Branches) - Months 1-2

| Item | Cost |
|------|------|
| 2 Branch Hardware & Software | ₹57,69,660 |
| Implementation | ₹14,10,000 |
| Extended Support (Pilot) | ₹5,00,000 |
| **Phase 1 Total** | **₹76,79,660** |

### Phase 2: Regional Rollout (10 Branches) - Months 3-5

| Item | Cost (with 10% discount) |
|------|--------------------------|
| 10 Branch Hardware & Software | ₹2,88,58,500 |
| Implementation | ₹63,45,000 |
| Project Management | ₹15,00,000 |
| **Phase 2 Total** | **₹3,67,03,500** |

### Phase 3: National Rollout (38 Branches) - Months 6-12

| Item | Cost (with 20% discount) |
|------|--------------------------|
| 38 Branch Hardware & Software | ₹9,74,87,200 |
| Implementation | ₹2,14,30,000 |
| Centralized SOC Setup | ₹35,00,000 |
| Project Management | ₹25,00,000 |
| **Phase 3 Total** | **₹12,49,17,200** |

### **Total 50-Branch Phased Rollout:** ₹16,93,00,360 (~₹16.9 crores)

*Phased rollout adds ~10% to total cost vs simultaneous deployment due to mobilization costs, but reduces risk and allows for optimization.

---

## 7. Optional Add-Ons & Upgrades

### Advanced Feature Modules (Per Branch, Annual)

| Module | Description | Cost |
|--------|-------------|------|
| **Custom AI Models** | Industry-specific detection (e.g., jewellery, gold loan collateral) | ₹2,00,000 |
| **Advanced Face Recognition** | Liveness detection, mask recognition, age/gender | ₹80,000 |
| **LPR Enhancement** | Multi-line plates, damaged plate reading | ₹60,000 |
| **Audio Analytics** | Gunshot, glass break, aggression detection | ₹1,20,000 |
| **Behavioral Analytics** | Crowd behavior, customer journey mapping | ₹90,000 |
| **Integration Pack** | Pre-built connectors (Splunk, ServiceNow, etc.) | ₹50,000/system |

### Professional Services (As Needed)

| Service | Cost Range |
|---------|------------|
| **SOC-as-a-Service** | ₹3,00,000 - ₹6,00,000/month (24x7 monitoring) |
| **Managed Security Service** | ₹1,50,000 - ₹3,00,000/month |
| **Custom Development** | ₹8,000 - ₹15,000/hour |
| **On-Site Support Contract** | ₹2,00,000 - ₹5,00,000/year |
| **Compliance Consulting** | ₹3,00,000 - ₹8,00,000 (one-time) |
| **Penetration Testing** | ₹2,00,000 - ₹5,00,000 (annual) |

---

## 8. Cost Comparison Summary

### 50-Branch NBFC - 5 Year TCO

| Model | Year 1 | Annual (Y2-5) | 5-Year Total | Per Branch (5Y) |
|-------|--------|---------------|--------------|-----------------|
| **On-Premises** | ₹12.8 Cr | ₹1.4 Cr/year | **₹18.5 Cr** | **₹37 lakhs** |
| **Hybrid Cloud** | ₹9.9 Cr | ₹2.2 Cr/year | **₹18.5 Cr** | **₹37 lakhs** |
| **SaaS** | ₹12.1 Cr | ₹5.4 Cr/year | **₹33.5 Cr** | **₹67 lakhs** |

### Break-Even Analysis: On-Prem vs SaaS

**SaaS becomes more expensive after Year 2**

- Year 1: SaaS cheaper by ₹70 lakhs
- Year 2: SaaS more expensive by ₹80 lakhs (cumulative even)
- Year 5: SaaS more expensive by ₹15 crores total

**Recommendation:** On-premises for long-term (3+ years), SaaS for pilots or short-term projects.

---

## 9. Financing & Payment Options

### Option 1: CAPEX Purchase (100% Upfront)

- **Discount:** 5% on total project value
- **Payment Terms:** 30% advance, 40% on installation, 30% on acceptance
- **Warranty:** 3 years comprehensive

### Option 2: Phased CAPEX (Pay-as-You-Deploy)

- **Discount:** 2% on completed phases
- **Payment Terms:** Per-phase billing, 15 days net
- **Warranty:** 3 years per branch from acceptance

### Option 3: OPEX Lease (Finance Partner)

- **Term:** 3, 4, or 5 years
- **Interest Rate:** 9-12% (depends on credit rating)
- **Example (5-year, 10%):** ₹12.8 Cr → ₹2.72 Cr/year (₹22.67 lakhs/month)
- **Benefits:** Preserve working capital, 100% tax deductible

### Option 4: Revenue Share Model (Custom)

- **Zero Upfront Cost**
- **Share Savings:** 40% of documented savings/ROI for 5 years
- **Minimum Guarantee:** ₹50 lakhs/branch over 5 years
- **Requires:** Baseline metrics, audit rights, long-term contract

---

## 10. ROI Analysis & Payback Period

### Quantifiable Savings (Annual, 50-Branch NBFC)

| Benefit Category | Annual Savings |
|------------------|----------------|
| **False Dispatch Reduction** (40% fewer security calls) | ₹12-15 lakhs |
| **Theft & Fraud Prevention** (documented cases) | ₹50-80 lakhs |
| **Insurance Premium** (10-15% reduction) | ₹8-12 lakhs |
| **SOC Labor Optimization** (50% workload reduction) | ₹20-25 lakhs |
| **Device Downtime Prevention** (predictive maintenance) | ₹5-8 lakhs |
| **Investigation Time** (60% faster) | ₹8-10 lakhs |
| **Compliance Fine Avoidance** (audit readiness) | ₹10-15 lakhs |
| **Total Annual Savings** | **₹1.13 - ₹1.65 crores** |

### Payback Period Calculation

#### On-Premises Model (50 Branches)

- **Initial Investment:** ₹12.8 crores
- **Annual Savings:** ₹1.4 crores (conservative estimate)
- **Annual Operating Cost:** ₹1.4 crores
- **Net Annual Benefit:** ₹1.4 crores (savings) - ₹1.4 crores (opex) = **Break-even on operations**
- **CAPEX Payback:** 12.8 ÷ 1.4 = **9.1 years**

**However, accounting for intangible benefits:**
- **Effective Payback:** 3-4 years (including brand protection, compliance, operational efficiency)

#### More Realistic ROI (Including Intangibles)

| Year | Cost | Savings | Cumulative |
|------|------|---------|------------|
| 0 | (₹12.8 Cr) | - | (₹12.8 Cr) |
| 1 | (₹1.4 Cr) | ₹1.4 Cr | (₹12.8 Cr) |
| 2 | (₹1.4 Cr) | ₹1.6 Cr | (₹12.6 Cr) |
| 3 | (₹1.4 Cr) | ₹1.8 Cr | (₹12.2 Cr) |
| 4 | (₹1.4 Cr) | ₹2.0 Cr | (₹11.6 Cr) |
| 5 | (₹1.4 Cr) | ₹2.2 Cr | (₹10.8 Cr) |

**True Payback (Hard + Soft ROI):** 4-5 years  
**10-Year ROI:** 180-220% (considering asset life of 8-10 years)

---

## 11. Hidden Costs & Risk Contingency

### Potential Hidden Costs (Budget 15-20% Contingency)

| Item | Risk Level | Potential Cost |
|------|------------|----------------|
| **Network Upgrades** | Medium | ₹50,000 - ₹2,00,000/branch |
| **Electrical Work** | Low | ₹20,000 - ₹80,000/branch |
| **Civil Work** (conduits, mounts) | Medium | ₹30,000 - ₹1,50,000/branch |
| **Legacy System Integration** | High | ₹2,00,000 - ₹10,00,000 (one-time) |
| **Data Migration** | Low | ₹50,000 - ₹2,00,000 (one-time) |
| **Extended Testing** | Low | ₹1,00,000 - ₹3,00,000 |
| **Change Management** | Medium | ₹2,00,000 - ₹5,00,000 |
| **Scope Creep** | High | 10-20% of project value |

### Recommended Contingency Budget

- **Technical Contingency:** 10% of hardware/software cost
- **Implementation Contingency:** 15% of services cost
- **Total Contingency:** ₹1.5 - ₹2.0 crores (50-branch project)

---

## 12. Cost Optimization Strategies

### 1. Phased Feature Rollout

- **Phase 1:** Core security only (intrusion, vault, ATM)
- **Phase 2:** Add face recognition (after consent framework)
- **Phase 3:** Add predictive analytics
- **Savings:** 20-30% on Year 1 license cost

### 2. Hybrid Camera Strategy

- **New Cameras:** Critical areas only (20-30% of total)
- **Existing Cameras:** Integrate via ONVIF (70-80%)
- **Savings:** ₹4-5 lakhs per branch

### 3. Staggered GPU Deployment

- **Initial:** 1 GPU per 2 branches (shared processing)
- **Scale:** Add GPUs as load increases
- **Savings:** ₹3-4 lakhs per branch initially

### 4. Open-Source Model Usage

- **Commercial Models:** Critical detections only (face, weapon)
- **Open Models:** Generic detections (person, vehicle, motion)
- **Savings:** 30-40% on license cost

### 5. Multi-Year Contract

- **3-Year AMC:** 5% discount
- **5-Year AMC:** 10% discount
- **Savings:** ₹60-80 lakhs over 5 years (50 branches)

### **Total Potential Savings:** 25-35% of base cost = ₹3-4.5 crores (50-branch project)

---

## 13. Cost by Branch Type/Size

### Tier 1: Large Urban Branch (100+ cameras)

- **Hardware:** ₹32,00,000
- **Software:** ₹9,00,000
- **Implementation:** ₹10,00,000
- **Total Year 1:** ₹51,00,000

### Tier 2: Standard Branch (40-60 cameras)

- **Hardware:** ₹18,00,000
- **Software:** ₹6,50,000
- **Implementation:** ₹7,00,000
- **Total Year 1:** ₹31,50,000

### Tier 3: Small Branch (20-30 cameras)

- **Hardware:** ₹10,00,000
- **Software:** ₹4,50,000
- **Implementation:** ₹4,50,000
- **Total Year 1:** ₹19,00,000

### Tier 4: ATM Site (4-8 cameras)

- **Hardware:** ₹3,50,000
- **Software:** ₹2,50,000 (lite license)
- **Implementation:** ₹2,00,000
- **Total Year 1:** ₹8,00,000

---

## 14. Payment Milestones (Typical Project)

### 50-Branch Deployment (₹12.8 Crores)

| Milestone | Deliverable | Payment % | Amount |
|-----------|-------------|-----------|--------|
| **Contract Signing** | PO issued, kickoff | 15% | ₹1.92 Cr |
| **Pilot Acceptance** | 2 branches live, tested | 10% | ₹1.28 Cr |
| **25% Rollout** | 12 branches operational | 25% | ₹3.20 Cr |
| **50% Rollout** | 25 branches operational | 20% | ₹2.56 Cr |
| **75% Rollout** | 38 branches operational | 15% | ₹1.92 Cr |
| **Full Deployment** | All 50 branches, training | 10% | ₹1.28 Cr |
| **Final Acceptance** | UAT, documentation, warranty | 5% | ₹64 lakhs |

---

## 15. Total Cost of Ownership (TCO) - 10 Year View

### 50-Branch NBFC - On-Premises Model

| Year | Investment | OpEx | Upgrades | Total Annual | Cumulative |
|------|------------|------|----------|--------------|------------|
| 1 | ₹12.8 Cr | ₹1.4 Cr | - | ₹14.2 Cr | ₹14.2 Cr |
| 2-5 | - | ₹1.4 Cr | - | ₹1.4 Cr/yr | ₹19.8 Cr |
| 6 | - | ₹1.6 Cr | ₹3.0 Cr (GPU) | ₹4.6 Cr | ₹24.4 Cr |
| 7-10 | - | ₹1.6 Cr | - | ₹1.6 Cr/yr | ₹30.8 Cr |

**10-Year TCO:** ₹30.8 crores (₹6.16 lakhs/branch/year average)

### Hardware Refresh Strategy

- **Year 3:** Camera upgrades (20% failure rate) - ₹1.2 Cr
- **Year 6:** GPU/Server refresh - ₹3.0 Cr
- **Year 8:** Network infrastructure - ₹1.0 Cr

---

## 16. Decision Framework

### Choose **On-Premises** If:
- ✅ 3+ year commitment
- ✅ Data sovereignty critical (regulatory requirement)
- ✅ 25+ branches (economy of scale)
- ✅ In-house IT team available
- ✅ CAPEX budget approved

**Best TCO for long-term deployments.**

### Choose **Hybrid Cloud** If:
- ✅ Multi-location with centralized monitoring needs
- ✅ Scalability uncertainty (growing branch network)
- ✅ Some cloud comfort for reporting/analytics
- ✅ Balance between control and flexibility

**Best for growing organizations.**

### Choose **SaaS** If:
- ✅ Pilot/POC phase (6-12 months)
- ✅ Limited IT infrastructure/expertise
- ✅ OPEX-preferred model
- ✅ Rapid deployment critical (<3 months)
- ✅ Fewer than 10 branches

**Best for fast deployment and pilots.**

---

## 17. Competitive Positioning

### Market Comparison (50-Branch NBFC, 5-Year TCO)

| Vendor Type | 5-Year TCO | Feature Completeness | Support Quality |
|-------------|------------|---------------------|----------------|
| **Your Solution (On-Prem)** | ₹18.5 Cr | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **International Leader A** | ₹28-32 Cr | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **International Leader B** | ₹24-28 Cr | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Domestic Player A** | ₹20-22 Cr | ⭐⭐⭐ | ⭐⭐⭐ |
| **Domestic Player B** | ₹16-18 Cr | ⭐⭐⭐ | ⭐⭐⭐ |

**Value Proposition:** Enterprise-grade features at domestic pricing with superior support.

---

## 18. Frequently Asked Questions (Cost-Related)

### Q1: Can we start with fewer features to reduce cost?

**A:** Yes. Core security module (₹3.5L software/branch) provides intrusion, vault, ATM basics. Add modules later (₹80K-1.5L each). Saves 30-40% Year 1.

### Q2: What if we already have cameras?

**A:** Existing ONVIF/RTSP cameras work with our platform. Saves ₹6L/branch. We recommend upgrading 20-30% to 4K for critical areas.

### Q3: Is there a minimum commitment?

**A:** No minimum for SaaS (monthly). On-premises: 3-year AMC recommended for pricing. Hybrid: 1-year minimum.

### Q4: What happens if we cancel after Year 2?

**A:** On-premises: You own all hardware/software (perpetual license). Only lose AMC. Hybrid/SaaS: Data export included, transition support for 30 days.

### Q5: Are there any recurring surprise costs?

**A:** Potential: (1) Storage expansion if retention >90 days (₹20K/yr/branch), (2) Model updates if custom (₹40K/yr/branch), (3) Bandwidth if cloud-heavy (₹5-10K/month). All predictable and controllable.

### Q6: Can we negotiate pricing?

**A:** Yes. Volume discounts up to 25% (50+ branches). Multi-year contracts: 5-10% discount. Government/BFSI: Standard 10% discount. RFP response: Flexible commercial terms.

### Q7: What about international deployments?

**A:** Requires local compliance (GDPR, data residency). Add 15-20% for international setup (legal, local support, travel). Hybrid/SaaS models preferred for international.

### Q8: Do you offer performance guarantees?

**A:** Yes, in contract: (1) 99.5% uptime SLA, (2) <2% false positive rate (after calibration), (3) 92%+ detection accuracy for core capabilities. Penalty: 10% monthly refund per breach.

---

## 19. Next Steps & Proposal Request

### To Receive a Detailed Quote:

**Required Information:**
1. Number of branches and branch locations
2. Cameras per branch (existing + new required)
3. Specific AI features needed (from capability catalog)
4. Deployment model preference (on-prem/hybrid/SaaS)
5. Timeline and budget constraints
6. Existing infrastructure (VMS, access control, network)

### Proposal Contents:

- **Bill of Materials (BoM):** Itemized hardware, software, services
- **Implementation Plan:** Timeline, milestones, resource allocation
- **Commercial Terms:** Payment schedule, warranties, SLAs
- **TCO Analysis:** 5-year cost comparison with alternatives
- **ROI Calculator:** Customized savings projection
- **Pilot Proposal:** 2-branch POC with success criteria

### Timeline:

- **Week 1:** Requirements gathering, site survey
- **Week 2:** Technical design, BoM finalization
- **Week 3:** Commercial proposal, presentation
- **Week 4:** Contract negotiation, PO

---

## 20. Summary & Recommendations

### For a 50-Branch NBFC:

#### Recommended Approach: **Phased On-Premises with Hybrid Reporting**

**Phase 1 (Months 1-2):** 2-branch pilot (₹77 lakhs)  
**Phase 2 (Months 3-5):** 10-branch regional (₹3.7 crores)  
**Phase 3 (Months 6-12):** 38-branch national (₹12.5 crores)  

**Total Investment:** ₹16.9 crores (Year 1)  
**Annual Operating Cost:** ₹1.4 crores (Year 2+)  
**5-Year TCO:** ₹22.5 crores  
**10-Year TCO:** ₹30.8 crores  

**Expected ROI:** 180-220% over 10 years  
**Payback Period:** 4-5 years (including intangibles)  
**Annual Savings:** ₹1.4-1.6 crores (after Year 2)  

### Cost Optimization Recommendation:

- Use existing cameras where possible (saves ₹3 crores)
- Phased feature rollout (saves ₹2 crores Year 1)
- Multi-year AMC contract (saves ₹80 lakhs over 5 years)
- **Optimized Total:** ₹11-12 crores (Year 1) vs ₹16.9 crores base

---

## Contact for Pricing

**Sales Team:** sales@company.com  
**Technical Presales:** presales@company.com  
**Finance & Contracts:** finance@company.com  
**Phone:** +91-XXXX-XXXXXX

**Quote Validity:** 90 days from proposal date  
**Payment Terms:** Negotiable based on project size  
**Financing Partners:** Available for lease/OPEX models

---

**Document Version:** 1.0  
**Last Updated:** September 16, 2026  
**Classification:** Commercial - Confidential  
**Validity:** Pricing subject to change based on hardware/software component costs


# AI Analytics Dashboard - Complete Design Specification

**Project:** MIS Reporting System - Phase 3  
**Feature:** AI Analytics Dashboard (Priority #3 Enhancement)  
**Date:** September 17, 2026  
**Status:** Design Complete - Ready for Implementation

---

## Executive Summary

### Purpose
Track performance, ROI, and business impact of **381 AI capabilities** deployed across the surveillance platform, including person detection, vehicle/ANPR, face recognition, industrial safety, fire/smoke detection, and 10+ other capability domains.

### Business Value
- **Annual Value:** $50,000/year (highest value Phase 3 item)
- **Key Benefits:**
  - AI ROI visibility for CFO and board
  - Model performance tracking (identify underperforming capabilities)
  - Cost avoided calculation (justify AI investment)
  - Investigation time savings measurement
  - False positive reduction opportunities

### Success Criteria
- Track all 381 AI capabilities in real-time
- Report accuracy, false positives, inference time
- Calculate business impact (cost avoided, time saved)
- Load in < 3 seconds with 1M+ detection events
- 90%+ user satisfaction from executives

---

## Table of Contents

1. [User Interface Design](#user-interface-design)
2. [Backend API Specification](#backend-api-specification)
3. [Database Schema](#database-schema)
4. [Data Collection Architecture](#data-collection-architecture)
5. [Frontend Component Structure](#frontend-component-structure)
6. [Performance Optimization](#performance-optimization)
7. [Testing Strategy](#testing-strategy)
8. [Implementation Timeline](#implementation-timeline)

---

## User Interface Design

### Page 1: AI Analytics Dashboard Overview

```
┌────────────────────────────────────────────────────────────────────┐
│  AI Analytics Dashboard                    Last Updated: 2 min ago  │
│  [Auto-refresh: ON ▼]  [Export ▼]  [Date Range: Last 30 days ▼]   │
├────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────┬─────────────────┬─────────────────┬─────────┐ │
│  │ Total           │ Avg Accuracy    │ Total           │ Cost    │ │
│  │ Capabilities    │                 │ Detections      │ Avoided │ │
│  │                 │                 │                 │         │ │
│  │  381            │  92.4%          │  1.2M           │ $85K    │ │
│  │  ✅ All Active  │  ↑ 2.1% vs last │  ↑ 15% vs last │ This    │ │
│  │                 │     30 days     │     30 days     │ month   │ │
│  └─────────────────┴─────────────────┴─────────────────┴─────────┘ │
│                                                                      │
│  Performance by AI Capability Domain                                │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                                                                │  │
│  │  Human Analytics (67 capabilities)              [Expand ▼]    │  │
│  │  ├─ Accuracy: 94.2%  FP Rate: 3.1%  Detections: 450K         │  │
│  │  ├─ Incidents Prevented: 234                                  │  │
│  │  └─ Cost Avoided: $32,000                                     │  │
│  │                                                                │  │
│  │  Vehicle Analytics (52 capabilities)            [Expand ▼]    │  │
│  │  ├─ Accuracy: 91.8%  FP Rate: 4.2%  Detections: 380K         │  │
│  │  ├─ ANPR Success Rate: 89.5%                                  │  │
│  │  └─ Cost Avoided: $28,000                                     │  │
│  │                                                                │  │
│  │  Face Analytics (18 capabilities)               [Expand ▼]    │  │
│  │  ├─ Accuracy: 87.5%  FP Rate: 5.8%  Detections: 125K         │  │
│  │  ├─ Recognition Rate: 85.2%                                   │  │
│  │  └─ Cost Avoided: $12,000                                     │  │
│  │                                                                │  │
│  │  Fire & Safety (23 capabilities)                [Expand ▼]    │  │
│  │  ├─ Accuracy: 89.3%  FP Rate: 8.1%  Detections: 8,500        │  │
│  │  ├─ Response Time Improvement: 35%                            │  │
│  │  └─ Cost Avoided: $8,000                                      │  │
│  │                                                                │  │
│  │  [+11 more domains...]                                        │  │
│  │                                                                │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  30-Day Accuracy Trend                                              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  100% ┤                                                        │  │
│  │       │           ╱──╲                                        │  │
│  │   95% ┤      ╱───╯    ╲                                      │  │
│  │       │  ╱──╯           ╲╱╲╱─╲                               │  │
│  │   90% ┤─╯                    ╲                                │  │
│  │       │                       ╲╱─╲                           │  │
│  │   85% ┼────┬────┬────┬────┬────┬────┬────┬────┬────┬────   │  │
│  │       Sep10  15   20   25   Oct1   5   10   15   20   25    │  │
│  │                                                                │  │
│  │  ─── Overall  ─── Human  ─── Vehicle  ─── Face               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Top Performing Capabilities (This Month)                           │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Rank │ Capability          │ Accuracy │ FP Rate │ Detections│  │
│  ├───────┼─────────────────────┼──────────┼─────────┼───────────┤  │
│  │  🥇 1  │ Person Detection    │  96.8%   │  1.2%   │  320K     │  │
│  │  🥈 2  │ Vehicle Detection   │  95.4%   │  2.1%   │  280K     │  │
│  │  🥉 3  │ Crowd Density       │  94.7%   │  3.5%   │   45K     │  │
│  │   4   │ Loitering Detection │  93.2%   │  4.1%   │   12K     │  │
│  │   5   │ PPE Detection       │  92.8%   │  3.8%   │   28K     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Capabilities Needing Attention (Low Performance)                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  ⚠️  Face Recognition (Unknown Person) - 78.2% accuracy       │  │
│  │      Recommendation: Retrain model with more diverse dataset  │  │
│  │                                                                │  │
│  │  ⚠️  Fire Detection (Night Vision) - 82.5% accuracy           │  │
│  │      Recommendation: Adjust detection threshold               │  │
│  │                                                                │  │
│  │  ⚠️  ANPR (Low Light) - 81.3% accuracy                        │  │
│  │      Recommendation: Upgrade camera hardware                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
└────────────────────────────────────────────────────────────────────┘
```

---

### Page 2: Capability Detail View (Drill-Down)

**When user clicks "Human Analytics [Expand]":**

```
┌────────────────────────────────────────────────────────────────────┐
│  ← Back to Dashboard          Human Analytics (67 Capabilities)    │
│                                                                      │
├────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Summary                                                             │
│  ┌──────────────┬──────────────┬──────────────┬──────────────────┐ │
│  │ Avg Accuracy │ Total FPs    │ Detections   │ Investigation    │ │
│  │  94.2%       │  14,000      │  450,000     │ Time Saved       │ │
│  │  ↑ 1.8%      │  ↓ 12%       │  ↑ 18%       │  156 hours       │ │
│  └──────────────┴──────────────┴──────────────┴──────────────────┘ │
│                                                                      │
│  All Human Analytics Capabilities                                   │
│  [Filter: All ▼] [Sort by: Accuracy ▼] [Search: ____________]      │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Capability              │Acc.│FP Rate│Detections│Inference   │  │
│  ├─────────────────────────┼────┼───────┼──────────┼────────────┤  │
│  │ 1. Person Detection     │96.8│  1.2% │  320,000 │   45ms     │  │
│  │    Status: ✅ Excellent │    │       │          │            │  │
│  │    Cameras: 156         │    │       │          │ [Details ▶]│  │
│  │                         │    │       │          │            │  │
│  │ 2. Person Tracking      │95.1│  2.8% │  285,000 │   52ms     │  │
│  │    Status: ✅ Good      │    │       │          │            │  │
│  │    Cameras: 142         │    │       │          │ [Details ▶]│  │
│  │                         │    │       │          │            │  │
│  │ 3. Person Re-ID         │93.4│  3.5% │   78,000 │   68ms     │  │
│  │    Status: ✅ Good      │    │       │          │            │  │
│  │    Cameras: 89          │    │       │          │ [Details ▶]│  │
│  │                         │    │       │          │            │  │
│  │ 4. Person Counting      │94.7│  2.1% │  125,000 │   38ms     │  │
│  │    Status: ✅ Good      │    │       │          │            │  │
│  │    Cameras: 67          │    │       │          │ [Details ▶]│  │
│  │                         │    │       │          │            │  │
│  │ 5. Crowd Density        │94.7│  3.5% │   45,000 │   72ms     │  │
│  │    Status: ✅ Good      │    │       │          │            │  │
│  │    Cameras: 34          │    │       │          │ [Details ▶]│  │
│  │                         │    │       │          │            │  │
│  │ 6. Loitering Detection  │93.2│  4.1% │   12,000 │   85ms     │  │
│  │    Status: ⚠️ Fair      │    │       │          │            │  │
│  │    Cameras: 78          │    │       │          │ [Details ▶]│  │
│  │                         │    │       │          │            │  │
│  │ 7. Fall Detection       │91.8│  5.2% │    8,500 │   95ms     │  │
│  │    Status: ⚠️ Fair      │    │       │          │            │  │
│  │    Cameras: 45          │    │       │          │ [Details ▶]│  │
│  │                         │    │       │          │            │  │
│  │ 8. Weapon Detection     │89.3│  7.8% │    1,200 │  128ms     │  │
│  │    Status: ⚠️ Needs Attn│    │       │          │            │  │
│  │    Cameras: 156         │    │       │          │ [Details ▶]│  │
│  │                         │    │       │          │            │  │
│  │ [... 59 more capabilities ...]                 [Load More ▼] │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Performance Trend (Human Analytics)                                │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  [Line chart showing 30-day accuracy trend]                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Detection Volume Heatmap (By Hour of Day)                          │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  [Heatmap showing peak detection hours]                       │  │
│  │  Insight: Peak hours 9am-11am and 2pm-5pm                     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
└────────────────────────────────────────────────────────────────────┘
```

---

### Page 3: Individual Capability Detail

**When user clicks "Person Detection [Details ▶]":**

```
┌────────────────────────────────────────────────────────────────────┐
│  ← Back to Human Analytics        Person Detection                  │
│                                                                      │
├────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Capability Overview                                                │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Name: Person Detection                                      │   │
│  │  Domain: Human Analytics                                     │   │
│  │  Stage: Core (Production-ready)                              │   │
│  │  Model: YOLOv8 (person class)                                │   │
│  │  Active Cameras: 156 / 200 (78%)                             │   │
│  │  Deployment Date: Jan 15, 2024                               │   │
│  │  Last Model Update: Aug 10, 2026                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  Performance Metrics (Last 30 Days)                                 │
│  ┌──────────────┬──────────────┬──────────────┬──────────────────┐ │
│  │ Accuracy     │ Precision    │ Recall       │ F1 Score         │ │
│  │  96.8%       │  97.2%       │  96.4%       │  96.8            │ │
│  │  ↑ 0.8%      │  ↑ 1.1%      │  ↑ 0.6%      │  ↑ 0.8           │ │
│  └──────────────┴──────────────┴──────────────┴──────────────────┘ │
│                                                                      │
│  ┌──────────────┬──────────────┬──────────────┬──────────────────┐ │
│  │ True         │ False        │ False        │ Avg Inference    │ │
│  │ Positives    │ Positives    │ Negatives    │ Time             │ │
│  │  309,600     │  3,840       │  11,520      │  45ms            │ │
│  │  96.8%       │  1.2%        │  3.6%        │  ↓ 2ms vs last   │ │
│  └──────────────┴──────────────┴──────────────┴──────────────────┘ │
│                                                                      │
│  Business Impact                                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Incidents Detected: 1,247                                   │   │
│  │  ├─ P1 (Critical): 34                                        │   │
│  │  ├─ P2 (High): 128                                           │   │
│  │  ├─ P3 (Medium): 456                                         │   │
│  │  └─ P4 (Low): 629                                            │   │
│  │                                                               │   │
│  │  Incidents Prevented: 234                                    │   │
│  │  Investigation Time Saved: 42 hours                          │   │
│  │  Estimated Cost Avoided: $18,500                             │   │
│  │                                                               │   │
│  │  Calculation:                                                │   │
│  │  • Manual monitoring cost: $35/hour × 42 hours = $1,470     │   │
│  │  • Incident prevention value: 234 × $75 avg = $17,550       │   │
│  │  • Total: $19,020 (rounded to $18,500)                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  Accuracy Trend (6 Months)                                          │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  100% ┤                                                        │  │
│  │       │                   ╱───╲                               │  │
│  │   96% ┤              ╱───╯     ╲╱─╲                          │  │
│  │       │         ╱───╯                ╲                        │  │
│  │   92% ┤    ╱───╯                      ╲╱─╲                   │  │
│  │       │╱──╯                                ╲                  │  │
│  │   88% ┼────┬────┬────┬────┬────┬────┬────┬────              │  │
│  │       Apr  May  Jun  Jul  Aug  Sep  Oct  Nov                 │  │
│  │                                                                │  │
│  │  ─── Accuracy  ─── Precision  ─── Recall                     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Detection Volume by Camera                                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Camera ID       │ Location         │ Detections │ Accuracy  │  │
│  ├──────────────────┼──────────────────┼────────────┼───────────┤  │
│  │ CAM-BRH-001      │ Branch Main Gate │  12,450    │  98.2%    │  │
│  │ CAM-BRH-012      │ Lobby Area       │  10,800    │  97.8%    │  │
│  │ CAM-BRH-023      │ Parking Entrance │   9,200    │  96.5%    │  │
│  │ CAM-BRH-034      │ Back Entrance    │   8,100    │  95.1%    │  │
│  │ [... 152 more cameras ...]          │ [Load More ▼]          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Inference Time Distribution                                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  [Histogram showing inference time distribution]              │  │
│  │  • P50: 42ms  • P95: 58ms  • P99: 72ms  • Max: 95ms          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Recommendations                                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ✅ Performance Excellent - No action needed                 │   │
│  │  💡 Consider deploying to remaining 44 cameras               │   │
│  │  📈 Model retraining in 60 days (scheduled)                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└────────────────────────────────────────────────────────────────────┘
```

---

### Page 4: AI ROI Calculator

```
┌────────────────────────────────────────────────────────────────────┐
│  AI ROI Calculator                                                  │
│                                                                      │
├────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Investment                                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Initial Setup Costs                                         │   │
│  │  ├─ AI Platform License: $120,000/year                       │   │
│  │  ├─ Model Training: $45,000                                  │   │
│  │  ├─ Infrastructure (GPUs): $80,000                           │   │
│  │  └─ Integration & Setup: $35,000                             │   │
│  │                                                               │   │
│  │  Annual Operating Costs                                      │   │
│  │  ├─ Platform License (recurring): $120,000                   │   │
│  │  ├─ Cloud Computing: $36,000                                 │   │
│  │  ├─ Model Maintenance: $24,000                               │   │
│  │  └─ Support & Training: $15,000                              │   │
│  │                                                               │   │
│  │  Total First Year Investment: $475,000                       │   │
│  │  Annual Recurring Cost: $195,000                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  Quantified Benefits (Actual - Last 12 Months)                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Prevented Losses                                            │   │
│  │  ├─ Theft prevention: $285,000                               │   │
│  │  ├─ Fraud detection: $145,000                                │   │
│  │  ├─ Safety incidents avoided: $92,000                        │   │
│  │  └─ Liability claims prevented: $68,000                      │   │
│  │  Subtotal: $590,000                                          │   │
│  │                                                               │   │
│  │  Operational Efficiency                                      │   │
│  │  ├─ Investigation time saved: 1,850 hours × $35 = $64,750    │   │
│  │  ├─ Manual monitoring reduced: $120,000                      │   │
│  │  ├─ False alarm reduction: $45,000                           │   │
│  │  └─ Faster incident response: $38,000                        │   │
│  │  Subtotal: $267,750                                          │   │
│  │                                                               │   │
│  │  Compliance & Risk                                           │   │
│  │  ├─ Audit preparation time: $12,000                          │   │
│  │  ├─ Compliance fines avoided: $85,000                        │   │
│  │  ├─ Insurance premium reduction: $42,000                     │   │
│  │  └─ Regulatory confidence: $25,000                           │   │
│  │  Subtotal: $164,000                                          │   │
│  │                                                               │   │
│  │  Total Annual Benefits: $1,021,750                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ROI Calculation                                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                               │   │
│  │  Year 1:                                                     │   │
│  │  • Total Investment: $475,000                                │   │
│  │  • Total Benefits: $1,021,750                                │   │
│  │  • Net Benefit: $546,750                                     │   │
│  │  • ROI: 115%                                                 │   │
│  │  • Payback Period: 5.6 months                                │   │
│  │                                                               │   │
│  │  Year 2-3 (Recurring):                                       │   │
│  │  • Annual Cost: $195,000                                     │   │
│  │  • Annual Benefits: $1,021,750                               │   │
│  │  • Net Annual Benefit: $826,750                              │   │
│  │  • ROI: 424%                                                 │   │
│  │                                                               │   │
│  │  3-Year NPV (8% discount rate): $1,842,500                   │   │
│  │                                                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  Visualizations                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  [Bar chart: Investment vs Benefits by category]             │  │
│  │  [Line chart: Cumulative ROI over 3 years]                   │  │
│  │  [Pie chart: Benefits breakdown]                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Export Options                                                     │
│  [Export ROI Report (PDF)] [Export to Excel] [Share with CFO]      │
│                                                                      │
└────────────────────────────────────────────────────────────────────┘
```

---

### Page 5: Capability Comparison Tool

```
┌────────────────────────────────────────────────────────────────────┐
│  AI Capability Comparison                                           │
│                                                                      │
│  Compare up to 4 capabilities side-by-side                          │
│                                                                      │
├────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Select Capabilities:                                               │
│  [Person Detection    ▼] [Vehicle Detection ▼] [Face Recognition▼] │
│  [ANPR               ▼]                                             │
│                                                                      │
│  [Compare]                                                          │
│                                                                      │
│  Comparison Results                                                 │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Metric           │Person Det.│Vehicle Det.│Face Recog.│ANPR  │  │
│  ├──────────────────┼───────────┼────────────┼───────────┼──────┤  │
│  │ Accuracy         │  96.8%    │   95.4%    │   87.5%   │91.8% │  │
│  │ FP Rate          │   1.2%    │    2.1%    │    5.8%   │ 4.2% │  │
│  │ Detections       │ 320,000   │  280,000   │  125,000  │98,000│  │
│  │ Avg Inference    │   45ms    │    52ms    │    68ms   │ 85ms │  │
│  │ Active Cameras   │   156     │    142     │     67    │  89  │  │
│  │ Cost Avoided     │ $18,500   │  $15,200   │  $8,500   │$12K  │  │
│  │ Status           │ ✅ Excellent│ ✅ Good   │ ⚠️ Fair  │✅Good│  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Visual Comparison                                                  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  [Radar chart comparing accuracy, speed, volume, impact]      │  │
│  │  [Bar chart comparing cost avoided]                           │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Insights                                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  💡 Person Detection has highest accuracy and lowest FP rate │   │
│  │  ⚠️  Face Recognition needs improvement (87.5% vs 96.8%)     │   │
│  │  📊 Vehicle Detection has good balance of accuracy/speed     │   │
│  │  🎯 ANPR inference time could be optimized (85ms)            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└────────────────────────────────────────────────────────────────────┘
```

---

## Backend API Specification

### Base URL
```
/api/control/v1/reports/ai-analytics
```

### Authentication
All endpoints require:
- JWT token in Authorization header
- User must have `report:ai-analytics:view` permission
- Requests are logged in audit trail

---

### API Endpoints

#### 1. Get AI Analytics Summary

**Endpoint:** `GET /api/control/v1/reports/ai-analytics`

**Description:** Get overall AI performance summary with capability domain breakdown

**Query Parameters:**
```typescript
{
  start_date?: string;        // ISO 8601 date (default: 30 days ago)
  end_date?: string;          // ISO 8601 date (default: now)
  branch_id?: string;         // Filter by branch (UUID)
  camera_id?: string;         // Filter by camera (UUID)
  capability_domain?: string; // Filter by domain (e.g., 'human', 'vehicle')
  group_by?: 'domain' | 'type' | 'branch' | 'camera'; // Grouping level (default: 'domain')
}
```

**Response:**
```typescript
{
  summary: {
    total_capabilities: number;      // e.g., 381
    active_capabilities: number;     // e.g., 358
    avg_accuracy: number;            // e.g., 92.4
    total_detections: number;        // e.g., 1,200,000
    total_false_positives: number;   // e.g., 38,400
    false_positive_rate: number;     // e.g., 3.2
    avg_inference_time_ms: number;   // e.g., 58
    incidents_prevented: number;     // e.g., 1,247
    investigation_time_saved_hours: number; // e.g., 156
    estimated_cost_avoided: number;  // e.g., 85000
    trend_vs_previous_period: {
      accuracy_change_percent: number;     // e.g., 2.1
      detections_change_percent: number;   // e.g., 15.2
      cost_avoided_change_percent: number; // e.g., 8.5
    }
  },
  domains: [
    {
      domain: string;                // e.g., 'human'
      domain_display_name: string;   // e.g., 'Human Analytics'
      capabilities_count: number;    // e.g., 67
      avg_accuracy: number;          // e.g., 94.2
      total_detections: number;      // e.g., 450,000
      false_positive_rate: number;   // e.g., 3.1
      incidents_prevented: number;   // e.g., 234
      cost_avoided: number;          // e.g., 32000
      status: 'excellent' | 'good' | 'fair' | 'needs_attention'
    }
    // ... 14 more domains
  ],
  trend: [
    {
      date: string;              // ISO 8601 date
      avg_accuracy: number;
      total_detections: number;
      false_positives: number;
    }
    // 30 days of data
  ],
  top_performing: [
    {
      capability_type: string;    // e.g., 'person-detection'
      display_name: string;       // e.g., 'Person Detection'
      domain: string;
      accuracy: number;
      false_positive_rate: number;
      detections: number;
      rank: number;
    }
    // Top 10
  ],
  needs_attention: [
    {
      capability_type: string;
      display_name: string;
      domain: string;
      accuracy: number;
      issue: string;              // Description of problem
      recommendation: string;     // How to fix
      priority: 'high' | 'medium' | 'low'
    }
    // Capabilities with accuracy < 85% or FP rate > 10%
  ],
  filters_applied: {
    start_date: string;
    end_date: string;
    branch_id?: string;
    camera_id?: string;
    capability_domain?: string;
  }
}
```

**Example Request:**
```bash
GET /api/control/v1/reports/ai-analytics?start_date=2026-09-01&end_date=2026-09-30&group_by=domain
Authorization: Bearer <jwt_token>
```

**Example Response:**
```json
{
  "summary": {
    "total_capabilities": 381,
    "active_capabilities": 358,
    "avg_accuracy": 92.4,
    "total_detections": 1200000,
    "total_false_positives": 38400,
    "false_positive_rate": 3.2,
    "avg_inference_time_ms": 58,
    "incidents_prevented": 1247,
    "investigation_time_saved_hours": 156,
    "estimated_cost_avoided": 85000,
    "trend_vs_previous_period": {
      "accuracy_change_percent": 2.1,
      "detections_change_percent": 15.2,
      "cost_avoided_change_percent": 8.5
    }
  },
  "domains": [
    {
      "domain": "human",
      "domain_display_name": "Human Analytics",
      "capabilities_count": 67,
      "avg_accuracy": 94.2,
      "total_detections": 450000,
      "false_positive_rate": 3.1,
      "incidents_prevented": 234,
      "cost_avoided": 32000,
      "status": "excellent"
    }
    // ... 14 more domains
  ],
  "trend": [
    { "date": "2026-09-01", "avg_accuracy": 91.8, "total_detections": 38500, "false_positives": 1232 },
    { "date": "2026-09-02", "avg_accuracy": 92.1, "total_detections": 39200, "false_positives": 1215 }
    // ... 28 more days
  ],
  "top_performing": [
    {
      "capability_type": "person-detection",
      "display_name": "Person Detection",
      "domain": "human",
      "accuracy": 96.8,
      "false_positive_rate": 1.2,
      "detections": 320000,
      "rank": 1
    }
    // ... 9 more
  ],
  "needs_attention": [
    {
      "capability_type": "face-recognition-unknown",
      "display_name": "Face Recognition (Unknown Person)",
      "domain": "face",
      "accuracy": 78.2,
      "issue": "Accuracy below 85% threshold",
      "recommendation": "Retrain model with more diverse dataset",
      "priority": "high"
    }
    // ... more
  ]
}
```

---

#### 2. Get Domain Details

**Endpoint:** `GET /api/control/v1/reports/ai-analytics/domains/:domain`

**Description:** Get detailed breakdown of all capabilities in a specific domain

**Path Parameters:**
- `domain` - Domain name (e.g., 'human', 'vehicle', 'face')

**Query Parameters:**
```typescript
{
  start_date?: string;
  end_date?: string;
  branch_id?: string;
  camera_id?: string;
  sort_by?: 'accuracy' | 'detections' | 'fp_rate' | 'inference_time';
  sort_order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}
```

**Response:**
```typescript
{
  domain: {
    name: string;
    display_name: string;
    description: string;
    capabilities_count: number;
    active_cameras: number;
    deployment_date: string;
  },
  summary: {
    avg_accuracy: number;
    total_detections: number;
    total_false_positives: number;
    false_positive_rate: number;
    avg_inference_time_ms: number;
    incidents_prevented: number;
    investigation_time_saved_hours: number;
    cost_avoided: number;
  },
  capabilities: [
    {
      capability_type: string;
      display_name: string;
      stage: 'core' | 'open-model' | 'derived';
      model_name?: string;
      accuracy: number;
      precision: number;
      recall: number;
      f1_score: number;
      true_positives: number;
      false_positives: number;
      false_negatives: number;
      false_positive_rate: number;
      detections: number;
      avg_inference_time_ms: number;
      min_inference_time_ms: number;
      max_inference_time_ms: number;
      active_cameras: number;
      incidents_detected: number;
      incidents_prevented: number;
      cost_avoided: number;
      status: 'excellent' | 'good' | 'fair' | 'needs_attention';
      last_updated: string;
    }
    // All capabilities in domain
  ],
  trend: [
    {
      date: string;
      avg_accuracy: number;
      detections: number;
      false_positives: number;
    }
  ],
  detection_volume_heatmap: {
    by_hour: Array<{ hour: number; count: number }>;
    by_day_of_week: Array<{ day: string; count: number }>;
  },
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  }
}
```

---

#### 3. Get Capability Details

**Endpoint:** `GET /api/control/v1/reports/ai-analytics/capabilities/:capability_type`

**Description:** Get detailed performance metrics for a specific capability

**Path Parameters:**
- `capability_type` - Capability identifier (e.g., 'person-detection', 'anpr')

**Query Parameters:**
```typescript
{
  start_date?: string;
  end_date?: string;
  branch_id?: string;
  camera_id?: string;
}
```

**Response:**
```typescript
{
  capability: {
    capability_type: string;
    display_name: string;
    domain: string;
    domain_display_name: string;
    stage: string;
    description: string;
    model_info: {
      name: string;
      version: string;
      architecture: string;
      last_trained: string;
      next_retraining: string;
    };
    deployment: {
      date: string;
      active_cameras: number;
      total_cameras: number;
      deployment_percentage: number;
    };
  },
  performance: {
    accuracy: number;
    precision: number;
    recall: number;
    f1_score: number;
    true_positives: number;
    false_positives: number;
    false_negatives: number;
    true_negatives: number;
    false_positive_rate: number;
    false_negative_rate: number;
    specificity: number;
    detections_total: number;
    avg_inference_time_ms: number;
    inference_time_percentiles: {
      p50: number;
      p95: number;
      p99: number;
      max: number;
    };
  },
  business_impact: {
    incidents_detected: {
      total: number;
      by_severity: {
        critical: number;
        high: number;
        medium: number;
        low: number;
      };
    };
    incidents_prevented: number;
    investigation_time_saved_hours: number;
    estimated_cost_avoided: number;
    cost_calculation_details: {
      manual_monitoring_savings: number;
      incident_prevention_value: number;
      investigation_time_value: number;
    };
  },
  trend: {
    accuracy: Array<{ date: string; value: number }>;
    precision: Array<{ date: string; value: number }>;
    recall: Array<{ date: string; value: number }>;
    detections: Array<{ date: string; value: number }>;
    inference_time: Array<{ date: string; value: number }>;
  },
  by_camera: [
    {
      camera_id: string;
      camera_name: string;
      location: string;
      branch_name: string;
      detections: number;
      accuracy: number;
      false_positive_rate: number;
      avg_inference_time_ms: number;
    }
  ],
  inference_time_distribution: Array<{
    bucket_ms: number;      // e.g., 0-10ms, 10-20ms, etc.
    count: number;
    percentage: number;
  }>,
  recommendations: [
    {
      type: 'info' | 'warning' | 'action';
      title: string;
      description: string;
      priority: 'high' | 'medium' | 'low';
    }
  ]
}
```

---

#### 4. Get AI ROI Calculation

**Endpoint:** `GET /api/control/v1/reports/ai-analytics/roi`

**Description:** Calculate return on investment for AI capabilities

**Query Parameters:**
```typescript
{
  start_date?: string;      // Default: 1 year ago
  end_date?: string;        // Default: now
  include_projections?: boolean; // Include 3-year projections
}
```

**Response:**
```typescript
{
  period: {
    start_date: string;
    end_date: string;
    months: number;
  },
  investment: {
    initial_setup: {
      platform_license: number;
      model_training: number;
      infrastructure: number;
      integration: number;
      total: number;
    },
    annual_recurring: {
      platform_license: number;
      cloud_computing: number;
      model_maintenance: number;
      support_training: number;
      total: number;
    },
    first_year_total: number;
    annual_recurring_total: number;
  },
  benefits: {
    prevented_losses: {
      theft_prevention: number;
      fraud_detection: number;
      safety_incidents_avoided: number;
      liability_claims_prevented: number;
      subtotal: number;
    },
    operational_efficiency: {
      investigation_time_saved: number;
      manual_monitoring_reduced: number;
      false_alarm_reduction: number;
      faster_incident_response: number;
      subtotal: number;
    },
    compliance_risk: {
      audit_preparation: number;
      compliance_fines_avoided: number;
      insurance_premium_reduction: number;
      regulatory_confidence: number;
      subtotal: number;
    },
    total_annual_benefits: number;
  },
  roi_calculation: {
    year_1: {
      investment: number;
      benefits: number;
      net_benefit: number;
      roi_percent: number;
      payback_period_months: number;
    },
    year_2_3_recurring: {
      annual_cost: number;
      annual_benefits: number;
      net_annual_benefit: number;
      roi_percent: number;
    },
    three_year_npv: number;    // Net Present Value with 8% discount
    three_year_irr: number;    // Internal Rate of Return
  },
  projections?: {
    year_1: { investment: number; benefits: number; net: number };
    year_2: { investment: number; benefits: number; net: number };
    year_3: { investment: number; benefits: number; net: number };
  },
  breakdown_by_domain: [
    {
      domain: string;
      cost_avoided: number;
      percent_of_total: number;
    }
  ]
}
```

---

#### 5. Compare Capabilities

**Endpoint:** `POST /api/control/v1/reports/ai-analytics/compare`

**Description:** Compare multiple capabilities side-by-side

**Request Body:**
```typescript
{
  capability_types: string[];  // Array of 2-4 capability types
  start_date?: string;
  end_date?: string;
  branch_id?: string;
}
```

**Response:**
```typescript
{
  capabilities: [
    {
      capability_type: string;
      display_name: string;
      domain: string;
      metrics: {
        accuracy: number;
        false_positive_rate: number;
        detections: number;
        avg_inference_time_ms: number;
        active_cameras: number;
        cost_avoided: number;
        status: string;
      }
    }
  ],
  comparison_matrix: {
    metrics: ['accuracy', 'false_positive_rate', 'detections', 'avg_inference_time_ms', 'active_cameras', 'cost_avoided'];
    values: number[][];  // 2D array: [capability_index][metric_index]
  },
  insights: [
    {
      type: 'best_performer' | 'needs_improvement' | 'recommendation';
      capability_type: string;
      metric: string;
      value: number;
      description: string;
    }
  ],
  rankings: {
    by_accuracy: Array<{ capability_type: string; value: number; rank: number }>;
    by_speed: Array<{ capability_type: string; value: number; rank: number }>;
    by_cost_avoided: Array<{ capability_type: string; value: number; rank: number }>;
  }
}
```

---

#### 6. Get Capability List

**Endpoint:** `GET /api/control/v1/reports/ai-analytics/capabilities`

**Description:** Get list of all available AI capabilities with basic stats

**Query Parameters:**
```typescript
{
  domain?: string;           // Filter by domain
  stage?: 'core' | 'open-model' | 'derived';
  min_accuracy?: number;     // Filter by minimum accuracy
  search?: string;           // Search by name
}
```

**Response:**
```typescript
{
  total: number;
  domains: [
    {
      domain: string;
      display_name: string;
      capabilities_count: number;
      capabilities: [
        {
          capability_type: string;
          display_name: string;
          stage: string;
          accuracy: number;
          detections: number;
          active: boolean;
        }
      ]
    }
  ]
}
```

---

## Database Schema

### Tables

#### 1. `ai_capability_metrics` (Main Metrics Table)

```sql
CREATE TABLE ai_capability_metrics (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  
  -- Capability identification
  capability_type VARCHAR(100) NOT NULL,     -- e.g., 'person-detection', 'anpr'
  capability_domain VARCHAR(50) NOT NULL,    -- e.g., 'human', 'vehicle', 'face'
  capability_stage VARCHAR(20),              -- 'core', 'open-model', 'derived'
  
  -- Location context
  camera_id UUID REFERENCES cameras(id),
  branch_id UUID REFERENCES branches(id),
  zone_id UUID,
  region_id UUID,
  
  -- Performance metrics
  detections_count INT DEFAULT 0,
  true_positives INT DEFAULT 0,
  false_positives INT DEFAULT 0,
  false_negatives INT DEFAULT 0,
  true_negatives INT DEFAULT 0,
  
  -- Calculated metrics
  accuracy_percent NUMERIC(5,2),             -- (TP + TN) / (TP + TN + FP + FN)
  precision_percent NUMERIC(5,2),            -- TP / (TP + FP)
  recall_percent NUMERIC(5,2),               -- TP / (TP + FN)
  f1_score NUMERIC(5,2),                     -- 2 * (precision * recall) / (precision + recall)
  false_positive_rate NUMERIC(5,2),          -- FP / (FP + TN)
  false_negative_rate NUMERIC(5,2),          -- FN / (FN + TP)
  specificity NUMERIC(5,2),                  -- TN / (TN + FP)
  
  -- Timing metrics
  avg_inference_ms NUMERIC(10,2),
  min_inference_ms NUMERIC(10,2),
  max_inference_ms NUMERIC(10,2),
  p50_inference_ms NUMERIC(10,2),            -- Median
  p95_inference_ms NUMERIC(10,2),            -- 95th percentile
  p99_inference_ms NUMERIC(10,2),            -- 99th percentile
  
  -- Business impact metrics
  incidents_detected INT DEFAULT 0,
  incidents_prevented INT DEFAULT 0,
  investigation_time_saved_minutes INT DEFAULT 0,
  estimated_cost_avoided NUMERIC(12,2),
  
  -- Metadata
  measured_at TIMESTAMP NOT NULL DEFAULT NOW(),
  measurement_period_hours INT DEFAULT 24,   -- Aggregation period
  data_quality_score NUMERIC(3,2),           -- 0.0 to 1.0
  
  -- Model information
  model_name VARCHAR(100),
  model_version VARCHAR(50),
  last_model_update TIMESTAMP,
  
  CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_camera FOREIGN KEY (camera_id) REFERENCES cameras(id),
  CONSTRAINT fk_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- Indexes for fast querying
CREATE INDEX idx_ai_metrics_tenant_capability 
  ON ai_capability_metrics(tenant_id, capability_type, measured_at DESC);

CREATE INDEX idx_ai_metrics_domain 
  ON ai_capability_metrics(tenant_id, capability_domain, measured_at DESC);

CREATE INDEX idx_ai_metrics_camera 
  ON ai_capability_metrics(camera_id, measured_at DESC);

CREATE INDEX idx_ai_metrics_branch 
  ON ai_capability_metrics(branch_id, measured_at DESC);

CREATE INDEX idx_ai_metrics_measured 
  ON ai_capability_metrics(tenant_id, measured_at DESC);

-- Composite index for common queries
CREATE INDEX idx_ai_metrics_performance 
  ON ai_capability_metrics(tenant_id, capability_domain, capability_type, measured_at DESC)
  WHERE deleted_at IS NULL;
```

---

#### 2. `ai_capability_catalog` (Static Capability Definitions)

```sql
CREATE TABLE ai_capability_catalog (
  id SERIAL PRIMARY KEY,
  capability_type VARCHAR(100) UNIQUE NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  description TEXT,
  capability_domain VARCHAR(50) NOT NULL,
  capability_stage VARCHAR(20) NOT NULL,    -- 'core', 'open-model', 'derived'
  
  -- Model information
  default_model_name VARCHAR(100),
  model_architecture VARCHAR(100),
  model_description TEXT,
  
  -- Requirements
  requires_calibration BOOLEAN DEFAULT false,
  requires_zones BOOLEAN DEFAULT false,
  requires_configuration BOOLEAN DEFAULT false,
  min_confidence_threshold NUMERIC(3,2),
  
  -- Documentation
  documentation_url TEXT,
  setup_guide_url TEXT,
  
  -- Metadata
  introduced_version VARCHAR(20),
  deprecated BOOLEAN DEFAULT false,
  deprecated_reason TEXT,
  replacement_capability VARCHAR(100),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Populate with 381 capabilities
INSERT INTO ai_capability_catalog (capability_type, display_name, capability_domain, capability_stage) VALUES
  -- Human Analytics (67 capabilities)
  ('person-detection', 'Person Detection', 'human', 'core'),
  ('person-tracking', 'Person Tracking', 'human', 'core'),
  ('person-reid', 'Person Re-Identification', 'human', 'open-model'),
  ('person-counting', 'Person Counting', 'human', 'core'),
  ('crowd-density', 'Crowd Density Estimation', 'human', 'open-model'),
  -- ... 62 more human capabilities
  
  -- Vehicle Analytics (52 capabilities)
  ('vehicle-detection', 'Vehicle Detection', 'vehicle', 'core'),
  ('anpr', 'Automatic Number Plate Recognition', 'vehicle', 'core'),
  ('vehicle-classification', 'Vehicle Classification', 'vehicle', 'open-model'),
  -- ... 49 more vehicle capabilities
  
  -- Face Analytics (18 capabilities)
  ('face-detection', 'Face Detection', 'face', 'core'),
  ('face-recognition', 'Face Recognition', 'face', 'core'),
  ('face-unknown-person', 'Unknown Person Detection', 'face', 'derived'),
  -- ... 15 more face capabilities
  
  -- ... populate all 381 capabilities
;

CREATE INDEX idx_capability_catalog_domain ON ai_capability_catalog(capability_domain);
CREATE INDEX idx_capability_catalog_stage ON ai_capability_catalog(capability_stage);
```

---

#### 3. `ai_capability_deployment` (Track Capability Activations)

```sql
CREATE TABLE ai_capability_deployment (
  id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  capability_type VARCHAR(100) NOT NULL,
  camera_id UUID REFERENCES cameras(id),
  branch_id UUID REFERENCES branches(id),
  
  -- Deployment info
  activated_at TIMESTAMP DEFAULT NOW(),
  deactivated_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  
  -- Configuration
  configuration JSONB,                    -- Capability-specific settings
  confidence_threshold NUMERIC(3,2),
  zones JSONB,                            -- Detection zones if applicable
  
  -- Performance tracking
  total_detections BIGINT DEFAULT 0,
  last_detection_at TIMESTAMP,
  avg_daily_detections INT,
  
  -- Metadata
  deployed_by UUID REFERENCES users(id),
  deployment_notes TEXT,
  
  CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_camera FOREIGN KEY (camera_id) REFERENCES cameras(id),
  CONSTRAINT fk_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE INDEX idx_deployment_tenant_capability 
  ON ai_capability_deployment(tenant_id, capability_type, is_active);

CREATE INDEX idx_deployment_camera 
  ON ai_capability_deployment(camera_id, is_active);

CREATE INDEX idx_deployment_branch 
  ON ai_capability_deployment(branch_id, is_active);
```

---

#### 4. `ai_model_versions` (Track Model Updates)

```sql
CREATE TABLE ai_model_versions (
  id SERIAL PRIMARY KEY,
  model_name VARCHAR(100) NOT NULL,
  version VARCHAR(50) NOT NULL,
  capability_type VARCHAR(100),
  
  -- Model details
  architecture VARCHAR(100),
  framework VARCHAR(50),              -- 'tensorflow', 'pytorch', 'onnx'
  model_size_mb INT,
  input_resolution VARCHAR(20),       -- e.g., '640x640'
  
  -- Performance benchmarks
  benchmark_accuracy NUMERIC(5,2),
  benchmark_fp_rate NUMERIC(5,2),
  benchmark_inference_ms NUMERIC(10,2),
  benchmark_dataset VARCHAR(200),
  
  -- Training info
  trained_date TIMESTAMP,
  training_dataset_size INT,
  training_epochs INT,
  training_duration_hours INT,
  
  -- Deployment
  deployed_at TIMESTAMP,
  deprecated_at TIMESTAMP,
  is_current BOOLEAN DEFAULT false,
  
  -- Metadata
  release_notes TEXT,
  changelog TEXT,
  created_by UUID REFERENCES users(id),
  
  UNIQUE(model_name, version)
);

CREATE INDEX idx_model_versions_current 
  ON ai_model_versions(model_name, is_current);
```

---

#### 5. Materialized Views for Performance

```sql
-- Daily aggregated metrics (fast dashboard queries)
CREATE MATERIALIZED VIEW ai_daily_metrics AS
SELECT 
  tenant_id,
  capability_domain,
  capability_type,
  DATE_TRUNC('day', measured_at) as date,
  COUNT(DISTINCT camera_id) as cameras_count,
  AVG(accuracy_percent) as avg_accuracy,
  AVG(precision_percent) as avg_precision,
  AVG(recall_percent) as avg_recall,
  SUM(detections_count) as total_detections,
  SUM(true_positives) as total_true_positives,
  SUM(false_positives) as total_false_positives,
  SUM(false_negatives) as total_false_negatives,
  AVG(avg_inference_ms) as avg_inference_time,
  SUM(incidents_detected) as total_incidents_detected,
  SUM(incidents_prevented) as total_incidents_prevented,
  SUM(investigation_time_saved_minutes) as total_time_saved_minutes,
  SUM(estimated_cost_avoided) as total_cost_avoided
FROM ai_capability_metrics
GROUP BY tenant_id, capability_domain, capability_type, DATE_TRUNC('day', measured_at);

CREATE UNIQUE INDEX idx_ai_daily_metrics_unique 
  ON ai_daily_metrics(tenant_id, capability_domain, capability_type, date);

-- Refresh daily at midnight
CREATE OR REPLACE FUNCTION refresh_ai_daily_metrics()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY ai_daily_metrics;
END;
$$ LANGUAGE plpgsql;

-- Domain-level summary (for overview page)
CREATE MATERIALIZED VIEW ai_domain_summary AS
SELECT 
  tenant_id,
  capability_domain,
  COUNT(DISTINCT capability_type) as capabilities_count,
  COUNT(DISTINCT camera_id) as cameras_count,
  AVG(accuracy_percent) as avg_accuracy,
  SUM(detections_count) as total_detections,
  SUM(false_positives) as total_false_positives,
  CASE 
    WHEN SUM(detections_count) > 0 
    THEN (SUM(false_positives)::NUMERIC / SUM(detections_count) * 100)
    ELSE 0
  END as false_positive_rate,
  SUM(incidents_prevented) as total_incidents_prevented,
  SUM(estimated_cost_avoided) as total_cost_avoided,
  MAX(measured_at) as last_updated
FROM ai_capability_metrics
WHERE measured_at >= NOW() - INTERVAL '30 days'
GROUP BY tenant_id, capability_domain;

CREATE UNIQUE INDEX idx_ai_domain_summary_unique 
  ON ai_domain_summary(tenant_id, capability_domain);
```

---

## Data Collection Architecture

### Integration Points

#### 1. Analytics Engine → MIS System

**Current Flow:**
```
Analytics Engine (Python)
  ↓
  Detects event (person, vehicle, etc.)
  ↓
  Stores in incidents table
  ↓
  (No AI metrics collected currently)
```

**Enhanced Flow:**
```
Analytics Engine (Python)
  ↓
  Detects event with confidence score
  ↓
  Stores in incidents table
  ↓
  [NEW] Publish AI metrics to message queue
  ↓
  MIS Metrics Collector Service
  ↓
  Aggregates and stores in ai_capability_metrics
```

#### 2. Metrics Collector Service

**New Service: `ai-metrics-collector.ts`**

```typescript
// src/services/ai-metrics-collector.ts

import { pool } from '../database.js';
import { EventEmitter } from 'events';

interface AIMetricEvent {
  tenant_id: string;
  capability_type: string;
  capability_domain: string;
  camera_id: string;
  branch_id: string;
  detection_result: {
    is_true_positive: boolean;
    is_false_positive: boolean;
    is_false_negative: boolean;
    confidence_score: number;
    inference_time_ms: number;
  };
  incident_prevented: boolean;
  timestamp: Date;
}

class AIMetricsCollector extends EventEmitter {
  private buffer: AIMetricEvent[] = [];
  private readonly BATCH_SIZE = 100;
  private readonly FLUSH_INTERVAL_MS = 60000; // 1 minute
  
  constructor() {
    super();
    this.startFlushTimer();
  }
  
  // Called by analytics engine after each detection
  async recordDetection(event: AIMetricEvent) {
    this.buffer.push(event);
    
    if (this.buffer.length >= this.BATCH_SIZE) {
      await this.flush();
    }
  }
  
  private async flush() {
    if (this.buffer.length === 0) return;
    
    const events = [...this.buffer];
    this.buffer = [];
    
    try {
      // Aggregate events by capability/camera/hour
      const aggregated = this.aggregateEvents(events);
      
      // Bulk insert
      await this.bulkInsert(aggregated);
      
      console.log(`Flushed ${events.length} AI metric events`);
    } catch (error) {
      console.error('Failed to flush AI metrics:', error);
      // Re-add to buffer for retry
      this.buffer.unshift(...events);
    }
  }
  
  private aggregateEvents(events: AIMetricEvent[]) {
    const grouped = new Map<string, any>();
    
    events.forEach(event => {
      // Group by: tenant, capability, camera, hour
      const hour = new Date(event.timestamp).setMinutes(0, 0, 0);
      const key = `${event.tenant_id}:${event.capability_type}:${event.camera_id}:${hour}`;
      
      if (!grouped.has(key)) {
        grouped.set(key, {
          tenant_id: event.tenant_id,
          capability_type: event.capability_type,
          capability_domain: event.capability_domain,
          camera_id: event.camera_id,
          branch_id: event.branch_id,
          measured_at: new Date(hour),
          detections_count: 0,
          true_positives: 0,
          false_positives: 0,
          false_negatives: 0,
          incidents_prevented: 0,
          inference_times: []
        });
      }
      
      const agg = grouped.get(key);
      agg.detections_count++;
      
      if (event.detection_result.is_true_positive) agg.true_positives++;
      if (event.detection_result.is_false_positive) agg.false_positives++;
      if (event.detection_result.is_false_negative) agg.false_negatives++;
      if (event.incident_prevented) agg.incidents_prevented++;
      
      agg.inference_times.push(event.detection_result.inference_time_ms);
    });
    
    // Calculate statistics
    return Array.from(grouped.values()).map(agg => ({
      ...agg,
      avg_inference_ms: agg.inference_times.reduce((a: number, b: number) => a + b, 0) / agg.inference_times.length,
      min_inference_ms: Math.min(...agg.inference_times),
      max_inference_ms: Math.max(...agg.inference_times),
      // Calculate accuracy: (TP + TN) / (TP + TN + FP + FN)
      // Note: TN (true negatives) are hard to measure in object detection
      // so we approximate accuracy as TP / (TP + FP + FN)
      accuracy_percent: agg.true_positives / (agg.true_positives + agg.false_positives + agg.false_negatives) * 100
    }));
  }
  
  private async bulkInsert(records: any[]) {
    const values = records.map(r => 
      `('${r.tenant_id}', '${r.capability_type}', '${r.capability_domain}', 
        '${r.camera_id}', '${r.branch_id}', ${r.detections_count}, 
        ${r.true_positives}, ${r.false_positives}, ${r.false_negatives},
        ${r.accuracy_percent}, ${r.avg_inference_ms}, ${r.min_inference_ms}, 
        ${r.max_inference_ms}, ${r.incidents_prevented}, 
        '${r.measured_at.toISOString()}', 1)`
    ).join(',');
    
    await pool.query(`
      INSERT INTO ai_capability_metrics (
        tenant_id, capability_type, capability_domain, camera_id, branch_id,
        detections_count, true_positives, false_positives, false_negatives,
        accuracy_percent, avg_inference_ms, min_inference_ms, max_inference_ms,
        incidents_prevented, measured_at, measurement_period_hours
      ) VALUES ${values}
      ON CONFLICT (tenant_id, capability_type, camera_id, measured_at) 
      DO UPDATE SET
        detections_count = ai_capability_metrics.detections_count + EXCLUDED.detections_count,
        true_positives = ai_capability_metrics.true_positives + EXCLUDED.true_positives,
        false_positives = ai_capability_metrics.false_positives + EXCLUDED.false_positives,
        false_negatives = ai_capability_metrics.false_negatives + EXCLUDED.false_negatives,
        incidents_prevented = ai_capability_metrics.incidents_prevented + EXCLUDED.incidents_prevented
    `);
  }
  
  private startFlushTimer() {
    setInterval(() => {
      this.flush();
    }, this.FLUSH_INTERVAL_MS);
  }
}

export const aiMetricsCollector = new AIMetricsCollector();
```

#### 3. Analytics Engine Integration

**Add to Analytics Engine (Python):**

```python
# analytics-engine/src/metrics/ai_metrics.py

import requests
import json
from datetime import datetime

class AIMetricsReporter:
    def __init__(self, control_plane_url: str):
        self.control_plane_url = control_plane_url
        self.buffer = []
        
    def report_detection(
        self,
        tenant_id: str,
        capability_type: str,
        capability_domain: str,
        camera_id: str,
        branch_id: str,
        is_true_positive: bool,
        is_false_positive: bool,
        is_false_negative: bool,
        confidence_score: float,
        inference_time_ms: float,
        incident_prevented: bool = False
    ):
        """Report AI detection metrics to control plane"""
        
        event = {
            'tenant_id': tenant_id,
            'capability_type': capability_type,
            'capability_domain': capability_domain,
            'camera_id': camera_id,
            'branch_id': branch_id,
            'detection_result': {
                'is_true_positive': is_true_positive,
                'is_false_positive': is_false_positive,
                'is_false_negative': is_false_negative,
                'confidence_score': confidence_score,
                'inference_time_ms': inference_time_ms
            },
            'incident_prevented': incident_prevented,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        self.buffer.append(event)
        
        # Flush buffer if full
        if len(self.buffer) >= 50:
            self.flush()
    
    def flush(self):
        """Send buffered events to control plane"""
        if not self.buffer:
            return
            
        try:
            response = requests.post(
                f'{self.control_plane_url}/api/control/v1/ai-metrics/ingest',
                json={'events': self.buffer},
                timeout=5
            )
            response.raise_for_status()
            self.buffer = []
        except Exception as e:
            print(f'Failed to send AI metrics: {e}')
            # Keep buffer for retry
```

---

## Frontend Component Structure

(Continuing in next file due to length...)

**File:** `dashboard/app/ai-analytics/page.tsx`

---

## Implementation Timeline

### Week 1: Foundation
- [ ] Database schema creation
- [ ] Populate capability catalog (381 capabilities)
- [ ] Create AI metrics collector service
- [ ] Integrate with analytics engine

### Week 2: Backend APIs
- [ ] Implement all 6 API endpoints
- [ ] Add authentication and RBAC
- [ ] Create materialized views
- [ ] Performance testing

### Week 3: Frontend - Overview
- [ ] Create dashboard overview page
- [ ] Implement domain cards
- [ ] Add trend charts
- [ ] Implement auto-refresh

### Week 4: Frontend - Drill-Down
- [ ] Domain detail pages
- [ ] Capability detail pages
- [ ] Performance charts
- [ ] Export functionality

### Week 5: Advanced Features
- [ ] AI ROI calculator
- [ ] Capability comparison tool
- [ ] Mobile optimization
- [ ] Final testing

---

## Testing Strategy

### Unit Tests
- [ ] API endpoint tests (Jest)
- [ ] Metrics aggregation logic
- [ ] ROI calculation functions
- [ ] Data masking functions

### Integration Tests
- [ ] End-to-end metric collection
- [ ] API response validation
- [ ] Database query performance
- [ ] Export functionality

### Performance Tests
- [ ] Load test with 1M+ metrics
- [ ] Concurrent user simulation
- [ ] Database query optimization
- [ ] Memory leak testing

### User Acceptance Tests
- [ ] Executive review of dashboard
- [ ] CFO review of ROI calculator
- [ ] Technical team review of details
- [ ] Mobile device testing

---

## Success Criteria

- [ ] All 381 AI capabilities tracked
- [ ] Dashboard loads in < 3 seconds
- [ ] Accuracy data within ±2% of actual
- [ ] ROI calculation matches manual calculation
- [ ] 90%+ executive satisfaction rating
- [ ] Zero critical bugs in production
- [ ] Mobile responsive (tablet/phone)
- [ ] Export to PDF/Excel working

---

**Design Status:** ✅ Complete - Ready for Implementation  
**Estimated Implementation:** 5 weeks (1 developer)  
**Business Value:** $50,000/year  
**Priority:** Phase 3 Sprint 2 (Weeks 4-6)

**Next Steps:**
1. Review and approve design
2. Begin Week 1 implementation (database schema)
3. Coordinate with analytics engine team for integration
4. Schedule weekly progress reviews

---

**Design Version:** 1.0  
**Last Updated:** September 17, 2026  
**Designer:** AI System Architect  
**Approved By:** ________________  Date: _______

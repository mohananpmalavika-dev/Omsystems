# Phase 5 Quick Reference Card

## 🚀 Advanced Reporting Engine

### Generate a Report
```bash
POST /v1/maintenance/reports/generate

{
  "reportType": "cost-analysis" | "preventive-maintenance" | "sla-compliance" | ...,
  "title": "Report Title",
  "periodStart": "2024-12-01T00:00:00Z",
  "periodEnd": "2024-12-31T23:59:59Z",
  "format": "pdf" | "excel" | "json",
  "filters": { "branchNodeId": "..." },
  "includeDetails": true
}
```

### Schedule a Report
```bash
POST /v1/maintenance/reports/scheduled

{
  "reportType": "cost-analysis",
  "title": "Monthly Cost Report",
  "schedule": "0 9 1 * *",  # 1st of month at 9 AM
  "format": "both",
  "recipients": ["manager@company.com"],
  "enabled": true
}
```

---

## 📊 Report Types

| Type | Use Case | Key Metrics |
|------|----------|-------------|
| `preventive-maintenance` | PM compliance | Visits, overdue, compliance rate |
| `corrective-maintenance` | Work order analysis | Total, resolution time, cost |
| `amc-performance` | Contract tracking | SLA compliance, cost |
| `vendor-performance` | Vendor ranking | Response time, quality |
| `sla-compliance` | SLA monitoring | Breach rate, on-time % |
| `health-summary` | System overview | Alerts, status, trends |
| `cost-analysis` | Budget tracking | Costs by category, trends |
| `capacity-forecast` | Planning | Storage, camera growth |
| `predictive-summary` | Failure prediction | Risk score, recommendations |

---

## ⏰ Cron Schedules

| Schedule | Description |
|----------|-------------|
| `0 6 * * *` | Daily at 6 AM |
| `0 8 * * 1` | Weekly (Monday 8 AM) |
| `0 9 1 * *` | Monthly (1st at 9 AM) |
| `0 10 1 1,4,7,10 *` | Quarterly (1st at 10 AM) |
| `0 */6 * * *` | Every 6 hours |

---

## 📁 Output Formats

### PDF
- Professional formatting
- Cover page with metadata
- Executive summary
- Key metrics table
- Data tables
- Header/footer

### Excel
- Multi-sheet workbooks
- Summary sheet
- Data sheets (visits, work orders, etc.)
- Formatted tables
- Color coding

---

## 🔧 Configuration

### Optional Environment Variables
```env
REPORT_STORAGE_PATH=/var/reports
REPORT_MAX_AGE_DAYS=90
SCHEDULED_REPORTS_ENABLED=true
```

---

## 📝 Common Tasks

### List All Reports
```bash
GET /v1/maintenance/reports?limit=50
```

### Get Report Details
```bash
GET /v1/maintenance/reports/{reportId}
```

### Download Report
```bash
GET /v1/maintenance/reports/{reportId}/download
```

### List Scheduled Reports
```bash
GET /v1/maintenance/reports/scheduled
```

### Update Schedule
```bash
PATCH /v1/maintenance/reports/scheduled/{id}
{
  "schedule": "0 9 * * 1",
  "enabled": false
}
```

### Delete Schedule
```bash
DELETE /v1/maintenance/reports/scheduled/{id}
```

---

## 🎯 Quick Tips

1. **Use Filters**: Narrow reports by branch, vendor, or severity
2. **Include Details**: Set `includeDetails: true` for comprehensive data
3. **Schedule Wisely**: Don't overlap heavy reports
4. **Test First**: Generate manually before scheduling
5. **Monitor Size**: Large reports may take longer

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Report generation fails | Check date range (max 1 year) |
| No data in report | Verify filters and period |
| Schedule not running | Validate cron expression |
| Missing dependencies | Run `npm install` |
| PDF/Excel errors | Check pdfkit/exceljs installation |

---

## 📚 Documentation

- [MAINTENANCE_PHASE5_REPORTING_COMPLETE.md](./MAINTENANCE_PHASE5_REPORTING_COMPLETE.md) - Full documentation
- [MAINTENANCE_MODULE_INDEX.md](./MAINTENANCE_MODULE_INDEX.md) - Module overview

---

**Quick Reference** | Phase 5 | January 2025

/**
 * Export Utilities for MIS Reports
 * 
 * Provides PDF and Excel export functionality for all reports
 * Uses react-to-print for PDF and xlsx for Excel
 */

// ============================================================================
// EXCEL & CSV EXPORT
// ============================================================================

export interface ExcelSheet {
  name: string;
  data: any[];
}

export function exportToCSV(data: any[], filename: string) {
  if (!data || data.length === 0) return;
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers.map((field) => JSON.stringify(row[field] ?? "")).join(",")
  );
  const csvContent = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}_${formatDate(new Date())}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportToExcel(sheets: ExcelSheet[], filename: string) {
  if (sheets.length > 0 && sheets[0].data?.length) {
    exportToCSV(sheets[0].data, filename);
  }
}

export function exportSimpleExcel(data: any[], filename: string, sheetName: string = 'Data') {
  exportToExcel([{ name: sheetName, data }], filename);
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Flatten nested objects for Excel export
 */
export function flattenObject(obj: any, prefix: string = ''): any {
  const flattened: any = {};
  
  Object.keys(obj).forEach(key => {
    const value = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;
    
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(flattened, flattenObject(value, newKey));
    } else if (Array.isArray(value)) {
      flattened[newKey] = value.join(', ');
    } else {
      flattened[newKey] = value;
    }
  });
  
  return flattened;
}

/**
 * Convert array of objects to flat structure
 */
export function flattenArray(data: any[]): any[] {
  return data.map(item => flattenObject(item));
}

// ============================================================================
// PRINT STYLES
// ============================================================================

/**
 * Get print-optimized styles for PDF export
 */
export function getPrintStyles(): string {
  return `
    @media print {
      @page {
        size: A4;
        margin: 1cm;
      }
      
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      
      .no-print {
        display: none !important;
      }
      
      .page-break {
        page-break-after: always;
      }
      
      .avoid-break {
        page-break-inside: avoid;
      }
      
      /* Dark theme adjustments for print */
      .dark-bg {
        background: white !important;
        color: black !important;
      }
      
      .dark-text {
        color: black !important;
      }
      
      .dark-border {
        border-color: #e5e7eb !important;
      }
      
      /* Chart adjustments */
      .recharts-wrapper {
        background: white !important;
      }
      
      /* Table adjustments */
      table {
        border-collapse: collapse;
      }
      
      table th,
      table td {
        border: 1px solid #d1d5db;
        padding: 8px;
      }
      
      /* Hide interactive elements */
      button:not(.keep-for-print),
      .interactive-only {
        display: none !important;
      }
    }
  `;
}

// ============================================================================
// REPORT-SPECIFIC EXPORTERS
// ============================================================================

/**
 * Export Executive KPI data to Excel
 */
export function exportExecutiveKPI(data: any) {
  const sheets: ExcelSheet[] = [
    {
      name: 'Summary',
      data: [{
        'Security Posture Score': data.securityPosture?.score || 0,
        'Operational Efficiency': data.operationalEfficiency?.score || 0,
        'Risk Score': data.riskScore || 0,
        'Active Incidents': data.activeIncidents || 0,
      }]
    },
    {
      name: 'Quick Stats',
      data: [{
        'Total Branches': data.totalBranches || 0,
        'Online Cameras': data.onlineCameras || 0,
        'Total Cameras': data.totalCameras || 0,
        'Active Alerts': data.activeAlerts || 0,
        'Resolved Today': data.resolvedToday || 0,
        'Average Response Time': data.avgResponseTime || 0,
        'System Uptime': data.systemUptime || 0,
      }]
    },
    {
      name: 'Branch Performance',
      data: data.topBranches || []
    },
    {
      name: 'Bottom Performers',
      data: data.bottomBranches || []
    }
  ];
  
  exportToExcel(sheets, 'Executive_KPI_Dashboard');
}

/**
 * Export Financial TCO data to Excel
 */
export function exportFinancialTCO(data: any) {
  const sheets: ExcelSheet[] = [
    {
      name: 'Summary',
      data: [{
        'Total Cost': data.summary?.totalCost || 0,
        'CapEx': data.summary?.capex || 0,
        'OpEx': data.summary?.opex || 0,
        'Hidden Costs': data.summary?.hiddenCosts || 0,
        'Cost Per Camera': data.summary?.costPerCamera || 0,
        'Cost Per Branch': data.summary?.costPerBranch || 0,
        'Cost Per Incident': data.summary?.costPerIncident || 0,
      }]
    },
    {
      name: 'CapEx Breakdown',
      data: data.breakdown?.capex || []
    },
    {
      name: 'OpEx Breakdown',
      data: data.breakdown?.opex || []
    },
    {
      name: 'Hidden Costs',
      data: data.breakdown?.hiddenCosts || []
    },
    {
      name: 'Branch Costs',
      data: data.branches || []
    }
  ];
  
  exportToExcel(sheets, 'Financial_TCO_Report');
}

/**
 * Export Financial ROI data to Excel
 */
export function exportFinancialROI(data: any) {
  const sheets: ExcelSheet[] = [
    {
      name: 'Summary',
      data: [{
        'Total Investment': data.summary?.totalInvestment || 0,
        'Annual Savings': data.summary?.annualSavings || 0,
        'ROI Percentage': data.summary?.roiPercentage || 0,
        'Payback Period (months)': data.summary?.paybackMonths || 0,
        'NPV': data.summary?.npv || 0,
        'IRR': data.summary?.irr || 0,
      }]
    },
    {
      name: 'Cost Savings',
      data: data.savings || []
    },
    {
      name: 'Risk Reduction',
      data: data.riskReduction || []
    },
    {
      name: 'Productivity Gains',
      data: data.productivityGains || []
    }
  ];
  
  exportToExcel(sheets, 'Financial_ROI_Report');
}

/**
 * Export Branch Benchmarking data to Excel
 */
export function exportBranchBenchmarking(data: any) {
  const sheets: ExcelSheet[] = [
    {
      name: 'All Branches',
      data: data.branches || []
    },
    {
      name: 'Top Performers',
      data: data.topPerformers || []
    },
    {
      name: 'Needs Improvement',
      data: data.needsImprovement || []
    },
    {
      name: 'Recommendations',
      data: data.recommendations || []
    }
  ];
  
  exportToExcel(sheets, 'Branch_Benchmarking_Report');
}

/**
 * Export Compliance Scorecard data to Excel
 */
export function exportComplianceScorecard(data: any) {
  const sheets: ExcelSheet[] = [
    {
      name: 'Domain Scores',
      data: data.domains || []
    },
    {
      name: 'Compliance Checks',
      data: flattenArray(data.checks || [])
    },
    {
      name: 'Gaps',
      data: data.gaps || []
    },
    {
      name: 'Remediation Actions',
      data: flattenArray(data.remediationActions || [])
    }
  ];
  
  exportToExcel(sheets, 'Compliance_Scorecard_Report');
}

/**
 * Export MIS Unified Report data to Excel
 */
export function exportMISUnified(data: any, groupBy: string) {
  const sheets: ExcelSheet[] = [
    {
      name: 'Summary',
      data: [data.summary]
    },
    {
      name: `By ${groupBy}`,
      data: data.matrix || []
    },
    {
      name: 'Date-wise',
      data: data.dateWiseBreakdown || []
    },
    {
      name: 'Time-wise',
      data: data.timeWiseBreakdown || []
    },
    {
      name: 'All Branches',
      data: data.allBranches || []
    }
  ];
  
  exportToExcel(sheets, `MIS_Unified_Report_${groupBy}`);
}

/**
 * Consolidated Reports Module
 * 
 * Exports all reporting-related route creators
 */

// Phase 1: Executive & Financial Intelligence
export { createExecutiveKpiRoutes } from './executive-kpi.routes.js';
export { createFinancialTcoRoutes } from './financial-tco.routes.js';
export { createBranchBenchmarkingRoutes } from './branch-benchmarking.routes.js';
export { createComplianceScorecardRoutes } from './compliance-scorecard.routes.js';

// MIS Unified Report (Multi-dimensional Analysis)
export { createMISUnifiedRoutes } from './mis-unified.routes.js';

// Phase 2: Historical Trends & Analytics
export { createHistoricalTrendsRoutes } from './historical-trends.routes.js';

/**
 * Enhanced Report Wrapper
 * 
 * Unified wrapper component that provides:
 * - Auto-refresh functionality
 * - Performance monitoring
 * - Export buttons (PDF/Excel)
 * - Mobile optimization
 * - Loading states
 */

'use client';

import { useRef, useEffect, useState } from 'react';
import { useAutoRefresh } from '@/hooks/use-auto-refresh';
import { usePerformanceMonitor } from '@/hooks/use-performance-monitor';
import { useMobileDetect } from '@/hooks/use-mobile-detect';
import { ExportButtons } from '@/components/export-buttons';
import { AutoRefreshToggle } from '@/components/auto-refresh-toggle';
import { PerformanceIndicator } from '@/components/performance-indicator';
import { AlertCircle, Loader2 } from 'lucide-react';

interface EnhancedReportWrapperProps {
  /** Report name for tracking */
  reportName: string;
  
  /** Report title */
  title: string;
  
  /** Children content */
  children: React.ReactNode;
  
  /** Loading state */
  loading: boolean;
  
  /** Error state */
  error?: string | null;
  
  /** Data fetch function */
  onRefresh: () => Promise<void> | void;
  
  /** Export to Excel function */
  onExportExcel: () => void;
  
  /** Filename for exports */
  exportFilename: string;
  
  /** Optional: Custom refresh interval (default: 60s) */
  refreshInterval?: number;
  
  /** Optional: Show performance metrics */
  showPerformance?: boolean;
  
  /** Optional: Enable auto-refresh by default */
  autoRefreshDefault?: boolean;
}

export function EnhancedReportWrapper({
  reportName,
  title,
  children,
  loading,
  error,
  onRefresh,
  onExportExcel,
  exportFilename,
  refreshInterval = 60000,
  showPerformance = true,
  autoRefreshDefault = false,
}: EnhancedReportWrapperProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const { isMobile, isTablet } = useMobileDetect();
  const { metrics, trackAPIStart, trackAPIEnd, trackRenderComplete } = usePerformanceMonitor(reportName);
  
  // Auto-refresh setup
  const { enabled: autoRefreshEnabled, toggle: toggleAutoRefresh } = useAutoRefresh({
    enabled: autoRefreshDefault,
    interval: refreshInterval,
    onRefresh: async () => {
      trackAPIStart();
      await onRefresh();
      trackAPIEnd();
      setLastRefreshed(new Date());
    },
  });
  
  // Track when data is loaded
  useEffect(() => {
    if (!loading && !error) {
      trackRenderComplete();
    }
  }, [loading, error]);
  
  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h1 className="text-2xl sm:text-3xl font-bold">{title}</h1>
          
          <div className="flex flex-wrap items-center gap-2">
            <AutoRefreshToggle
              enabled={autoRefreshEnabled}
              onToggle={toggleAutoRefresh}
              interval={refreshInterval}
              lastRefreshed={lastRefreshed}
            />
            
            <ExportButtons
              contentRef={contentRef}
              filename={exportFilename}
              onExportExcel={onExportExcel}
              documentTitle={title}
            />
          </div>
        </div>
        
        {/* Performance indicator */}
        {showPerformance && metrics.completedAt && (
          <div className="flex items-center justify-between text-sm">
            <PerformanceIndicator metrics={metrics} showDetails={!isMobile} />
            <span className="text-gray-400">
              Last updated: {lastRefreshed.toLocaleTimeString()}
            </span>
          </div>
        )}
      </div>
      
      {/* Content */}
      <div ref={contentRef} className="printable-content">
        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={48} className="animate-spin text-blue-400 mb-4" />
            <p className="text-gray-400">Loading {reportName}...</p>
          </div>
        )}
        
        {/* Error state */}
        {error && !loading && (
          <div className="bg-red-500/10 border border-red-500 rounded-lg p-6 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle size={24} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-semibold text-red-400 mb-2">Error Loading Report</h3>
                <p className="text-gray-300">{error}</p>
                <button
                  onClick={onRefresh}
                  className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Main content */}
        {!loading && !error && children}
      </div>
      
      {/* Mobile optimization styles */}
      <style jsx global>{`
        @media (max-width: 768px) {
          .recharts-wrapper {
            font-size: 12px;
          }
          
          .recharts-cartesian-axis-tick {
            font-size: 10px;
          }
          
          table {
            font-size: 14px;
          }
          
          .card {
            padding: 12px;
          }
        }
        
        @media print {
          .no-print,
          button,
          .auto-refresh-toggle,
          .export-buttons {
            display: none !important;
          }
          
          .printable-content {
            background: white;
            color: black;
          }
        }
      `}</style>
    </div>
  );
}

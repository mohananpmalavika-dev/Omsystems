/**
 * Export Buttons Component
 * 
 * Reusable export buttons for PDF and Excel functionality
 */

'use client';

import { Download, FileSpreadsheet } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { RefObject } from 'react';

interface ExportButtonsProps {
  /** Reference to the component to print/export */
  contentRef: RefObject<HTMLElement>;
  
  /** Filename for exports (without extension) */
  filename: string;
  
  /** Function to export to Excel */
  onExportExcel: () => void;
  
  /** Optional: Custom print document title */
  documentTitle?: string;
  
  /** Optional: Show only specific buttons */
  showPDF?: boolean;
  showExcel?: boolean;
  showCSV?: boolean;
}

export function ExportButtons({
  contentRef,
  filename,
  onExportExcel,
  documentTitle,
  showPDF = true,
  showExcel = true,
  showCSV = false,
}: ExportButtonsProps) {
  
  const handlePrint = useReactToPrint({
    content: () => contentRef.current,
    documentTitle: documentTitle || filename,
    pageStyle: `
      @page {
        size: A4;
        margin: 1cm;
      }
      @media print {
        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .no-print {
          display: none !important;
        }
      }
    `,
  });
  
  return (
    <div className="flex items-center gap-2">
      {showPDF && (
        <button
          onClick={handlePrint}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          title="Export to PDF"
        >
          <Download size={16} />
          <span className="hidden sm:inline">Export PDF</span>
          <span className="sm:hidden">PDF</span>
        </button>
      )}
      
      {showExcel && (
        <button
          onClick={onExportExcel}
          className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
          title="Export to Excel"
        >
          <FileSpreadsheet size={16} />
          <span className="hidden sm:inline">Export Excel</span>
          <span className="sm:hidden">Excel</span>
        </button>
      )}
    </div>
  );
}

/**
 * Simplified export button for CSV only
 */
interface CSVExportButtonProps {
  onExport: () => void;
  label?: string;
}

export function CSVExportButton({ onExport, label = 'Export CSV' }: CSVExportButtonProps) {
  return (
    <button
      onClick={onExport}
      className="inline-flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
    >
      <Download size={16} />
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">CSV</span>
    </button>
  );
}

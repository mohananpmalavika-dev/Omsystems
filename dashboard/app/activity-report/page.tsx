/**
 * Employee Activity Report Page
 * Main page for viewing employee activity reports
 */

'use client';

import { EmployeeActivityReport } from '@/components/EmployeeActivityReport';
import { useActivityTracking, usePageTracking } from '@/hooks/useActivityTracker';

export default function ActivityReportPage() {
  // Get API configuration from environment or context
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  
  // Get access token from your auth system
  // This is a placeholder - replace with your actual auth implementation
  const accessToken = typeof window !== 'undefined' 
    ? sessionStorage.getItem('activityAccessToken') || localStorage.getItem('accessToken') || ''
    : '';
  
  const currentUserId = typeof window !== 'undefined'
    ? sessionStorage.getItem('currentUserId') || ''
    : '';

  // Track this page visit
  usePageTracking('activity_report', 'reports', {
    pageTitle: 'Employee Activity Report',
    enabled: !!accessToken,
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <EmployeeActivityReport
        apiBaseUrl={apiBaseUrl}
        accessToken={accessToken}
        currentUserId={currentUserId}
        showAllUsers={true} // Set to true for admins, false for regular users
      />
    </div>
  );
}

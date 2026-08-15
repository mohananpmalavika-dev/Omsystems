/**
 * Frontend Integration Code for Branch Operational Health System
 * 
 * Follow these steps to add the operational health dashboard to your frontend.
 */

// ============================================================================
// STEP 1: Create the Operations Page
// ============================================================================

// Create file: dashboard/app/operations/page.tsx
// (or dashboard/pages/operations.tsx if using Pages Router)

import { OperationalDashboard } from '@/components/operational-health/operational-dashboard';

export default function OperationsPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <OperationalDashboard />
    </div>
  );
}

// If using Next.js Pages Router instead of App Router:
// export default function OperationsPage() {
//   return <OperationalDashboard />;
// }

// ============================================================================
// STEP 2: Add Navigation Link
// ============================================================================

// Find your navigation component (usually in app/layout.tsx or components/navigation.tsx)
// Add this to your navigation items array:

const navigationItems = [
  // ... existing items
  {
    name: 'Operations',
    href: '/operations',
    icon: MonitorIcon, // Use your icon library
    description: 'Branch operational health dashboard',
    badge: 'NEW', // Optional badge
  },
  // ... more items
];

// ============================================================================
// STEP 3: Add to Sidebar (if applicable)
// ============================================================================

// Example sidebar item:
<Link
  href="/operations"
  className={`
    flex items-center gap-3 px-4 py-2 rounded-lg
    ${pathname === '/operations' 
      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300' 
      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
    }
  `}
>
  <MonitorIcon className="w-5 h-5" />
  <span>Operations</span>
  <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">NEW</span>
</Link>

// ============================================================================
// STEP 4: Configure Environment Variables
// ============================================================================

// Create or update: dashboard/.env.local

NEXT_PUBLIC_API_URL=http://localhost:3000/v1
NEXT_PUBLIC_WS_URL=ws://localhost:3000/ws

// For production:
// NEXT_PUBLIC_API_URL=https://api.yourdomain.com/v1
// NEXT_PUBLIC_WS_URL=wss://api.yourdomain.com/ws

// ============================================================================
// STEP 5: Example Layout Integration (Optional)
// ============================================================================

// If you want to add the operations link to your main layout:
// dashboard/app/layout.tsx

'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-gray-800 border-r">
        <nav className="p-4 space-y-2">
          {/* Dashboard */}
          <Link
            href="/dashboard"
            className={pathname === '/dashboard' ? 'active' : ''}
          >
            Dashboard
          </Link>
          
          {/* Operations - NEW */}
          <Link
            href="/operations"
            className={pathname === '/operations' ? 'active' : ''}
          >
            <div className="flex items-center justify-between">
              <span>Operations</span>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                NEW
              </span>
            </div>
          </Link>
          
          {/* Other nav items */}
        </nav>
      </aside>
      
      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}

// ============================================================================
// STEP 6: Example with React Router (if not using Next.js)
// ============================================================================

// If using React Router instead of Next.js:
// dashboard/src/App.tsx

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { OperationalDashboard } from './components/operational-health/operational-dashboard';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard" element={<Dashboard />} />
        {/* NEW: Operations Route */}
        <Route path="/operations" element={<OperationalDashboard />} />
        <Route path="/cameras" element={<Cameras />} />
      </Routes>
    </BrowserRouter>
  );
}

// ============================================================================
// STEP 7: Example Navigation with React Router
// ============================================================================

// dashboard/src/components/Navigation.tsx

import { NavLink } from 'react-router-dom';

export function Navigation() {
  return (
    <nav>
      <NavLink to="/dashboard">Dashboard</NavLink>
      <NavLink to="/operations">
        Operations <span className="badge">NEW</span>
      </NavLink>
      <NavLink to="/cameras">Cameras</NavLink>
    </nav>
  );
}

// ============================================================================
// STEP 8: Verify Installation
// ============================================================================

// After integrating, verify by:
// 1. Start your dashboard: npm run dev
// 2. Navigate to http://localhost:3001/operations
// 3. You should see:
//    - Summary KPI cards at the top
//    - Branch mosaic grid
//    - "Needs Attention" / "All Branches" toggle
//    - Search and filter functionality

// ============================================================================
// TROUBLESHOOTING
// ============================================================================

// Issue: "Module not found"
// Solution: Check that all component files exist in:
//   dashboard/components/operational-health/

// Issue: "Cannot resolve '@/components'"
// Solution: Check tsconfig.json paths:
//   "paths": { "@/*": ["./"] }

// Issue: API returns 401
// Solution: Ensure authentication is configured properly

// Issue: No data showing
// Solution: 
//   1. Check API is running: curl http://localhost:3000/v1/operational-health/dashboard
//   2. Trigger initial data: curl -X POST http://localhost:3000/v1/operational-health/refresh-all
//   3. Check browser console for errors

// ============================================================================
// OPTIONAL: Custom Styling
// ============================================================================

// If you want to customize the dashboard colors, create:
// dashboard/styles/operational-health.css

.operational-dashboard {
  --health-healthy: #10b981;
  --health-warning: #f59e0b;
  --health-critical: #ef4444;
  --health-unknown: #6b7280;
}

// ============================================================================
// OPTIONAL: Add to Main Menu (Tailwind Example)
// ============================================================================

// Example with Tailwind CSS dropdown menu:
<div className="relative">
  <button className="flex items-center gap-2">
    <span>Menu</span>
    <ChevronDownIcon className="w-4 h-4" />
  </button>
  
  <div className="absolute mt-2 w-48 bg-white rounded-lg shadow-lg">
    <Link href="/dashboard" className="block px-4 py-2 hover:bg-gray-100">
      Dashboard
    </Link>
    <Link href="/operations" className="block px-4 py-2 hover:bg-gray-100">
      <div className="flex items-center justify-between">
        <span>Operations</span>
        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
          NEW
        </span>
      </div>
    </Link>
    <Link href="/cameras" className="block px-4 py-2 hover:bg-gray-100">
      Cameras
    </Link>
  </div>
</div>

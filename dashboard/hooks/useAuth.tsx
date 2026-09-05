/**
 * Authentication Context Hook
 * 
 * PURPOSE: UI personalization and frontend UX only
 * 
 * SECURITY WARNING:
 * This hook provides user information for:
 * ✓ Showing logged-in user name
 * ✓ Displaying user role
 * ✓ Hiding UI elements based on permissions (UX only)
 * ✓ Personalizing assignment pickers
 * ✓ Showing current branch/site
 * 
 * This hook should NEVER be used to:
 * ✗ Stamp identity on API mutations
 * ✗ Assert who performed an action
 * ✗ Bypass server authorization
 * ✗ Construct audit records
 * 
 * The server ALWAYS determines WHO performed an action from the
 * authenticated session context (request.currentUser).
 */

'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export interface User {
  id: string;
  displayName: string;
  username?: string;
  email?: string;
  tenantId: string;
  role?: string;
  permissions?: string[];
  branchId?: string;
  branchName?: string;
  preferences?: Record<string, any>;
}

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasRole: (role: string) => boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Auth Provider Component
 * 
 * Fetches and maintains current user information from the server.
 * This information is used ONLY for UI/UX purposes.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCurrentUser = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/control/v1/auth/me', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user || (data.id ? data : null));
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Failed to fetch current user:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  const hasPermission = (permission: string): boolean => {
    if (!user?.permissions) return false;
    return user.permissions.includes(permission);
  };

  const hasAnyPermission = (permissions: string[]): boolean => {
    if (!user?.permissions) return false;
    return permissions.some((perm) => user.permissions!.includes(perm));
  };

  const hasRole = (role: string): boolean => {
    if (!user?.role) return false;
    return user.role === role;
  };

  const value: AuthContextValue = {
    user,
    isAuthenticated: user !== null,
    isLoading,
    hasPermission,
    hasAnyPermission,
    hasRole,
    refresh: fetchCurrentUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * useAuth Hook
 * 
 * Access current user information for UI purposes.
 * 
 * @example
 * ```tsx
 * function AlertActions() {
 *   const { user, hasPermission } = useAuth();
 * 
 *   return (
 *     <div>
 *       <p>Logged in as {user?.displayName}</p>
 *       
 *       {hasPermission('alerts.acknowledge') && (
 *         <button onClick={handleAcknowledge}>Acknowledge</button>
 *       )}
 *       
 *       {hasPermission('alerts.resolve') && (
 *         <button onClick={handleResolve}>Resolve</button>
 *       )}
 *     </div>
 *   );
 * }
 * 
 * function handleResolve() {
 *   // CORRECT: Let server derive identity
 *   await resolveAlert(alertId, {
 *     resolutionCode: 'FALSE_POSITIVE',
 *     comment: 'Reflection detected'
 *   });
 * 
 *   // WRONG: Don't send user.id
 *   // await resolveAlert(alertId, {
 *   //   resolutionCode: 'FALSE_POSITIVE',
 *   //   userId: user.id  // ❌ NEVER DO THIS
 *   // });
 * }
 * ```
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}

/**
 * Permission-based component visibility
 * 
 * @example
 * ```tsx
 * <RequirePermission permission="alerts.resolve">
 *   <ResolveAlertButton />
 * </RequirePermission>
 * ```
 */
interface RequirePermissionProps {
  permission: string;
  children: ReactNode;
  fallback?: ReactNode;
}

export function RequirePermission({ 
  permission, 
  children, 
  fallback = null 
}: RequirePermissionProps) {
  const { hasPermission } = useAuth();
  
  if (!hasPermission(permission)) {
    return <>{fallback}</>;
  }
  
  return <>{children}</>;
}

/**
 * Role-based component visibility
 * 
 * @example
 * ```tsx
 * <RequireRole role="company_admin">
 *   <AdminPanel />
 * </RequireRole>
 * ```
 */
interface RequireRoleProps {
  role: string;
  children: ReactNode;
  fallback?: ReactNode;
}

export function RequireRole({ 
  role, 
  children, 
  fallback = null 
}: RequireRoleProps) {
  const { hasRole } = useAuth();
  
  if (!hasRole(role)) {
    return <>{fallback}</>;
  }
  
  return <>{children}</>;
}

/**
 * Authenticated-only component visibility
 * 
 * @example
 * ```tsx
 * <RequireAuth fallback={<LoginPrompt />}>
 *   <Dashboard />
 * </RequireAuth>
 * ```
 */
interface RequireAuthProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function RequireAuth({ 
  children, 
  fallback = null 
}: RequireAuthProps) {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return <>{fallback}</>;
  }
  
  if (!isAuthenticated) {
    return <>{fallback}</>;
  }
  
  return <>{children}</>;
}

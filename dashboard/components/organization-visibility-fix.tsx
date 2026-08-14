"use client";

import { AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { organizationApi } from "@/lib/api-client";

interface OrganizationDebugInfo {
  debug: {
    user: {
      id: string;
      username: string;
      role: string;
      tenantId: string;
    };
    totalNodesInTenant: number;
    visibleNodes: number;
    hiddenNodes: number;
    companyNodes: number;
    visibleCompanyNodes: number;
  };
  allNodes: Array<{
    id: string;
    name: string;
    type: string;
    isVisible: boolean;
  }>;
  recommendation: string | null;
}

export function OrganizationVisibilityFix() {
  const [debugInfo, setDebugInfo] = useState<OrganizationDebugInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDebugInfo();
  }, []);

  const loadDebugInfo = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch("/api/v1/organization/debug", {
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error(`Failed to load debug info: ${response.statusText}`);
      }
      
      const data = await response.json();
      setDebugInfo(data);
    } catch (err: any) {
      setError(err.message || "Failed to load debug information");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="visibility-fix-container">
        <div className="visibility-fix-card loading">
          <Loader2 size={24} className="spin" />
          <p>Checking organization visibility...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="visibility-fix-container">
        <div className="visibility-fix-card error">
          <AlertTriangle size={24} />
          <h3>Unable to Check Organization Status</h3>
          <p>{error}</p>
          <button onClick={loadDebugInfo} className="btn btn-secondary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!debugInfo) {
    return null;
  }

  const hasHiddenOrganization = 
    debugInfo.debug.companyNodes > 0 && 
    debugInfo.debug.visibleCompanyNodes === 0;

  if (!hasHiddenOrganization) {
    return null; // No issue to fix
  }

  const hiddenCompanyNodes = debugInfo.allNodes.filter(
    n => n.type === 'company' && !n.isVisible
  );

  return (
    <div className="visibility-fix-container">
      <div className="visibility-fix-card warning">
        <AlertTriangle size={32} color="#f59e0b" />
        
        <h3>Organization Permission Issue Detected</h3>
        
        <div className="issue-details">
          <p>
            <strong>Issue:</strong> An organization exists in the system, but your account 
            cannot see it due to missing permissions.
          </p>
          
          <div className="debug-stats">
            <div className="stat">
              <span className="stat-label">Your Role:</span>
              <span className="stat-value">{debugInfo.debug.user.role}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Organizations in System:</span>
              <span className="stat-value">{debugInfo.debug.companyNodes}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Visible to You:</span>
              <span className="stat-value error-value">
                {debugInfo.debug.visibleCompanyNodes}
              </span>
            </div>
          </div>

          {hiddenCompanyNodes.length > 0 && (
            <div className="hidden-nodes">
              <p><strong>Hidden Organizations:</strong></p>
              <ul>
                {hiddenCompanyNodes.map((node) => (
                  <li key={node.id}>{node.name}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="fix-instructions">
          <h4>How to Fix:</h4>
          <p>Contact your system administrator to:</p>
          <ol>
            <li>Grant you the <code>company_admin</code> role, OR</li>
            <li>Assign you to the organization node as <code>node_admin</code></li>
          </ol>

          <details className="technical-details">
            <summary>Technical Details (for administrators)</summary>
            <div className="technical-content">
              <p>Run one of these SQL commands in your database:</p>
              
              <div className="code-block">
                <h5>Option 1: Grant company_admin role</h5>
                <pre>{`UPDATE users
SET role = 'company_admin'
WHERE id = '${debugInfo.debug.user.id}';`}</pre>
              </div>

              {hiddenCompanyNodes.length > 0 && (
                <div className="code-block">
                  <h5>Option 2: Assign to organization node</h5>
                  <pre>{`INSERT INTO role_node_assignments 
  (user_id, node_id, role, assigned_by)
VALUES 
  ('${debugInfo.debug.user.id}', 
   '${hiddenCompanyNodes[0].id}', 
   'node_admin', 
   '${debugInfo.debug.user.id}')
ON CONFLICT (user_id, node_id) 
DO UPDATE SET role = 'node_admin';`}</pre>
                </div>
              )}

              <p className="help-link">
                See <code>ORGANIZATION_VISIBILITY_FIX.md</code> for complete instructions.
              </p>
            </div>
          </details>
        </div>

        <button onClick={loadDebugInfo} className="btn btn-primary">
          <CheckCircle size={16} />
          Check Again
        </button>
      </div>

      <style jsx>{`
        .visibility-fix-container {
          padding: 1rem;
        }

        .visibility-fix-card {
          background: white;
          border-radius: 8px;
          padding: 2rem;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          max-width: 800px;
          margin: 0 auto;
        }

        .visibility-fix-card.loading,
        .visibility-fix-card.error {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          text-align: center;
        }

        .visibility-fix-card.warning {
          border-left: 4px solid #f59e0b;
        }

        .visibility-fix-card h3 {
          font-size: 1.5rem;
          color: #1a202c;
          margin: 1rem 0;
        }

        .visibility-fix-card h4 {
          font-size: 1.125rem;
          color: #2d3748;
          margin-top: 1.5rem;
          margin-bottom: 0.5rem;
        }

        .visibility-fix-card h5 {
          font-size: 0.95rem;
          color: #4a5568;
          margin: 0.5rem 0;
        }

        .issue-details {
          margin: 1.5rem 0;
          padding: 1rem;
          background: #fef3c7;
          border-radius: 6px;
        }

        .debug-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
          margin-top: 1rem;
        }

        .stat {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .stat-label {
          font-size: 0.875rem;
          color: #6b7280;
        }

        .stat-value {
          font-size: 1.25rem;
          font-weight: 600;
          color: #1a202c;
        }

        .stat-value.error-value {
          color: #dc2626;
        }

        .hidden-nodes {
          margin-top: 1rem;
          padding: 1rem;
          background: white;
          border-radius: 4px;
        }

        .hidden-nodes ul {
          margin: 0.5rem 0 0 0;
          padding-left: 1.5rem;
        }

        .hidden-nodes li {
          margin: 0.25rem 0;
        }

        .fix-instructions {
          margin-top: 1.5rem;
          padding: 1.5rem;
          background: #f9fafb;
          border-radius: 6px;
        }

        .fix-instructions ol {
          margin: 0.5rem 0;
          padding-left: 1.5rem;
        }

        .fix-instructions li {
          margin: 0.5rem 0;
        }

        .fix-instructions code {
          background: #e5e7eb;
          padding: 0.125rem 0.375rem;
          border-radius: 3px;
          font-family: monospace;
          font-size: 0.9em;
        }

        .technical-details {
          margin-top: 1rem;
          padding: 1rem;
          background: white;
          border-radius: 4px;
          border: 1px solid #e5e7eb;
        }

        .technical-details summary {
          cursor: pointer;
          font-weight: 500;
          color: #4b5563;
          user-select: none;
        }

        .technical-details summary:hover {
          color: #1f2937;
        }

        .technical-content {
          margin-top: 1rem;
        }

        .code-block {
          margin: 1rem 0;
        }

        .code-block pre {
          background: #1f2937;
          color: #f3f4f6;
          padding: 1rem;
          border-radius: 4px;
          overflow-x: auto;
          font-size: 0.875rem;
          font-family: 'Courier New', monospace;
        }

        .help-link {
          margin-top: 1rem;
          font-size: 0.875rem;
          color: #6b7280;
        }

        .btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 6px;
          font-size: 1rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          margin-top: 1rem;
        }

        .btn-primary {
          background: #3b82f6;
          color: white;
        }

        .btn-primary:hover {
          background: #2563eb;
        }

        .btn-secondary {
          background: #6b7280;
          color: white;
        }

        .btn-secondary:hover {
          background: #4b5563;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

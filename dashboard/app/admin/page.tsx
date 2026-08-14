"use client";

import { ArrowLeft, Building2, Camera, ShieldCheck, Users, Server } from "lucide-react";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { CameraPermissionManager } from "@/components/camera-permission-manager";
import { DeviceManager } from "@/components/device-manager";
import { OrganizationTree } from "@/components/organization-tree";
import { OrgNodeForm } from "@/components/org-node-form";
import { UserForm } from "@/components/user-form";
import { UserList } from "@/components/user-list";
import { organizationApi, userApi } from "@/lib/api-client";
import { CreateOrganizationForm } from "@/components/create-organization-form";
import { OrganizationVisibilityFix } from "@/components/organization-visibility-fix";

type SelectedRecord = {
  id: string;
  name?: string;
  displayName?: string;
  type?: string;
};

export default function AdminPage() {
  const [tab, setTab] = useState<"organization" | "users" | "devices">("organization");
  const [revision, setRevision] = useState(0);
  const [parentNode, setParentNode] = useState<SelectedRecord | undefined>();
  const [editNode, setEditNode] = useState<SelectedRecord | undefined>();
  const [editUser, setEditUser] = useState<SelectedRecord | undefined>();
  const [creatingUser, setCreatingUser] = useState(false);
  const [permissionUser, setPermissionUser] = useState<SelectedRecord | undefined>();
  const [hasOrganization, setHasOrganization] = useState<boolean | null>(null);
  const [isLoadingOrg, setIsLoadingOrg] = useState(true);

  useEffect(() => {
    checkOrganizationExists();
  }, [revision]);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested === "users" || requested === "devices") setTab(requested);
  }, []);

  const checkOrganizationExists = async () => {
    try {
      setIsLoadingOrg(true);
      const response = await organizationApi.getTree();
      // Check if there's at least one company node
      const hasCompany = response.data && response.data.length > 0;
      setHasOrganization(hasCompany);
    } catch (error) {
      console.error("Failed to check organization:", error);
      setHasOrganization(false);
    } finally {
      setIsLoadingOrg(false);
    }
  };

  const refresh = () => {
    setParentNode(undefined);
    setEditNode(undefined);
    setEditUser(undefined);
    setCreatingUser(false);
    setRevision((current) => current + 1);
  };

  const deleteNode = async (node: SelectedRecord) => {
    if (!confirm(`Deactivate ${node.name ?? "this organization node"}?`)) return;
    await organizationApi.deleteNode(node.id);
    refresh();
  };

  const deleteUser = async (user: SelectedRecord) => {
    if (!confirm(`Deactivate ${user.displayName ?? "this user"}?`)) return;
    await userApi.delete(user.id);
    refresh();
  };

  const handleOrganizationCreated = () => {
    setHasOrganization(true);
    refresh();
  };

  // Show loading state
  if (isLoadingOrg) {
    return (
      <AppLayout>
        <div className="admin-shell">
          <header className="admin-header">
            <div>
              <a href="/" className="admin-back"><ArrowLeft size={15} /> Security operations</a>
              <div className="admin-title">
                <span><ShieldCheck size={22} /></span>
                <div>
                  <h1>Organization & access</h1>
                  <p>Loading...</p>
                </div>
              </div>
            </div>
          </header>
          <div style={{ padding: "2rem", textAlign: "center" }}>
            <p>Loading organization...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Show organization creation form if no organization exists
  if (hasOrganization === false) {
    return (
      <AppLayout>
        <div className="admin-shell">
          <header className="admin-header">
            <div>
              <a href="/" className="admin-back"><ArrowLeft size={15} /> Security operations</a>
              <div className="admin-title">
                <span><ShieldCheck size={22} /></span>
                <div>
                  <h1>Organization Setup</h1>
                  <p>Create your organization to get started</p>
                </div>
              </div>
            </div>
          </header>
          <section className="admin-panel">
            <div style={{ marginBottom: "1rem", padding: "1rem", background: "#fff3cd", borderRadius: "8px" }}>
              <p style={{ margin: 0, color: "#856404" }}>
                No organization found. Create one to start managing branches, employees, and cameras.
              </p>
              <button
                onClick={() => setHasOrganization(true)}
                style={{
                  marginTop: "0.5rem",
                  padding: "0.5rem 1rem",
                  background: "#6c757d",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer"
                }}
              >
                Skip and Continue Anyway
              </button>
            </div>
            
            {/* Show visibility fix diagnostic if creation fails */}
            <OrganizationVisibilityFix />
            
            <CreateOrganizationForm onSuccess={handleOrganizationCreated} />
          </section>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="admin-shell">
      <header className="admin-header">
        <div>
          <a href="/" className="admin-back"><ArrowLeft size={15} /> Security operations</a>
          <div className="admin-title">
            <span><ShieldCheck size={22} /></span>
            <div>
              <h1>Organization & access</h1>
              <p>Company hierarchy, employee scope, and camera exceptions</p>
            </div>
          </div>
        </div>
        <div>
          <a 
            href="/admin/system"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              background: '#007bff',
              color: 'white',
              borderRadius: '4px',
              textDecoration: 'none',
              fontSize: '0.875rem',
              fontWeight: '600'
            }}
          >
            <Server size={16} /> System Management
          </a>
        </div>
      </header>

      <nav className="admin-tabs" aria-label="Administration sections">
        <button
          className={tab === "organization" ? "active" : ""}
          onClick={() => setTab("organization")}
        >
          <Building2 size={16} /> Organization
        </button>
        <button
          className={tab === "users" ? "active" : ""}
          onClick={() => setTab("users")}
        >
          <Users size={16} /> Employees & permissions
        </button>
        <button
          className={tab === "devices" ? "active" : ""}
          onClick={() => setTab("devices")}
        >
          <Camera size={16} /> Branch cameras
        </button>
      </nav>

      <section className="admin-panel">
        {tab === "organization" ? (
          <>
            <div className="admin-panel-heading">
              <div>
                <h2>Company structure</h2>
                <p>Company → Head Office → Zone → Region → Area → Branch</p>
              </div>
            </div>
            <OrganizationTree
              key={`organization-${revision}`}
              onAddChild={(node) => setParentNode(node)}
              onEditNode={(node) => setEditNode(node)}
              onDeleteNode={(node) => void deleteNode(node)}
            />
          </>
        ) : tab === "users" ? (
          <UserList
            key={`users-${revision}`}
            onCreateUser={() => setCreatingUser(true)}
            onEditUser={(user) => setEditUser(user)}
            onDeleteUser={(user) => void deleteUser(user)}
            onSelectUser={(user) => setPermissionUser(user)}
          />
        ) : (
          <DeviceManager />
        )}
      </section>

      {(parentNode || editNode) && (
        <OrgNodeForm
          parentNode={parentNode as any}
          editNode={editNode}
          onSuccess={refresh}
          onCancel={() => {
            setParentNode(undefined);
            setEditNode(undefined);
          }}
        />
      )}
      {(creatingUser || editUser) && (
        <UserForm
          editUser={editUser}
          onSuccess={refresh}
          onCancel={() => {
            setCreatingUser(false);
            setEditUser(undefined);
          }}
        />
      )}
      {permissionUser && (
        <CameraPermissionManager
          userId={permissionUser.id}
          userName={permissionUser.displayName ?? "Employee"}
          onClose={() => setPermissionUser(undefined)}
        />
      )}
      </div>
    </AppLayout>
  );
}

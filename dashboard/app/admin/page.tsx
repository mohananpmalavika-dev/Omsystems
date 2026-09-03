"use client";

import { AlertTriangle, ArrowLeft, Building2, Camera, Shield, ShieldCheck, Users, Server } from "lucide-react";
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
import {
  getOrganizationAvailability,
  type OrganizationAvailability,
} from "@/lib/organization-state";

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
  const [initialNodeType, setInitialNodeType] = useState<string | undefined>();
  const [editNode, setEditNode] = useState<SelectedRecord | undefined>();
  const [editUser, setEditUser] = useState<SelectedRecord | undefined>();
  const [creatingUser, setCreatingUser] = useState(false);
  const [permissionUser, setPermissionUser] = useState<SelectedRecord | undefined>();
  const [organizationState, setOrganizationState] = useState<
    OrganizationAvailability | "loading" | "error"
  >("loading");
  const [organizationError, setOrganizationError] = useState<string | null>(null);
  const [canCreateRoot, setCanCreateRoot] = useState(false);

  useEffect(() => {
    checkOrganizationExists();
  }, [revision]);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested === "users" || requested === "devices") setTab(requested);
  }, []);

  const checkOrganizationExists = async () => {
    try {
      setOrganizationState("loading");
      setOrganizationError(null);
      const response = await organizationApi.getTree();
      setCanCreateRoot(response.meta.canCreateRoot);
      setOrganizationState(getOrganizationAvailability(response));
    } catch (error: unknown) {
      console.error("Failed to check organization:", error);
      setOrganizationError(
        error instanceof Error
          ? error.message
          : "The organization service is temporarily unavailable.",
      );
      setOrganizationState("error");
    }
  };

  const refresh = () => {
    setParentNode(undefined);
    setInitialNodeType(undefined);
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
    refresh();
  };

  // Show loading state
  if (organizationState === "loading") {
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

  if (organizationState === "error") {
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
                  <p>Organization status unavailable</p>
                </div>
              </div>
            </div>
          </header>
          <section className="admin-panel">
            <div role="alert" style={{ maxWidth: 640, margin: "3rem auto", textAlign: "center" }}>
              <AlertTriangle size={42} style={{ color: "#dc2626", marginBottom: "1rem" }} />
              <h2>We couldn&apos;t load the organization</h2>
              <p style={{ color: "#667286", marginBottom: "1.5rem" }}>{organizationError}</p>
              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
                {organizationError?.toLowerCase().includes("sign in") || organizationError?.toLowerCase().includes("unauthenticated") ? (
                  <a className="btn btn-primary" href="/login">
                    Sign in to continue
                  </a>
                ) : (
                  <button className="btn btn-primary" onClick={() => void checkOrganizationExists()}>
                    Retry
                  </button>
                )}
                <a className="btn btn-secondary" href="/login">
                  Go to Login
                </a>
              </div>
            </div>
          </section>
        </div>
      </AppLayout>
    );
  }

  if (organizationState === "restricted") {
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
                  <p>Your employee account needs an organization assignment</p>
                </div>
              </div>
            </div>
          </header>
          <section className="admin-panel">
            <div role="status" style={{ maxWidth: 680, margin: "3rem auto", textAlign: "center" }}>
              <ShieldCheck size={46} style={{ color: "#d97706", marginBottom: "1rem" }} />
              <h2>Organization access required</h2>
              <p style={{ color: "#667286", lineHeight: 1.6 }}>
                An organization already exists, but your employee account is not assigned to a permitted scope.
                Ask a company administrator to assign you to the appropriate company, region, area, or branch.
              </p>
              <a className="btn btn-primary" href="/">Return to security operations</a>
            </div>
          </section>
        </div>
      </AppLayout>
    );
  }

  // Only a successful API response confirming an empty tenant may expose the
  // root creation form.
  if (organizationState === "empty") {
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
                  <p>{canCreateRoot ? "Create your organization to get started" : "Organization setup is pending"}</p>
                </div>
              </div>
            </div>
          </header>
          <section className="admin-panel">
            {canCreateRoot ? (
              <CreateOrganizationForm onSuccess={handleOrganizationCreated} />
            ) : (
              <div role="status" style={{ maxWidth: 680, margin: "3rem auto", textAlign: "center" }}>
                <Building2 size={46} style={{ color: "#d97706", marginBottom: "1rem" }} />
                <h2>No organization has been configured</h2>
                <p style={{ color: "#667286", lineHeight: 1.6 }}>
                  A super administrator or company administrator must create the organization before employees can be assigned.
                </p>
                <a className="btn btn-primary" href="/">Return to security operations</a>
              </div>
            )}
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
        <a
          href="/admin/organization?tab=roles"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 0.875rem',
            color: '#a5b4fc',
            textDecoration: 'none',
            fontSize: '0.875rem',
            fontWeight: 500,
            borderRadius: '6px',
            background: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
            marginLeft: 'auto',
            cursor: 'pointer'
          }}
        >
          <Shield size={15} /> Role vs Menu Permissions
        </a>
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
              onAddChild={(node, defaultType) => {
                setParentNode(node);
                setInitialNodeType(defaultType);
              }}
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
          initialNodeType={initialNodeType}
          onSuccess={refresh}
          onCancel={() => {
            setParentNode(undefined);
            setInitialNodeType(undefined);
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

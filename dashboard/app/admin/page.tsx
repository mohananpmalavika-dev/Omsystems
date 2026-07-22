"use client";

import { ArrowLeft, Building2, Camera, ShieldCheck, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { CameraPermissionManager } from "@/components/camera-permission-manager";
import { DeviceManager } from "@/components/device-manager";
import { OrganizationTree } from "@/components/organization-tree";
import { OrgNodeForm } from "@/components/org-node-form";
import { UserForm } from "@/components/user-form";
import { UserList } from "@/components/user-list";
import { organizationApi, userApi } from "@/lib/api-client";

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

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested === "users" || requested === "devices") setTab(requested);
  }, []);

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

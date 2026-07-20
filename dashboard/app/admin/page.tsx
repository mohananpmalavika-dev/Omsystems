"use client";

import { ArrowLeft, Building2, ShieldCheck, Users } from "lucide-react";
import { useState } from "react";
import { CameraPermissionManager } from "@/components/camera-permission-manager";
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
  const [tab, setTab] = useState<"organization" | "users">("organization");
  const [revision, setRevision] = useState(0);
  const [parentNode, setParentNode] = useState<SelectedRecord | undefined>();
  const [editNode, setEditNode] = useState<SelectedRecord | undefined>();
  const [editUser, setEditUser] = useState<SelectedRecord | undefined>();
  const [creatingUser, setCreatingUser] = useState(false);
  const [permissionUser, setPermissionUser] = useState<SelectedRecord | undefined>();

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
    <main className="admin-shell">
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
        ) : (
          <UserList
            key={`users-${revision}`}
            onCreateUser={() => setCreatingUser(true)}
            onEditUser={(user) => setEditUser(user)}
            onDeleteUser={(user) => void deleteUser(user)}
            onSelectUser={(user) => setPermissionUser(user)}
          />
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
    </main>
  );
}

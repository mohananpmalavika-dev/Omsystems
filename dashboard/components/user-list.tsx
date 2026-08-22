"use client";

import {
  Edit,
  Lock,
  MoreVertical,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Unlock,
  UserPlus,
} from "lucide-react";
import { useState, useEffect } from "react";
import { userApi } from "@/lib/api-client";

interface User {
  id: string;
  username: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  department?: string;
  designation?: string;
  primaryOrgName?: string;
  lastLoginAt?: string;
  createdAt: string;
}

interface UserListProps {
  onSelectUser?: (user: User) => void;
  onEditUser?: (user: User) => void;
  onDeleteUser?: (user: User) => void;
  onCreateUser?: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  company_admin: "Company Admin",
  hq_admin: "HQ Admin",
  zone_manager: "Zone Manager",
  region_manager: "Region Manager",
  area_manager: "Area Manager",
  branch_manager: "Branch Manager",
  operator: "Operator",
  viewer: "Viewer",
  security_officer: "Security Officer",
  auditor: "Auditor",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "Active", color: "green" },
  inactive: { label: "Inactive", color: "gray" },
  suspended: { label: "Suspended", color: "red" },
  locked: { label: "Locked", color: "orange" },
  pending_activation: { label: "Pending", color: "blue" },
};

export function UserList({
  onSelectUser,
  onEditUser,
  onDeleteUser,
  onCreateUser,
}: UserListProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [users, searchTerm, roleFilter, statusFilter]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await userApi.list();
      setUsers(response.data);
    } catch (err: any) {
      setError(err.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const filterUsers = () => {
    let filtered = users;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (user) =>
          user.username.toLowerCase().includes(term) ||
          user.email.toLowerCase().includes(term) ||
          user.displayName.toLowerCase().includes(term) ||
          user.department?.toLowerCase().includes(term)
      );
    }

    if (roleFilter) {
      filtered = filtered.filter((user) => user.role === roleFilter);
    }

    if (statusFilter) {
      filtered = filtered.filter((user) => user.status === statusFilter);
    }

    setFilteredUsers(filtered);
  };

  const handleUnlockUser = async (userId: string) => {
    try {
      await userApi.unlock(userId);
      loadUsers();
    } catch (err: any) {
      alert(`Failed to unlock user: ${err.message}`);
    }
  };

  const getRoleIcon = (role: string) => {
    if (role === "super_admin" || role === "company_admin") {
      return <ShieldCheck size={16} className="text-purple-600" />;
    }
    if (role.includes("admin") || role.includes("manager")) {
      return <Shield size={16} className="text-blue-600" />;
    }
    return <ShieldAlert size={16} className="text-gray-500" />;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="user-list-container">
      <div className="list-header">
        <div className="header-title">
          <h2>Users</h2>
          <span className="count-badge">{filteredUsers.length} users</span>
        </div>
        <button className="primary-button" onClick={onCreateUser}>
          <UserPlus size={16} />
          Add User
        </button>
      </div>

      <div className="list-filters">
        <div className="search-box">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search by name, email, or department..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <select
          className="filter-select"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="">All roles</option>
          {Object.entries(ROLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([value, { label }]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="loading-state">
          <div className="spinner" />
          <p>Loading users...</p>
        </div>
      )}

      {error && (
        <div className="error-state">
          <p>{error}</p>
          <button onClick={loadUsers} className="retry-button">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (
        <div className="user-table-container">
          <table className="user-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Organization</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr
                  key={user.id}
                  className={selectedUserId === user.id ? "selected" : ""}
                  onClick={() => {
                    setSelectedUserId(user.id);
                    onSelectUser?.(user);
                  }}
                >
                  <td>
                    <div className="user-cell">
                      <div className="user-avatar">
                        {user.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="user-info">
                        <div className="user-name">{user.displayName}</div>
                        <div className="user-email">{user.email}</div>
                        {user.designation && (
                          <div className="user-designation">
                            {user.designation}
                            {user.department && ` • ${user.department}`}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="role-cell">
                      {getRoleIcon(user.role)}
                      <span>{ROLE_LABELS[user.role] || user.role}</span>
                    </div>
                  </td>
                  <td>
                    <span
                      className={`status-badge status-${
                        STATUS_LABELS[user.status]?.color || "gray"
                      }`}
                    >
                      {STATUS_LABELS[user.status]?.label || user.status}
                    </span>
                  </td>
                  <td>
                    <div className="org-cell">
                      {user.primaryOrgName || "—"}
                    </div>
                  </td>
                  <td>
                    <div className="date-cell">
                      {formatDate(user.lastLoginAt)}
                    </div>
                  </td>
                  <td>
                    <div className="action-buttons">
                      {user.status === "locked" && (
                        <button
                          className="icon-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUnlockUser(user.id);
                          }}
                          title="Unlock account"
                        >
                          <Unlock size={14} />
                        </button>
                      )}
                      <button
                        className="icon-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditUser?.(user);
                        }}
                        title="Edit user"
                      >
                        <Edit size={14} />
                      </button>
                      <button
                        className="icon-button text-red-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteUser?.(user);
                        }}
                        title="Delete user"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredUsers.length === 0 && (
            <div className="empty-state">
              <p>No users found matching your filters</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

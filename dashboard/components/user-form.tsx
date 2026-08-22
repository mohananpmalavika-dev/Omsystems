"use client";

import { useState, useEffect } from "react";
import { X, Eye, EyeOff } from "lucide-react";
import { userApi, organizationApi } from "@/lib/api-client";

interface UserFormProps {
  editUser?: any;
  onSuccess: () => void;
  onCancel: () => void;
}

const ROLES = [
  { value: "super_admin", label: "Super Admin" },
  { value: "company_admin", label: "Company Admin" },
  { value: "hq_admin", label: "HQ Admin" },
  { value: "zone_manager", label: "Zone Manager" },
  { value: "region_manager", label: "Region Manager" },
  { value: "area_manager", label: "Area Manager" },
  { value: "branch_manager", label: "Branch Manager" },
  { value: "operator", label: "Operator" },
  { value: "security_officer", label: "Security Officer" },
  { value: "viewer", label: "Viewer" },
  { value: "auditor", label: "Auditor" },
];

const STATUSES = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "suspended", label: "Suspended" },
  { value: "pending_activation", label: "Pending Activation" },
];

export function UserForm({ editUser, onSuccess, onCancel }: UserFormProps) {
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    displayName: "",
    password: "",
    confirmPassword: "",
    employeeId: "",
    phoneNumber: "",
    role: "viewer",
    status: "active",
    department: "",
    designation: "",
    dateOfJoining: "",
    dateOfBirth: "",
    primaryOrgNodeId: "",
  });

  const [orgNodes, setOrgNodes] = useState<any[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    loadOrgNodes();

    if (editUser) {
      setFormData({
        username: editUser.username || "",
        email: editUser.email || "",
        displayName: editUser.displayName || "",
        password: "",
        confirmPassword: "",
        employeeId: editUser.employeeId || "",
        phoneNumber: editUser.phoneNumber || "",
        role: editUser.role || "viewer",
        status: editUser.status || "active",
        department: editUser.department || "",
        designation: editUser.designation || "",
        dateOfJoining: editUser.dateOfJoining || "",
        dateOfBirth: editUser.dateOfBirth || "",
        primaryOrgNodeId: editUser.primaryOrgNodeId || "",
      });
    }
  }, [editUser]);

  const loadOrgNodes = async () => {
    try {
      const response = await organizationApi.listNodes();
      setOrgNodes(response.data);
    } catch (err) {
      console.error("Failed to load org nodes:", err);
    }
  };

  const validatePassword = (password: string): boolean => {
    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return false;
    }
    setPasswordError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validate passwords match for new users or when changing password
    if (!editUser && formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    if (!editUser && !validatePassword(formData.password)) {
      setLoading(false);
      return;
    }

    try {
      const payload: any = {
        email: formData.email,
        displayName: formData.displayName,
        role: formData.role,
        department: formData.department || undefined,
        designation: formData.designation || undefined,
        employeeId: formData.employeeId || undefined,
        phoneNumber: formData.phoneNumber || undefined,
        dateOfJoining: formData.dateOfJoining || undefined,
        dateOfBirth: formData.dateOfBirth || undefined,
      };

      if (editUser) {
        // Update existing user
        payload.status = formData.status;
        await userApi.update(editUser.id, payload);
      } else {
        // Create new user
        payload.username = formData.username;
        payload.password = formData.password;
        payload.primaryOrgNodeId = formData.primaryOrgNodeId;
        await userApi.create(payload);
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to save user");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // Clear password error when typing
    if (name === "password" && passwordError) {
      setPasswordError(null);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-container modal-large">
        <div className="modal-header">
          <h2>{editUser ? "Edit User" : "Create New User"}</h2>
          <button className="icon-button" onClick={onCancel}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {error && <div className="error-banner">{error}</div>}

          <div className="form-section">
            <h3>Account Information</h3>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="username">
                  Username <span className="required">*</span>
                </label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  required
                  disabled={!!editUser}
                  placeholder="username"
                />
              </div>

              <div className="form-group">
                <label htmlFor="email">
                  Email <span className="required">*</span>
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  placeholder="user@example.com"
                />
              </div>
            </div>

            {!editUser && (
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="password">
                    Password <span className="required">*</span>
                  </label>
                  <div className="password-input">
                    <input
                      type={showPassword ? "text" : "password"}
                      id="password"
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      required
                      minLength={8}
                      placeholder="Minimum 8 characters"
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {passwordError && (
                    <span className="field-error">{passwordError}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="confirmPassword">
                    Confirm Password <span className="required">*</span>
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    id="confirmPassword"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    required
                    placeholder="Re-enter password"
                  />
                </div>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="displayName">
                Display Name <span className="required">*</span>
              </label>
              <input
                type="text"
                id="displayName"
                name="displayName"
                value={formData.displayName}
                onChange={handleChange}
                required
                placeholder="Full Name"
              />
            </div>
          </div>

          <div className="form-section">
            <h3>Role & Access</h3>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="role">
                  Role <span className="required">*</span>
                </label>
                <select
                  id="role"
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  required
                >
                  {ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>

              {editUser && (
                <div className="form-group">
                  <label htmlFor="status">Status</label>
                  <select
                    id="status"
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                  >
                    {STATUSES.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {!editUser && (
              <div className="form-group">
                <label htmlFor="primaryOrgNodeId">
                  Primary Organization <span className="required">*</span>
                </label>
                <select
                  id="primaryOrgNodeId"
                  name="primaryOrgNodeId"
                  value={formData.primaryOrgNodeId}
                  onChange={handleChange}
                  required
                >
                  <option value="">Select organization...</option>
                  {orgNodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.name} ({node.type})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="form-section">
            <h3>Employee Details</h3>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="employeeId">Employee ID</label>
                <input
                  type="text"
                  id="employeeId"
                  name="employeeId"
                  value={formData.employeeId}
                  onChange={handleChange}
                  placeholder="EMP001"
                />
              </div>

              <div className="form-group">
                <label htmlFor="phoneNumber">Phone Number</label>
                <input
                  type="tel"
                  id="phoneNumber"
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handleChange}
                  placeholder="+1234567890"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="department">Department</label>
                <input
                  type="text"
                  id="department"
                  name="department"
                  value={formData.department}
                  onChange={handleChange}
                  placeholder="Security"
                />
              </div>

              <div className="form-group">
                <label htmlFor="designation">Designation</label>
                <input
                  type="text"
                  id="designation"
                  name="designation"
                  value={formData.designation}
                  onChange={handleChange}
                  placeholder="Security Manager"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="dateOfJoining">Date of Joining</label>
                <input
                  type="date"
                  id="dateOfJoining"
                  name="dateOfJoining"
                  value={formData.dateOfJoining}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label htmlFor="dateOfBirth">Date of Birth</label>
                <input
                  type="date"
                  id="dateOfBirth"
                  name="dateOfBirth"
                  value={formData.dateOfBirth}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={loading}
            >
              {loading ? "Saving..." : editUser ? "Update User" : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

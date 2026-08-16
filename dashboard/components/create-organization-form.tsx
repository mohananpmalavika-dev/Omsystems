"use client";

import { Building2, CheckCircle, Upload, Image as ImageIcon, X } from "lucide-react";
import { useState, FormEvent, useRef } from "react";
import { organizationApi } from "@/lib/api-client";
import { useOrgBranding } from "@/components/ui/org-branding-provider";

interface CreateOrganizationFormProps {
  onSuccess: () => void;
}

export function CreateOrganizationForm({ onSuccess }: CreateOrganizationFormProps) {
  const { updateBranding } = useOrgBranding();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    description: "",
    address: {
      street: "",
      city: "",
      state: "",
      postalCode: "",
      country: "",
    },
    contactInfo: {
      phone: "",
      email: "",
      contactPerson: "",
    },
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogoFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload a valid image file (PNG, SVG, JPG, WebP)");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Logo file size must be less than 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setLogoPreview(dataUrl);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // Create company node without parent (root level)
      const payload: any = {
        nodeType: "company",
        name: formData.name.trim(),
      };

      if (formData.code.trim()) {
        payload.code = formData.code.trim();
      }

      if (formData.description.trim()) {
        payload.description = formData.description.trim();
      }

      if (logoPreview) {
        payload.logoUrl = logoPreview;
      }

      // Add address if any field is filled
      const hasAddress = Object.values(formData.address).some((v) => v.trim());
      if (hasAddress) {
        payload.address = formData.address;
      }

      // Add contact info if any field is filled
      const hasContactInfo = Object.values(formData.contactInfo).some((v) => v.trim());
      if (hasContactInfo) {
        payload.contactInfo = formData.contactInfo;
      }

      await organizationApi.createNode(payload);

      // Sync global branding across all pages immediately
      updateBranding({
        orgName: formData.name.trim(),
        orgCode: formData.code.trim() || "COMPANY-ROOT",
        logoUrl: logoPreview,
      });

      onSuccess();
    } catch (err: any) {
      console.error("Failed to create organization:", err);
      
      // Handle specific error cases
      let errorMessage = "Failed to create organization";
      
      if (err.statusCode === 403) {
        errorMessage = "You don't have permission to create an organization. Please contact your system administrator.";
      } else if (err.statusCode === 409) {
        errorMessage = "An organization already exists. Only one organization is allowed per system.";
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    if (field.startsWith("address.")) {
      const addressField = field.replace("address.", "");
      setFormData({
        ...formData,
        address: {
          ...formData.address,
          [addressField]: value,
        },
      });
    } else if (field.startsWith("contactInfo.")) {
      const contactField = field.replace("contactInfo.", "");
      setFormData({
        ...formData,
        contactInfo: {
          ...formData.contactInfo,
          [contactField]: value,
        },
      });
    } else {
      setFormData({
        ...formData,
        [field]: value,
      });
    }
  };

  return (
    <div className="create-organization-container">
      <div className="create-organization-card">
        <div className="create-organization-icon">
          {logoPreview ? (
            <img src={logoPreview} alt="Organization Logo" className="w-16 h-16 object-contain rounded-xl shadow-md border border-slate-700 bg-slate-900 p-1" />
          ) : (
            <Building2 size={48} className="text-blue-600" />
          )}
        </div>
        
        <h2 className="create-organization-title">Create Your Organization</h2>
        <p className="create-organization-subtitle">
          Set up your company information, upload your brand logo, and customize your security operations
        </p>

        <form onSubmit={handleSubmit} className="create-organization-form">
          {error && (
            <div className="form-error">
              {error}
            </div>
          )}

          <div className="form-section">
            <h3 className="form-section-title">Brand &amp; Logo</h3>
            
            <div className="form-group">
              <label className="form-label">Organization Logo</label>
              <div 
                className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-4 text-center hover:border-blue-500 transition-colors cursor-pointer bg-slate-50 dark:bg-slate-900/50"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleLogoFile(e.dataTransfer.files[0]);
                  }
                }}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleLogoFile(e.target.files[0]);
                    }
                  }} 
                  accept="image/png,image/jpeg,image/svg+xml,image/webp" 
                  className="hidden" 
                />
                
                {logoPreview ? (
                  <div className="flex flex-col items-center gap-2">
                    <img src={logoPreview} alt="Uploaded logo preview" className="max-h-20 max-w-[200px] object-contain rounded-lg shadow-sm border border-slate-700 p-1 bg-white" />
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-emerald-500 font-medium">Logo uploaded</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLogoPreview(null);
                        }}
                        className="text-xs text-rose-500 hover:text-rose-600 font-medium flex items-center gap-1"
                      >
                        <X size={12} /> Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-500 dark:text-slate-400">
                    <Upload size={24} className="text-blue-500" />
                    <div className="text-xs font-medium">
                      <span className="text-blue-500 font-semibold">Click to upload</span> or drag and drop your organization logo
                    </div>
                    <div className="text-[11px] text-slate-400">SVG, PNG, JPG, or WebP (max 2MB) • Displayed across all pages</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">Basic Information</h3>
            
            <div className="form-group">
              <label htmlFor="name" className="form-label required">
                Company Name
              </label>
              <input
                type="text"
                id="name"
                className="form-input"
                value={formData.name}
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder="Enter company name"
                required
                disabled={isSubmitting}
              />
            </div>

            <div className="form-group">
              <label htmlFor="code" className="form-label">
                Company Code
              </label>
              <input
                type="text"
                id="code"
                className="form-input"
                value={formData.code}
                onChange={(e) => handleChange("code", e.target.value)}
                placeholder="e.g., COMP001"
                disabled={isSubmitting}
              />
              <small className="form-hint">Unique alphanumeric identifier for your organization</small>
            </div>

            <div className="form-group">
              <label htmlFor="description" className="form-label">
                Description
              </label>
              <textarea
                id="description"
                className="form-textarea"
                value={formData.description}
                onChange={(e) => handleChange("description", e.target.value)}
                placeholder="Brief description of your company"
                rows={3}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">Address (Optional)</h3>
            
            <div className="form-group">
              <label htmlFor="street" className="form-label">
                Street Address
              </label>
              <input
                type="text"
                id="street"
                className="form-input"
                value={formData.address.street}
                onChange={(e) => handleChange("address.street", e.target.value)}
                placeholder="Street address"
                disabled={isSubmitting}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="city" className="form-label">
                  City
                </label>
                <input
                  type="text"
                  id="city"
                  className="form-input"
                  value={formData.address.city}
                  onChange={(e) => handleChange("address.city", e.target.value)}
                  placeholder="City"
                  disabled={isSubmitting}
                />
              </div>

              <div className="form-group">
                <label htmlFor="state" className="form-label">
                  State/Province
                </label>
                <input
                  type="text"
                  id="state"
                  className="form-input"
                  value={formData.address.state}
                  onChange={(e) => handleChange("address.state", e.target.value)}
                  placeholder="State"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="postalCode" className="form-label">
                  Postal Code
                </label>
                <input
                  type="text"
                  id="postalCode"
                  className="form-input"
                  value={formData.address.postalCode}
                  onChange={(e) => handleChange("address.postalCode", e.target.value)}
                  placeholder="Postal code"
                  disabled={isSubmitting}
                />
              </div>

              <div className="form-group">
                <label htmlFor="country" className="form-label">
                  Country
                </label>
                <input
                  type="text"
                  id="country"
                  className="form-input"
                  value={formData.address.country}
                  onChange={(e) => handleChange("address.country", e.target.value)}
                  placeholder="Country"
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">Contact Information (Optional)</h3>
            
            <div className="form-group">
              <label htmlFor="contactPerson" className="form-label">
                Contact Person
              </label>
              <input
                type="text"
                id="contactPerson"
                className="form-input"
                value={formData.contactInfo.contactPerson}
                onChange={(e) => handleChange("contactInfo.contactPerson", e.target.value)}
                placeholder="Contact person name"
                disabled={isSubmitting}
              />
            </div>

            <div className="form-group">
              <label htmlFor="email" className="form-label">
                Email
              </label>
              <input
                type="email"
                id="email"
                className="form-input"
                value={formData.contactInfo.email}
                onChange={(e) => handleChange("contactInfo.email", e.target.value)}
                placeholder="contact@company.com"
                disabled={isSubmitting}
              />
            </div>

            <div className="form-group">
              <label htmlFor="phone" className="form-label">
                Phone
              </label>
              <input
                type="tel"
                id="phone"
                className="form-input"
                value={formData.contactInfo.phone}
                onChange={(e) => handleChange("contactInfo.phone", e.target.value)}
                placeholder="+1 (555) 123-4567"
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="form-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting || !formData.name.trim()}
            >
              {isSubmitting ? (
                <>Creating Organization...</>
              ) : (
                <>
                  <CheckCircle size={16} />
                  Create Organization
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        .create-organization-container {
          display: flex;
          justify-content: center;
          align-items: flex-start;
          padding: 2rem;
          min-height: calc(100vh - 200px);
        }

        .create-organization-card {
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          padding: 3rem;
          max-width: 800px;
          width: 100%;
        }

        .create-organization-icon {
          display: flex;
          justify-content: center;
          margin-bottom: 1.5rem;
        }

        .create-organization-title {
          font-size: 1.75rem;
          font-weight: 700;
          text-align: center;
          color: #1a202c;
          margin-bottom: 0.5rem;
        }

        .create-organization-subtitle {
          font-size: 0.95rem;
          color: #718096;
          text-align: center;
          margin-bottom: 2rem;
        }

        .create-organization-form {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .form-error {
          background: #fee;
          border: 1px solid #fcc;
          color: #c33;
          padding: 0.75rem 1rem;
          border-radius: 6px;
          font-size: 0.9rem;
        }

        .form-section {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .form-section-title {
          font-size: 1.125rem;
          font-weight: 600;
          color: #2d3748;
          margin-bottom: 0.5rem;
          padding-bottom: 0.5rem;
          border-bottom: 2px solid #e2e8f0;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .form-label {
          font-size: 0.9rem;
          font-weight: 500;
          color: #4a5568;
        }

        .form-label.required::after {
          content: " *";
          color: #e53e3e;
        }

        .form-input,
        .form-textarea {
          padding: 0.75rem;
          border: 1px solid #cbd5e0;
          border-radius: 6px;
          font-size: 0.95rem;
          transition: border-color 0.2s;
        }

        .form-input:focus,
        .form-textarea:focus {
          outline: none;
          border-color: #4299e1;
          box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.1);
        }

        .form-input:disabled,
        .form-textarea:disabled {
          background: #f7fafc;
          cursor: not-allowed;
        }

        .form-textarea {
          resize: vertical;
          min-height: 80px;
        }

        .form-hint {
          font-size: 0.85rem;
          color: #a0aec0;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        .form-actions {
          display: flex;
          justify-content: center;
          padding-top: 1rem;
        }

        .btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 2rem;
          border: none;
          border-radius: 6px;
          font-size: 1rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-primary {
          background: #4299e1;
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: #3182ce;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(66, 153, 225, 0.3);
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        @media (max-width: 768px) {
          .create-organization-card {
            padding: 2rem 1.5rem;
          }

          .form-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

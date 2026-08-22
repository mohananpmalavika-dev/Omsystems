"use client";

import { Info, Key } from "lucide-react";
import { useState } from "react";

interface DefaultCredentialSuggesterProps {
  deviceId?: string;
  manufacturer?: string;
  credentialOptions?: CredentialOption[];
  onSelectCredential: (username: string, password: string) => void;
}

interface CredentialOption {
  username: string;
  password: string;
  label: string;
  description: string;
  priority: number;
}

export function DefaultCredentialSuggester({
  credentialOptions = [],
  onSelectCredential,
}: DefaultCredentialSuggesterProps) {
  const [showSuggestions, setShowSuggestions] = useState(true);
  const credentials = [...credentialOptions].sort((a, b) => a.priority - b.priority);

  if (!showSuggestions) {
    return (
      <button
        type="button"
        className="default-credential-toggle"
        onClick={() => setShowSuggestions(true)}
      >
        <Key size={16} />
        Show credential guidance
      </button>
    );
  }

  return (
    <div className="default-credential-suggester">
      <div className="suggester-header">
        <div className="suggester-title">
          <Info size={18} />
          <h4>Use Provisioned Credentials</h4>
        </div>
        <button
          type="button"
          className="suggester-close"
          onClick={() => setShowSuggestions(false)}
        >
          ×
        </button>
      </div>

      <p className="suggester-description">
        Use credentials issued for this device by your approved provisioning or secrets workflow.
        This interface does not include vendor or factory default passwords.
      </p>

      <div className="credential-options">
        {credentials.length === 0 ? (
          <div className="credential-empty">
            No device credentials are available to auto-fill. Enter them manually or load them
            from the approved credential provider.
          </div>
        ) : credentials.map((cred, index) => (
          <button
            key={index}
            type="button"
            className="credential-option"
            onClick={() => {
              onSelectCredential(cred.username, cred.password);
            }}
          >
            <div className="credential-badge">#{index + 1}</div>
            <div className="credential-info">
              <strong className="credential-label">{cred.label}</strong>
              <small className="credential-description">{cred.description}</small>
            </div>
            <div className="credential-action">Try →</div>
          </button>
        ))}
      </div>

      <div className="suggester-footer">
        <small>
          <strong>Security:</strong> Never reuse factory credentials; rotate device passwords after provisioning.
        </small>
      </div>

      <style jsx>{`
        .default-credential-suggester {
          margin: 1.5rem 0;
          padding: 1.25rem;
          background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
          border: 1px solid #93c5fd;
          border-radius: 10px;
        }

        .default-credential-toggle {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.625rem 1rem;
          background: #eff6ff;
          border: 1px solid #93c5fd;
          border-radius: 6px;
          color: #1e40af;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          margin: 1rem 0;
        }

        .default-credential-toggle:hover {
          background: #dbeafe;
          transform: translateY(-1px);
        }

        .suggester-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.75rem;
        }

        .suggester-title {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: #1e40af;
        }

        .suggester-title h4 {
          margin: 0;
          font-size: 1rem;
          font-weight: 600;
        }

        .suggester-close {
          background: none;
          border: none;
          color: #64748b;
          font-size: 1.5rem;
          line-height: 1;
          cursor: pointer;
          padding: 0;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          transition: all 0.2s;
        }

        .suggester-close:hover {
          background: rgba(0, 0, 0, 0.1);
          color: #1e293b;
        }

        .suggester-description {
          margin: 0 0 1rem;
          font-size: 0.875rem;
          color: #475569;
        }

        .credential-options {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .credential-option {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.875rem;
          background: white;
          border: 1.5px solid #e0e7ff;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }

        .credential-option:hover {
          border-color: #3b82f6;
          background: #f8fafc;
          transform: translateX(4px);
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.15);
        }

        .credential-badge {
          flex-shrink: 0;
          width: 28px;
          height: 28px;
          background: #3b82f6;
          color: white;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          font-weight: 700;
        }

        .credential-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .credential-label {
          font-size: 0.9375rem;
          font-weight: 600;
          color: #1e293b;
          font-family: 'Courier New', monospace;
        }

        .credential-description {
          font-size: 0.8125rem;
          color: #64748b;
        }

        .credential-action {
          flex-shrink: 0;
          font-size: 0.875rem;
          font-weight: 600;
          color: #3b82f6;
        }

        .suggester-footer {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid #bfdbfe;
        }

        .suggester-footer small {
          font-size: 0.8125rem;
          color: #475569;
          display: block;
          line-height: 1.5;
        }

        @media (max-width: 640px) {
          .default-credential-suggester {
            padding: 1rem;
          }

          .credential-option {
            padding: 0.75rem;
          }

          .credential-badge {
            width: 24px;
            height: 24px;
            font-size: 0.6875rem;
          }

          .credential-label {
            font-size: 0.875rem;
          }

          .credential-description {
            font-size: 0.75rem;
          }
        }
      `}</style>
    </div>
  );
}

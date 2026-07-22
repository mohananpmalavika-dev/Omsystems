"use client";

import {
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileVideo,
  Info,
  Loader2,
  Shield,
} from "lucide-react";
import { useState } from "react";

interface ExportFormat {
  id: "original" | "viewing-copy" | "manifest-only";
  name: string;
  description: string;
  icon: React.ReactNode;
  features: string[];
  requirements?: string[];
}

interface ExportOptions {
  format: "original" | "viewing-copy" | "manifest-only";
  includeMetadata: boolean;
  includeChainOfCustody: boolean;
  watermark?: {
    enabled: boolean;
    text?: string;
    position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  };
  password?: string;
  notes?: string;
  recipientInfo?: {
    name: string;
    organization: string;
    email: string;
  };
}

interface ExportWizardProps {
  segmentIds: string[];
  caseId?: string;
  onExport?: (options: ExportOptions) => Promise<void>;
  onCancel?: () => void;
}

const EXPORT_FORMATS: ExportFormat[] = [
  {
    id: "original",
    name: "Original Format",
    description: "Unmodified, forensically sound copy with hash verification",
    icon: <Shield size={24} />,
    features: [
      "Exact copy of original recording",
      "No transcoding or compression",
      "SHA-256 hash verification included",
      "Full metadata preservation",
      "Court-admissible forensic evidence",
    ],
    requirements: [
      "Large file size",
      "May require specific codec support",
    ],
  },
  {
    id: "viewing-copy",
    name: "Viewing Copy (MP4)",
    description: "Transcoded for universal playback with optional watermark",
    icon: <FileVideo size={24} />,
    features: [
      "H.264/MP4 format for universal compatibility",
      "Optional visible watermark",
      "Metadata embedded in file",
      "Smaller file size",
      "Playable on any modern device",
    ],
  },
  {
    id: "manifest-only",
    name: "Manifest Only",
    description: "Export metadata, chain of custody, and references without video",
    icon: <FileVideo size={24} />,
    features: [
      "JSON manifest with all metadata",
      "Complete chain of custody log",
      "Video segment references",
      "Verification hashes",
      "Minimal file size",
    ],
  },
];

export function ExportWizard({
  segmentIds,
  caseId,
  onExport,
  onCancel,
}: ExportWizardProps) {
  const [step, setStep] = useState(1);
  const [options, setOptions] = useState<ExportOptions>({
    format: "viewing-copy",
    includeMetadata: true,
    includeChainOfCustody: true,
    watermark: {
      enabled: false,
      position: "bottom-right",
    },
  });
  const [isExporting, setIsExporting] = useState(false);
  const [exportComplete, setExportComplete] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const totalSteps = 3;

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleFormatSelect = (format: "original" | "viewing-copy" | "manifest-only") => {
    setOptions((prev) => ({
      ...prev,
      format,
      watermark:
        format === "viewing-copy"
          ? { enabled: false, position: "bottom-right" }
          : undefined,
    }));
  };

  const handleExport = async () => {
    if (!onExport) return;

    setIsExporting(true);
    setExportError(null);

    try {
      await onExport(options);
      setExportComplete(true);
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Export failed",
      );
    } finally {
      setIsExporting(false);
    }
  };

  const selectedFormat = EXPORT_FORMATS.find((f) => f.id === options.format);

  return (
    <div className="export-wizard">
      {/* Header */}
      <div className="wizard-header">
        <h2>
          <Download size={24} />
          Export Evidence
        </h2>
        <p>
          Export {segmentIds.length} recording segment
          {segmentIds.length !== 1 ? "s" : ""}
          {caseId && ` for Evidence Case ${caseId}`}
        </p>
      </div>

      {/* Progress Indicator */}
      {!exportComplete && (
        <div className="progress-indicator">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className="progress-step-wrapper">
              <div
                className={`progress-step ${i + 1 <= step ? "active" : ""} ${i + 1 < step ? "completed" : ""}`}
              >
                {i + 1 < step ? (
                  <CheckCircle size={20} />
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>
              <span className="progress-label">
                {i === 0 && "Format"}
                {i === 1 && "Options"}
                {i === 2 && "Review"}
              </span>
              {i < totalSteps - 1 && <div className="progress-line" />}
            </div>
          ))}
        </div>
      )}

      {/* Step Content */}
      <div className="wizard-content">
        {/* Step 1: Format Selection */}
        {step === 1 && (
          <div className="step-content">
            <h3>Select Export Format</h3>
            <p className="step-description">
              Choose the format that best suits your needs
            </p>

            <div className="format-options">
              {EXPORT_FORMATS.map((format) => (
                <div
                  key={format.id}
                  className={`format-card ${options.format === format.id ? "selected" : ""}`}
                  onClick={() => handleFormatSelect(format.id)}
                >
                  <div className="format-header">
                    <div className="format-icon">{format.icon}</div>
                    <div className="format-info">
                      <h4>{format.name}</h4>
                      <p>{format.description}</p>
                    </div>
                    <div className="format-radio">
                      <input
                        type="radio"
                        checked={options.format === format.id}
                        onChange={() => handleFormatSelect(format.id)}
                      />
                    </div>
                  </div>

                  <div className="format-features">
                    <strong>Features:</strong>
                    <ul>
                      {format.features.map((feature, i) => (
                        <li key={i}>{feature}</li>
                      ))}
                    </ul>
                  </div>

                  {format.requirements && (
                    <div className="format-requirements">
                      <Info size={14} />
                      <span>
                        <strong>Note:</strong> {format.requirements.join(", ")}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Options Configuration */}
        {step === 2 && (
          <div className="step-content">
            <h3>Configure Export Options</h3>
            <p className="step-description">
              Customize your export settings
            </p>

            <div className="options-form">
              {/* Metadata Options */}
              <div className="option-section">
                <h4>Metadata & Chain of Custody</h4>

                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={options.includeMetadata}
                    onChange={(e) =>
                      setOptions((prev) => ({
                        ...prev,
                        includeMetadata: e.target.checked,
                      }))
                    }
                  />
                  <span>Include video metadata</span>
                </label>

                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={options.includeChainOfCustody}
                    onChange={(e) =>
                      setOptions((prev) => ({
                        ...prev,
                        includeChainOfCustody: e.target.checked,
                      }))
                    }
                  />
                  <span>Include chain of custody log</span>
                </label>
              </div>

              {/* Watermark Options (viewing-copy only) */}
              {options.format === "viewing-copy" && (
                <div className="option-section">
                  <h4>Watermark Settings</h4>

                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={options.watermark?.enabled || false}
                      onChange={(e) =>
                        setOptions((prev) => ({
                          ...prev,
                          watermark: {
                            ...prev.watermark,
                            enabled: e.target.checked,
                            position: "bottom-right",
                          },
                        }))
                      }
                    />
                    <span>Add visible watermark</span>
                  </label>

                  {options.watermark?.enabled && (
                    <>
                      <div className="form-field">
                        <label>Watermark Text</label>
                        <input
                          type="text"
                          placeholder="e.g., CONFIDENTIAL - Case #12345"
                          value={options.watermark.text || ""}
                          onChange={(e) =>
                            setOptions((prev) => ({
                              ...prev,
                              watermark: {
                                ...prev.watermark!,
                                text: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>

                      <div className="form-field">
                        <label>Position</label>
                        <select
                          value={options.watermark.position}
                          onChange={(e) =>
                            setOptions((prev) => ({
                              ...prev,
                              watermark: {
                                ...prev.watermark!,
                                position: e.target.value as any,
                              },
                            }))
                          }
                        >
                          <option value="top-left">Top Left</option>
                          <option value="top-right">Top Right</option>
                          <option value="bottom-left">Bottom Left</option>
                          <option value="bottom-right">Bottom Right</option>
                        </select>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Password Protection */}
              <div className="option-section">
                <h4>Security</h4>

                <div className="form-field">
                  <label>Password Protection (Optional)</label>
                  <input
                    type="password"
                    placeholder="Leave empty for no password"
                    value={options.password || ""}
                    onChange={(e) =>
                      setOptions((prev) => ({
                        ...prev,
                        password: e.target.value || undefined,
                      }))
                    }
                  />
                  <span className="field-hint">
                    Password will be required to extract exported files
                  </span>
                </div>
              </div>

              {/* Recipient Information */}
              <div className="option-section">
                <h4>Recipient Information (Optional)</h4>

                <div className="form-field">
                  <label>Recipient Name</label>
                  <input
                    type="text"
                    placeholder="e.g., Det. John Smith"
                    value={options.recipientInfo?.name || ""}
                    onChange={(e) =>
                      setOptions((prev) => ({
                        ...prev,
                        recipientInfo: {
                          ...prev.recipientInfo,
                          name: e.target.value,
                          organization: prev.recipientInfo?.organization || "",
                          email: prev.recipientInfo?.email || "",
                        },
                      }))
                    }
                  />
                </div>

                <div className="form-field">
                  <label>Organization</label>
                  <input
                    type="text"
                    placeholder="e.g., City Police Department"
                    value={options.recipientInfo?.organization || ""}
                    onChange={(e) =>
                      setOptions((prev) => ({
                        ...prev,
                        recipientInfo: {
                          ...prev.recipientInfo,
                          name: prev.recipientInfo?.name || "",
                          organization: e.target.value,
                          email: prev.recipientInfo?.email || "",
                        },
                      }))
                    }
                  />
                </div>

                <div className="form-field">
                  <label>Email</label>
                  <input
                    type="email"
                    placeholder="e.g., john.smith@police.gov"
                    value={options.recipientInfo?.email || ""}
                    onChange={(e) =>
                      setOptions((prev) => ({
                        ...prev,
                        recipientInfo: {
                          ...prev.recipientInfo,
                          name: prev.recipientInfo?.name || "",
                          organization: prev.recipientInfo?.organization || "",
                          email: e.target.value,
                        },
                      }))
                    }
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="option-section">
                <h4>Export Notes</h4>

                <div className="form-field">
                  <label>Additional Notes (Optional)</label>
                  <textarea
                    rows={4}
                    placeholder="Enter any additional notes about this export..."
                    value={options.notes || ""}
                    onChange={(e) =>
                      setOptions((prev) => ({
                        ...prev,
                        notes: e.target.value || undefined,
                      }))
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Review & Confirm */}
        {step === 3 && !exportComplete && (
          <div className="step-content">
            <h3>Review & Confirm</h3>
            <p className="step-description">
              Please review your export settings before proceeding
            </p>

            <div className="review-summary">
              <div className="review-section">
                <h4>Export Format</h4>
                <div className="review-item">
                  <span className="review-label">Format:</span>
                  <span className="review-value">{selectedFormat?.name}</span>
                </div>
                <div className="review-item">
                  <span className="review-label">Segments:</span>
                  <span className="review-value">{segmentIds.length}</span>
                </div>
                {caseId && (
                  <div className="review-item">
                    <span className="review-label">Case ID:</span>
                    <span className="review-value">{caseId}</span>
                  </div>
                )}
              </div>

              <div className="review-section">
                <h4>Options</h4>
                <div className="review-item">
                  <span className="review-label">Include Metadata:</span>
                  <span className="review-value">
                    {options.includeMetadata ? "Yes" : "No"}
                  </span>
                </div>
                <div className="review-item">
                  <span className="review-label">Chain of Custody:</span>
                  <span className="review-value">
                    {options.includeChainOfCustody ? "Yes" : "No"}
                  </span>
                </div>
                {options.watermark?.enabled && (
                  <div className="review-item">
                    <span className="review-label">Watermark:</span>
                    <span className="review-value">
                      {options.watermark.text || "Default"} (
                      {options.watermark.position})
                    </span>
                  </div>
                )}
                {options.password && (
                  <div className="review-item">
                    <span className="review-label">Password Protected:</span>
                    <span className="review-value">Yes</span>
                  </div>
                )}
              </div>

              {options.recipientInfo?.name && (
                <div className="review-section">
                  <h4>Recipient</h4>
                  <div className="review-item">
                    <span className="review-label">Name:</span>
                    <span className="review-value">
                      {options.recipientInfo.name}
                    </span>
                  </div>
                  {options.recipientInfo.organization && (
                    <div className="review-item">
                      <span className="review-label">Organization:</span>
                      <span className="review-value">
                        {options.recipientInfo.organization}
                      </span>
                    </div>
                  )}
                  {options.recipientInfo.email && (
                    <div className="review-item">
                      <span className="review-label">Email:</span>
                      <span className="review-value">
                        {options.recipientInfo.email}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {options.notes && (
                <div className="review-section">
                  <h4>Notes</h4>
                  <p className="review-notes">{options.notes}</p>
                </div>
              )}
            </div>

            <div className="warning-banner">
              <AlertCircle size={20} />
              <div>
                <strong>Important:</strong> This export will be logged in the
                chain of custody. Ensure all information is correct before
                proceeding.
              </div>
            </div>

            {exportError && (
              <div className="error-banner">
                <AlertCircle size={20} />
                <span>{exportError}</span>
              </div>
            )}
          </div>
        )}

        {/* Export Complete */}
        {exportComplete && (
          <div className="step-content">
            <div className="success-state">
              <CheckCircle size={64} className="success-icon" />
              <h3>Export Completed Successfully</h3>
              <p>
                Your evidence export has been prepared and logged in the chain
                of custody.
              </p>

              <div className="success-actions">
                <button className="primary-button">
                  <Download size={16} />
                  Download Export
                </button>
                <button
                  className="secondary-button"
                  onClick={onCancel}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      {!exportComplete && (
        <div className="wizard-footer">
          <button
            className="secondary-button"
            onClick={step === 1 ? onCancel : handleBack}
            disabled={isExporting}
          >
            {step === 1 ? "Cancel" : <><ChevronLeft size={16} /> Back</>}
          </button>

          {step < totalSteps ? (
            <button
              className="primary-button"
              onClick={handleNext}
              disabled={isExporting}
            >
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button
              className="primary-button"
              onClick={() => void handleExport()}
              disabled={isExporting}
            >
              {isExporting ? (
                <>
                  <Loader2 size={16} className="spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download size={16} />
                  Start Export
                </>
              )}
            </button>
          )}
        </div>
      )}

      <style jsx>{`
        .export-wizard {
          display: flex;
          flex-direction: column;
          max-width: 900px;
          margin: 0 auto;
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }

        .wizard-header {
          padding: 24px;
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: white;
        }

        .wizard-header h2 {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 0 0 8px 0;
          font-size: 24px;
        }

        .wizard-header p {
          margin: 0;
          opacity: 0.9;
        }

        .progress-indicator {
          display: flex;
          justify-content: center;
          padding: 32px 24px;
          background: #f9fafb;
        }

        .progress-step-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
          position: relative;
        }

        .progress-step {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: white;
          border: 2px solid #d1d5db;
          color: #6b7280;
          font-weight: 600;
          margin-bottom: 8px;
          transition: all 0.3s;
        }

        .progress-step.active {
          border-color: #3b82f6;
          color: #3b82f6;
        }

        .progress-step.completed {
          background: #3b82f6;
          border-color: #3b82f6;
          color: white;
        }

        .progress-label {
          font-size: 13px;
          color: #6b7280;
          font-weight: 500;
        }

        .progress-line {
          position: absolute;
          top: 20px;
          left: 60px;
          width: 100px;
          height: 2px;
          background: #d1d5db;
        }

        .wizard-content {
          padding: 32px 24px;
          min-height: 400px;
        }

        .step-content h3 {
          margin: 0 0 8px 0;
          font-size: 20px;
        }

        .step-description {
          color: #6b7280;
          margin: 0 0 24px 0;
        }

        .format-options {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .format-card {
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          padding: 20px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .format-card:hover {
          border-color: #3b82f6;
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.1);
        }

        .format-card.selected {
          border-color: #3b82f6;
          background: #eff6ff;
        }

        .format-header {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 12px;
        }

        .format-icon {
          color: #3b82f6;
        }

        .format-info {
          flex: 1;
        }

        .format-info h4 {
          margin: 0 0 4px 0;
          font-size: 16px;
        }

        .format-info p {
          margin: 0;
          font-size: 14px;
          color: #6b7280;
        }

        .format-radio input {
          width: 20px;
          height: 20px;
          cursor: pointer;
        }

        .format-features {
          padding-left: 40px;
          font-size: 14px;
        }

        .format-features ul {
          margin: 8px 0 0 0;
          padding-left: 20px;
        }

        .format-features li {
          margin: 4px 0;
          color: #374151;
        }

        .format-requirements {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          margin-top: 12px;
          padding: 8px 12px;
          background: #fef3c7;
          border-radius: 6px;
          font-size: 13px;
          color: #92400e;
        }

        .options-form {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .option-section {
          padding: 20px;
          background: #f9fafb;
          border-radius: 8px;
        }

        .option-section h4 {
          margin: 0 0 16px 0;
          font-size: 16px;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          cursor: pointer;
        }

        .checkbox-label input[type="checkbox"] {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }

        .form-field {
          margin-bottom: 16px;
        }

        .form-field label {
          display: block;
          margin-bottom: 6px;
          font-weight: 500;
          font-size: 14px;
        }

        .form-field input,
        .form-field select,
        .form-field textarea {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
        }

        .field-hint {
          display: block;
          margin-top: 4px;
          font-size: 12px;
          color: #6b7280;
        }

        .review-summary {
          display: flex;
          flex-direction: column;
          gap: 20px;
          margin-bottom: 20px;
        }

        .review-section {
          padding: 16px;
          background: #f9fafb;
          border-radius: 8px;
        }

        .review-section h4 {
          margin: 0 0 12px 0;
          font-size: 16px;
        }

        .review-item {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #e5e7eb;
        }

        .review-item:last-child {
          border-bottom: none;
        }

        .review-label {
          font-weight: 500;
          color: #6b7280;
        }

        .review-value {
          color: #111827;
        }

        .review-notes {
          margin: 0;
          padding: 12px;
          background: white;
          border-radius: 6px;
          font-size: 14px;
          color: #374151;
        }

        .warning-banner {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 12px 16px;
          background: #fef3c7;
          border: 1px solid #fde68a;
          border-radius: 6px;
          color: #92400e;
        }

        .error-banner {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 6px;
          color: #991b1b;
          margin-top: 16px;
        }

        .success-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 40px 20px;
        }

        .success-icon {
          color: #10b981;
          margin-bottom: 20px;
        }

        .success-state h3 {
          margin: 0 0 8px 0;
        }

        .success-state p {
          color: #6b7280;
          margin: 0 0 32px 0;
        }

        .success-actions {
          display: flex;
          gap: 12px;
        }

        .wizard-footer {
          display: flex;
          justify-content: space-between;
          padding: 20px 24px;
          background: #f9fafb;
          border-top: 1px solid #e5e7eb;
        }

        .primary-button {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
        }

        .primary-button:hover:not(:disabled) {
          background: #2563eb;
        }

        .primary-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .secondary-button {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          cursor: pointer;
        }

        .secondary-button:hover:not(:disabled) {
          background: #f9fafb;
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

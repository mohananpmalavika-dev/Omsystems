"use client";

/**
 * CCTV Enrollment Wizard
 * 
 * Allows enrolling employees directly from CCTV footage
 * 
 * സവിശേഷതകൾ:
 * 1. Video playback-ൽ നിന്ന് frame select ചെയ്യുക
 * 2. Face detect ചെയ്ത് quality check ചെയ്യുക
 * 3. Employee details add ചെയ്യുക
 * 4. Enroll ചെയ്യുക
 */

import { useState } from "react";
import {
  Camera,
  CheckCircle2,
  XCircle,
  AlertCircle,
  User,
  Video,
  Sparkles,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  ZoomIn,
  Upload,
} from "lucide-react";

interface CCTVEnrollmentProps {
  cameraId: string;
  cameraName: string;
  watchlistId: string;
  watchlistName: string;
  onSuccess?: (personId: string) => void;
  onCancel?: () => void;
}

interface ValidationResult {
  suitable: boolean;
  quality: number;
  qualityGrade: string;
  reasons: string[];
  recommendations: string[];
}

type EnrollmentStep = "select-frame" | "validate" | "employee-details" | "enroll" | "success";

export function CCTVEnrollmentWizard({
  cameraId,
  cameraName,
  watchlistId,
  watchlistName,
  onSuccess,
  onCancel,
}: CCTVEnrollmentProps) {
  const [step, setStep] = useState<EnrollmentStep>("select-frame");
  const [selectedFrame, setSelectedFrame] = useState<string | null>(null);
  const [faceBoundingBox, setFaceBoundingBox] = useState<any>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [employeeName, setEmployeeName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [enrolledPersonId, setEnrolledPersonId] = useState<string | null>(null);

  const validateFrame = async () => {
    if (!selectedFrame || !faceBoundingBox) {
      alert("Please select a frame and face first");
      return;
    }

    try {
      const response = await fetch("/api/v1/face/cctv/validate-frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          cameraId,
          timestamp: new Date().toISOString(),
          frameData: selectedFrame.split(",")[1], // Remove data:image/jpeg;base64,
          frameWidth: 1920, // From video
          frameHeight: 1080,
          faceBoundingBox,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setValidation(data.validation);
        if (data.validation.suitable) {
          setStep("employee-details");
        } else {
          setStep("validate");
        }
      }
    } catch (error) {
      console.error("Validation failed:", error);
      alert("Failed to validate frame");
    }
  };

  const enrollEmployee = async () => {
    if (!employeeName.trim()) {
      alert("Employee name is required");
      return;
    }

    setEnrolling(true);

    try {
      const response = await fetch("/api/v1/face/cctv/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          watchlistId,
          employeeName: employeeName.trim(),
          employeeId: employeeId.trim() || undefined,
          cameraId,
          videoTimestamp: new Date().toISOString(),
          frameData: selectedFrame!.split(",")[1],
          frameWidth: 1920,
          frameHeight: 1080,
          faceBoundingBox,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setEnrolledPersonId(data.data.personId);
        setStep("success");
        if (onSuccess) {
          onSuccess(data.data.personId);
        }
      } else {
        alert(data.message || "Enrollment failed");
      }
    } catch (error) {
      console.error("Enrollment failed:", error);
      alert("Failed to enroll employee");
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-100 mb-2 flex items-center gap-3">
            <Camera className="w-8 h-8 text-indigo-400" />
            CCTV Face Enrollment
          </h1>
          <p className="text-slate-400">
            {cameraName} → {watchlistName}
          </p>
        </div>

        {/* Steps */}
        <div className="flex items-center justify-center mb-8 gap-4">
          {[
            { id: "select-frame", label: "Select Frame", icon: Video },
            { id: "validate", label: "Validate", icon: CheckCircle2 },
            { id: "employee-details", label: "Employee Details", icon: User },
            { id: "enroll", label: "Enroll", icon: Sparkles },
          ].map((s, i) => {
            const Icon = s.icon;
            const isActive = step === s.id;
            const isComplete = ["select-frame", "validate", "employee-details"].indexOf(s.id) <
              ["select-frame", "validate", "employee-details", "enroll"].indexOf(step);

            return (
              <div key={s.id} className="flex items-center gap-4">
                <div
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                    isActive
                      ? "bg-indigo-600 text-white"
                      : isComplete
                      ? "bg-green-600 text-white"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{s.label}</span>
                </div>
                {i < 3 && (
                  <div className="w-8 h-0.5 bg-slate-700"></div>
                )}
              </div>
            );
          })}
        </div>

        {/* Content */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8">
          {step === "select-frame" && (
            <SelectFrameStep
              onFrameSelected={(frame, bbox) => {
                setSelectedFrame(frame);
                setFaceBoundingBox(bbox);
              }}
              onNext={validateFrame}
              onCancel={onCancel}
            />
          )}

          {step === "validate" && validation && (
            <ValidationStep
              validation={validation}
              onRetry={() => setStep("select-frame")}
              onContinue={() => setStep("employee-details")}
            />
          )}

          {step === "employee-details" && validation && (
            <EmployeeDetailsStep
              validation={validation}
              employeeName={employeeName}
              employeeId={employeeId}
              onEmployeeNameChange={setEmployeeName}
              onEmployeeIdChange={setEmployeeId}
              onBack={() => setStep("select-frame")}
              onNext={enrollEmployee}
              enrolling={enrolling}
            />
          )}

          {step === "success" && (
            <SuccessStep
              employeeName={employeeName}
              personId={enrolledPersonId!}
              quality={validation?.quality || 0}
              onClose={onCancel}
            />
          )}
        </div>

        {/* Guidelines */}
        <div className="mt-8 bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-blue-400" />
            എങ്ങനെ നല്ല Result കിട്ടും?
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium text-slate-300 mb-2">✓ ചെയ്യേണ്ടത്:</h4>
              <ul className="space-y-1 text-sm text-slate-400">
                <li>• മുഖം നേരെ camera-യ്ക്ക് നോക്കുക</li>
                <li>• നല്ല വെളിച്ചമുള്ള സമയം തിരഞ്ഞെടുക്കുക</li>
                <li>• വ്യക്തമായ frame (blur ഇല്ലാത്തത്)</li>
                <li>• നിശ്ചലമായി നിൽക്കുമ്പോൾ</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-slate-300 mb-2">✗ ചെയ്യരുത്:</h4>
              <ul className="space-y-1 text-sm text-slate-400">
                <li>• മുഖം വശത്തേക്ക് തിരിഞ്ഞിരിക്കുമ്പോൾ</li>
                <li>• മാസ്ക്/കണ്ണട ധരിച്ചിരിക്കുമ്പോൾ</li>
                <li>• ഇരുട്ടിൽ അല്ലെങ്കിൽ വളരെ bright ആയി</li>
                <li>• നീങ്ങുന്ന സമയത്ത്</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SelectFrameStep({ onFrameSelected, onNext, onCancel }: any) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-100 mb-2">
          Select a Frame from Video
        </h2>
        <p className="text-slate-400">
          Choose a clear frame where the employee's face is visible
        </p>
      </div>

      {/* Video player would go here */}
      <div className="aspect-video bg-slate-950 rounded-lg border-2 border-dashed border-slate-700 flex items-center justify-center">
        <div className="text-center">
          <Upload className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-500 mb-4">
            Video player integration coming soon
          </p>
          <p className="text-sm text-slate-600">
            For now, use playback screen to capture frame
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-4">
        <button
          onClick={onCancel}
          className="px-6 py-2 text-slate-400 hover:text-slate-200 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onNext}
          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
        >
          Validate Frame
        </button>
      </div>
    </div>
  );
}

function ValidationStep({ validation, onRetry, onContinue }: any) {
  const qualityColor =
    validation.quality >= 80
      ? "text-green-400"
      : validation.quality >= 65
      ? "text-yellow-400"
      : "text-red-400";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-100 mb-2">
          Frame Quality Check
        </h2>
      </div>

      <div className="grid gap-6">
        {/* Quality Score */}
        <div className="bg-slate-950 rounded-lg p-6 border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-400">Quality Score</span>
            <span className={`text-3xl font-bold ${qualityColor}`}>
              {validation.quality}%
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-3">
            <div
              className={`h-3 rounded-full ${
                validation.quality >= 80
                  ? "bg-green-500"
                  : validation.quality >= 65
                  ? "bg-yellow-500"
                  : "bg-red-500"
              }`}
              style={{ width: `${validation.quality}%` }}
            ></div>
          </div>
          <div className="mt-2 text-sm">
            <span className={qualityColor}>{validation.qualityGrade.toUpperCase()}</span>
            <span className="text-slate-500"> • Minimum: 65% • Recommended: 80%+</span>
          </div>
        </div>

        {/* Results */}
        {validation.suitable ? (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-green-400 mb-2">
                  Frame is suitable for enrollment!
                </h3>
                <ul className="space-y-1 text-sm text-green-300/80">
                  {validation.reasons.map((reason: string, i: number) => (
                    <li key={i}>• {reason}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6">
            <div className="flex items-start gap-3">
              <XCircle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-red-400 mb-2">
                  Frame not suitable for enrollment
                </h3>
                <ul className="space-y-1 text-sm text-red-300/80 mb-4">
                  {validation.reasons.map((reason: string, i: number) => (
                    <li key={i}>• {reason}</li>
                  ))}
                </ul>
                {validation.recommendations && validation.recommendations.length > 0 && (
                  <>
                    <h4 className="font-medium text-red-300 text-sm mb-2">
                      Recommendations:
                    </h4>
                    <ul className="space-y-1 text-sm text-red-300/70">
                      {validation.recommendations.map((rec: string, i: number) => (
                        <li key={i}>→ {rec}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-4">
        <button
          onClick={onRetry}
          className="px-6 py-2 text-slate-400 hover:text-slate-200 transition-colors"
        >
          Select Different Frame
        </button>
        {validation.suitable && (
          <button
            onClick={onContinue}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
          >
            Continue to Employee Details
          </button>
        )}
      </div>
    </div>
  );
}

function EmployeeDetailsStep({
  validation,
  employeeName,
  employeeId,
  onEmployeeNameChange,
  onEmployeeIdChange,
  onBack,
  onNext,
  enrolling,
}: any) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-100 mb-2">
          Employee Details
        </h2>
        <p className="text-slate-400">
          Enter the employee information for enrollment
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Employee Name *
          </label>
          <input
            type="text"
            value={employeeName}
            onChange={(e) => onEmployeeNameChange(e.target.value)}
            placeholder="Enter full name"
            className="w-full px-4 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Employee ID (Optional)
          </label>
          <input
            type="text"
            value={employeeId}
            onChange={(e) => onEmployeeIdChange(e.target.value)}
            placeholder="E.g., EMP001"
            className="w-full px-4 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="bg-slate-950 rounded-lg p-4 border border-slate-800">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Frame Quality:</span>
            <span className="text-green-400 font-medium">
              {validation.quality}% ({validation.qualityGrade})
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-4">
        <button
          onClick={onBack}
          disabled={enrolling}
          className="px-6 py-2 text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!employeeName.trim() || enrolling}
          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {enrolling ? (
            <>
              <span className="animate-spin">⏳</span>
              Enrolling...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              Enroll Employee
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function SuccessStep({ employeeName, personId, quality, onClose }: any) {
  return (
    <div className="text-center py-12">
      <div className="inline-flex items-center justify-center w-20 h-20 bg-green-500/10 rounded-full mb-6">
        <CheckCircle2 className="w-12 h-12 text-green-400" />
      </div>

      <h2 className="text-2xl font-bold text-slate-100 mb-2">
        Enrollment Successful!
      </h2>
      <p className="text-slate-400 mb-8">
        {employeeName} has been enrolled successfully
      </p>

      <div className="bg-slate-950 rounded-lg p-6 max-w-md mx-auto mb-8">
        <div className="space-y-3 text-left">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Employee:</span>
            <span className="text-slate-100 font-medium">{employeeName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Person ID:</span>
            <span className="text-slate-400 font-mono text-sm">{personId.substring(0, 8)}...</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Quality:</span>
            <span className="text-green-400 font-medium">{quality}%</span>
          </div>
        </div>
      </div>

      <button
        onClick={onClose}
        className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
      >
        Done
      </button>
    </div>
  );
}

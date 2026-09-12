"use client";

import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, ShieldCheck, AlertCircle, Info, QrCode, Camera, RotateCcw, Upload, CheckCircle2 } from "lucide-react";
import QRCode from "qrcode";
import { authApi, organizationApi } from "@/lib/api-client";
import { useRouter, useSearchParams } from "next/navigation";
import { safeReturnPath } from "@/lib/session-navigation";

import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { useOrgBranding } from "@/components/ui/org-branding-provider";

interface LoginFormProps {
  onSuccess?: () => void;
}

export function LoginForm(props: LoginFormProps) {
  return <LoginFormInner {...props} />;
}

function LoginFormInner({ onSuccess }: LoginFormProps) {
  const { branding } = useOrgBranding();
  const router = useRouter();
  const searchParams = useSearchParams();
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const faceVideoRef = useRef<HTMLVideoElement>(null);
  const faceCanvasRef = useRef<HTMLCanvasElement>(null);
  const faceStreamRef = useRef<MediaStream | null>(null);
  const faceFileInputRef = useRef<HTMLInputElement>(null);
  const [showQR, setShowQR] = useState(false);
  const [showFaceScan, setShowFaceScan] = useState(false);
  const [faceScan, setFaceScan] = useState<string | null>(null);
  const [faceStream, setFaceStream] = useState<MediaStream | null>(null);
  const [faceCameraActive, setFaceCameraActive] = useState(false);
  const [faceCameraReady, setFaceCameraReady] = useState(false);
  const [faceCameraError, setFaceCameraError] = useState<string | null>(null);
  const [loginUrl, setLoginUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    tenantSlug: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    return () => {
      if (faceStreamRef.current) {
        faceStreamRef.current.getTracks().forEach((track) => track.stop());
        faceStreamRef.current = null;
      }
    };
  }, []);

  // Check for session expiry or error messages
  useEffect(() => {
    if (!searchParams) return;
    
    const reason = searchParams.get('reason') || searchParams.get('expired');
    
    if (reason === 'expired' || reason === 'true') {
      setInfo('Your session has expired. Please sign in again.');
    } else if (reason === 'invalid') {
      setInfo('Please sign in to continue.');
    } else if (reason === 'network') {
      setError('Cannot connect to server. Please check your connection and try again.');
    } else if (searchParams.get('logout') === 'true') {
      setInfo('You have been signed out successfully.');
    }
  }, [searchParams]);

  // Generate QR code with current login URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const currentUrl = window.location.origin + window.location.pathname;
      setLoginUrl(currentUrl);
    }
  }, []);

  // Generate QR code data URL directly using bundled library
  useEffect(() => {
    if (!loginUrl) return;

    QRCode.toDataURL(loginUrl, {
      width: 200,
      margin: 2,
      color: {
        dark: '#1e293b',
        light: '#ffffff',
      },
    })
      .then((dataUrl) => {
        setQrDataUrl(dataUrl);
      })
      .catch((err) => {
        console.error('Failed to generate QR data URL:', err);
      });
  }, [loginUrl]);

  // Also draw to canvas as a fallback when shown
  useEffect(() => {
    if (showQR && loginUrl && qrCanvasRef.current) {
      QRCode.toCanvas(
        qrCanvasRef.current,
        loginUrl,
        {
          width: 200,
          margin: 2,
          color: {
            dark: '#1e293b',
            light: '#ffffff',
          },
        },
        (err) => {
          if (err) console.error('Failed to render canvas QR:', err);
        }
      );
    }
  }, [showQR, loginUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (showFaceScan && !faceScan) {
      setError("Complete the facial scan or upload a photo before signing in.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const response = await authApi.login(
        formData.username.trim(),
        formData.password,
        formData.tenantSlug.trim() || undefined,
        faceScan || undefined,
      );

      if ((response as any)?.user?.mustChangePassword) {
        setMustChangePassword(true);
        setInfo("You must change your password before continuing.");
        setLoading(false);
        return;
      }

      if (onSuccess) {
        onSuccess();
      } else {
        const destination = safeReturnPath(searchParams?.get("next"));
        window.location.href = destination === "/" ? "/operations" : destination;
      }

    } catch (err: any) {
      console.error("Login failed:", err);
      const serverErr = err.response?.data?.error;
      if (serverErr === "facial_verification_required") {
        setShowFaceScan(true);
      }
      setError(
        err.response?.data?.message ||
        err.message ||
        "Invalid username or password"
      );
    } finally {
      setLoading(false);
    }
  };

  // Attach active camera stream to video element when mounted
  useEffect(() => {
    const video = faceVideoRef.current;
    if (!faceCameraActive || !faceStream || !video) {
      setFaceCameraReady(false);
      return;
    }

    video.srcObject = faceStream;

    let isSubscribed = true;
    const handleCanPlay = () => {
      if (isSubscribed) {
        setFaceCameraReady(true);
      }
    };

    video.addEventListener("canplay", handleCanPlay);
    video.play().catch((err) => {
      console.warn("Camera video play interrupted:", err);
      if (isSubscribed) {
        setFaceCameraError("Unable to start video preview. You can upload a photo instead.");
      }
    });

    return () => {
      isSubscribed = false;
      video.removeEventListener("canplay", handleCanPlay);
    };
  }, [faceCameraActive, faceStream]);

  async function startFaceCamera() {
    setFaceCameraError(null);
    setFaceCameraReady(false);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access is not supported or blocked (requires HTTPS or localhost). You can upload a photo below.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      faceStreamRef.current = stream;
      setFaceStream(stream);
      setFaceCameraActive(true);
    } catch (err: any) {
      const msg = err.name === "NotAllowedError" || err.name === "PermissionDeniedError"
        ? "Camera access permission was denied. Please allow camera access in browser settings or upload a photo."
        : (err.message || "Unable to access the camera. Check browser permissions and try again.");
      setFaceCameraError(msg);
      stopFaceCamera();
    }
  }

  function stopFaceCamera() {
    if (faceStreamRef.current) {
      faceStreamRef.current.getTracks().forEach((track) => track.stop());
      faceStreamRef.current = null;
    }
    setFaceStream(null);
    setFaceCameraActive(false);
    setFaceCameraReady(false);
  }

  function captureFaceScan() {
    const video = faceVideoRef.current;
    const canvas = faceCanvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) {
      setFaceCameraError("The camera is still starting. Please wait a moment and try again.");
      return;
    }

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    // Center crop square matching the facial reticle
    const cropSize = Math.min(vw, vh);
    const startX = (vw - cropSize) / 2;
    const startY = (vh - cropSize) / 2;

    const targetSize = Math.min(cropSize, 480);
    canvas.width = targetSize;
    canvas.height = targetSize;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setFaceCameraError("Unable to capture image from camera.");
      return;
    }

    ctx.drawImage(video, startX, startY, cropSize, cropSize, 0, 0, targetSize, targetSize);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.90);
    setFaceScan(dataUrl);
    setFaceCameraError(null);
    stopFaceCamera();
  }

  function handlePhotoFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      setFaceCameraError("Please select a valid JPEG, PNG, or WEBP photo.");
      return;
    }

    if (file.size > 2_000_000) {
      setFaceCameraError("Photo file size must be less than 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setFaceScan(reader.result);
        setFaceCameraError(null);
        stopFaceCamera();
      }
    };
    reader.onerror = () => {
      setFaceCameraError("Failed to read the selected photo file.");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      await authApi.changePassword(
        user.id || 'me',
        formData.password,
        newPassword
      );

      // A password change revokes every old session, including the limited
      // session used to perform this forced update. Establish a fresh session
      // before navigating so the user does not land in an immediate login loop.
      await authApi.login(
        formData.username.trim(),
        newPassword,
        formData.tenantSlug.trim() || undefined,
      );

      setMustChangePassword(false);
      if (onSuccess) {
        onSuccess();
      } else {
        router.push(safeReturnPath(searchParams?.get("next")));
      }
    } catch (err: any) {
      console.error("Password change failed:", err);
      setError(
        err.response?.data?.message ||
        err.message ||
        "Failed to change password"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  if (mustChangePassword) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <div className="login-brand">
              <ShieldCheck size={32} className="brand-icon" />
              <h1>Change Password</h1>
            </div>
            <p className="login-subtitle">
              Please set a new password for your account
            </p>
          </div>

          {error && (
            <div className="login-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {info && (
            <div className="login-info">
              <Info size={16} />
              <span>{info}</span>
            </div>
          )}

          <form onSubmit={handlePasswordChange} className="login-form">
            <div className="form-group">
              <label htmlFor="newPassword">New Password</label>
              <input
                type="password"
                id="newPassword"
                name="newPassword"
                className="login-input"
                style={{ color: "#0f172a", backgroundColor: "#ffffff", caretColor: "#0f172a" }}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                placeholder="Enter new password"
                disabled={loading}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                className="login-input"
                style={{ color: "#0f172a", backgroundColor: "#ffffff", caretColor: "#0f172a" }}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Confirm new password"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              className="login-button"
              disabled={loading}
            >
              {loading ? "Updating..." : "Update Password & Continue"}
            </button>
          </form>
        </div>

        <footer className="login-footer">
          <p>&copy; 2026 OM Systems. All rights reserved.</p>
        </footer>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div style={{ display: "flex", justifyContent: "flex-end", width: "100%", marginBottom: "4px" }}>
            <ThemeSwitcher />
          </div>
          <div className="login-brand">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt={branding.orgName || "Organization Logo"} className="login-org-logo" />
            ) : (
              <ShieldCheck size={32} className="brand-icon" />
            )}
            <h1>{branding.orgName || "KryptonVision"}</h1>
          </div>
          <p className="login-subtitle">
            {branding.tagline || "Sign in to access your security dashboard"}
          </p>
        </div>

        {error && (
          <div className="login-error">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {info && (
          <div className="login-info">
            <Info size={16} />
            <span>{info}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              name="username"
              className="login-input"
              style={{ color: "#0f172a", backgroundColor: "#ffffff", caretColor: "#0f172a" }}
              value={formData.username}
              onChange={handleChange}
              required
              autoComplete="username"
              placeholder="Enter your username"
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="password-input-wrapper">
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                name="password"
                className="login-input"
                style={{ color: "#0f172a", backgroundColor: "#ffffff", caretColor: "#0f172a" }}
                value={formData.password}
                onChange={handleChange}
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                disabled={loading}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="tenantSlug">
              Organization Code{" "}
              <span className="optional-label">(optional)</span>
            </label>
            <input
              type="text"
              id="tenantSlug"
              name="tenantSlug"
              className="login-input"
              style={{ color: "#0f172a", backgroundColor: "#ffffff", caretColor: "#0f172a" }}
              value={formData.tenantSlug}
              onChange={handleChange}
              placeholder="Leave blank if not required"
              disabled={loading}
            />
          </div>

          <div className="face-login-section">
            <div className="face-login-heading">
              <div>
                 <label htmlFor="face-scan-toggle">Facial scan verification</label>
                 <p>Compare a live camera scan with the employee profile captured during enrollment.</p>
              </div>
              <input
                id="face-scan-toggle"
                type="checkbox"
                checked={showFaceScan}
                onChange={(event) => {
                  setShowFaceScan(event.target.checked);
                  if (!event.target.checked) {
                    stopFaceCamera();
                    setFaceScan(null);
                    setFaceCameraError(null);
                  }
                }}
                disabled={loading}
              />
            </div>
            {showFaceScan && (
              <div className="face-login-panel">
                <div className="face-login-preview">
                  {faceCameraActive ? (
                    <div className="face-viewfinder-container">
                      <video
                        ref={faceVideoRef}
                        autoPlay
                        playsInline
                        muted
                        aria-label="Facial scan camera preview"
                      />
                      <div className="face-alignment-reticle">
                        <div className="face-oval-guide" />
                        <span className="face-reticle-label">
                          {faceCameraReady ? "Align face inside oval" : "Starting camera..."}
                        </span>
                      </div>
                    </div>
                  ) : faceScan ? (
                    <div className="face-captured-preview">
                      <img src={faceScan} alt="Facial scan preview" />
                      <div className="face-captured-badge">
                        <CheckCircle2 size={12} />
                        <span>Scan Captured</span>
                      </div>
                    </div>
                  ) : (
                    <div className="face-placeholder">
                      <Camera size={24} />
                      <span>No scan captured</span>
                    </div>
                  )}
                </div>
                <canvas ref={faceCanvasRef} className="hidden" style={{ display: "none" }} />
                {faceCameraError && <p className="face-login-error">{faceCameraError}</p>}
                <div className="face-login-actions">
                  {faceCameraActive ? (
                    <>
                      <button
                        type="button"
                        className="btn-capture-face"
                        onClick={captureFaceScan}
                        disabled={!faceCameraReady}
                      >
                        <Camera size={14} /> Capture face
                      </button>
                      <button
                        type="button"
                        className="btn-cancel-face"
                        onClick={stopFaceCamera}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn-open-camera"
                        onClick={startFaceCamera}
                      >
                        <Camera size={14} /> {faceScan ? "Retake scan" : "Open camera"}
                      </button>
                      <button
                        type="button"
                        className="btn-upload-face"
                        onClick={() => faceFileInputRef.current?.click()}
                      >
                        <Upload size={14} /> Upload photo
                      </button>
                      <input
                        ref={faceFileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        style={{ display: "none" }}
                        onChange={handlePhotoFileUpload}
                      />
                      {faceScan && (
                        <button
                          type="button"
                          className="btn-clear-face"
                          aria-label="Clear facial scan"
                          onClick={() => setFaceScan(null)}
                          title="Clear scan"
                        >
                          <RotateCcw size={14} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="form-actions">
            <label className="remember-me">
              <input type="checkbox" disabled={loading} />
              <span>Remember me</span>
            </label>
            <a href="/forgot-password" className="forgot-password-link">
              Forgot password?
            </a>
          </div>

          <button
            type="submit"
            className="login-button"
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="login-help">
          <p>
            Need help?{" "}
            <a href="/support" className="support-link">
              Contact Support
            </a>
          </p>
        </div>

        <div className="login-qr-section">
          <button
            type="button"
            className="qr-toggle-btn"
            onClick={() => setShowQR(!showQR)}
          >
            <QrCode size={18} />
            {showQR ? "Hide Login QR Code" : "Show Login QR Code"}
          </button>
          
          {showQR && (
            <div className="qr-display">
              <p className="qr-label">Scan to access login page</p>
              <div className="qr-canvas-wrapper" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "200px", padding: "8px" }}>
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="Login QR Code"
                    width={200}
                    height={200}
                    className="qr-image"
                    style={{ borderRadius: "8px", background: "#ffffff", padding: "4px" }}
                  />
                ) : (
                  <canvas ref={qrCanvasRef} width={200} height={200} />
                )}
              </div>
              <p className="qr-url">{loginUrl}</p>
              <small className="qr-note">
                Share this QR code to allow others to access the login page from their mobile devices
              </small>
            </div>
          )}
        </div>
      </div>

      <footer className="login-footer">
        <p>&copy; 2026 OM Systems. All rights reserved.</p>
        <div className="footer-links">
          <a href="/privacy">Privacy Policy</a>
          <span>&bull;</span>
          <a href="/terms">Terms of Service</a>
        </div>
      </footer>
    </div>
  );
}

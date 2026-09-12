"use client";

import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, ShieldCheck, AlertCircle, Info, QrCode, Camera, RotateCcw, Upload, CheckCircle2, Download, Laptop, Smartphone, Check } from "lucide-react";
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
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [activeInstallTab, setActiveInstallTab] = useState<"desktop" | "ios" | "android">("desktop");
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

  // Listen for PWA installation events and detect standalone application mode
  useEffect(() => {
    if (typeof window !== "undefined") {
      const checkStandalone = () => {
        const isStandaloneMode =
          window.matchMedia("(display-mode: standalone)").matches ||
          (window.navigator as any).standalone === true ||
          document.referrer.includes("android-app://");
        setIsStandalone(isStandaloneMode);
        if (isStandaloneMode) setIsInstalled(true);
      };

      checkStandalone();

      const handleBeforeInstallPrompt = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
      };

      const handleAppInstalled = () => {
        setIsInstalled(true);
        setDeferredPrompt(null);
        setShowInstallModal(false);
      };

      window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.addEventListener("appinstalled", handleAppInstalled);

      const ua = navigator.userAgent || "";
      if (/iPhone|iPad|iPod/i.test(ua)) {
        setActiveInstallTab("ios");
      } else if (/Android/i.test(ua)) {
        setActiveInstallTab("android");
      } else {
        setActiveInstallTab("desktop");
      }

      return () => {
        window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
        window.removeEventListener("appinstalled", handleAppInstalled);
      };
    }
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice && choice.outcome === "accepted") {
          setIsInstalled(true);
          setDeferredPrompt(null);
          setShowInstallModal(false);
        }
      } catch (err) {
        console.warn("PWA prompt error:", err);
        setShowInstallModal(true);
      }
    } else {
      setShowInstallModal(true);
    }
  };

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
        if (destination !== "/") {
          window.location.href = destination;
        } else {
          const userObj = (response as any)?.user;
          const allowedMenus = Array.isArray(userObj?.menuAccess) ? userObj.menuAccess : [];
          if (allowedMenus.length > 0 && !allowedMenus.includes("/") && !allowedMenus.includes("/operations")) {
            window.location.href = allowedMenus[0];
          } else {
            window.location.href = "/operations";
          }
        }
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginBottom: "6px" }}>
            {isStandalone ? (
              <span className="pwa-status-badge standalone" title="Running in standalone desktop/mobile app mode">
                <Check size={12} /> App Mode
              </span>
            ) : (
              <button
                type="button"
                onClick={handleInstallClick}
                className="pwa-quick-install-btn"
                title="Install as Desktop or Mobile Application"
              >
                <Download size={13} />
                <span>Install App</span>
              </button>
            )}
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

        {/* PWA Application Installation Banner */}
        <div className="login-install-section">
          <div className="install-banner">
            <div className="install-banner-icon">
              <img src="/icon-192.png" alt="KryptonVision App" className="install-app-icon" />
            </div>
            <div className="install-banner-text">
              <h4>{isStandalone ? "KryptonVision App Active" : "Install KryptonVision Application"}</h4>
              <p>
                {isStandalone
                  ? "You are currently running in standalone application mode."
                  : "Install on Windows, Mac, Android, or iOS as a native standalone app."}
              </p>
            </div>
            {!isStandalone && (
              <button
                type="button"
                onClick={handleInstallClick}
                className="btn-install-pwa"
              >
                <Download size={13} /> Install Now
              </button>
            )}
          </div>
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

      {/* Interactive Install Guide Modal */}
      {showInstallModal && (
        <div className="pwa-modal-overlay" onClick={() => setShowInstallModal(false)}>
          <div className="pwa-modal" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80">
              <div className="flex items-center gap-3">
                <img src="/icon-192.png" alt="KryptonVision" className="w-8 h-8 rounded-lg shadow-sm" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Install KryptonVision Application
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Enterprise Security Command Center
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowInstallModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg font-bold px-2 py-1 rounded-md"
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            {/* Platform Selection Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-950/50 p-1.5 gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setActiveInstallTab("desktop")}
                className={`flex-1 py-1.5 px-2 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  activeInstallTab === "desktop"
                    ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <Laptop size={14} /> Desktop (PC/Mac)
              </button>
              <button
                type="button"
                onClick={() => setActiveInstallTab("ios")}
                className={`flex-1 py-1.5 px-2 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  activeInstallTab === "ios"
                    ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <Smartphone size={14} /> iOS (iPhone)
              </button>
              <button
                type="button"
                onClick={() => setActiveInstallTab("android")}
                className={`flex-1 py-1.5 px-2 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  activeInstallTab === "android"
                    ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <Smartphone size={14} /> Android
              </button>
            </div>

            {/* Tab Instructions Content */}
            <div className="p-5 space-y-4 text-xs">
              {activeInstallTab === "desktop" && (
                <div className="space-y-3">
                  {deferredPrompt && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 rounded-xl flex items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-blue-900 dark:text-blue-200 text-xs">Browser Ready</p>
                        <p className="text-[11px] text-blue-700 dark:text-blue-300">Click to launch the 1-click installer</p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          if (deferredPrompt) {
                            await deferredPrompt.prompt();
                            const res = await deferredPrompt.userChoice;
                            if (res?.outcome === "accepted") {
                              setIsInstalled(true);
                              setDeferredPrompt(null);
                              setShowInstallModal(false);
                            }
                          }
                        }}
                        className="py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs shadow flex items-center gap-1.5 flex-shrink-0"
                      >
                        <Download size={13} /> Install Now
                      </button>
                    </div>
                  )}

                  <div className="space-y-2.5 text-slate-700 dark:text-slate-300">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">How to install on Chrome, Edge, or Brave:</p>
                    <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                      <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 font-bold flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">1</span>
                      <p className="text-[11px] leading-relaxed">
                        Look at the right side of your <strong>browser address bar</strong> at the top.
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                      <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 font-bold flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">2</span>
                      <p className="text-[11px] leading-relaxed">
                        Click the <strong>Install icon (⤓ or ⊕)</strong>, or open the browser menu (<strong>⋮</strong> or <strong>⋯</strong>) and select <strong>&quot;Install KryptonVision&quot;</strong>.
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                      <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 font-bold flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">3</span>
                      <p className="text-[11px] leading-relaxed">
                        Click <strong>Install</strong>. KryptonVision will launch in its own standalone window and add a desktop/start menu shortcut!
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeInstallTab === "ios" && (
                <div className="space-y-3 text-slate-700 dark:text-slate-300">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">How to install on iPhone or iPad:</p>
                  <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 font-bold flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">1</span>
                    <p className="text-[11px] leading-relaxed">
                      Make sure you are opening this page in <strong>Apple Safari</strong>.
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 font-bold flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">2</span>
                    <p className="text-[11px] leading-relaxed">
                      Tap the <strong>Share</strong> button (the square icon with an upward arrow ⎋ at the bottom toolbar).
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 font-bold flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">3</span>
                    <p className="text-[11px] leading-relaxed">
                      Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong> (➕).
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 font-bold flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">4</span>
                    <p className="text-[11px] leading-relaxed">
                      Tap <strong>Add</strong> in the top-right corner. KryptonVision will now appear on your iPhone home screen!
                    </p>
                  </div>
                </div>
              )}

              {activeInstallTab === "android" && (
                <div className="space-y-3 text-slate-700 dark:text-slate-300">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">How to install on Android:</p>
                  <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 font-bold flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">1</span>
                    <p className="text-[11px] leading-relaxed">
                      Tap the <strong>three dots (⋮)</strong> in the top-right corner of Google Chrome.
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 font-bold flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">2</span>
                    <p className="text-[11px] leading-relaxed">
                      Tap <strong>&quot;Install App&quot;</strong> or <strong>&quot;Add to Home screen&quot;</strong>.
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 font-bold flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">3</span>
                    <p className="text-[11px] leading-relaxed">
                      Tap <strong>Install</strong> to add the native app shortcut to your home screen and app drawer.
                    </p>
                  </div>
                </div>
              )}

              {/* Native App Benefits */}
              <div className="p-3 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1.5">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Installed Application Benefits:</p>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Check size={12} className="text-emerald-500 flex-shrink-0" />
                    <span>Clean Standalone Window</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check size={12} className="text-emerald-500 flex-shrink-0" />
                    <span>Fast Desktop / App Launch</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check size={12} className="text-emerald-500 flex-shrink-0" />
                    <span>No Browser Address Bar</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check size={12} className="text-emerald-500 flex-shrink-0" />
                    <span>Direct Camera Access</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end">
              <button
                type="button"
                onClick={() => setShowInstallModal(false)}
                className="py-1.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg text-xs transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

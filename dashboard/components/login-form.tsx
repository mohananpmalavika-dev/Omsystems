"use client";

import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, ShieldCheck, AlertCircle, Info, QrCode } from "lucide-react";
import { authApi } from "@/lib/api-client";
import { resetLocalEdgeAutostart } from "@/lib/local-edge-autostart";
import { useRouter, useSearchParams } from "next/navigation";

interface LoginFormProps {
  onSuccess?: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [showQR, setShowQR] = useState(false);
  const [loginUrl, setLoginUrl] = useState("");
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

  // Generate QR code when URL is set and QR is shown
  useEffect(() => {
    if (!showQR || !loginUrl || !qrCanvasRef.current) return;

    // Load QRCode library dynamically from CDN
    const script = document.getElementById('qrcode-script');
    if (!script) {
      const qrScript = document.createElement('script');
      qrScript.id = 'qrcode-script';
      qrScript.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js';
      qrScript.onload = () => generateQR();
      document.head.appendChild(qrScript);
    } else {
      generateQR();
    }

    function generateQR() {
      if (typeof window !== 'undefined' && (window as any).QRCode && qrCanvasRef.current) {
        (window as any).QRCode.toCanvas(
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
          (error: any) => {
            if (error) console.error('QR generation error:', error);
          }
        );
      }
    }
  }, [showQR, loginUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await authApi.login(
        formData.username,
        formData.password,
        formData.tenantSlug || undefined
      );

      if (response.user.mustChangePassword) {
        setMustChangePassword(true);
        setLoading(false);
        return;
      }

      // Successful login - activity tracking will start automatically via ActivityMonitor
      console.log('[LoginForm] Login successful, redirecting to dashboard');
      resetLocalEdgeAutostart();
      
      if (onSuccess) {
        onSuccess();
      } else {
        router.push("/");
      }
    } catch (err: any) {
      if (err.statusCode === 403) {
        if (err.details?.error === "account_locked") {
          setError(
            "Your account has been locked due to too many failed login attempts. Please try again later or contact support."
          );
        } else if (err.details?.error === "account_suspended") {
          setError(
            "Your account has been suspended. Please contact your administrator."
          );
        } else if (err.details?.error === "account_inactive") {
          setError(
            "Your account is inactive. Please contact your administrator."
          );
        } else {
          setError(err.message || "Access denied");
        }
      } else if (err.statusCode === 429) {
        setError(
          "Too many login attempts. Please wait a few minutes and try again."
        );
      } else {
        setError(err.message || "Invalid username or password");
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      await authApi.changePassword(user.id, formData.password, newPassword);

      // Re-login with new password
      await authApi.login(
        formData.username,
        newPassword,
        formData.tenantSlug || undefined
      );
      resetLocalEdgeAutostart();

      if (onSuccess) {
        onSuccess();
      } else {
        router.push("/");
      }
    } catch (err: any) {
      setError(err.message || "Failed to change password");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
    // Clear error and info when user starts typing
    if (error) setError(null);
    if (info) setInfo(null);
  };

  if (mustChangePassword) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <div className="login-brand">
              <ShieldCheck size={32} className="brand-icon" />
              <h1>Sentinel Grid</h1>
            </div>
            <p className="login-subtitle">Change Your Password</p>
          </div>

          {error && (
            <div className="login-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handlePasswordChange} className="login-form">
            <div className="form-info-banner">
              <AlertCircle size={16} />
              <p>
                For security reasons, you must change your password before
                continuing.
              </p>
            </div>

            <div className="form-group">
              <label htmlFor="newPassword">New Password</label>
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? "text" : "password"}
                  id="newPassword"
                  name="newPassword"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="At least 8 characters"
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
              <label htmlFor="confirmPassword">Confirm New Password</label>
              <input
                type={showPassword ? "text" : "password"}
                id="confirmPassword"
                name="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Re-enter new password"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              className="login-button"
              disabled={loading}
            >
              {loading ? "Changing Password..." : "Change Password"}
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
          <div className="login-brand">
            <ShieldCheck size={32} className="brand-icon" />
            <h1>Sentinel Grid</h1>
          </div>
          <p className="login-subtitle">
            Sign in to access your security dashboard
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
              value={formData.tenantSlug}
              onChange={handleChange}
              placeholder="Leave blank if not required"
              disabled={loading}
            />
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
              <div className="qr-canvas-wrapper">
                <canvas ref={qrCanvasRef} />
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

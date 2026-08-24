"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, Info, RefreshCw, XCircle } from "lucide-react";

interface DiagnosticResult {
  name: string;
  status: "success" | "error" | "warning" | "info";
  message: string;
  details?: string;
}

export default function DiagnosticsPage() {
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [authDebug, setAuthDebug] = useState<any>(null);

  const runDiagnostics = async () => {
    setLoading(true);
    const diagnostics: DiagnosticResult[] = [];

    // 1. Check localStorage for access token
    try {
      const token = localStorage.getItem("accessToken");
      if (token) {
        diagnostics.push({
          name: "Authentication Token",
          status: "success",
          message: "Access token found in localStorage",
          details: `Token length: ${token.length} characters`,
        });
      } else {
        diagnostics.push({
          name: "Authentication Token",
          status: "error",
          message: "No access token found",
          details: "You need to log in to access the video wall",
        });
      }
    } catch (error) {
      diagnostics.push({
        name: "localStorage Access",
        status: "error",
        message: "Cannot access localStorage",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // 2. Check authentication debug endpoint
    try {
      const response = await fetch("/api/live/debug");
      const data = await response.json();
      setAuthDebug(data);

      if (data.authentication?.hasSessionToken) {
        diagnostics.push({
          name: "Session Authentication",
          status: "success",
          message: "Valid session token detected",
          details: `Token source: ${data.authentication.tokenSource}`,
        });
      } else {
        diagnostics.push({
          name: "Session Authentication",
          status: "error",
          message: "No valid session token",
          details: "Backend cannot authenticate your requests",
        });
      }

      if (data.environment.controlPlaneUrl !== "NOT_SET") {
        diagnostics.push({
          name: "Control Plane URL",
          status: "success",
          message: "Control plane URL configured",
          details: data.environment.controlPlaneUrl,
        });
      } else {
        diagnostics.push({
          name: "Control Plane URL",
          status: "error",
          message: "CONTROL_PLANE_URL or CONTROL_PLANE_INTERNAL_URL not configured",
          details: "Backend cannot connect to control plane API",
        });
      }
    } catch (error) {
      diagnostics.push({
        name: "Auth Debug Endpoint",
        status: "error",
        message: "Failed to fetch authentication debug info",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // 3. Test camera API endpoint
    try {
      const token = localStorage.getItem("accessToken");
      const response = await fetch("/api/control/v1/cameras?limit=1", {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}`, "x-sentinel-session": token } : {}),
        },
        credentials: "include",
      });

      if (response.ok) {
        const body = await response.json();
        const cameras = Array.isArray(body.data) ? body.data : Array.isArray(body) ? body : [];
        diagnostics.push({
          name: "Camera API",
          status: "success",
          message: `Camera API accessible`,
          details: `Found ${cameras.length} cameras`,
        });
      } else {
        const body = await response.json().catch(() => ({}));
        diagnostics.push({
          name: "Camera API",
          status: "error",
          message: `Camera API returned HTTP ${response.status}`,
          details: typeof body.error === "string" ? body.error : typeof body.message === "string" ? body.message : "Unknown error",
        });
      }
    } catch (error) {
      diagnostics.push({
        name: "Camera API",
        status: "error",
        message: "Failed to connect to camera API",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // 4. Test live session API
    try {
      const token = localStorage.getItem("accessToken");
      const response = await fetch("/api/live", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}`, "x-sentinel-session": token } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ cameraId: "test-camera-id", profile: "sub" }),
      });

      const body = await response.json();
      
      if (response.status === 404 || body.error === "camera_not_found") {
        diagnostics.push({
          name: "Live Session API",
          status: "warning",
          message: "Live API is accessible but test camera not found",
          details: "This is expected - API is working",
        });
      } else if (response.ok) {
        diagnostics.push({
          name: "Live Session API",
          status: "success",
          message: "Live session API is accessible",
        });
      } else {
        diagnostics.push({
          name: "Live Session API",
          status: "error",
          message: `Live API returned HTTP ${response.status}`,
          details: typeof body.error === "string" ? body.error : "Unknown error",
        });
      }
    } catch (error) {
      diagnostics.push({
        name: "Live Session API",
        status: "error",
        message: "Failed to connect to live session API",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // 5. Check cookies
    try {
      const cookies = document.cookie;
      const hasSentinelCookie = cookies.includes("sentinel_access");
      
      if (hasSentinelCookie) {
        diagnostics.push({
          name: "Authentication Cookies",
          status: "success",
          message: "Sentinel session cookie found",
        });
      } else {
        diagnostics.push({
          name: "Authentication Cookies",
          status: "warning",
          message: "No sentinel session cookie",
          details: "Using localStorage token instead",
        });
      }
    } catch (error) {
      diagnostics.push({
        name: "Cookie Access",
        status: "error",
        message: "Cannot access cookies",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }

    setResults(diagnostics);
    setLoading(false);
  };

  useEffect(() => {
    void runDiagnostics();
  }, []);

  const statusIcon = (status: DiagnosticResult["status"]) => {
    switch (status) {
      case "success":
        return <CheckCircle className="text-green-500" size={20} />;
      case "error":
        return <XCircle className="text-red-500" size={20} />;
      case "warning":
        return <AlertTriangle className="text-yellow-500" size={20} />;
      case "info":
        return <Info className="text-blue-500" size={20} />;
    }
  };

  const hasErrors = results.some((r) => r.status === "error");

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 rounded-lg bg-white p-6 shadow-md">
          <h1 className="mb-2 text-2xl font-bold text-gray-900">System Diagnostics</h1>
          <p className="text-sm text-gray-600">
            Checking live video wall configuration and connectivity
          </p>
        </div>

        <div className="mb-4 flex justify-end">
          <button
            onClick={() => void runDiagnostics()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            {loading ? "Running..." : "Re-run Diagnostics"}
          </button>
        </div>

        <div className="space-y-4">
          {results.map((result, index) => (
            <div
              key={index}
              className={`rounded-lg border bg-white p-4 ${
                result.status === "error"
                  ? "border-red-200"
                  : result.status === "warning"
                    ? "border-yellow-200"
                    : "border-gray-200"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">{statusIcon(result.status)}</div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{result.name}</h3>
                  <p className="mt-1 text-sm text-gray-700">{result.message}</p>
                  {result.details && (
                    <p className="mt-2 text-xs text-gray-500 font-mono bg-gray-50 p-2 rounded">
                      {result.details}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {hasErrors && (
          <div className="mt-8 rounded-lg bg-red-50 border border-red-200 p-6">
            <h2 className="mb-4 text-lg font-bold text-red-900">Common Solutions</h2>
            <ul className="space-y-3 text-sm text-red-800">
              <li className="flex gap-2">
                <span className="font-bold">1.</span>
                <div>
                  <strong>Not logged in:</strong> Navigate to the login page and sign in with valid credentials.
                </div>
              </li>
              <li className="flex gap-2">
                <span className="font-bold">2.</span>
                <div>
                  <strong>Missing environment variables:</strong> Set <code className="bg-red-100 px-1 rounded">CONTROL_PLANE_URL</code> and <code className="bg-red-100 px-1 rounded">MEDIA_GATEWAY_INTERNAL_URL</code> in your Render dashboard.
                </div>
              </li>
              <li className="flex gap-2">
                <span className="font-bold">3.</span>
                <div>
                  <strong>Backend service down:</strong> Check if your control plane backend service is running and accessible.
                </div>
              </li>
              <li className="flex gap-2">
                <span className="font-bold">4.</span>
                <div>
                  <strong>Network issues:</strong> Check browser console (F12) for CORS or network errors.
                </div>
              </li>
            </ul>
          </div>
        )}

        {authDebug && (
          <div className="mt-8 rounded-lg bg-gray-50 p-6">
            <h2 className="mb-4 text-lg font-bold text-gray-900">Authentication Debug Info</h2>
            <pre className="overflow-auto rounded bg-gray-900 p-4 text-xs text-green-400">
              {JSON.stringify(authDebug, null, 2)}
            </pre>
          </div>
        )}

        <div className="mt-8 rounded-lg bg-blue-50 border border-blue-200 p-6">
          <h2 className="mb-2 text-lg font-bold text-blue-900">Next Steps</h2>
          <p className="text-sm text-blue-800">
            If all diagnostics pass but video still doesn't work, check:
          </p>
          <ul className="mt-3 list-disc list-inside space-y-1 text-sm text-blue-800">
            <li>Browser console (F12) for JavaScript errors</li>
            <li>Network tab for failed requests</li>
            <li>Camera status in the control plane</li>
            <li>Media gateway service health</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

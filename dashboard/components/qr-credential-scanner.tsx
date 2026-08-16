"use client";

import { Camera, Upload, X, AlertTriangle, CheckCircle2, Wifi, QrCode, Cpu, ShieldCheck } from "lucide-react";
import jsQR from "jsqr";
import QRCode from "qrcode";
import { useState, useRef, useEffect } from "react";
import { parseQrPayload, type QrPayload } from "@/lib/qr-payload";

interface QRCredentialScannerProps {
  onCredentialsExtracted: (username: string, password: string) => void;
  onDeviceIdentified?: (device: { uid: string; model?: string; productCode?: string; vendor?: string }) => void;
  onClose: () => void;
}

import { cameraInventoryApi } from "@/lib/api-client";
import { Zap } from "lucide-react";

export function QRCredentialScanner({ onCredentialsExtracted, onDeviceIdentified, onClose }: QRCredentialScannerProps) {
  const [tab, setTab] = useState<"scan" | "wifi-pair">("scan");
  const [mode, setMode] = useState<"camera" | "upload" | null>(null);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [scanning, setScanning] = useState(false);
  const [connectingQr, setConnectingQr] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [scanResult, setScanResult] = useState<QrPayload>();
  
  // Wi-Fi pairing generator state
  const [wifiSsid, setWifiSsid] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [wifiQrUrl, setWifiQrUrl] = useState<string | null>(null);
  const [wifiLoading, setWifiLoading] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  async function handleDirectQrConnect() {
    if (!scanResult || scanResult.kind !== "device-uid") return;
    setConnectingQr(true);
    setError(undefined);
    try {
      const res = await cameraInventoryApi.connectViaQr(scanResult.uid);
      setSuccess(`✓ ${res.message}`);
      if (onDeviceIdentified) {
        onDeviceIdentified({
          uid: scanResult.uid,
          model: scanResult.model || "T18061-W",
          productCode: scanResult.productCode || "T18061-BA",
          vendor: "trueview",
        });
      }
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      setError(err.message || "Failed to connect camera via QR");
    } finally {
      setConnectingQr(false);
    }
  }

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (mode !== "camera" || !stream || !video) return;

    video.srcObject = stream;
    void video.play()
      .then(startQRDetection)
      .catch(() => {
        setError("Unable to start the camera preview. Please upload the QR image instead.");
        stopCamera();
      });
  }, [mode, stream]);

  async function startCameraScanning() {
    setMode("camera");
    setError(undefined);
    setSuccess(undefined);
    setScanResult(undefined);
    setScanning(true);

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = mediaStream;
      setStream(mediaStream);
    } catch {
      setError("Unable to access camera. Please check permissions.");
      setScanning(false);
    }
  }

  function stopCamera() {
    if (scanIntervalRef.current !== null) {
      window.clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setStream(null);
    }
    setScanning(false);
  }

  function startQRDetection() {
    if (!videoRef.current || !canvasRef.current) return;

    scanIntervalRef.current = window.setInterval(() => {
      if (!videoRef.current || !canvasRef.current) return;

      const canvas = canvasRef.current;
      const video = videoRef.current;
      const context = canvas.getContext("2d");

      if (!context || video.readyState !== video.HAVE_ENOUGH_DATA) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = detectQRCode(imageData);

      if (code) {
        handleQRCodeDetected(code);
      }
    }, 500);
  }

  function detectQRCode(imageData: ImageData): string | null {
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "attemptBoth",
    });
    return code?.data ?? null;
  }

  function handleQRCodeDetected(qrData: string) {
    stopCamera();
    const result = parseQrPayload(qrData);
    setMode(null);

    if (result.kind === "credentials") {
      setSuccess("QR code decoded. Filling in the camera credentials…");
      window.setTimeout(() => onCredentialsExtracted(result.username, result.password), 250);
      return;
    }

    if (result.kind === "device-uid") {
      setScanResult(result);
      setSuccess(`Recognized Device UID: ${result.uid}`);
      if (onDeviceIdentified) {
        onDeviceIdentified({
          uid: result.uid,
          model: result.model || "T18061-W",
          productCode: result.productCode || "T18061-BA",
          vendor: "trueview",
        });
      }
      return;
    }

    if (result.kind === "truecloud-share") {
      setScanResult(result);
      return;
    }

    setError("This QR code format was not recognized. You can enter the device details manually.");
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setMode("upload");
    setError(undefined);
    setSuccess(undefined);
    setScanResult(undefined);
    setScanning(true);

    try {
      const imageData = await readImageFile(file);
      const code = detectQRCode(imageData);

      if (code) {
        handleQRCodeDetected(code);
      } else {
        setError("Could not decode QR code from image. Please ensure the image is clear and the QR code is visible.");
        setScanning(false);
      }
    } catch {
      setError("Could not read QR code from image. Please ensure the image is clear and the QR code is visible.");
    } finally {
      setScanning(false);
    }
  }

  async function generateWifiPairingQr(e: React.FormEvent) {
    e.preventDefault();
    if (!wifiSsid.trim()) return;

    setWifiLoading(true);
    try {
      // Standard SmartConfig / Tuya / TrueCloud Wi-Fi pairing payload
      const wifiPayload = JSON.stringify({
        s: wifiSsid.trim(),
        p: wifiPassword,
        t: "WPA2",
      });

      const dataUrl = await QRCode.toDataURL(wifiPayload, {
        width: 260,
        margin: 2,
        color: { dark: "#0f172a", light: "#ffffff" },
      });

      setWifiQrUrl(dataUrl);
    } catch (err: any) {
      setError("Failed to generate Wi-Fi QR code");
    } finally {
      setWifiLoading(false);
    }
  }

  async function readImageFile(file: File): Promise<ImageData> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          if (!canvasRef.current) {
            reject(new Error("Canvas not available"));
            return;
          }

          const canvas = canvasRef.current;
          const context = canvas.getContext("2d");
          if (!context) {
            reject(new Error("Canvas context not available"));
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          context.drawImage(img, 0, 0);
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          resolve(imageData);
        };
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }

  return (
    <div className="qr-scanner-overlay">
      <div className="qr-scanner-container">
        <div className="modal-header">
          <div>
            <h3>Connect Camera via QR Code</h3>
            <p className="text-xs text-slate-500">Scan camera body sticker, or generate a pairing QR for the camera lens</p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex border-b border-slate-200 dark:border-slate-800 px-6 pt-2 gap-4">
          <button
            type="button"
            onClick={() => setTab("scan")}
            className={`pb-2 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-all ${
              tab === "scan"
                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <QrCode size={14} /> Scan Camera QR / UID
          </button>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              setMode(null);
              setTab("wifi-pair");
            }}
            className={`pb-2 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-all ${
              tab === "wifi-pair"
                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <Wifi size={14} /> Wi-Fi Pairing (Lens Scan)
          </button>
        </div>

        <div className="qr-scanner-content">
          {error && (
            <div className="device-message error">
              <AlertTriangle size={16} />
              {error}
            </div>
          )}

          {success && (
            <div className="device-message success">
              <CheckCircle2 size={16} />
              {success}
            </div>
          )}

          {tab === "scan" && scanResult?.kind === "device-uid" && (
            <div className="device-uid-result p-4 rounded-xl border border-blue-500/30 bg-blue-500/10 mb-4 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck size={20} className="text-blue-500" />
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Camera Recognized: Trueview Robot Pan-Tilt ({scanResult.model || "T18061-W"})
                </h4>
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                <div><strong>Scanned UID:</strong> <code className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-blue-600 dark:text-blue-400 font-mono">{scanResult.uid}</code></div>
                <div><strong>Product Code:</strong> {scanResult.productCode || "T18061-BA (3MP Wi-Fi Robot)"}</div>
                <div><strong>Streaming Protocol:</strong> RTSP (Port 554) • Happytime RTSP Server</div>
                <div><strong>Recommended Stream URL:</strong> <code className="text-[11px] bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">rtsp://admin:&lt;PASSWORD&gt;@&lt;IP&gt;:554/stream1</code></div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2 items-center">
                <button
                  type="button"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-md transition-all flex items-center gap-1.5"
                  disabled={connectingQr}
                  onClick={handleDirectQrConnect}
                >
                  <Zap size={14} /> {connectingQr ? "Connecting via QR..." : "Connect Camera via QR (1-Click)"}
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
                  onClick={() => {
                    if (onDeviceIdentified) {
                      onDeviceIdentified({
                        uid: scanResult.uid,
                        model: scanResult.model || "T18061-W",
                        productCode: scanResult.productCode || "T18061-BA",
                        vendor: "trueview",
                      });
                    }
                    onClose();
                  }}
                >
                  Apply &amp; Auto-Fill Form
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-medium transition-all"
                  onClick={() => setScanResult(undefined)}
                >
                  Scan Another
                </button>
              </div>
            </div>
          )}

          {tab === "scan" && scanResult?.kind === "truecloud-share" && (
            <div className="truecloud-result">
              <h4>TrueCloud device-sharing QR code detected</h4>
              <p>
                This code shares a device through the TrueCloud service. It does not contain an ONVIF or RTSP address, or a camera login.
              </p>
              <p>
                {scanResult.expired
                  ? "This share code has expired. Generate a new QR code in TrueCloud and scan it there before returning here."
                  : `Claim this code in the authenticated TrueCloud app${scanResult.expiresAt ? ` before ${scanResult.expiresAt.toLocaleString()}` : ""}.`}
              </p>
              <p>
                To add the camera to Sentinel Grid, enable ONVIF or RTSP on the camera's local network, then enter its private IP address and device credentials in this form.
              </p>
              <button type="button" className="secondary-button" onClick={() => setScanResult(undefined)}>
                Scan another QR code
              </button>
            </div>
          )}

          {tab === "scan" && !mode && !scanResult && (
            <div className="qr-scanner-options">
              <p className="qr-scanner-description">
                Scan the QR code sticker on the camera body or upload a photo to auto-detect model and parameters:
              </p>
              <div className="qr-scanner-buttons">
                <button
                  type="button"
                  className="qr-option-button"
                  onClick={startCameraScanning}
                >
                  <Camera size={24} />
                  <span>Scan QR Code</span>
                  <small>Use webcam or phone camera</small>
                </button>
                <button
                  type="button"
                  className="qr-option-button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={24} />
                  <span>Upload Photo of QR</span>
                  <small>Select camera sticker image</small>
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                style={{ display: "none" }}
              />
            </div>
          )}

          {tab === "scan" && mode === "camera" && (
            <div className="qr-camera-view">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="qr-video-preview"
              />
              <div className="qr-camera-overlay">
                <div className="qr-scan-frame" />
                <p>{scanning ? "Position QR code within frame" : "Initializing camera..."}</p>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  stopCamera();
                  setMode(null);
                }}
              >
                Cancel
              </button>
            </div>
          )}

          {tab === "scan" && mode === "upload" && scanning && (
            <div className="qr-upload-processing">
              <div className="loading-spinner" />
              <p>Processing image...</p>
            </div>
          )}

          {tab === "wifi-pair" && (
            <div className="wifi-pairing-pane space-y-4">
              <div className="text-xs text-slate-600 dark:text-slate-300">
                Generate a Smart Wi-Fi Pairing QR code. Point your camera lens at the screen (15–20 cm away) to connect it to your Wi-Fi network automatically.
              </div>
              <form onSubmit={generateWifiPairingQr} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Wi-Fi Network Name (SSID)</label>
                  <input
                    type="text"
                    required
                    value={wifiSsid}
                    onChange={(e) => setWifiSsid(e.target.value)}
                    placeholder="e.g. MyHome_WiFi_2.4G"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
                  />
                  <small className="text-[10px] text-slate-500">Note: Trueview/Tuya Wi-Fi cameras connect to 2.4GHz Wi-Fi.</small>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Wi-Fi Password</label>
                  <input
                    type="password"
                    value={wifiPassword}
                    onChange={(e) => setWifiPassword(e.target.value)}
                    placeholder="Enter Wi-Fi password"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>
                <button
                  type="submit"
                  disabled={wifiLoading || !wifiSsid.trim()}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-all shadow-sm flex items-center justify-center gap-1.5"
                >
                  <QrCode size={14} /> Generate Wi-Fi Pairing QR
                </button>
              </form>

              {wifiQrUrl && (
                <div className="mt-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-center flex flex-col items-center gap-2">
                  <div className="p-3 bg-white rounded-xl shadow-md border border-slate-200">
                    <img src={wifiQrUrl} alt="Wi-Fi Pairing QR" width={220} height={220} className="rounded-lg" />
                  </div>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Point camera lens at this QR code from 15–20 cm away
                  </p>
                  <small className="text-[11px] text-slate-500">
                    When the camera beeps and says "Connecting to Wi-Fi", it will join your network and acquire an IP address.
                  </small>
                </div>
              )}
            </div>
          )}

          <canvas ref={canvasRef} style={{ display: "none" }} />

          <div className="qr-scanner-help">
            <h4>Tips for best results:</h4>
            <ul>
              <li>Ensure the QR code is well-lit and in focus</li>
              <li>Hold the camera steady for 2-3 seconds</li>
              <li>For uploads, use a clear photo without glare</li>
              <li>Use only QR codes from a camera you own or are authorized to manage</li>
              <li>TrueCloud sharing codes must be claimed in the TrueCloud app before local camera setup</li>
            </ul>
          </div>
        </div>
      </div>

      <style jsx>{`
        .qr-scanner-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .qr-scanner-container {
          background: white;
          border-radius: 8px;
          max-width: 600px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
        }

        .qr-scanner-content {
          padding: 1.5rem;
        }

        .qr-scanner-options {
          text-align: center;
        }

        .qr-scanner-description {
          margin-bottom: 2rem;
          color: #64748b;
        }

        .qr-scanner-buttons {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          margin-bottom: 2rem;
        }

        .qr-option-button {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          padding: 2rem 1rem;
          border: 2px solid #e2e8f0;
          border-radius: 8px;
          background: white;
          cursor: pointer;
          transition: all 0.2s;
        }

        .qr-option-button:hover {
          border-color: #3b82f6;
          background: #f8fafc;
          transform: translateY(-2px);
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .qr-option-button span {
          font-weight: 600;
          color: #1e293b;
        }

        .qr-option-button small {
          font-size: 0.875rem;
          color: #64748b;
        }

        .qr-camera-view {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
        }

        .qr-video-preview {
          width: 100%;
          max-width: 500px;
          border-radius: 8px;
          background: #000;
        }

        .qr-camera-overlay {
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 100%;
          max-width: 500px;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }

        .qr-scan-frame {
          width: 250px;
          height: 250px;
          border: 3px solid #3b82f6;
          border-radius: 8px;
          box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
        }

        .qr-camera-overlay p {
          margin-top: 1rem;
          color: white;
          background: rgba(0, 0, 0, 0.7);
          padding: 0.5rem 1rem;
          border-radius: 4px;
          font-size: 0.875rem;
        }

        .qr-upload-processing {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          padding: 3rem;
        }

        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #e2e8f0;
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .qr-scanner-help {
          margin-top: 2rem;
          padding: 1rem;
          background: #f8fafc;
          border-radius: 8px;
        }

        .qr-scanner-help h4 {
          margin: 0 0 0.5rem;
          font-size: 0.875rem;
          font-weight: 600;
          color: #1e293b;
        }

        .qr-scanner-help ul {
          margin: 0;
          padding-left: 1.5rem;
          font-size: 0.875rem;
          color: #64748b;
        }

        .qr-scanner-help li {
          margin: 0.25rem 0;
        }

        .truecloud-result {
          margin-bottom: 1.5rem;
          padding: 1rem;
          border: 1px solid #bfdbfe;
          border-radius: 8px;
          background: #eff6ff;
          color: #1e3a8a;
          font-size: 0.875rem;
          line-height: 1.5;
        }

        .truecloud-result h4 {
          margin: 0 0 0.5rem;
          font-size: 1rem;
        }

        .truecloud-result p {
          margin: 0.5rem 0;
        }

        @media (max-width: 640px) {
          .qr-scanner-buttons {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

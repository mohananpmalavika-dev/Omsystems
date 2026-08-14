"use client";

import { Camera, Upload, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface QRCredentialScannerProps {
  onCredentialsExtracted: (username: string, password: string) => void;
  onClose: () => void;
}

interface DecodedCredentials {
  username?: string;
  password?: string;
  user?: string;
  pwd?: string;
  id?: string;
  ip?: string;
}

export function QRCredentialScanner({ onCredentialsExtracted, onClose }: QRCredentialScannerProps) {
  const [mode, setMode] = useState<"camera" | "upload" | null>(null);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [scanning, setScanning] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scanIntervalRef = useRef<number>();

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  async function startCameraScanning() {
    setMode("camera");
    setError(undefined);
    setSuccess(undefined);
    setScanning(true);

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
        startQRDetection();
      }
    } catch (err) {
      setError("Unable to access camera. Please check permissions.");
      setScanning(false);
    }
  }

  function stopCamera() {
    if (scanIntervalRef.current) {
      window.clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = undefined;
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
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
    // Use jsQR library if available
    if (typeof window !== "undefined" && "jsQR" in window) {
      const jsQR = (window as any).jsQR;
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });
      return code?.data ?? null;
    }
    return null;
  }

  function handleQRCodeDetected(qrData: string) {
    stopCamera();
    setSuccess("QR code detected! Extracting credentials...");

    try {
      const credentials = parseCredentials(qrData);
      if (credentials.username && credentials.password) {
        setTimeout(() => {
          onCredentialsExtracted(credentials.username!, credentials.password!);
        }, 500);
      } else {
        setError("QR code found, but no credentials detected. Please try uploading the image instead or enter credentials manually.");
      }
    } catch (err) {
      setError("Could not parse QR code data. Please try again or enter credentials manually.");
    }
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setMode("upload");
    setError(undefined);
    setSuccess(undefined);
    setScanning(true);

    try {
      const imageData = await readImageFile(file);
      const code = detectQRCode(imageData);

      if (code) {
        handleQRCodeDetected(code);
      } else {
        // Try using server-side decoding as fallback
        await tryServerSideDecoding(file);
      }
    } catch (err) {
      setError("Could not read QR code from image. Please ensure the image is clear and the QR code is visible.");
    } finally {
      setScanning(false);
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

  async function tryServerSideDecoding(file: File) {
    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch("/api/decode-qr", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Server decoding failed");
      }

      const data = await response.json();
      if (data.qrData) {
        handleQRCodeDetected(data.qrData);
      } else {
        throw new Error("No QR code found in image");
      }
    } catch (err) {
      setError("Could not decode QR code. Please ensure the image contains a valid QR code.");
      setScanning(false);
    }
  }

  function parseCredentials(qrData: string): DecodedCredentials {
    const credentials: DecodedCredentials = {};

    // Try JSON format
    try {
      const json = JSON.parse(qrData);
      credentials.username = json.user || json.username || json.USER || json.USERNAME;
      credentials.password = json.pwd || json.password || json.PWD || json.PASSWORD;
      return credentials;
    } catch (e) {
      // Not JSON, continue with other formats
    }

    // Try key-value format (ID:xxx;USER:xxx;PWD:xxx)
    if (qrData.includes(";") && qrData.includes(":")) {
      const pairs = qrData.split(";");
      pairs.forEach((pair) => {
        const [key, value] = pair.split(":");
        if (key && value) {
          const upperKey = key.trim().toUpperCase();
          if (upperKey === "USER" || upperKey === "USERNAME") {
            credentials.username = value.trim();
          } else if (upperKey === "PWD" || upperKey === "PASSWORD" || upperKey === "PASS") {
            credentials.password = value.trim();
          }
        }
      });
      return credentials;
    }

    // Try URL format
    if (qrData.startsWith("http") || qrData.includes("://")) {
      try {
        const url = new URL(qrData);
        credentials.username = url.searchParams.get("user") || url.searchParams.get("username") || undefined;
        credentials.password = url.searchParams.get("pwd") || url.searchParams.get("password") || undefined;
        if (credentials.username || credentials.password) {
          return credentials;
        }
      } catch (e) {
        // Not a valid URL
      }
    }

    // Try comma-separated format (deviceId,username,password,...)
    if (qrData.includes(",")) {
      const parts = qrData.split(",");
      if (parts.length >= 3) {
        credentials.username = parts[1]?.trim();
        credentials.password = parts[2]?.trim();
        return credentials;
      }
    }

    return credentials;
  }

  return (
    <div className="qr-scanner-overlay">
      <div className="qr-scanner-container">
        <div className="modal-header">
          <h3>Scan or Upload QR Code</h3>
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

          {!mode && (
            <div className="qr-scanner-options">
              <p className="qr-scanner-description">
                Choose how you want to extract camera credentials from the QR code:
              </p>
              <div className="qr-scanner-buttons">
                <button
                  type="button"
                  className="qr-option-button"
                  onClick={startCameraScanning}
                >
                  <Camera size={24} />
                  <span>Scan QR Code</span>
                  <small>Use your device camera to scan</small>
                </button>
                <button
                  type="button"
                  className="qr-option-button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={24} />
                  <span>Upload QR Image</span>
                  <small>Select a saved QR code image</small>
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

          {mode === "camera" && (
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

          {mode === "upload" && scanning && (
            <div className="qr-upload-processing">
              <div className="loading-spinner" />
              <p>Processing image...</p>
            </div>
          )}

          <canvas ref={canvasRef} style={{ display: "none" }} />

          <div className="qr-scanner-help">
            <h4>Tips for best results:</h4>
            <ul>
              <li>Ensure the QR code is well-lit and in focus</li>
              <li>Hold the camera steady for 2-3 seconds</li>
              <li>For uploads, use a clear photo without glare</li>
              <li>Common default credentials: admin/admin, admin/12345</li>
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

        @media (max-width: 640px) {
          .qr-scanner-buttons {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

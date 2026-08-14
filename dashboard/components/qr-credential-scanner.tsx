"use client";

import { Camera, Upload, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import jsQR from "jsqr";
import { useState, useRef, useEffect } from "react";
import { parseQrPayload, type QrPayload } from "@/lib/qr-payload";

interface QRCredentialScannerProps {
  onCredentialsExtracted: (username: string, password: string) => void;
  onClose: () => void;
}

export function QRCredentialScanner({ onCredentialsExtracted, onClose }: QRCredentialScannerProps) {
  const [mode, setMode] = useState<"camera" | "upload" | null>(null);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [scanning, setScanning] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [scanResult, setScanResult] = useState<QrPayload>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

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

    if (result.kind === "truecloud-share") {
      setScanResult(result);
      return;
    }

    setError("This QR code does not include usable camera credentials. Enter the local ONVIF or RTSP login manually.");
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

          {scanResult?.kind === "truecloud-share" && (
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

          {!mode && !scanResult && (
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

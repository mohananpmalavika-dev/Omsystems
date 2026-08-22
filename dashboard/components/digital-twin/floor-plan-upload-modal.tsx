'use client';

/**
 * Floor Plan Upload Modal
 * Handles floor plan file upload with scale and transformation settings
 */

import { useState, useRef } from 'react';
import { X, Upload, FileImage } from 'lucide-react';

interface FloorPlanUploadModalProps {
  floorId: string;
  onClose: () => void;
  onUploaded: () => void;
}

export default function FloorPlanUploadModal({
  floorId,
  onClose,
  onUploaded,
}: FloorPlanUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [scaleMetersPerPixel, setScaleMetersPerPixel] = useState<string>('0.01');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      
      // Generate preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreview(e.target?.result as string);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('floorId', floorId);
      formData.append('fileType', file.name.split('.').pop() || 'png');
      formData.append('scaleMetersPerPixel', scaleMetersPerPixel);
      formData.append('originX', '0');
      formData.append('originY', '0');
      formData.append('rotationDegrees', '0');

      const response = await fetch('/api/digital-twin/floor-plans', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        onUploaded();
      } else {
        const error = await response.json();
        alert(`Upload failed: ${error.error}`);
      }
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold text-gray-900">Upload Floor Plan</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Floor Plan File
            </label>
            {!preview ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-300 rounded-lg p-12 hover:border-blue-600 transition-colors"
              >
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 mb-2">Click to upload floor plan</p>
                <p className="text-sm text-gray-500">PNG, JPG, SVG, or PDF up to 50MB</p>
              </button>
            ) : (
              <div className="relative">
                <img
                  src={preview}
                  alt="Floor plan preview"
                  className="w-full rounded-lg border-2 border-gray-300"
                />
                <button
                  onClick={() => {
                    setFile(null);
                    setPreview(null);
                  }}
                  className="absolute top-2 right-2 p-2 bg-white rounded-lg shadow-lg hover:bg-gray-100"
                >
                  <X className="w-5 h-5" />
                </button>
                <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                  <FileImage className="w-4 h-4" />
                  <span>{file?.name}</span>
                  <span className="text-gray-400">
                    ({(file!.size / 1024 / 1024).toFixed(2)} MB)
                  </span>
                </div>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,application/pdf"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Scale Settings */}
          {file && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Scale (meters per pixel)
              </label>
              <input
                type="number"
                step="0.001"
                value={scaleMetersPerPixel}
                onChange={(e) => setScaleMetersPerPixel(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="0.01"
              />
              <p className="mt-2 text-sm text-gray-600">
                Typical values: 0.01 for architectural plans, 0.05 for rough sketches
              </p>
            </div>
          )}

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">Tips for Best Results</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Use high-resolution images (at least 2000px wide)</li>
              <li>• Ensure the floor plan shows clear walls and rooms</li>
              <li>• PNG or SVG formats work best for clarity</li>
              <li>• You can adjust scale and rotation after upload</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}

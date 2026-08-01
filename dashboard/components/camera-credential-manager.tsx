"use client";

import { useState } from "react";
import { Key, Loader2, Check, X, Eye, EyeOff, AlertCircle, Camera } from "lucide-react";

interface CameraCredentialManagerProps {
  branchId: string;
  edgeAgentId?: string;
  onCredentialsUpdated?: () => void;
}

interface TestResult {
  ip: string;
  success: boolean;
  message: string;
}

export function CameraCredentialManager({ 
  branchId, 
  edgeAgentId,
  onCredentialsUpdated 
}: CameraCredentialManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'input' | 'testing' | 'results'>('input');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [testMode, setTestMode] = useState<'single' | 'auto'>('auto');
  const [testIP, setTestIP] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [updating, setUpdating] = useState(false);

  const commonPasswords = [
    { label: 'Empty (no password)', value: '' },
    { label: 'admin', value: 'admin' },
    { label: '12345', value: '12345' },
    { label: '123456', value: '123456' },
    { label: '888888', value: '888888' },
  ];

  const handleTestCredentials = async () => {
    if (!edgeAgentId) {
      alert('No edge agent configured for this branch');
      return;
    }

    setTesting(true);
    setStep('testing');
    setTestResults([]);

    try {
      if (testMode === 'single' && testIP) {
        // Test single camera
        const response = await fetch('/api/edge-agents/test-camera-credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            edgeAgentId,
            cameraIP: testIP,
            username,
            password,
          }),
        });

        const result = await response.json();
        setTestResults([{
          ip: testIP,
          success: result.success,
          message: result.message || (result.success ? 'Authentication successful' : 'Authentication failed'),
        }]);
      } else {
        // Auto-test with common passwords
        const results: TestResult[] = [];
        
        for (const pwd of commonPasswords) {
          const response = await fetch('/api/edge-agents/test-camera-credentials', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              edgeAgentId,
              cameraIP: testIP || undefined, // Will test all discovered cameras if empty
              username,
              password: pwd.value,
            }),
          });

          const result = await response.json();
          
          if (result.success) {
            setPassword(pwd.value);
            results.push({
              ip: testIP || 'all cameras',
              success: true,
              message: `Success with password: ${pwd.label}`,
            });
            break;
          } else {
            results.push({
              ip: testIP || 'all cameras',
              success: false,
              message: `Failed with password: ${pwd.label}`,
            });
          }
        }
        
        setTestResults(results);
      }
      
      setStep('results');
    } catch (error) {
      console.error('Test failed:', error);
      setTestResults([{
        ip: testIP || 'unknown',
        success: false,
        message: 'Test failed: ' + (error instanceof Error ? error.message : String(error)),
      }]);
      setStep('results');
    } finally {
      setTesting(false);
    }
  };

  const handleUpdateCredentials = async () => {
    if (!edgeAgentId) {
      alert('No edge agent configured');
      return;
    }

    if (!username || username.trim() === '') {
      alert('Please enter a username');
      return;
    }

    setUpdating(true);

    try {
      const response = await fetch('/api/edge-agents/update-camera-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          edgeAgentId,
          username,
          password,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update credentials');
      }

      const result = await response.json();
      
      alert('Camera credentials updated successfully!\n\nThe edge agent will restart and reconnect to cameras within 1 minute.');
      setIsOpen(false);
      setStep('input');
      
      if (onCredentialsUpdated) {
        onCredentialsUpdated();
      }
    } catch (error) {
      console.error('Update failed:', error);
      alert('Failed to update credentials: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setUpdating(false);
    }
  };

  const successfulTest = testResults.find(r => r.success);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        <Key size={18} />
        <span>Update Camera Credentials</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 rounded-t-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Camera size={24} />
                  <h2 className="text-2xl font-bold">Camera Credential Manager</h2>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <p className="text-blue-100 mt-2">
                Update camera login credentials for all cameras on this branch
              </p>
            </div>

            <div className="p-6">
              {step === 'input' && (
                <div className="space-y-6">
                  {/* Username Input */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Camera Username
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="admin"
                    />
                    <p className="text-sm text-gray-500 mt-1">Usually "admin" for most cameras</p>
                  </div>

                  {/* Password Input */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Camera Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Enter password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      >
                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                      </button>
                    </div>
                  </div>

                  {/* Quick Password Buttons */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Common Passwords (click to use)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {commonPasswords.map((pwd) => (
                        <button
                          key={pwd.value}
                          onClick={() => setPassword(pwd.value)}
                          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm transition-colors"
                        >
                          {pwd.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Test Mode Selection */}
                  <div className="border-t pt-6">
                    <label className="block text-sm font-semibold text-gray-700 mb-3">
                      Test Before Applying (Optional)
                    </label>
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="radio"
                          checked={testMode === 'auto'}
                          onChange={() => setTestMode('auto')}
                          className="w-4 h-4"
                        />
                        <div>
                          <div className="font-medium">Auto-test common passwords</div>
                          <div className="text-sm text-gray-500">Automatically try common passwords</div>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="radio"
                          checked={testMode === 'single'}
                          onChange={() => setTestMode('single')}
                          className="w-4 h-4"
                        />
                        <div>
                          <div className="font-medium">Test specific camera</div>
                          <div className="text-sm text-gray-500">Test credentials on one camera first</div>
                        </div>
                      </label>
                    </div>

                    {testMode === 'single' && (
                      <input
                        type="text"
                        value={testIP}
                        onChange={(e) => setTestIP(e.target.value)}
                        className="mt-3 w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., 192.168.29.171"
                      />
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={handleTestCredentials}
                      disabled={testing || !username}
                      className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {testing ? (
                        <>
                          <Loader2 size={18} className="animate-spin" />
                          <span>Testing...</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle size={18} />
                          <span>Test Credentials</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleUpdateCredentials}
                      disabled={updating || !username}
                      className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {updating ? (
                        <>
                          <Loader2 size={18} className="animate-spin" />
                          <span>Updating...</span>
                        </>
                      ) : (
                        <>
                          <Check size={18} />
                          <span>Apply Credentials</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {step === 'testing' && (
                <div className="text-center py-12">
                  <Loader2 size={48} className="animate-spin mx-auto mb-4 text-blue-600" />
                  <p className="text-lg font-medium text-gray-700">Testing credentials...</p>
                  <p className="text-sm text-gray-500 mt-2">This may take a few moments</p>
                </div>
              )}

              {step === 'results' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-bold text-gray-800">Test Results</h3>
                  
                  <div className="space-y-2">
                    {testResults.map((result, index) => (
                      <div
                        key={index}
                        className={`flex items-start gap-3 p-4 rounded-lg ${
                          result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                        }`}
                      >
                        {result.success ? (
                          <Check size={20} className="text-green-600 mt-0.5 flex-shrink-0" />
                        ) : (
                          <X size={20} className="text-red-600 mt-0.5 flex-shrink-0" />
                        )}
                        <div className="flex-1">
                          <div className="font-medium">{result.ip}</div>
                          <div className="text-sm text-gray-600">{result.message}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {successfulTest && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle size={20} className="text-blue-600 mt-0.5" />
                        <div>
                          <p className="font-medium text-blue-900">Password Found!</p>
                          <p className="text-sm text-blue-700 mt-1">
                            Username: <span className="font-mono">{username}</span><br />
                            Password: <span className="font-mono">{password || '(empty)'}</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={() => setStep('input')}
                      className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                    >
                      Try Different Password
                    </button>
                    {successfulTest && (
                      <button
                        onClick={handleUpdateCredentials}
                        disabled={updating}
                        className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {updating ? (
                          <>
                            <Loader2 size={18} className="animate-spin" />
                            <span>Updating...</span>
                          </>
                        ) : (
                          <>
                            <Check size={18} />
                            <span>Apply This Password</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

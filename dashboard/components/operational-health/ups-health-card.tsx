/**
 * UPS Health Card Component
 * Displays UPS power status and battery metrics
 */

import { Battery, Zap, AlertTriangle } from "lucide-react";
import { UPSHealth, getTimeAgo } from "@/lib/types/operational-health";

interface UPSHealthCardProps {
  ups: UPSHealth;
}

export function UPSHealthCard({ ups }: UPSHealthCardProps) {
  const getBatteryColor = (percent: number) => {
    if (percent >= 80) return 'text-green-600';
    if (percent >= 30) return 'text-amber-600';
    return 'text-red-600';
  };

  const getBatteryBg = (percent: number) => {
    if (percent >= 80) return 'bg-green-500';
    if (percent >= 30) return 'bg-amber-500';
    return 'bg-red-500';
  };

  const showWarning = !ups.utilityPowerAvailable || 
                      ups.runningOnBattery || 
                      ups.batteryPercent < 30 ||
                      ups.batteryAgeMonths > 36;

  return (
    <div className="card hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${
            ups.utilityPowerAvailable ? 'bg-green-100' : 'bg-red-100'
          }`}>
            <Battery size={20} className={
              ups.utilityPowerAvailable ? 'text-green-600' : 'text-red-600'
            } />
          </div>
          <div>
            <h4 className="font-semibold text-gray-900">{ups.branchName}</h4>
            <p className="text-xs text-gray-500">{ups.branchCode}</p>
          </div>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
          ups.upsStatus === 'online' 
            ? 'bg-green-100 text-green-700'
            : ups.upsStatus === 'on_battery'
            ? 'bg-amber-100 text-amber-700'
            : 'bg-red-100 text-red-700'
        }`}>
          {ups.upsStatus.replace('_', ' ')}
        </span>
      </div>

      {showWarning && (
        <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-amber-700">
              {!ups.utilityPowerAvailable && <p>Utility power unavailable</p>}
              {ups.runningOnBattery && (
                <p>Running on battery: {ups.estimatedRuntimeMinutes} min remaining</p>
              )}
              {ups.batteryPercent < 30 && <p>Battery low: {ups.batteryPercent}%</p>}
              {ups.batteryAgeMonths > 36 && (
                <p>Battery replacement due ({ups.batteryAgeMonths} months old)</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Battery Level */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-gray-600">Battery Level</span>
          <span className={`font-medium ${getBatteryColor(ups.batteryPercent)}`}>
            {ups.batteryPercent.toFixed(0)}%
          </span>
        </div>
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full ${getBatteryBg(ups.batteryPercent)} transition-all`}
            style={{ width: `${Math.min(ups.batteryPercent, 100)}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-gray-500 mb-1">Utility Power</p>
          <p className="font-medium flex items-center gap-1">
            <Zap size={12} className={ups.utilityPowerAvailable ? 'text-green-600' : 'text-red-600'} />
            {ups.utilityPowerAvailable ? 'Available' : 'Unavailable'}
          </p>
        </div>
        <div>
          <p className="text-gray-500 mb-1">Runtime</p>
          <p className="font-medium">{ups.estimatedRuntimeMinutes} min</p>
        </div>
        <div>
          <p className="text-gray-500 mb-1">Load</p>
          <p className="font-medium">{ups.loadPercent.toFixed(0)}%</p>
        </div>
        <div>
          <p className="text-gray-500 mb-1">Input Voltage</p>
          <p className="font-medium">{ups.inputVoltage.toFixed(1)}V</p>
        </div>
        <div>
          <p className="text-gray-500 mb-1">Output Voltage</p>
          <p className="font-medium">{ups.outputVoltage.toFixed(1)}V</p>
        </div>
        <div>
          <p className="text-gray-500 mb-1">Battery Age</p>
          <p className={`font-medium ${ups.batteryAgeMonths > 36 ? 'text-amber-600' : ''}`}>
            {ups.batteryAgeMonths} months
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 mt-3 border-t text-xs text-gray-500">
        <span>Last self-test: {ups.lastSelfTest ? getTimeAgo(ups.lastSelfTest) : 'N/A'}</span>
        <span>{getTimeAgo(ups.lastCheck)}</span>
      </div>
    </div>
  );
}

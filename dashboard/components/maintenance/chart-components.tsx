'use client';

import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';

// ============================================================================
// Health Trend Chart - Line chart showing health metrics over time
// ============================================================================

interface HealthTrendData {
  timestamp: string;
  healthy: number;
  warning: number;
  critical: number;
}

interface HealthTrendChartProps {
  data: HealthTrendData[];
  height?: number;
}

export function HealthTrendChart({ data, height = 300 }: HealthTrendChartProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Health Trend (Last 24 Hours)</h3>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="timestamp" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Area type="monotone" dataKey="healthy" stackId="1" stroke="#10b981" fill="#10b981" name="Healthy" />
          <Area type="monotone" dataKey="warning" stackId="1" stroke="#f59e0b" fill="#f59e0b" name="Warning" />
          <Area type="monotone" dataKey="critical" stackId="1" stroke="#ef4444" fill="#ef4444" name="Critical" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================================
// Alert Distribution Chart - Pie chart showing alert categories
// ============================================================================

interface AlertDistributionData {
  category: string;
  count: number;
  color: string;
}

interface AlertDistributionChartProps {
  data: AlertDistributionData[];
  height?: number;
}

export function AlertDistributionChart({ data, height = 300 }: AlertDistributionChartProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Alert Distribution by Category</h3>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ payload, percent }) => {
            const categoryLabel = (payload as any)?.category ?? (payload as any)?.name ?? '';
            return typeof percent === 'number'
              ? `${categoryLabel}: ${(percent * 100).toFixed(0)}%`
              : categoryLabel;
          }}
            outerRadius={80}
            fill="#8884d8"
            dataKey="count"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================================
// Work Order Status Chart - Bar chart showing work order status
// ============================================================================

interface WorkOrderStatusData {
  status: string;
  count: number;
}

interface WorkOrderStatusChartProps {
  data: WorkOrderStatusData[];
  height?: number;
}

export function WorkOrderStatusChart({ data, height = 300 }: WorkOrderStatusChartProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Work Orders by Status</h3>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="status" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="count" fill="#3b82f6" name="Count" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================================
// Cost Trend Chart - Line chart showing maintenance costs over time
// ============================================================================

interface CostTrendData {
  month: string;
  corrective: number;
  preventive: number;
  amc: number;
}

interface CostTrendChartProps {
  data: CostTrendData[];
  height?: number;
}

export function CostTrendChart({ data, height = 300 }: CostTrendChartProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Cost Trend (Last 12 Months)</h3>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip formatter={(value) => `$${value}`} />
          <Legend />
          <Line type="monotone" dataKey="corrective" stroke="#ef4444" name="Corrective" strokeWidth={2} />
          <Line type="monotone" dataKey="preventive" stroke="#10b981" name="Preventive" strokeWidth={2} />
          <Line type="monotone" dataKey="amc" stroke="#3b82f6" name="AMC" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================================
// Camera Health Distribution Chart - Bar chart by branch
// ============================================================================

interface CameraHealthByBranchData {
  branch: string;
  healthy: number;
  warning: number;
  critical: number;
  offline: number;
}

interface CameraHealthByBranchChartProps {
  data: CameraHealthByBranchData[];
  height?: number;
}

export function CameraHealthByBranchChart({ data, height = 300 }: CameraHealthByBranchChartProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Camera Health by Branch</h3>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="branch" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="healthy" fill="#10b981" name="Healthy" stackId="a" />
          <Bar dataKey="warning" fill="#f59e0b" name="Warning" stackId="a" />
          <Bar dataKey="critical" fill="#ef4444" name="Critical" stackId="a" />
          <Bar dataKey="offline" fill="#6b7280" name="Offline" stackId="a" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================================
// SLA Compliance Chart - Line chart showing compliance percentage
// ============================================================================

interface SLAComplianceData {
  week: string;
  compliance: number;
  target: number;
}

interface SLAComplianceChartProps {
  data: SLAComplianceData[];
  height?: number;
}

export function SLAComplianceChart({ data, height = 300 }: SLAComplianceChartProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">SLA Compliance (Last 12 Weeks)</h3>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="week" />
          <YAxis domain={[0, 100]} />
          <Tooltip formatter={(value) => `${value}%`} />
          <Legend />
          <Line type="monotone" dataKey="compliance" stroke="#3b82f6" name="Actual" strokeWidth={2} />
          <Line type="monotone" dataKey="target" stroke="#10b981" name="Target" strokeWidth={2} strokeDasharray="5 5" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================================
// Storage Capacity Chart - Area chart showing storage usage
// ============================================================================

interface StorageCapacityData {
  date: string;
  used: number;
  available: number;
}

interface StorageCapacityChartProps {
  data: StorageCapacityData[];
  height?: number;
}

export function StorageCapacityChart({ data, height = 300 }: StorageCapacityChartProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Storage Capacity Trend</h3>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip formatter={(value) => `${value} GB`} />
          <Legend />
          <Area type="monotone" dataKey="used" stackId="1" stroke="#ef4444" fill="#ef4444" name="Used" />
          <Area type="monotone" dataKey="available" stackId="1" stroke="#10b981" fill="#10b981" name="Available" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================================
// MTTR Trend Chart - Line chart showing Mean Time To Repair
// ============================================================================

interface MTTRData {
  month: string;
  mttr: number;
  target: number;
}

interface MTTRChartProps {
  data: MTTRData[];
  height?: number;
}

export function MTTRChart({ data, height = 300 }: MTTRChartProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Mean Time To Repair (MTTR)</h3>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip formatter={(value) => `${value} hours`} />
          <Legend />
          <Line type="monotone" dataKey="mttr" stroke="#3b82f6" name="MTTR" strokeWidth={2} />
          <Line type="monotone" dataKey="target" stroke="#f59e0b" name="Target" strokeWidth={2} strokeDasharray="5 5" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

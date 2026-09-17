/**
 * Historical Trend Chart Component
 * 
 * Displays 6-month historical trends for MIS reports
 */

'use client';

import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useResponsiveChartHeight } from '@/hooks/use-mobile-detect';

interface TrendData {
  month: string;
  [key: string]: any;
}

interface HistoricalTrendChartProps {
  /** Report type for API call */
  reportType: 'executive-kpi' | 'financial' | 'benchmarking' | 'compliance';
  
  /** Number of months to display */
  months?: number;
  
  /** Chart title */
  title: string;
  
  /** Data keys to display */
  dataKeys: Array<{
    key: string;
    label: string;
    color: string;
  }>;
  
  /** Chart type */
  chartType?: 'line' | 'area';
  
  /** Optional: Y-axis label */
  yAxisLabel?: string;
  
  /** Optional: Show trend indicator */
  showTrendIndicator?: boolean;
}

export function HistoricalTrendChart({
  reportType,
  months = 6,
  title,
  dataKeys,
  chartType = 'line',
  yAxisLabel,
  showTrendIndicator = true,
}: HistoricalTrendChartProps) {
  const [data, setData] = useState<TrendData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const chartHeight = useResponsiveChartHeight(300, 250, 200);
  
  useEffect(() => {
    fetchTrends();
  }, [reportType, months]);
  
  const fetchTrends = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(
        `/api/control/v1/reports/trends?reportType=${reportType}&months=${months}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch trends');
      }
      
      const result = await response.json();
      setData(result.trends || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };
  
  // Calculate trend (comparing last month to first month)
  const getTrendIndicator = (key: string) => {
    if (data.length < 2) return null;
    
    const firstValue = data[0]?.[key] || 0;
    const lastValue = data[data.length - 1]?.[key] || 0;
    
    if (lastValue > firstValue) {
      const change = ((lastValue - firstValue) / firstValue * 100).toFixed(1);
      return { direction: 'up', change, color: 'text-green-400' };
    } else if (lastValue < firstValue) {
      const change = ((firstValue - lastValue) / firstValue * 100).toFixed(1);
      return { direction: 'down', change, color: 'text-red-400' };
    }
    return { direction: 'flat', change: '0', color: 'text-gray-400' };
  };
  
  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="h-64 bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500 rounded-lg p-6">
        <p className="text-red-400">Error loading trends: {error}</p>
        <button
          onClick={fetchTrends}
          className="mt-3 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors text-sm"
        >
          Retry
        </button>
      </div>
    );
  }
  
  if (data.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 text-center text-gray-400">
        <p>No historical data available</p>
      </div>
    );
  }
  
  const ChartComponent = chartType === 'area' ? AreaChart : LineChart;
  
  return (
    <div className="bg-gray-800 rounded-lg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">{title}</h3>
        
        {showTrendIndicator && dataKeys.length === 1 && (
          <div className="flex items-center gap-2">
            {(() => {
              const trend = getTrendIndicator(dataKeys[0].key);
              if (!trend) return null;
              
              const Icon = trend.direction === 'up' 
                ? TrendingUp 
                : trend.direction === 'down' 
                ? TrendingDown 
                : Minus;
              
              return (
                <>
                  <Icon size={20} className={trend.color} />
                  <span className={`font-semibold ${trend.color}`}>
                    {trend.change}%
                  </span>
                  <span className="text-sm text-gray-400">vs {months} months ago</span>
                </>
              );
            })()}
          </div>
        )}
      </div>
      
      {/* Chart */}
      <ResponsiveContainer width="100%" height={chartHeight}>
        <ChartComponent data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            dataKey="month" 
            stroke="#9CA3AF"
            tick={{ fill: '#9CA3AF' }}
          />
          <YAxis 
            stroke="#9CA3AF"
            tick={{ fill: '#9CA3AF' }}
            label={yAxisLabel ? { value: yAxisLabel, angle: -90, position: 'insideLeft', fill: '#9CA3AF' } : undefined}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1F2937',
              border: '1px solid #374151',
              borderRadius: '8px',
            }}
            labelStyle={{ color: '#F3F4F6' }}
          />
          <Legend />
          
          {dataKeys.map(({ key, label, color }) => {
            if (chartType === 'area') {
              return (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={color}
                  fill={color}
                  fillOpacity={0.3}
                  name={label}
                  strokeWidth={2}
                />
              );
            } else {
              return (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={color}
                  name={label}
                  strokeWidth={2}
                  dot={{ fill: color, r: 4 }}
                  activeDot={{ r: 6 }}
                />
              );
            }
          })}
        </ChartComponent>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Multi-line trend chart for comparing multiple metrics
 */
export function MultiMetricTrendChart({
  reportType,
  months = 6,
  title,
  dataKeys,
}: Omit<HistoricalTrendChartProps, 'chartType' | 'showTrendIndicator'>) {
  return (
    <HistoricalTrendChart
      reportType={reportType}
      months={months}
      title={title}
      dataKeys={dataKeys}
      chartType="line"
      showTrendIndicator={false}
    />
  );
}

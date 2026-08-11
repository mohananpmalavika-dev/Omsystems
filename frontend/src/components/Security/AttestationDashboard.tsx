/**
 * Attestation Dashboard Component
 * Overview of TPM attestation status across all devices
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Alert,
  Tabs,
  Tab
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Warning as WarningIcon,
  Help as HelpIcon
} from '@mui/icons-material';
import { AttestationStatusCard } from './AttestationStatusCard';

interface AttestationStatistics {
  totalDevices: number;
  statusBreakdown: {
    VERIFIED: number;
    FAILED: number;
    STALE: number;
    UNSUPPORTED: number;
    UNKNOWN: number;
    NOT_CONFIGURED: number;
  };
  assuranceBreakdown: {
    NONE: number;
    SELF_REPORTED: number;
    SIGNED_AGENT: number;
    HARDWARE_ATTESTED: number;
  };
  recentFailures: number;
  staleAttestations: number;
  averageAttestationAgeSeconds: number;
  policyComplianceRate: number;
}

interface AttestationDashboardProps {
  tenantId?: string;
}

export const AttestationDashboard: React.FC<AttestationDashboardProps> = ({
  tenantId
}) => {
  const [loading, setLoading] = useState(true);
  const [statistics, setStatistics] = useState<AttestationStatistics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    loadStatistics();
  }, [tenantId]);

  const loadStatistics = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/attestation/statistics${tenantId ? `?tenantId=${tenantId}` : ''}`
      );

      if (!response.ok) {
        throw new Error('Failed to load attestation statistics');
      }

      const data = await response.json();
      setStatistics(data.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !statistics) {
    return (
      <Box p={3}>
        <LinearProgress />
        <Typography variant="body2" color="text.secondary" mt={2}>
          Loading attestation statistics...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!statistics) {
    return null;
  }

  const compliancePercentage = Math.round(statistics.policyComplianceRate * 100);

  return (
    <Box>
      {/* Overview Cards */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Devices"
            value={statistics.totalDevices}
            icon={<HelpIcon />}
            color="primary"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Verified"
            value={statistics.statusBreakdown.VERIFIED}
            subtitle={`${compliancePercentage}% compliant`}
            icon={<CheckCircleIcon />}
            color="success"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Failed"
            value={statistics.statusBreakdown.FAILED}
            subtitle={`${statistics.recentFailures} recent`}
            icon={<CancelIcon />}
            color="error"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Stale"
            value={statistics.statusBreakdown.STALE}
            subtitle="Needs re-attestation"
            icon={<WarningIcon />}
            color="warning"
          />
        </Grid>
      </Grid>

      {/* Assurance Level Breakdown */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Assurance Levels
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <AssuranceMetric
                label="Hardware Attested"
                value={statistics.assuranceBreakdown.HARDWARE_ATTESTED}
                total={statistics.totalDevices}
                color="success"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <AssuranceMetric
                label="Signed Agent"
                value={statistics.assuranceBreakdown.SIGNED_AGENT}
                total={statistics.totalDevices}
                color="info"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <AssuranceMetric
                label="Self-Reported"
                value={statistics.assuranceBreakdown.SELF_REPORTED}
                total={statistics.totalDevices}
                color="warning"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <AssuranceMetric
                label="No Assurance"
                value={statistics.assuranceBreakdown.NONE}
                total={statistics.totalDevices}
                color="default"
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Status Tabs */}
      <Card>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          <Tab label="All Devices" />
          <Tab
            label={`Failed (${statistics.statusBreakdown.FAILED})`}
            disabled={statistics.statusBreakdown.FAILED === 0}
          />
          <Tab
            label={`Stale (${statistics.statusBreakdown.STALE})`}
            disabled={statistics.statusBreakdown.STALE === 0}
          />
          <Tab
            label={`Unsupported (${statistics.statusBreakdown.UNSUPPORTED})`}
            disabled={statistics.statusBreakdown.UNSUPPORTED === 0}
          />
        </Tabs>
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            Device attestation details will be displayed here
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
};

interface StatCardProps {
  title: string;
  value: number;
  subtitle?: string;
  icon: React.ReactNode;
  color: 'primary' | 'success' | 'error' | 'warning';
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  color
}) => (
  <Card>
    <CardContent>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start">
        <Box>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {title}
          </Typography>
          <Typography variant="h4" color={`${color}.main`}>
            {value}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        <Box color={`${color}.main`}>{icon}</Box>
      </Box>
    </CardContent>
  </Card>
);

interface AssuranceMetricProps {
  label: string;
  value: number;
  total: number;
  color: 'success' | 'info' | 'warning' | 'default';
}

const AssuranceMetric: React.FC<AssuranceMetricProps> = ({
  label,
  value,
  total,
  color
}) => {
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" mb={1}>
        <Typography variant="body2">{label}</Typography>
        <Typography variant="body2" fontWeight="bold">
          {value}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={percentage}
        color={color}
        sx={{ height: 8, borderRadius: 1 }}
      />
      <Typography variant="caption" color="text.secondary" mt={0.5}>
        {percentage}%
      </Typography>
    </Box>
  );
};

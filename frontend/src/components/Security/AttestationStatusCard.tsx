/**
 * Attestation Status Card Component
 * Displays device TPM attestation status and verification details
 */

import React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  Typography,
  Chip,
  Box,
  LinearProgress,
  Tooltip,
  IconButton,
  Alert
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Warning as WarningIcon,
  HelpOutline as HelpIcon,
  Refresh as RefreshIcon,
  Shield as ShieldIcon
} from '@mui/icons-material';

export interface AttestationStatus {
  status: 'VERIFIED' | 'FAILED' | 'UNKNOWN' | 'UNSUPPORTED' | 'NOT_CONFIGURED' | 'STALE';
  assurance: 'NONE' | 'SELF_REPORTED' | 'SIGNED_AGENT' | 'HARDWARE_ATTESTED';
  lastAttestation?: {
    attestedAt: string;
    ageSeconds: number;
    result: {
      quoteVerified: boolean;
      nonceVerified: boolean;
      pcrDigestVerified: boolean;
      policyVerified: boolean;
      secureBootEnabled?: boolean;
      failures?: string[];
    };
  };
  identity?: {
    enrolled: boolean;
    trustLevel: string;
    enrolledAt: string;
  };
}

interface AttestationStatusCardProps {
  deviceId: string;
  deviceName: string;
  status: AttestationStatus;
  onRefresh?: () => void;
  loading?: boolean;
}

export const AttestationStatusCard: React.FC<AttestationStatusCardProps> = ({
  deviceId,
  deviceName,
  status,
  onRefresh,
  loading = false
}) => {
  const getStatusConfig = () => {
    switch (status.status) {
      case 'VERIFIED':
        return {
          color: 'success' as const,
          icon: <CheckCircleIcon />,
          label: 'Verified',
          description: 'Boot integrity cryptographically verified'
        };
      case 'FAILED':
        return {
          color: 'error' as const,
          icon: <CancelIcon />,
          label: 'Failed',
          description: 'Attestation verification failed'
        };
      case 'STALE':
        return {
          color: 'warning' as const,
          icon: <WarningIcon />,
          label: 'Stale',
          description: 'Attestation data is outdated'
        };
      case 'UNSUPPORTED':
        return {
          color: 'default' as const,
          icon: <HelpIcon />,
          label: 'Unsupported',
          description: 'Device does not support TPM attestation'
        };
      case 'NOT_CONFIGURED':
        return {
          color: 'default' as const,
          icon: <HelpIcon />,
          label: 'Not Configured',
          description: 'Attestation not yet configured'
        };
      default:
        return {
          color: 'default' as const,
          icon: <HelpIcon />,
          label: 'Unknown',
          description: 'Cannot establish trust'
        };
    }
  };

  const getAssuranceConfig = () => {
    switch (status.assurance) {
      case 'HARDWARE_ATTESTED':
        return { label: 'Hardware Attested', color: 'success' as const };
      case 'SIGNED_AGENT':
        return { label: 'Signed Agent', color: 'info' as const };
      case 'SELF_REPORTED':
        return { label: 'Self-Reported', color: 'warning' as const };
      default:
        return { label: 'No Assurance', color: 'default' as const };
    }
  };

  const formatAge = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const statusConfig = getStatusConfig();
  const assuranceConfig = getAssuranceConfig();

  return (
    <Card>
      <CardHeader
        avatar={<ShieldIcon color={statusConfig.color} />}
        title={
          <Box display="flex" alignItems="center" gap={1}>
            <Typography variant="h6">{deviceName}</Typography>
            <Chip
              label={statusConfig.label}
              color={statusConfig.color}
              size="small"
              icon={statusConfig.icon}
            />
          </Box>
        }
        subheader={`Device ID: ${deviceId}`}
        action={
          onRefresh && (
            <Tooltip title="Refresh attestation status">
              <IconButton onClick={onRefresh} disabled={loading}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          )
        }
      />
      <CardContent>
        {loading && <LinearProgress sx={{ mb: 2 }} />}

        {/* Status Description */}
        <Typography variant="body2" color="text.secondary" paragraph>
          {statusConfig.description}
        </Typography>

        {/* Assurance Level */}
        <Box mb={2}>
          <Typography variant="caption" color="text.secondary">
            Assurance Level
          </Typography>
          <Box mt={0.5}>
            <Chip
              label={assuranceConfig.label}
              color={assuranceConfig.color}
              size="small"
            />
          </Box>
        </Box>

        {/* Identity Status */}
        {status.identity && (
          <Box mb={2}>
            <Typography variant="caption" color="text.secondary">
              Identity
            </Typography>
            <Box mt={0.5}>
              <Chip
                label={status.identity.enrolled ? 'Enrolled' : 'Not Enrolled'}
                color={status.identity.enrolled ? 'success' : 'default'}
                size="small"
              />
              {status.identity.enrolled && (
                <Typography variant="caption" color="text.secondary" ml={1}>
                  Trust: {status.identity.trustLevel}
                </Typography>
              )}
            </Box>
          </Box>
        )}

        {/* Last Attestation */}
        {status.lastAttestation && (
          <>
            <Box mb={2}>
              <Typography variant="caption" color="text.secondary">
                Last Attestation
              </Typography>
              <Typography variant="body2">
                {formatAge(status.lastAttestation.ageSeconds)}
              </Typography>
            </Box>

            {/* Verification Details */}
            <Box mb={2}>
              <Typography variant="caption" color="text.secondary" gutterBottom>
                Verification Checks
              </Typography>
              <Box display="flex" flexDirection="column" gap={0.5} mt={1}>
                <VerificationCheck
                  label="TPM Quote Signature"
                  verified={status.lastAttestation.result.quoteVerified}
                />
                <VerificationCheck
                  label="Nonce (Freshness)"
                  verified={status.lastAttestation.result.nonceVerified}
                />
                <VerificationCheck
                  label="PCR Digest"
                  verified={status.lastAttestation.result.pcrDigestVerified}
                />
                <VerificationCheck
                  label="Boot Policy"
                  verified={status.lastAttestation.result.policyVerified}
                />
                {status.lastAttestation.result.secureBootEnabled !== undefined && (
                  <VerificationCheck
                    label="Secure Boot"
                    verified={status.lastAttestation.result.secureBootEnabled}
                  />
                )}
              </Box>
            </Box>

            {/* Failures */}
            {status.lastAttestation.result.failures &&
              status.lastAttestation.result.failures.length > 0 && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  <Typography variant="caption" fontWeight="bold">
                    Verification Failures:
                  </Typography>
                  <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
                    {status.lastAttestation.result.failures.map((failure, idx) => (
                      <li key={idx}>
                        <Typography variant="caption">{failure}</Typography>
                      </li>
                    ))}
                  </ul>
                </Alert>
              )}
          </>
        )}

        {/* No Attestation Data */}
        {!status.lastAttestation && status.status === 'NOT_CONFIGURED' && (
          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="caption">
              Device has not completed initial attestation. Enroll the device's TPM
              identity to begin hardware verification.
            </Typography>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};

interface VerificationCheckProps {
  label: string;
  verified: boolean;
}

const VerificationCheck: React.FC<VerificationCheckProps> = ({ label, verified }) => (
  <Box display="flex" alignItems="center" gap={1}>
    {verified ? (
      <CheckCircleIcon fontSize="small" color="success" />
    ) : (
      <CancelIcon fontSize="small" color="error" />
    )}
    <Typography variant="body2">{label}</Typography>
  </Box>
);

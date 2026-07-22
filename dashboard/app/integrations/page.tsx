'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tabs,
  Tab,
  Alert
} from '@mui/material';
import Grid2 from '@mui/material/Unstable_Grid2';
import {
  Settings as SettingsIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  PlayArrow as PlayArrowIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
  Add as AddIcon,
  Edit as EditIcon
} from '@mui/icons-material';

interface Integration {
  id: string;
  name: string;
  connector_type: string;
  status: string;
  connection_method: string;
  last_successful_event_at: string;
  events_received_count: number;
  events_failed_count: number;
  average_latency_ms: number;
}

interface IntegrationHealth {
  id: string;
  name: string;
  connector_type: string;
  status: string;
  health: string;
  queueDepth: number;
  last_successful_event_at: string;
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [healthStatus, setHealthStatus] = useState<IntegrationHealth[]>([]);
  const [selectedTab, setSelectedTab] = useState(0);
  const [openDialog, setOpenDialog] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchIntegrations();
    fetchHealthStatus();
    
    // Refresh health status every 30 seconds
    const interval = setInterval(fetchHealthStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchIntegrations = async () => {
    try {
      const response = await fetch('/api/integrations');
      const data = await response.json();
      if (data.success) {
        setIntegrations(data.data);
      }
    } catch (error) {
      console.error('Error fetching integrations:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHealthStatus = async () => {
    try {
      const response = await fetch('/api/integrations/health');
      const data = await response.json();
      if (data.success) {
        setHealthStatus(data.data);
      }
    } catch (error) {
      console.error('Error fetching health status:', error);
    }
  };

  const getStatusIcon = (health: string) => {
    switch (health) {
      case 'healthy':
        return <CheckCircleIcon color="success" />;
      case 'warning':
        return <WarningIcon color="warning" />;
      case 'error':
        return <ErrorIcon color="error" />;
      default:
        return <WarningIcon color="disabled" />;
    }
  };

  const getStatusColor = (health: string) => {
    switch (health) {
      case 'healthy':
        return 'success';
      case 'warning':
        return 'warning';
      case 'error':
        return 'error';
      default:
        return 'default';
    }
  };

  const handleEnableDisable = async (id: string, currentStatus: string) => {
    const action = currentStatus === 'active' ? 'disable' : 'enable';
    try {
      const response = await fetch(`/api/integrations/${id}/${action}`, {
        method: 'POST'
      });
      if (response.ok) {
        fetchIntegrations();
      }
    } catch (error) {
      console.error(`Error ${action} integration:`, error);
    }
  };

  const handleTestConnection = async (id: string) => {
    try {
      const response = await fetch(`/api/integrations/${id}/test`, {
        method: 'POST'
      });
      const data = await response.json();
      if (data.success) {
        alert('Connection test successful');
        fetchHealthStatus();
      } else {
        alert('Connection test failed');
      }
    } catch (error) {
      console.error('Error testing connection:', error);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Integration & Interoperability
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setOpenDialog(true)}
        >
          Add Integration
        </Button>
      </Box>

      {/* Health Status Dashboard */}
      <Grid2 container spacing={3} sx={{ mb: 3 }}>
        {healthStatus.map((item) => (
          <Grid2 xs={12} sm={6} md={4} lg={3} key={item.id}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                  <Box>
                    <Typography variant="subtitle2" color="textSecondary">
                      {item.connector_type.replace(/-/g, ' ').toUpperCase()}
                    </Typography>
                    <Typography variant="h6">{item.name}</Typography>
                  </Box>
                  {getStatusIcon(item.health)}
                </Box>
                
                <Chip
                  label={item.health.toUpperCase()}
                  color={getStatusColor(item.health) as any}
                  size="small"
                  sx={{ mb: 1 }}
                />
                
                {item.queueDepth > 0 && (
                  <Typography variant="body2" color="textSecondary">
                    Queue: {item.queueDepth} events
                  </Typography>
                )}
                
                {item.last_successful_event_at && (
                  <Typography variant="caption" color="textSecondary">
                    Last event: {new Date(item.last_successful_event_at).toLocaleString()}
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid2>
        ))}
      </Grid2>

      {/* Tabs for different views */}
      <Card>
        <Tabs value={selectedTab} onChange={(e, newValue) => setSelectedTab(newValue)}>
          <Tab label="Connectors" />
          <Tab label="Events" />
          <Tab label="Mappings" />
          <Tab label="Rules" />
          <Tab label="Failed Events" />
        </Tabs>

        <CardContent>
          {selectedTab === 0 && (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Connection</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Events Received</TableCell>
                    <TableCell align="right">Failed</TableCell>
                    <TableCell align="right">Avg Latency</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {integrations.map((integration) => (
                    <TableRow key={integration.id}>
                      <TableCell>{integration.name}</TableCell>
                      <TableCell>
                        <Chip
                          label={integration.connector_type}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>{integration.connection_method}</TableCell>
                      <TableCell>
                        <Chip
                          label={integration.status}
                          color={integration.status === 'active' ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="right">
                        {integration.events_received_count.toLocaleString()}
                      </TableCell>
                      <TableCell align="right">
                        {integration.events_failed_count > 0 ? (
                          <Chip
                            label={integration.events_failed_count}
                            color="error"
                            size="small"
                          />
                        ) : (
                          '0'
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {integration.average_latency_ms ? `${integration.average_latency_ms}ms` : '-'}
                      </TableCell>
                      <TableCell>
                        <IconButton
                          size="small"
                          onClick={() => handleTestConnection(integration.id)}
                          title="Test Connection"
                        >
                          <RefreshIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleEnableDisable(integration.id, integration.status)}
                          title={integration.status === 'active' ? 'Disable' : 'Enable'}
                        >
                          {integration.status === 'active' ? <StopIcon /> : <PlayArrowIcon />}
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => {/* Edit integration */}}
                          title="Edit"
                        >
                          <EditIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {selectedTab === 1 && (
            <Alert severity="info">
              Event viewer coming soon. This will display all external events received from integrated systems.
            </Alert>
          )}

          {selectedTab === 2 && (
            <Alert severity="info">
              Mapping manager coming soon. This will allow you to map external device IDs to Sentinel entities.
            </Alert>
          )}

          {selectedTab === 3 && (
            <Alert severity="info">
              Rules engine coming soon. This will allow you to configure automated responses to external events.
            </Alert>
          )}

          {selectedTab === 4 && (
            <Alert severity="info">
              Failed events viewer coming soon. This will display events that failed processing and allow manual replay.
            </Alert>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

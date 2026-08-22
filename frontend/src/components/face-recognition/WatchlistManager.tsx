/**
 * Watchlist Manager Component
 * Main interface for managing face recognition watchlists
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  IconButton,
  TextField,
  Typography,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  People as PeopleIcon,
  Visibility as ViewIcon,
  Security as SecurityIcon,
  Star as VipIcon,
  Block as BlockIcon,
  Work as WorkIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { faceWatchlistAPI } from '../../api/face-recognition';

interface Watchlist {
  id: string;
  name: string;
  description?: string;
  listType: 'security' | 'vip' | 'staff' | 'blacklist' | 'missing-person';
  enabled: boolean;
  alertOnMatch: boolean;
  alertSeverity: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  matchThreshold: number;
  reviewThreshold: number;
  createdAt: string;
  updatedAt: string;
}

const listTypeIcons = {
  security: <SecurityIcon />,
  vip: <VipIcon />,
  staff: <WorkIcon />,
  blacklist: <BlockIcon />,
  'missing-person': <SearchIcon />,
};

const listTypeColors = {
  security: 'warning',
  vip: 'success',
  staff: 'info',
  blacklist: 'error',
  'missing-person': 'secondary',
} as const;

export const WatchlistManager: React.FC = () => {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingWatchlist, setEditingWatchlist] = useState<Watchlist | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadWatchlists();
  }, []);

  const loadWatchlists = async () => {
    try {
      setLoading(true);
      const response = await faceWatchlistAPI.listWatchlists();
      setWatchlists(response.watchlists);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load watchlists');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWatchlist = () => {
    setEditingWatchlist(null);
    setCreateDialogOpen(true);
  };

  const handleEditWatchlist = (watchlist: Watchlist) => {
    setEditingWatchlist(watchlist);
    setCreateDialogOpen(true);
  };

  const handleDeleteWatchlist = async (watchlistId: string) => {
    if (!confirm('Are you sure you want to delete this watchlist?')) {
      return;
    }

    try {
      await faceWatchlistAPI.deleteWatchlist(watchlistId);
      await loadWatchlists();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete watchlist');
    }
  };

  const handleViewWatchlist = (watchlistId: string) => {
    navigate(`/face-recognition/watchlists/${watchlistId}`);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Face Recognition Watchlists</Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleCreateWatchlist}
        >
          Create Watchlist
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {watchlists.map((watchlist) => (
          <Grid item xs={12} md={6} lg={4} key={watchlist.id}>
            <Card>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="start" mb={2}>
                  <Box display="flex" alignItems="center" gap={1}>
                    {listTypeIcons[watchlist.listType]}
                    <Typography variant="h6">{watchlist.name}</Typography>
                  </Box>
                  <Box>
                    <IconButton size="small" onClick={() => handleViewWatchlist(watchlist.id)}>
                      <ViewIcon />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleEditWatchlist(watchlist)}>
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDeleteWatchlist(watchlist.id)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                </Box>

                {watchlist.description && (
                  <Typography variant="body2" color="text.secondary" mb={2}>
                    {watchlist.description}
                  </Typography>
                )}

                <Box display="flex" gap={1} flexWrap="wrap" mb={2}>
                  <Chip
                    label={watchlist.listType.replace('-', ' ')}
                    color={listTypeColors[watchlist.listType]}
                    size="small"
                  />
                  <Chip
                    label={watchlist.enabled ? 'Enabled' : 'Disabled'}
                    color={watchlist.enabled ? 'success' : 'default'}
                    size="small"
                  />
                  {watchlist.alertOnMatch && (
                    <Chip
                      label={`Alert ${watchlist.alertSeverity}`}
                      color="warning"
                      size="small"
                    />
                  )}
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Match Threshold: {(watchlist.matchThreshold * 100).toFixed(0)}%
                  </Typography>
                  <br />
                  <Typography variant="caption" color="text.secondary">
                    Review Threshold: {(watchlist.reviewThreshold * 100).toFixed(0)}%
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {watchlists.length === 0 && !loading && (
        <Box textAlign="center" py={8}>
          <PeopleIcon sx={{ fontSize: 80, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No watchlists created yet
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Create your first watchlist to start face recognition
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreateWatchlist}>
            Create Watchlist
          </Button>
        </Box>
      )}

      <WatchlistDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onSuccess={loadWatchlists}
        watchlist={editingWatchlist}
      />
    </Box>
  );
};

interface WatchlistDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  watchlist?: Watchlist | null;
}

const WatchlistDialog: React.FC<WatchlistDialogProps> = ({
  open,
  onClose,
  onSuccess,
  watchlist,
}) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    listType: 'security' as const,
    enabled: true,
    alertOnMatch: true,
    alertSeverity: 'P2' as const,
    matchThreshold: 0.70,
    reviewThreshold: 0.60,
    minimumMargin: 0.05,
    minimumQuality: 0.55,
    temporalConfirmationFrames: 3,
    temporalWindowSeconds: 2,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (watchlist) {
      setFormData({
        name: watchlist.name,
        description: watchlist.description || '',
        listType: watchlist.listType,
        enabled: watchlist.enabled,
        alertOnMatch: watchlist.alertOnMatch,
        alertSeverity: watchlist.alertSeverity,
        matchThreshold: watchlist.matchThreshold,
        reviewThreshold: watchlist.reviewThreshold,
        minimumMargin: 0.05,
        minimumQuality: 0.55,
        temporalConfirmationFrames: 3,
        temporalWindowSeconds: 2,
      });
    } else {
      // Reset form for new watchlist
      setFormData({
        name: '',
        description: '',
        listType: 'security',
        enabled: true,
        alertOnMatch: true,
        alertSeverity: 'P2',
        matchThreshold: 0.70,
        reviewThreshold: 0.60,
        minimumMargin: 0.05,
        minimumQuality: 0.55,
        temporalConfirmationFrames: 3,
        temporalWindowSeconds: 2,
      });
    }
  }, [watchlist, open]);

  const handleSubmit = async () => {
    try {
      setSaving(true);
      setError(null);

      if (watchlist) {
        await faceWatchlistAPI.updateWatchlist(watchlist.id, formData);
      } else {
        await faceWatchlistAPI.createWatchlist(formData);
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save watchlist');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{watchlist ? 'Edit Watchlist' : 'Create Watchlist'}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12}>
            <TextField
              label="Name"
              fullWidth
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </Grid>

          <Grid item xs={12}>
            <TextField
              label="Description"
              fullWidth
              multiline
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>List Type</InputLabel>
              <Select
                value={formData.listType}
                label="List Type"
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    listType: e.target.value as typeof formData.listType,
                  })
                }
              >
                <MenuItem value="security">Security</MenuItem>
                <MenuItem value="vip">VIP</MenuItem>
                <MenuItem value="staff">Staff</MenuItem>
                <MenuItem value="blacklist">Blacklist</MenuItem>
                <MenuItem value="missing-person">Missing Person</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Alert Severity</InputLabel>
              <Select
                value={formData.alertSeverity}
                label="Alert Severity"
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    alertSeverity: e.target.value as typeof formData.alertSeverity,
                  })
                }
              >
                <MenuItem value="P1">P1 - Critical</MenuItem>
                <MenuItem value="P2">P2 - High</MenuItem>
                <MenuItem value="P3">P3 - Medium</MenuItem>
                <MenuItem value="P4">P4 - Low</MenuItem>
                <MenuItem value="P5">P5 - Info</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              label="Match Threshold"
              type="number"
              fullWidth
              inputProps={{ min: 0.4, max: 0.95, step: 0.05 }}
              value={formData.matchThreshold}
              onChange={(e) =>
                setFormData({ ...formData, matchThreshold: parseFloat(e.target.value) })
              }
              helperText="Minimum similarity for definitive match (0.4-0.95)"
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              label="Review Threshold"
              type="number"
              fullWidth
              inputProps={{ min: 0.3, max: 0.9, step: 0.05 }}
              value={formData.reviewThreshold}
              onChange={(e) =>
                setFormData({ ...formData, reviewThreshold: parseFloat(e.target.value) })
              }
              helperText="Minimum similarity for possible match (0.3-0.9)"
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <FormControlLabel
              control={
                <Switch
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                />
              }
              label="Enabled"
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <FormControlLabel
              control={
                <Switch
                  checked={formData.alertOnMatch}
                  onChange={(e) => setFormData({ ...formData, alertOnMatch: e.target.checked })}
                />
              }
              label="Alert on Match"
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={saving || !formData.name}
        >
          {saving ? 'Saving...' : watchlist ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

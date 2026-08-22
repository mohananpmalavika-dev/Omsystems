/**
 * Face Match Review Component
 * Interface for reviewing face recognition matches
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Button,
  Typography,
  Chip,
  Grid,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Divider,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  CheckCircle as ConfirmIcon,
  Cancel as RejectIcon,
  Help as UnsureIcon,
  Person as PersonIcon,
  Camera as CameraIcon,
  Schedule as TimeIcon,
  TrendingUp as SimilarityIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { faceRecognitionAPI } from '../../api/face-recognition';

interface FaceMatchEvent {
  id: string;
  personId: string;
  personName: string;
  personExternalId?: string;
  watchlistId: string;
  watchlistName: string;
  watchlistType: string;
  cameraId: string;
  cameraName: string;
  branchName?: string;
  similarityScore: number;
  faceQuality?: number;
  faceBbox: any;
  snapshotReference?: string;
  occurredAt: string;
  createdAt: string;
}

interface FaceMatchReviewProps {
  eventId: string;
  onClose: () => void;
  onReviewed?: () => void;
}

export const FaceMatchReview: React.FC<FaceMatchReviewProps> = ({
  eventId,
  onClose,
  onReviewed,
}) => {
  const [event, setEvent] = useState<FaceMatchEvent | null>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<'confirmed' | 'rejected' | 'unsure'>('confirmed');
  const [reviewNotes, setReviewNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadEventDetails();
    loadReviews();
  }, [eventId]);

  const loadEventDetails = async () => {
    try {
      setLoading(true);
      const data = await faceRecognitionAPI.getEvent(eventId);
      setEvent(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load event');
    } finally {
      setLoading(false);
    }
  };

  const loadReviews = async () => {
    try {
      const data = await faceRecognitionAPI.getEventReviews(eventId);
      setReviews(data);
    } catch (err) {
      console.error('Failed to load reviews:', err);
    }
  };

  const handleStartReview = (decision: 'confirmed' | 'rejected' | 'unsure') => {
    setReviewDecision(decision);
    setReviewNotes('');
    setReviewDialogOpen(true);
  };

  const handleSubmitReview = async () => {
    try {
      setReviewing(true);
      await faceRecognitionAPI.reviewMatch(eventId, {
        decision: reviewDecision,
        notes: reviewNotes,
      });
      await loadReviews();
      setReviewDialogOpen(false);
      onReviewed?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit review');
    } finally {
      setReviewing(false);
    }
  };

  if (loading || !event) {
    return (
      <Dialog open maxWidth="md" fullWidth onClose={onClose}>
        <DialogContent>
          <Box display="flex" justifyContent="center" p={4}>
            <Typography>Loading...</Typography>
          </Box>
        </DialogContent>
      </Dialog>
    );
  }

  const similarityPercent = (event.similarityScore * 100).toFixed(1);
  const qualityPercent = event.faceQuality ? (event.faceQuality * 100).toFixed(0) : 'N/A';

  return (
    <>
      <Dialog open maxWidth="lg" fullWidth onClose={onClose}>
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">Face Match Review</Typography>
            <Chip
              label={event.watchlistType.toUpperCase()}
              color={
                event.watchlistType === 'blacklist'
                  ? 'error'
                  : event.watchlistType === 'vip'
                  ? 'success'
                  : 'default'
              }
            />
          </Box>
        </DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <Grid container spacing={3}>
            {/* Event Details */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Match Details
                  </Typography>

                  <List>
                    <ListItem>
                      <ListItemAvatar>
                        <Avatar>
                          <PersonIcon />
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={event.personName}
                        secondary={
                          <>
                            {event.personExternalId && `ID: ${event.personExternalId}`}
                            <br />
                            Watchlist: {event.watchlistName}
                          </>
                        }
                      />
                    </ListItem>

                    <Divider variant="inset" component="li" />

                    <ListItem>
                      <ListItemAvatar>
                        <Avatar>
                          <CameraIcon />
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={event.cameraName}
                        secondary={event.branchName || 'Unknown branch'}
                      />
                    </ListItem>

                    <Divider variant="inset" component="li" />

                    <ListItem>
                      <ListItemAvatar>
                        <Avatar>
                          <TimeIcon />
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={format(new Date(event.occurredAt), 'PPpp')}
                        secondary="Event time"
                      />
                    </ListItem>

                    <Divider variant="inset" component="li" />

                    <ListItem>
                      <ListItemAvatar>
                        <Avatar>
                          <SimilarityIcon />
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Box display="flex" alignItems="center" gap={1}>
                            <Typography>{similarityPercent}%</Typography>
                            <Chip
                              label={
                                event.similarityScore >= 0.8
                                  ? 'High'
                                  : event.similarityScore >= 0.65
                                  ? 'Medium'
                                  : 'Low'
                              }
                              color={
                                event.similarityScore >= 0.8
                                  ? 'success'
                                  : event.similarityScore >= 0.65
                                  ? 'warning'
                                  : 'error'
                              }
                              size="small"
                            />
                          </Box>
                        }
                        secondary={`Similarity Score • Quality: ${qualityPercent}%`}
                      />
                    </ListItem>
                  </List>
                </CardContent>
              </Card>
            </Grid>

            {/* Image Preview */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Face Snapshot
                  </Typography>

                  {event.snapshotReference ? (
                    <Box
                      component="img"
                      src={event.snapshotReference}
                      alt="Face snapshot"
                      sx={{
                        width: '100%',
                        height: 'auto',
                        borderRadius: 1,
                        border: 1,
                        borderColor: 'divider',
                      }}
                    />
                  ) : (
                    <Box
                      display="flex"
                      justifyContent="center"
                      alignItems="center"
                      height={300}
                      bgcolor="background.default"
                      borderRadius={1}
                    >
                      <Typography color="text.secondary">
                        Snapshot not available
                      </Typography>
                    </Box>
                  )}

                  {event.faceBbox && (
                    <Box mt={2}>
                      <Typography variant="caption" color="text.secondary">
                        Face bbox: ({Math.round(event.faceBbox.x)},{' '}
                        {Math.round(event.faceBbox.y)}) {Math.round(event.faceBbox.width)}×
                        {Math.round(event.faceBbox.height)}
                      </Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Review Actions */}
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Review Action
                  </Typography>

                  <Box display="flex" gap={2} mb={3}>
                    <Button
                      variant="contained"
                      color="success"
                      startIcon={<ConfirmIcon />}
                      onClick={() => handleStartReview('confirmed')}
                      fullWidth
                    >
                      Confirm Match
                    </Button>
                    <Button
                      variant="contained"
                      color="error"
                      startIcon={<RejectIcon />}
                      onClick={() => handleStartReview('rejected')}
                      fullWidth
                    >
                      Reject Match
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<UnsureIcon />}
                      onClick={() => handleStartReview('unsure')}
                      fullWidth
                    >
                      Unsure
                    </Button>
                  </Box>

                  {reviews.length > 0 && (
                    <>
                      <Divider sx={{ my: 2 }} />
                      <Typography variant="subtitle2" gutterBottom>
                        Previous Reviews ({reviews.length})
                      </Typography>
                      <List>
                        {reviews.map((review, index) => (
                          <ListItem key={review.id} divider={index < reviews.length - 1}>
                            <ListItemText
                              primary={
                                <Box display="flex" alignItems="center" gap={1}>
                                  <Chip
                                    label={review.decision}
                                    color={
                                      review.decision === 'confirmed'
                                        ? 'success'
                                        : review.decision === 'rejected'
                                        ? 'error'
                                        : 'default'
                                    }
                                    size="small"
                                  />
                                  <Typography variant="body2">
                                    by {review.reviewer_name}
                                  </Typography>
                                </Box>
                              }
                              secondary={
                                <>
                                  {review.notes && (
                                    <>
                                      {review.notes}
                                      <br />
                                    </>
                                  )}
                                  {format(new Date(review.reviewed_at), 'PPpp')}
                                </>
                              }
                            />
                          </ListItem>
                        ))}
                      </List>
                    </>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Review Submission Dialog */}
      <Dialog open={reviewDialogOpen} onClose={() => setReviewDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Submit Review
          <Chip
            label={reviewDecision}
            color={
              reviewDecision === 'confirmed'
                ? 'success'
                : reviewDecision === 'rejected'
                ? 'error'
                : 'default'
            }
            sx={{ ml: 2 }}
          />
        </DialogTitle>
        <DialogContent>
          <TextField
            label="Notes (optional)"
            multiline
            rows={4}
            fullWidth
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            placeholder="Add any notes about this review..."
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviewDialogOpen(false)} disabled={reviewing}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmitReview}
            disabled={reviewing}
          >
            {reviewing ? 'Submitting...' : 'Submit Review'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

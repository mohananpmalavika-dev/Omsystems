/**
 * Person Enrollment Component
 * Interface for enrolling persons in watchlists with image upload
 */

import React, { useState, useCallback } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  TextField,
  Typography,
  Alert,
  Grid,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  LinearProgress,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Delete as DeleteIcon,
  Check as CheckIcon,
  Error as ErrorIcon,
  Image as ImageIcon,
  PersonAdd as PersonAddIcon,
} from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';
import { faceWatchlistAPI } from '../../api/face-recognition';

interface PersonEnrollmentProps {
  watchlistId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

interface ImageFile {
  file: File;
  preview: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

export const PersonEnrollment: React.FC<PersonEnrollmentProps> = ({
  watchlistId,
  onSuccess,
  onCancel,
}) => {
  const [displayName, setDisplayName] = useState('');
  const [externalId, setExternalId] = useState('');
  const [images, setImages] = useState<ImageFile[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newImages = acceptedFiles.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      status: 'pending' as const,
    }));
    setImages((prev) => [...prev, ...newImages]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 10,
  });

  const handleRemoveImage = (index: number) => {
    setImages((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleEnroll = async () => {
    if (!displayName.trim()) {
      setError('Please enter a name');
      return;
    }

    if (images.length === 0) {
      setError('Please upload at least one image');
      return;
    }

    try {
      setEnrolling(true);
      setError(null);

      const formData = new FormData();
      formData.append('displayName', displayName);
      if (externalId) {
        formData.append('externalId', externalId);
      }

      images.forEach((img) => {
        formData.append('images', img.file);
      });

      const response = await faceWatchlistAPI.enrollPerson(watchlistId, formData);
      setResult(response);

      // Update image statuses based on result
      setImages((prev) =>
        prev.map((img, idx) => {
          const failure = response.failures.find((f: any) => f.imageIndex === idx);
          return {
            ...img,
            status: failure ? 'error' : 'success',
            error: failure?.reason,
          };
        }),
      );

      if (response.acceptedImages > 0) {
        setTimeout(() => {
          onSuccess();
        }, 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enrollment failed');
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <Dialog open fullWidth maxWidth="md" onClose={onCancel}>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <PersonAddIcon />
          Enroll Person
        </Box>
      </DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {result && (
          <Alert
            severity={result.acceptedImages > 0 ? 'success' : 'error'}
            sx={{ mb: 2 }}
          >
            Enrollment {result.acceptedImages > 0 ? 'successful' : 'failed'}:{' '}
            {result.acceptedImages} image(s) accepted, {result.rejectedImages} rejected
          </Alert>
        )}

        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <TextField
              label="Full Name"
              fullWidth
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={enrolling}
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              label="External ID (optional)"
              fullWidth
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              disabled={enrolling}
              helperText="Employee ID, passport number, etc."
            />
          </Grid>

          <Grid item xs={12}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" gutterBottom>
                  Face Images
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Upload 1-10 clear face photos. Multiple angles improve recognition accuracy.
                </Typography>

                <Box
                  {...getRootProps()}
                  sx={{
                    border: 2,
                    borderColor: isDragActive ? 'primary.main' : 'divider',
                    borderStyle: 'dashed',
                    borderRadius: 1,
                    p: 3,
                    textAlign: 'center',
                    cursor: 'pointer',
                    bgcolor: isDragActive ? 'action.hover' : 'background.paper',
                    mb: 2,
                  }}
                >
                  <input {...getInputProps()} />
                  <UploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                  <Typography variant="body2" color="text.secondary">
                    {isDragActive
                      ? 'Drop images here...'
                      : 'Drag & drop images here, or click to select'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    JPEG, PNG, WebP (max 10MB each)
                  </Typography>
                </Box>

                {images.length > 0 && (
                  <List>
                    {images.map((img, index) => (
                      <ListItem
                        key={index}
                        secondaryAction={
                          <IconButton
                            edge="end"
                            onClick={() => handleRemoveImage(index)}
                            disabled={enrolling}
                          >
                            <DeleteIcon />
                          </IconButton>
                        }
                      >
                        <ListItemIcon>
                          <img
                            src={img.preview}
                            alt={`Preview ${index + 1}`}
                            style={{
                              width: 60,
                              height: 60,
                              objectFit: 'cover',
                              borderRadius: 4,
                            }}
                          />
                        </ListItemIcon>
                        <ListItemText
                          primary={img.file.name}
                          secondary={
                            img.status === 'success' ? (
                              <Chip
                                icon={<CheckIcon />}
                                label="Accepted"
                                color="success"
                                size="small"
                              />
                            ) : img.status === 'error' ? (
                              <Chip
                                icon={<ErrorIcon />}
                                label={img.error || 'Rejected'}
                                color="error"
                                size="small"
                              />
                            ) : (
                              `${(img.file.size / 1024 / 1024).toFixed(2)} MB`
                            )
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                )}

                {images.length === 0 && (
                  <Box textAlign="center" py={2}>
                    <ImageIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
                    <Typography variant="body2" color="text.secondary">
                      No images uploaded yet
                    </Typography>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12}>
            <Alert severity="info">
              <Typography variant="body2" gutterBottom>
                <strong>Tips for best results:</strong>
              </Typography>
              <Typography variant="body2" component="ul" sx={{ pl: 2, mt: 1 }}>
                <li>Use well-lit, clear photos</li>
                <li>Face should be fully visible (no masks, sunglasses)</li>
                <li>Include different angles (frontal, slight profile)</li>
                <li>Minimum face size: 80×80 pixels</li>
                <li>Avoid extreme poses or heavy shadows</li>
              </Typography>
            </Alert>
          </Grid>
        </Grid>

        {enrolling && (
          <Box sx={{ mt: 2 }}>
            <LinearProgress />
            <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 1 }}>
              Enrolling person...
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={enrolling}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleEnroll}
          disabled={enrolling || !displayName || images.length === 0}
          startIcon={<PersonAddIcon />}
        >
          {enrolling ? 'Enrolling...' : 'Enroll Person'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

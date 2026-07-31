import express from 'express';
import { rootCauseRouter } from './routes/root-cause-api';
import { logger } from './utils/logger';

const app = express();
const PORT = process.env.PORT || 3004;

// Middleware
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'root-cause-analysis-engine' });
});

// API routes
app.use('/api/v1', rootCauseRouter);

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  logger.info(`Root Cause Analysis Engine listening on port ${PORT}`);
});

export default app;

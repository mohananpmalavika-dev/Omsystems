import { Router, Request, Response } from 'express';
import { RootCauseAnalyzer } from '../analyzer/root-cause-analyzer';
import { logger } from '../utils/logger';

const router = Router();
const analyzer = new RootCauseAnalyzer();

// POST /api/v1/analyze - Analyze incident for root cause
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { incidentId, incidentData } = req.body;
    
    if (!incidentId || !incidentData) {
      return res.status(400).json({ error: 'Missing required fields: incidentId, incidentData' });
    }

    logger.info(`Analyzing root cause for incident: ${incidentId}`);
    
    const analysis = await analyzer.analyze(incidentId, incidentData);
    
    res.json({
      success: true,
      incidentId,
      analysis
    });
  } catch (error: any) {
    logger.error('Root cause analysis failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/analysis/:incidentId - Get analysis results
router.get('/analysis/:incidentId', async (req: Request, res: Response) => {
  try {
    const { incidentId } = req.params;
    
    const analysis = await analyzer.getAnalysis(incidentId);
    
    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }
    
    res.json({
      success: true,
      incidentId,
      analysis
    });
  } catch (error: any) {
    logger.error('Failed to retrieve analysis:', error);
    res.status(500).json({ error: error.message });
  }
});

export { router as rootCauseRouter };

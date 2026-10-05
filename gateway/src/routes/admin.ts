import { Router, Request, Response } from 'express';
import { storage } from '../services/storage.js';
import { PiiSanitizer } from '../services/piiSanitizer.js';
import { cacheService } from '../services/cacheService.js';
import { config } from '../config.js';

export const adminRouter = Router();

// 1. Analytics Summary
adminRouter.get('/analytics/summary', async (req: Request, res: Response) => {
  const orgId = (req.query.orgId as string) || config.defaultOrgId;
  const summary = await storage.getAnalyticsSummary(orgId);
  res.json(summary);
});

// 2. Request Logs Inspector
adminRouter.get('/logs', async (req: Request, res: Response) => {
  const limit = parseInt((req.query.limit as string) || '50', 10);
  const orgId = (req.query.orgId as string) || config.defaultOrgId;
  const logs = await storage.getRequestLogs(limit, orgId);
  res.json({ logs });
});

// 3. API Key Management
adminRouter.get('/api-keys', async (req: Request, res: Response) => {
  const orgId = (req.query.orgId as string) || config.defaultOrgId;
  const keys = await storage.getAllApiKeys(orgId);
  res.json({ keys });
});

adminRouter.post('/api-keys', async (req: Request, res: Response) => {
  const { name, rateLimitRpm, allowedModels, orgId } = req.body;
  const effectiveOrg = orgId || config.defaultOrgId;
  const result = await storage.createApiKey(
    effectiveOrg,
    name || 'Production Gateway Key',
    rateLimitRpm ? parseInt(rateLimitRpm, 10) : 60,
    allowedModels || ['gpt-4o', 'gpt-4o-mini', 'gemini-1.5-flash']
  );
  res.status(201).json(result);
});

adminRouter.patch('/api-keys/:id/toggle', async (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { isEnabled } = req.body;
  const success = await storage.toggleApiKey(id, isEnabled);
  res.json({ success });
});

adminRouter.delete('/api-keys/:id', async (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const success = await storage.deleteApiKey(id);
  res.json({ success });
});

// 4. Playground / Sandbox Tester
adminRouter.post('/sandbox/test-guardrails', (req: Request, res: Response) => {
  const { prompt, model = 'gpt-4o' } = req.body;
  if (!prompt) {
    res.status(400).json({ error: 'Prompt is required' });
    return;
  }

  const piiResult = PiiSanitizer.sanitize(prompt);
  res.json({
    originalPrompt: prompt,
    sanitizedPrompt: piiResult.sanitizedText,
    redactedCount: piiResult.redactedCount,
    typesDetected: piiResult.typesDetected,
    findings: piiResult.findings,
  });
});

// 5. User & Model Feedback Endpoints
adminRouter.post('/feedback', async (req: Request, res: Response) => {
  const { logId, promptSnippet, rating, category, comment, source } = req.body;
  if (!rating || !['positive', 'negative'].includes(rating)) {
    res.status(400).json({ error: 'Rating must be positive or negative' });
    return;
  }
  const saved = await storage.saveFeedback({
    logId,
    promptSnippet,
    rating,
    category: category || 'general',
    comment: comment || '',
    source: source || 'dashboard',
  });
  res.status(201).json({ success: true, feedback: saved });
});

adminRouter.get('/feedback', async (req: Request, res: Response) => {
  const limit = parseInt((req.query.limit as string) || '50', 10);
  const feedbacks = await storage.getFeedbacks(limit);
  res.json({ feedbacks });
});

// 6. System Status
adminRouter.get('/status', (req: Request, res: Response) => {
  res.json({
    status: 'online',
    version: '1.0.0',
    cachedEntries: cacheService.getCacheSize(),
    timestamp: new Date().toISOString(),
  });
});

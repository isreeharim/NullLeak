import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { completionsRouter } from './routes/completions.js';
import { adminRouter } from './routes/admin.js';
import { authAndRateLimitMiddleware } from './middleware/authRateLimit.js';

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'nullleak-gateway', uptime: process.uptime() });
});

// Admin / Dashboard API routes (CORS-enabled for Developer Portal)
app.use('/api/v1', adminRouter);

// Reverse Proxy Endpoint (Authenticated via Bearer Token)
app.use('/v1', authAndRateLimitMiddleware, completionsRouter);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Gateway Exception]', err);
  res.status(500).json({
    error: {
      message: 'Internal Gateway Error',
      type: 'internal_error',
    },
  });
});

import { antigravityWatcher } from './services/antigravityWatcher.js';

app.listen(config.port, () => {
  console.log(`\n======================================================`);
  console.log(`🛡️  NullLeak AI Guardrail & Optimizer Gateway Running`);
  console.log(`======================================================`);
  console.log(`🌐 Gateway Proxy Base URL: http://localhost:${config.port}/v1`);
  console.log(`📊 Admin / Telemetry API:  http://localhost:${config.port}/api/v1`);
  console.log(`🔑 Default Live Test Key:   ${config.defaultApiKey}`);
  console.log(`⚡ Mode:                    Zero-Config Dual-Mode (Ready)\n`);

  // Start real-time Antigravity activity & token synchronization
  antigravityWatcher.start();
});

export default app;

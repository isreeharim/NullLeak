import { Request, Response, NextFunction } from 'express';
import { storage } from '../services/storage.js';
import { IApiKey } from '../types.js';

declare global {
  namespace Express {
    interface Request {
      apiKeyDoc?: IApiKey;
    }
  }
}

// Sliding window counter in memory
const requestWindowMap = new Map<string, number[]>();

export async function authAndRateLimitMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: {
        message: 'Missing or malformed Authorization header. Expected Bearer token.',
        type: 'invalid_request_error',
        code: 'unauthorized',
      },
    });
    return;
  }

  const rawKey = authHeader.replace('Bearer ', '').trim();
  const keyDoc = await storage.getApiKeyRaw(rawKey);

  if (!keyDoc) {
    res.status(401).json({
      error: {
        message: 'Invalid API key provided.',
        type: 'invalid_request_error',
        code: 'invalid_api_key',
      },
    });
    return;
  }

  if (!keyDoc.isEnabled) {
    res.status(403).json({
      error: {
        message: 'This API key has been revoked or disabled.',
        type: 'invalid_request_error',
        code: 'api_key_disabled',
      },
    });
    return;
  }

  // Monthly Budget Cap Check
  const org = await storage.getOrganization(keyDoc.orgId);
  if (org && org.currentMonthSpendUsd >= org.monthlySpendLimitUsd) {
    res.status(429).json({
      error: {
        message: `Monthly budget cap ($${org.monthlySpendLimitUsd.toFixed(2)}) exceeded for this organization. Upgrade limit to continue.`,
        type: 'budget_limit_exceeded',
        code: 'budget_cap_reached',
      },
    });
    return;
  }

  // Sliding Window Rate Limiting (RPM)
  const now = Date.now();
  const windowStart = now - 60000;
  const timestamps = (requestWindowMap.get(keyDoc._id) || []).filter((t) => t > windowStart);

  if (timestamps.length >= keyDoc.rateLimitRpm) {
    res.status(429).json({
      error: {
        message: `Rate limit of ${keyDoc.rateLimitRpm} requests per minute exceeded.`,
        type: 'rate_limit_exceeded',
        code: 'rate_limit_exceeded',
      },
    });
    return;
  }

  timestamps.push(now);
  requestWindowMap.set(keyDoc._id, timestamps);

  req.apiKeyDoc = keyDoc;
  next();
}

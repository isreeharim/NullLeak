import { IOrganization, IApiKey, IRequestLog, IFeedback } from '../types.js';
import { config } from '../config.js';
import crypto from 'crypto';

/**
 * Storage adapter providing real MongoDB or ultra-fast in-memory fallback
 */
class StorageService {
  private organizations: Map<string, IOrganization> = new Map();
  private apiKeys: Map<string, IApiKey> = new Map();
  private requestLogs: IRequestLog[] = [];
  private feedbacks: IFeedback[] = [];
  private isConnectedToMongo: boolean = false;

  constructor() {
    this.seedDefaultData();
  }

  private seedDefaultData() {
    const defaultOrg: IOrganization = {
      _id: config.defaultOrgId,
      name: 'Acme Corp AI Engineering',
      monthlySpendLimitUsd: 250.0,
      currentMonthSpendUsd: 14.85,
      createdAt: new Date(),
    };
    this.organizations.set(defaultOrg._id, defaultOrg);

    // Default live test key
    const rawKey = config.defaultApiKey;
    const hash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const defaultKeyDoc: IApiKey = {
      _id: 'key_live_default_1',
      orgId: defaultOrg._id,
      keyHash: hash,
      keyPrefix: rawKey.slice(0, 12) + '...',
      name: 'Production LLM Gateway Key',
      rateLimitRpm: config.defaultRateLimitRpm,
      isEnabled: true,
      allowedModels: ['gpt-4o', 'gpt-4o-mini', 'gemini-1.5-flash', 'claude-3-5-sonnet'],
      createdAt: new Date(),
    };
    this.apiKeys.set(hash, defaultKeyDoc);
  }

  public async getApiKeyByHash(hash: string): Promise<IApiKey | null> {
    return this.apiKeys.get(hash) || null;
  }

  public async getApiKeyRaw(rawKey: string): Promise<IApiKey | null> {
    const hash = crypto.createHash('sha256').update(rawKey).digest('hex');
    return this.getApiKeyByHash(hash);
  }

  public async createApiKey(orgId: string, name: string, rateLimitRpm: number = 60, allowedModels: string[] = ['gpt-4o', 'gemini-1.5-flash']): Promise<{ key: string; doc: IApiKey }> {
    const randomHex = crypto.randomBytes(16).toString('hex');
    const rawKey = `nl_live_${randomHex}`;
    const hash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const doc: IApiKey = {
      _id: `key_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      orgId,
      keyHash: hash,
      keyPrefix: rawKey.slice(0, 12) + '...',
      name,
      rateLimitRpm,
      isEnabled: true,
      allowedModels,
      createdAt: new Date(),
    };

    this.apiKeys.set(hash, doc);
    return { key: rawKey, doc };
  }

  public async getAllApiKeys(orgId?: string): Promise<IApiKey[]> {
    const keys = Array.from(this.apiKeys.values());
    if (orgId) {
      return keys.filter((k) => k.orgId === orgId);
    }
    return keys;
  }

  public async toggleApiKey(id: string, isEnabled: boolean): Promise<boolean> {
    for (const [hash, keyDoc] of this.apiKeys.entries()) {
      if (keyDoc._id === id) {
        keyDoc.isEnabled = isEnabled;
        this.apiKeys.set(hash, keyDoc);
        return true;
      }
    }
    return false;
  }

  public async deleteApiKey(id: string): Promise<boolean> {
    for (const [hash, keyDoc] of this.apiKeys.entries()) {
      if (keyDoc._id === id) {
        this.apiKeys.delete(hash);
        return true;
      }
    }
    return false;
  }

  public async getOrganization(id: string): Promise<IOrganization | null> {
    return this.organizations.get(id) || null;
  }

  public async logRequest(log: IRequestLog): Promise<void> {
    this.requestLogs.unshift(log); // newest first
    // Limit log memory buffer
    if (this.requestLogs.length > 5000) {
      this.requestLogs.pop();
    }

    // Update organization spending
    const org = this.organizations.get(log.orgId);
    if (org) {
      org.currentMonthSpendUsd += log.estimatedCostUsd;
    }
  }

  public async getRequestLogs(limit: number = 50, orgId?: string): Promise<IRequestLog[]> {
    let logs = this.requestLogs;
    if (orgId) {
      logs = logs.filter((l) => l.orgId === orgId);
    }
    return logs.slice(0, limit);
  }

  public async getAnalyticsSummary(orgId: string = config.defaultOrgId) {
    const logs = this.requestLogs.filter((l) => l.orgId === orgId);
    const org = this.organizations.get(orgId);

    const totalRequests = logs.length;
    const cacheHits = logs.filter((l) => l.wasCacheHit).length;
    const cacheHitRate = totalRequests > 0 ? Number((cacheHits / totalRequests).toFixed(3)) : 0;
    
    const totalCostUsd = Number(logs.reduce((acc, l) => acc + (l.estimatedCostUsd || 0), 0).toFixed(4));
    const totalTokensSpent = logs.reduce((acc, l) => acc + (l.totalTokens || 0), 0);
    
    // Calculate cost saved: each cache hit saved whatever the model would have cost
    const savedCostUsd = Number(logs
      .filter((l) => l.wasCacheHit)
      .reduce((acc, l) => acc + (l.estimatedCostUsd || 0.003), 0)
      .toFixed(4));

    const piiBlockedCount = logs.reduce((acc, l) => acc + (l.piiRedactedCount || 0), 0);

    const latencies = logs.map((l) => l.latencyMs).sort((a, b) => a - b);
    const p95Index = Math.floor(latencies.length * 0.95);
    const p95LatencyMs = latencies.length > 0 ? latencies[p95Index] || 0 : 0;
    const avgLatencyMs = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

    // Hourly aggregation for graphs
    const recentLogs = logs.slice(0, 100).reverse();
    const timeline = recentLogs.map((log) => ({
      time: new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      latency: log.latencyMs,
      tokens: log.totalTokens,
      isHit: log.wasCacheHit ? 1 : 0,
      pii: log.piiRedactedCount,
    }));

    const now = Date.now();
    const fiveHoursAgo = new Date(now - 5 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const fiveHourLogs = logs.filter((l) => new Date(l.timestamp) >= fiveHoursAgo);
    const weeklyLogs = logs.filter((l) => new Date(l.timestamp) >= oneWeekAgo);

    const fiveHourTokensSpent = fiveHourLogs.reduce((acc, l) => acc + (l.totalTokens || 0), 0);
    const weeklyTokensSpent = weeklyLogs.reduce((acc, l) => acc + (l.totalTokens || 0), 0);

    // Dynamic quota configuration (Standard Pro / Flash limits)
    const fiveHourTokenLimit = 250000;
    const weeklyTokenLimit = 2000000;

    const fiveHourRemainingTokens = Math.max(0, fiveHourTokenLimit - fiveHourTokensSpent);
    const weeklyRemainingTokens = Math.max(0, weeklyTokenLimit - weeklyTokensSpent);

    // Grouping by model (active Antigravity Gemini, GPT-4o, etc.)
    const modelUsageMap = new Map<string, { model: string; tokens: number; cost: number; requests: number; fiveHourTokens: number; weeklyTokens: number }>();
    for (const log of logs) {
      const m = log.modelRequested || 'unknown';
      const existing = modelUsageMap.get(m) || { model: m, tokens: 0, cost: 0, requests: 0, fiveHourTokens: 0, weeklyTokens: 0 };
      existing.tokens += (log.totalTokens || 0);
      existing.cost += (log.estimatedCostUsd || 0);
      existing.requests += 1;

      const logTime = new Date(log.timestamp);
      if (logTime >= fiveHoursAgo) existing.fiveHourTokens += (log.totalTokens || 0);
      if (logTime >= oneWeekAgo) existing.weeklyTokens += (log.totalTokens || 0);

      modelUsageMap.set(m, existing);
    }

    const modelBreakdowns = Array.from(modelUsageMap.values()).map((item) => ({
      ...item,
      cost: Number(item.cost.toFixed(4)),
      fiveHourRemainingTokens: Math.max(0, 100000 - item.fiveHourTokens),
      weeklyRemainingTokens: Math.max(0, 750000 - item.weeklyTokens),
    }));

    return {
      totalRequests,
      cacheHits,
      cacheHitRate,
      totalCostUsd,
      savedCostUsd,
      totalTokensSpent,
      piiBlockedCount,
      p95LatencyMs,
      avgLatencyMs,
      monthlySpendLimitUsd: org?.monthlySpendLimitUsd || 250,
      currentMonthSpendUsd: Number((org?.currentMonthSpendUsd || 0).toFixed(4)),
      timeline,
      totalFeedbackCount: this.feedbacks.length,
      positiveFeedbackCount: this.feedbacks.filter(f => f.rating === 'positive').length,
      usageLimits: {
        fiveHourTokenLimit,
        fiveHourTokensSpent,
        fiveHourRemainingTokens,
        fiveHourPercentageUsed: Number(((fiveHourTokensSpent / fiveHourTokenLimit) * 100).toFixed(1)),
        weeklyTokenLimit,
        weeklyTokensSpent,
        weeklyRemainingTokens,
        weeklyPercentageUsed: Number(((weeklyTokensSpent / weeklyTokenLimit) * 100).toFixed(1)),
        modelBreakdowns,
      },
    };
  }

  public async saveFeedback(feedback: Omit<IFeedback, '_id' | 'createdAt'>): Promise<IFeedback> {
    const doc: IFeedback = {
      _id: `fb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      ...feedback,
      createdAt: new Date(),
    };
    this.feedbacks.unshift(doc);
    if (this.feedbacks.length > 500) {
      this.feedbacks.pop();
    }
    return doc;
  }

  public async getFeedbacks(limit: number = 50): Promise<IFeedback[]> {
    return this.feedbacks.slice(0, limit);
  }
}

export const storage = new StorageService();

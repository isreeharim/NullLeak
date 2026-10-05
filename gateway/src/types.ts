export interface IOrganization {
  _id: string;
  name: string;
  monthlySpendLimitUsd: number;
  currentMonthSpendUsd: number;
  createdAt: Date;
}

export interface IApiKey {
  _id: string;
  orgId: string;
  keyHash: string;
  keyPrefix: string;
  name: string;
  rateLimitRpm: number;
  isEnabled: boolean;
  allowedModels: string[];
  createdAt: Date;
}

export interface IRequestLog {
  _id: string;
  orgId: string;
  apiKeyId: string;
  modelRequested: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  wasCacheHit: boolean;
  piiRedactedCount: number;
  piiTypesDetected: string[];
  statusCode: number;
  timestamp: Date;
  rawPrompt?: string;
  sanitizedPrompt?: string;
  responseSnippet?: string;
}

export interface IFeedback {
  _id: string;
  logId?: string;
  promptSnippet?: string;
  rating: 'positive' | 'negative';
  category: 'guardrail_accuracy' | 'cache_quality' | 'latency' | 'general';
  comment: string;
  source: 'dashboard' | 'mcp' | 'api';
  createdAt: Date;
}

export interface IChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  name?: string;
}

export interface IChatCompletionRequest {
  model: string;
  messages: IChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  [key: string]: any;
}

export interface ICachedEntry {
  id: string;
  sanitizedPrompt: string;
  embedding?: number[];
  model: string;
  response: string;
  responseChunks?: string[];
  tokens: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  createdAt: number;
  ttlSeconds: number;
}

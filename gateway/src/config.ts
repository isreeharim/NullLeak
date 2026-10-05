import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Storage & Cache
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/nullleak',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  useInMemoryFallback: process.env.USE_IN_MEMORY_FALLBACK !== 'false', // default true for seamless local dev

  // Upstream Providers
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  geminiApiKey: process.env.GEMINI_API_KEY || '',

  // Cache & Guardrails Configuration
  semanticCacheThreshold: parseFloat(process.env.SEMANTIC_CACHE_THRESHOLD || '0.75'),
  cacheTtlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '86400', 10), // 24 hours
  defaultRateLimitRpm: parseInt(process.env.DEFAULT_RATE_LIMIT_RPM || '60', 10),

  // Initial Admin / Dev Org Key (for testing)
  defaultOrgId: 'org_enterprise_default',
  defaultApiKey: process.env.DEFAULT_GATEWAY_KEY || 'nl_live_test_7f8e9d0a1b2c3d4e5f6a',
};

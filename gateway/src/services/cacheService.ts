import { ICachedEntry } from '../types.js';
import { config } from '../config.js';

/**
 * High-speed tokenization and vector similarity math
 */
function createBagOfWordsVector(text: string): Map<string, number> {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  const freq = new Map<string, number>();
  for (const word of words) {
    freq.set(word, (freq.get(word) || 0) + 1);
  }
  return freq;
}

function cosineSimilarity(vecA: Map<string, number>, vecB: Map<string, number>): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const [, val] of vecA) {
    normA += val * val;
  }
  for (const [, val] of vecB) {
    normB += val * val;
  }

  if (normA === 0 || normB === 0) return 0;

  for (const [key, valA] of vecA) {
    if (vecB.has(key)) {
      dotProduct += valA * (vecB.get(key) || 0);
    }
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

class CacheService {
  private cacheEntries: Map<string, ICachedEntry> = new Map();
  private vectorCache: Map<string, Map<string, number>> = new Map();

  /**
   * Search for exact or semantically similar prompt in the cache
   */
  public async findMatch(sanitizedPrompt: string, model: string): Promise<{ entry: ICachedEntry; similarity: number } | null> {
    const trimmed = sanitizedPrompt.trim();
    if (!trimmed) return null;

    // 1. Exact match check (O(1))
    const exactId = `${model}:${trimmed}`;
    if (this.cacheEntries.has(exactId)) {
      const entry = this.cacheEntries.get(exactId)!;
      return { entry, similarity: 1.0 };
    }

    // 2. Semantic Vector similarity check
    const queryVector = createBagOfWordsVector(trimmed);
    let bestMatch: ICachedEntry | null = null;
    let highestSim = 0;

    for (const [id, entry] of this.cacheEntries.entries()) {
      if (entry.model !== model) continue;

      const cachedVector = this.vectorCache.get(id);
      if (!cachedVector) continue;

      const sim = cosineSimilarity(queryVector, cachedVector);
      if (sim > highestSim) {
        highestSim = sim;
        bestMatch = entry;
      }
    }

    if (bestMatch && highestSim >= config.semanticCacheThreshold) {
      return { entry: bestMatch, similarity: highestSim };
    }

    return null;
  }

  /**
   * Persist completion in cache with vector indexing
   */
  public async setEntry(
    sanitizedPrompt: string,
    model: string,
    response: string,
    tokens: { promptTokens: number; completionTokens: number; totalTokens: number }
  ): Promise<void> {
    const trimmed = sanitizedPrompt.trim();
    const id = `${model}:${trimmed}`;

    const entry: ICachedEntry = {
      id,
      sanitizedPrompt: trimmed,
      model,
      response,
      tokens,
      createdAt: Date.now(),
      ttlSeconds: config.cacheTtlSeconds,
    };

    this.cacheEntries.set(id, entry);
    this.vectorCache.set(id, createBagOfWordsVector(trimmed));

    // Cap cache size in memory
    if (this.cacheEntries.size > 2000) {
      const oldestKey = this.cacheEntries.keys().next().value;
      if (oldestKey) {
        this.cacheEntries.delete(oldestKey);
        this.vectorCache.delete(oldestKey);
      }
    }
  }

  public getCacheSize(): number {
    return this.cacheEntries.size;
  }
}

export const cacheService = new CacheService();

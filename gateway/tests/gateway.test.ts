import { describe, it, expect } from 'vitest';
import { PiiSanitizer } from '../src/services/piiSanitizer.js';
import { cacheService } from '../src/services/cacheService.js';
import { calculateCost } from '../src/services/costCalculator.js';

describe('NullLeak Gateway Core Services', () => {
  describe('PII & Secret Sanitization', () => {
    it('redacts email addresses correctly', () => {
      const input = 'Please contact alice.support@nullleak.com for queries.';
      const res = PiiSanitizer.sanitize(input);
      expect(res.redactedCount).toBe(1);
      expect(res.typesDetected).toContain('EMAIL');
      expect(res.sanitizedText).toContain('[REDACTED_EMAIL]');
      expect(res.sanitizedText).not.toContain('alice.support@nullleak.com');
    });

    it('redacts valid credit cards and passes non-cards', () => {
      // 4111 1111 1111 1111 is a classic valid Visa test card
      const input = 'My Visa card is 4111 1111 1111 1111 and my SSN is 123-45-6789.';
      const res = PiiSanitizer.sanitize(input);
      expect(res.typesDetected).toContain('CREDIT_CARD');
      expect(res.typesDetected).toContain('SSN');
      expect(res.sanitizedText).toContain('[REDACTED_CREDIT_CARD]');
      expect(res.sanitizedText).toContain('[REDACTED_SSN]');
    });

    it('redacts sensitive API tokens', () => {
      const input = 'My OpenAI key is sk-1234567890abcdef1234567890abcdef12345678';
      const res = PiiSanitizer.sanitize(input);
      expect(res.typesDetected).toContain('API_KEY');
      expect(res.sanitizedText).toContain('[REDACTED_API_KEY]');
    });
  });

  describe('Semantic Caching Engine', () => {
    it('stores and matches identical and near-identical queries', async () => {
      const prompt1 = 'How do I reset my user account password?';
      const model = 'gpt-4o';
      const response = 'Go to settings and click Reset Password.';

      await cacheService.setEntry(prompt1, model, response, {
        promptTokens: 10,
        completionTokens: 8,
        totalTokens: 18,
      });

      // Exact match
      const exactMatch = await cacheService.findMatch(prompt1, model);
      expect(exactMatch).not.toBeNull();
      expect(exactMatch?.similarity).toBe(1.0);
      expect(exactMatch?.entry.response).toBe(response);

      // Semantic match
      const nearPrompt = 'How do I reset my password?';
      const simMatch = await cacheService.findMatch(nearPrompt, model);
      expect(simMatch).not.toBeNull();
      expect(simMatch!.similarity).toBeGreaterThanOrEqual(0.75);
    });
  });

  describe('Cost Calculator', () => {
    it('calculates accurate pricing for standard models', () => {
      // gpt-4o: $2.50 / 1M prompt, $10.00 / 1M completion
      const cost = calculateCost('gpt-4o', 1000, 1000);
      expect(cost).toBeCloseTo(0.0125, 4);
    });
  });
});

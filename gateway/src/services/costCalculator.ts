export interface ModelRate {
  inputPerMillion: number;
  outputPerMillion: number;
}

export const MODEL_PRICING: Record<string, ModelRate> = {
  // OpenAI
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10.0 },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  'gpt-4-turbo': { inputPerMillion: 10.0, outputPerMillion: 30.0 },
  'gpt-3.5-turbo': { inputPerMillion: 0.5, outputPerMillion: 1.5 },
  // Gemini
  'gemini-1.5-flash': { inputPerMillion: 0.075, outputPerMillion: 0.3 },
  'gemini-1.5-pro': { inputPerMillion: 1.25, outputPerMillion: 5.0 },
  'gemini-2.0-flash': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  // Anthropic
  'claude-3-5-sonnet': { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  'claude-3-haiku': { inputPerMillion: 0.25, outputPerMillion: 1.25 },
};

export function calculateCost(model: string, promptTokens: number, completionTokens: number): number {
  const rate = MODEL_PRICING[model] || { inputPerMillion: 1.0, outputPerMillion: 3.0 };
  const inputCost = (promptTokens / 1_000_000) * rate.inputPerMillion;
  const outputCost = (completionTokens / 1_000_000) * rate.outputPerMillion;
  return Number((inputCost + outputCost).toFixed(6));
}

export function estimateTokenCount(text: string): number {
  // Approximate standard 1 token ~= 4 chars / 0.75 words
  return Math.max(1, Math.ceil(text.length / 3.8));
}

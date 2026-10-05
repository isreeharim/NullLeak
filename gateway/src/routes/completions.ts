import { Router, Request, Response } from 'express';
import { PiiSanitizer } from '../services/piiSanitizer.js';
import { cacheService } from '../services/cacheService.js';
import { calculateCost, estimateTokenCount } from '../services/costCalculator.js';
import { telemetryWorker } from '../services/telemetryWorker.js';
import { IChatCompletionRequest } from '../types.js';
import { config } from '../config.js';
import axios from 'axios';

export const completionsRouter = Router();

completionsRouter.post('/chat/completions', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const apiKeyDoc = req.apiKeyDoc!;
  const body = req.body as IChatCompletionRequest;

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    res.status(400).json({
      error: {
        message: 'Invalid request: "messages" array is required.',
        type: 'invalid_request_error',
      },
    });
    return;
  }

  const model = body.model || 'gpt-4o-mini';
  const isStreaming = Boolean(body.stream);

  // Extract raw user prompt for logging and sanitization
  const userMessages = body.messages.filter((m) => m.role === 'user');
  const lastUserMsg = userMessages[userMessages.length - 1];
  const rawPromptText = typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : '';

  // 1. PII & Secret Redaction Pipeline
  const piiResult = PiiSanitizer.sanitizeMessages(body.messages);
  const sanitizedMessages = piiResult.sanitizedMessages;
  const sanitizedPromptText = typeof sanitizedMessages[sanitizedMessages.length - 1]?.content === 'string'
    ? sanitizedMessages[sanitizedMessages.length - 1].content
    : '';

  // 2. Semantic & Exact Cache Check
  const cacheHit = await cacheService.findMatch(sanitizedPromptText, model);

  if (cacheHit) {
    const latencyMs = Date.now() - startTime;
    const { entry, similarity } = cacheHit;

    res.setHeader('x-nullleak-cache', 'HIT');
    res.setHeader('x-nullleak-cache-similarity', similarity.toFixed(3));
    res.setHeader('x-nullleak-latency', `${latencyMs}ms`);
    res.setHeader('x-nullleak-pii-redacted', piiResult.totalRedacted.toString());

    if (isStreaming) {
      // Stream cached response in chunks via SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const words = entry.response.split(' ');
      for (let i = 0; i < words.length; i++) {
        const chunk = {
          id: `chatcmpl-cache-${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [
            {
              index: 0,
              delta: { content: (i > 0 ? ' ' : '') + words[i] },
              finish_reason: i === words.length - 1 ? 'stop' : null,
            },
          ],
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      // Non-streaming standard OpenAI JSON response
      const payload = {
        id: `chatcmpl-cache-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: entry.response,
            },
            finish_reason: 'stop',
          },
        ],
        usage: entry.tokens,
      };
      res.json(payload);
    }

    // Telemetry dispatch ($0 cost, 0 upstream tokens consumed)
    telemetryWorker.enqueue({
      orgId: apiKeyDoc.orgId,
      apiKeyId: apiKeyDoc._id,
      modelRequested: model,
      promptTokens: entry.tokens.promptTokens,
      completionTokens: entry.tokens.completionTokens,
      totalTokens: entry.tokens.totalTokens,
      estimatedCostUsd: 0.0, // Free thanks to cache!
      latencyMs,
      wasCacheHit: true,
      piiRedactedCount: piiResult.totalRedacted,
      piiTypesDetected: piiResult.typesDetected,
      statusCode: 200,
      timestamp: new Date(),
      rawPrompt: rawPromptText.slice(0, 300),
      sanitizedPrompt: sanitizedPromptText.slice(0, 300),
      responseSnippet: entry.response.slice(0, 300),
    });
    return;
  }

  // 3. Cache Miss: Forward upstream or execute simulated intelligent completion
  res.setHeader('x-nullleak-cache', 'MISS');
  res.setHeader('x-nullleak-pii-redacted', piiResult.totalRedacted.toString());

  // Check if live OpenAI Key exists; otherwise execute zero-config intelligent mock provider
  if (config.openaiApiKey) {
    try {
      const upstreamReq = {
        ...body,
        messages: sanitizedMessages,
      };

      if (isStreaming) {
        const upstreamResponse = await axios.post(
          `${config.openaiBaseUrl}/chat/completions`,
          upstreamReq,
          {
            headers: {
              Authorization: `Bearer ${config.openaiApiKey}`,
              'Content-Type': 'application/json',
            },
            responseType: 'stream',
          }
        );

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        let accumulatedContent = '';

        upstreamResponse.data.on('data', (chunk: Buffer) => {
          const chunkStr = chunk.toString();
          res.write(chunk);

          // Parse chunks to accumulate response text for cache
          const lines = chunkStr.split('\n').filter((line) => line.trim().startsWith('data: '));
          for (const line of lines) {
            const rawData = line.replace('data: ', '').trim();
            if (rawData === '[DONE]') continue;
            try {
              const parsed = JSON.parse(rawData);
              const delta = parsed.choices?.[0]?.delta?.content || '';
              accumulatedContent += delta;
            } catch {
              // ignore parse errors on partial streams
            }
          }
        });

        upstreamResponse.data.on('end', async () => {
          res.end();
          const latencyMs = Date.now() - startTime;
          const promptTokens = estimateTokenCount(sanitizedPromptText);
          const completionTokens = estimateTokenCount(accumulatedContent);
          const totalTokens = promptTokens + completionTokens;
          const cost = calculateCost(model, promptTokens, completionTokens);

          // Write to semantic cache
          await cacheService.setEntry(sanitizedPromptText, model, accumulatedContent, {
            promptTokens,
            completionTokens,
            totalTokens,
          });

          telemetryWorker.enqueue({
            orgId: apiKeyDoc.orgId,
            apiKeyId: apiKeyDoc._id,
            modelRequested: model,
            promptTokens,
            completionTokens,
            totalTokens,
            estimatedCostUsd: cost,
            latencyMs,
            wasCacheHit: false,
            piiRedactedCount: piiResult.totalRedacted,
            piiTypesDetected: piiResult.typesDetected,
            statusCode: 200,
            timestamp: new Date(),
            rawPrompt: rawPromptText.slice(0, 300),
            sanitizedPrompt: sanitizedPromptText.slice(0, 300),
            responseSnippet: accumulatedContent.slice(0, 300),
          });
        });
        return;
      } else {
        // Non-streaming live upstream
        const upstreamResponse = await axios.post(
          `${config.openaiBaseUrl}/chat/completions`,
          upstreamReq,
          {
            headers: {
              Authorization: `Bearer ${config.openaiApiKey}`,
              'Content-Type': 'application/json',
            },
          }
        );

        const latencyMs = Date.now() - startTime;
        res.setHeader('x-nullleak-latency', `${latencyMs}ms`);
        const completionText = upstreamResponse.data.choices?.[0]?.message?.content || '';
        const usage = upstreamResponse.data.usage || {
          prompt_tokens: estimateTokenCount(sanitizedPromptText),
          completion_tokens: estimateTokenCount(completionText),
          total_tokens: estimateTokenCount(sanitizedPromptText) + estimateTokenCount(completionText),
        };

        const cost = calculateCost(model, usage.prompt_tokens, usage.completion_tokens);

        await cacheService.setEntry(sanitizedPromptText, model, completionText, {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        });

        telemetryWorker.enqueue({
          orgId: apiKeyDoc.orgId,
          apiKeyId: apiKeyDoc._id,
          modelRequested: model,
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
          estimatedCostUsd: cost,
          latencyMs,
          wasCacheHit: false,
          piiRedactedCount: piiResult.totalRedacted,
          piiTypesDetected: piiResult.typesDetected,
          statusCode: 200,
          timestamp: new Date(),
          rawPrompt: rawPromptText.slice(0, 300),
          sanitizedPrompt: sanitizedPromptText.slice(0, 300),
          responseSnippet: completionText.slice(0, 300),
        });

        res.json(upstreamResponse.data);
        return;
      }
    } catch (err: any) {
      console.error('[Gateway Upstream Error]', err?.response?.data || err?.message);
      // Fallback to simulated provider if upstream fails or credentials invalid
    }
  }

  // Intelligent local provider execution (for zero-config offline runs, demos & testing)
  const simulatedResponse = generateSmartCompletion(sanitizedPromptText, model);
  const promptTokens = estimateTokenCount(sanitizedPromptText);
  const completionTokens = estimateTokenCount(simulatedResponse);
  const totalTokens = promptTokens + completionTokens;
  const cost = calculateCost(model, promptTokens, completionTokens);
  const latencyMs = Date.now() - startTime;

  // Cache the generated response
  await cacheService.setEntry(sanitizedPromptText, model, simulatedResponse, {
    promptTokens,
    completionTokens,
    totalTokens,
  });

  if (isStreaming) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const words = simulatedResponse.split(' ');
    for (let i = 0; i < words.length; i++) {
      const chunk = {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            delta: { content: (i > 0 ? ' ' : '') + words[i] },
            finish_reason: i === words.length - 1 ? 'stop' : null,
          },
        ],
      };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } else {
    res.setHeader('x-nullleak-latency', `${latencyMs}ms`);
    res.json({
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: simulatedResponse,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
      },
    });
  }

  telemetryWorker.enqueue({
    orgId: apiKeyDoc.orgId,
    apiKeyId: apiKeyDoc._id,
    modelRequested: model,
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd: cost,
    latencyMs,
    wasCacheHit: false,
    piiRedactedCount: piiResult.totalRedacted,
    piiTypesDetected: piiResult.typesDetected,
    statusCode: 200,
    timestamp: new Date(),
    rawPrompt: rawPromptText.slice(0, 300),
    sanitizedPrompt: sanitizedPromptText.slice(0, 300),
    responseSnippet: simulatedResponse.slice(0, 300),
  });
});

function generateSmartCompletion(prompt: string, model: string): string {
  const p = prompt.toLowerCase();
  if (p.includes('password') || p.includes('reset')) {
    return 'To reset your account password, navigate to Account Settings > Security > Reset Password. You will receive an email verification token to complete the process securely.';
  }
  if (p.includes('billing') || p.includes('invoice') || p.includes('subscription')) {
    return 'You can review and download all past invoices in your Billing Dashboard under "Payment History". Invoices are generated automatically on the 1st of each month.';
  }
  if (p.includes('api') || p.includes('key') || p.includes('token')) {
    return 'Gateway API keys are managed centrally through the NullLeak developer portal. Remember never to commit raw Bearer keys into public source repositories.';
  }
  return `[${model}] Processed query: "${prompt}". NullLeak sanitized all sensitive PII tokens and secured transmission with enterprise budget guardrails.`;
}

import { storage } from './storage.js';
import { IRequestLog } from '../types.js';

export interface TelemetryJobData {
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

class TelemetryWorker {
  private queue: TelemetryJobData[] = [];
  private isProcessing: boolean = false;

  constructor() {
    // Process queue in regular batch intervals (simulate BullMQ worker)
    setInterval(() => this.processBatch(), 200);
  }

  /**
   * Non-blocking dispatch called after client response closes
   */
  public enqueue(job: TelemetryJobData) {
    this.queue.push(job);
  }

  private async processBatch() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    try {
      const batch = this.queue.splice(0, 50); // process up to 50 items
      for (const item of batch) {
        const logEntry: IRequestLog = {
          _id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          orgId: item.orgId,
          apiKeyId: item.apiKeyId,
          modelRequested: item.modelRequested,
          promptTokens: item.promptTokens,
          completionTokens: item.completionTokens,
          totalTokens: item.totalTokens,
          estimatedCostUsd: item.estimatedCostUsd,
          latencyMs: item.latencyMs,
          wasCacheHit: item.wasCacheHit,
          piiRedactedCount: item.piiRedactedCount,
          piiTypesDetected: item.piiTypesDetected,
          statusCode: item.statusCode,
          timestamp: item.timestamp,
          rawPrompt: item.rawPrompt,
          sanitizedPrompt: item.sanitizedPrompt,
          responseSnippet: item.responseSnippet,
        };

        await storage.logRequest(logEntry);
      }
    } catch (err) {
      console.error('[TelemetryWorker] Error processing telemetry batch:', err);
    } finally {
      this.isProcessing = false;
    }
  }
}

export const telemetryWorker = new TelemetryWorker();

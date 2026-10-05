import readline from 'readline';
import { PiiSanitizer } from '../services/piiSanitizer.js';
import { cacheService } from '../services/cacheService.js';
import { storage } from '../services/storage.js';
import { calculateCost, estimateTokenCount } from '../services/costCalculator.js';

/**
 * Standard MCP JSON-RPC 2.0 Server over Stdio
 * Provides Antigravity with live tools to sanitize PII, query semantic cache, and check gateway status.
 */

const TOOLS = [
  {
    name: 'nullleak_sanitize_prompt',
    description: 'Scans and sanitizes a prompt for sensitive PII (credit cards via Luhn, SSNs, emails, API keys/Bearer tokens, IPv4) before sending it to an LLM.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The raw user prompt containing potentially sensitive data',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'nullleak_check_cache',
    description: 'Checks the NullLeak semantic vector cache for cached LLM completions matching a given prompt to avoid duplicate token costs.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The sanitized prompt to query in the semantic cache',
        },
        model: {
          type: 'string',
          description: 'Target LLM model (e.g. gpt-4o, gpt-4o-mini, gemini-1.5-flash)',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'nullleak_get_telemetry_summary',
    description: 'Returns live telemetry metrics: cost saved, cache hit rate, PII blocked incidents, and latency p95.',
    inputSchema: {
      type: 'object',
      properties: {
        orgId: {
          type: 'string',
          description: 'Optional organization ID to inspect (defaults to default org)',
        },
      },
    },
  },
  {
    name: 'nullleak_create_api_key',
    description: 'Generates a new client API key for accessing the NullLeak reverse proxy.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Descriptive name for the API key asset',
        },
        rateLimitRpm: {
          type: 'number',
          description: 'Requests per minute limit (e.g. 60)',
        },
      },
      required: ['name'],
    },
  },
];

async function handleToolCall(name: string, args: any) {
  switch (name) {
    case 'nullleak_sanitize_prompt': {
      const res = PiiSanitizer.sanitize(args.prompt);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(res, null, 2),
          },
        ],
      };
    }
    case 'nullleak_check_cache': {
      const model = args.model || 'gpt-4o';
      const match = await cacheService.findMatch(args.prompt, model);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              match
                ? {
                    status: 'CACHE_HIT',
                    similarity: match.similarity,
                    response: match.entry.response,
                    tokens: match.entry.tokens,
                  }
                : {
                    status: 'CACHE_MISS',
                    message: 'No semantically similar response found in cache.',
                  },
              null,
              2
            ),
          },
        ],
      };
    }
    case 'nullleak_get_telemetry_summary': {
      const summary = await storage.getAnalyticsSummary(args.orgId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    }
    case 'nullleak_create_api_key': {
      const result = await storage.createApiKey(
        'org_enterprise_default',
        args.name,
        args.rateLimitRpm || 60
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
    default:
      throw new Error(`Tool ${name} not found`);
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const msg = JSON.parse(trimmed);
    const id = msg.id;

    if (msg.method === 'initialize') {
      const response = {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: {
            name: 'nullleak-mcp-server',
            version: '1.0.0',
          },
          capabilities: {
            tools: {},
          },
        },
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    } else if (msg.method === 'tools/list') {
      const response = {
        jsonrpc: '2.0',
        id,
        result: {
          tools: TOOLS,
        },
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    } else if (msg.method === 'tools/call') {
      const { name, arguments: toolArgs } = msg.params;
      const res = await handleToolCall(name, toolArgs);
      const response = {
        jsonrpc: '2.0',
        id,
        result: res,
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    } else {
      // Respond to ping / notifications
      if (id !== undefined) {
        process.stdout.write(
          JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: {},
          }) + '\n'
        );
      }
    }
  } catch (err: any) {
    process.stderr.write(`[NullLeak MCP Error] ${err?.message || err}\n`);
  }
});

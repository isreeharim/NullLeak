# NullLeak AI Guardrail & Cost-Optimizer Rules for Antigravity

This workspace operates behind the **NullLeak AI Guardrail & Cost-Optimizer Gateway**.

## 🛡️ Active Guardrail Policies

1. **Zero Data Leak**:
   - Prompts sent to external or upstream LLM providers must be sanitized of PII, API tokens, credit cards (Luhn validated), and credentials.
   - When communicating with LLM completions endpoints, use the local NullLeak proxy: `http://localhost:4000/v1/chat/completions`.

2. **Semantic Caching & Cost Optimization**:
   - Utilize prompt deduplication and semantic similarity caching before making expensive upstream calls.
   - Default test client key: `nl_live_test_7f8e9d0a1b2c3d4e5f6a`.

3. **Tool Invocations via MCP**:
   - Antigravity is connected directly to NullLeak via the `nullleak` MCP server.
   - Use `nullleak_sanitize_prompt` to test and redact text for security.
   - Use `nullleak_check_cache` to verify if an identical or near-identical prompt has already been cached.
   - Use `nullleak_get_telemetry_summary` to inspect live cost savings, cache hit rate, and blocked PII counts.

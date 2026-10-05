import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Zap,
  TrendingDown,
  Key,
  Terminal,
  Activity,
  Copy,
  CheckCircle,
  Plus,
  Trash2,
  Lock,
  RefreshCw,
  ArrowUpRight,
  Database
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';

interface AnalyticsSummary {
  totalRequests: number;
  cacheHits: number;
  cacheHitRate: number;
  totalCostUsd: number;
  savedCostUsd: number;
  piiBlockedCount: number;
  p95LatencyMs: number;
  avgLatencyMs: number;
  monthlySpendLimitUsd: number;
  currentMonthSpendUsd: number;
  timeline: Array<{
    time: string;
    latency: number;
    tokens: number;
    isHit: number;
    pii: number;
  }>;
}

interface ApiKeyItem {
  _id: string;
  name: string;
  keyPrefix: string;
  rateLimitRpm: number;
  isEnabled: boolean;
  allowedModels: string[];
  createdAt: string;
}

interface RequestLogItem {
  _id: string;
  modelRequested: string;
  totalTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  wasCacheHit: boolean;
  piiRedactedCount: number;
  piiTypesDetected: string[];
  statusCode: number;
  timestamp: string;
  rawPrompt?: string;
  sanitizedPrompt?: string;
}

export function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'playground' | 'keys' | 'logs'>('overview');
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [logs, setLogs] = useState<RequestLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Playground state
  const [sandboxPrompt, setSandboxPrompt] = useState(
    'Hello, my user account email is alice.support@nullleak.com and my secret key is sk-live9876543210abcdef1234. Please help me reset my account password.'
  );
  const [sandboxModel, setSandboxModel] = useState('gpt-4o');
  const [sandboxResult, setSandboxResult] = useState<any>(null);
  const [isSandboxRunning, setIsSandboxRunning] = useState(false);

  // New API key dialog state
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyRpm, setNewKeyRpm] = useState('60');
  const [createdKeySecret, setCreatedKeySecret] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      const [sumRes, keysRes, logsRes] = await Promise.all([
        fetch('/api/v1/analytics/summary').then((r) => r.json()),
        fetch('/api/v1/api-keys').then((r) => r.json()),
        fetch('/api/v1/logs?limit=50').then((r) => r.json()),
      ]);
      setAnalytics(sumRes);
      setApiKeys(keysRes.keys || []);
      setLogs(logsRes.logs || []);
    } catch (err) {
      console.error('Failed fetching data from gateway', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 5000); // 5s live polling
    return () => clearInterval(interval);
  }, []);

  const handleTestSandbox = async () => {
    setIsSandboxRunning(true);
    try {
      // 1. Check Guardrails
      const testRes = await fetch('/api/v1/sandbox/test-guardrails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: sandboxPrompt, model: sandboxModel }),
      }).then((r) => r.json());

      // 2. Execute via Live Proxy to check caching & streaming
      const liveProxyRes = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer nl_live_test_7f8e9d0a1b2c3d4e5f6a',
        },
        body: JSON.stringify({
          model: sandboxModel,
          messages: [{ role: 'user', content: sandboxPrompt }],
        }),
      });

      const proxyHeaderCache = liveProxyRes.headers.get('x-nullleak-cache');
      const proxyHeaderLatency = liveProxyRes.headers.get('x-nullleak-latency');
      const proxyData = await liveProxyRes.json();

      setSandboxResult({
        guardrail: testRes,
        cacheStatus: proxyHeaderCache || 'MISS',
        latency: proxyHeaderLatency || 'N/A',
        completion: proxyData.choices?.[0]?.message?.content || 'No response',
      });
      fetchAllData();
    } catch (err) {
      console.error('Sandbox run error', err);
    } finally {
      setIsSandboxRunning(false);
    }
  };

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newKeyName,
          rateLimitRpm: parseInt(newKeyRpm, 10),
        }),
      }).then((r) => r.json());

      setCreatedKeySecret(res.key);
      fetchAllData();
    } catch (err) {
      console.error('Failed creating API key', err);
    }
  };

  const handleDeleteApiKey = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this API key?')) return;
    await fetch(`/api/v1/api-keys/${id}`, { method: 'DELETE' });
    fetchAllData();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-50 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gradient-to-tr from-cyan-600 to-blue-500 rounded-lg shadow-md shadow-cyan-500/20">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                NullLeak
              </span>
              <span className="text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-400 border border-cyan-800/60">
                Gateway v1.0
              </span>
            </div>
            <p className="text-xs text-slate-400">Zero-Data-Leak AI Guardrail & Cost-Optimizer</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex space-x-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'overview'
                ? 'bg-slate-800 text-cyan-400 shadow-sm shadow-slate-900'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Overview</span>
          </button>
          <button
            onClick={() => setActiveTab('playground')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'playground'
                ? 'bg-slate-800 text-cyan-400 shadow-sm shadow-slate-900'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>Playground</span>
          </button>
          <button
            onClick={() => setActiveTab('keys')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'keys'
                ? 'bg-slate-800 text-cyan-400 shadow-sm shadow-slate-900'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>API Keys</span>
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'logs'
                ? 'bg-slate-800 text-cyan-400 shadow-sm shadow-slate-900'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Audit Logs</span>
          </button>
        </nav>

        {/* Quick status & refresh */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Gateway Online</span>
          </div>
          <button
            onClick={fetchAllData}
            title="Refresh metrics"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 rounded-full blur-2xl group-hover:bg-cyan-500/20 transition"></div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">Total Dollars Saved</span>
                  <div className="p-2 bg-emerald-950/60 rounded-lg text-emerald-400">
                    <TrendingDown className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-2xl font-bold text-white tracking-tight">
                    ${analytics?.savedCostUsd.toFixed(2) || '0.00'}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Saved via Redis semantic cache</p>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition"></div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">Cache Hit Rate</span>
                  <div className="p-2 bg-blue-950/60 rounded-lg text-blue-400">
                    <Zap className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-2xl font-bold text-white tracking-tight">
                    {((analytics?.cacheHitRate || 0) * 100).toFixed(1)}%
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {analytics?.cacheHits || 0} of {analytics?.totalRequests || 0} requests served in &lt;25ms
                  </p>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 rounded-full blur-2xl group-hover:bg-rose-500/20 transition"></div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">PII Incidents Blocked</span>
                  <div className="p-2 bg-rose-950/60 rounded-lg text-rose-400">
                    <Lock className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-2xl font-bold text-white tracking-tight">
                    {analytics?.piiBlockedCount || 0}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Secrets, emails & cards scrubbed</p>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl group-hover:bg-purple-500/20 transition"></div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">Monthly Budget Burn</span>
                  <div className="p-2 bg-purple-950/60 rounded-lg text-purple-400">
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-2xl font-bold text-white tracking-tight">
                    ${analytics?.currentMonthSpendUsd.toFixed(2) || '0.00'} / ${analytics?.monthlySpendLimitUsd || 250}
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
                    <div
                      className="bg-cyan-500 h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(
                          100,
                          ((analytics?.currentMonthSpendUsd || 0) / (analytics?.monthlySpendLimitUsd || 250)) * 100
                        )}%`,
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Gateway Latency Telemetry (ms)</h3>
                    <p className="text-xs text-slate-400">Comparing real-time request latencies and cache hits</p>
                  </div>
                  <span className="text-xs text-cyan-400 font-mono bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
                    p95: {analytics?.p95LatencyMs || 0}ms
                  </span>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analytics?.timeline && analytics.timeline.length > 0 ? analytics.timeline : [{ time: '00:00', latency: 15, tokens: 0, isHit: 0, pii: 0 }]}>
                      <defs>
                        <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} unit="ms" />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.5rem' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="latency"
                        stroke="#06b6d4"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#latencyGrad)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white mb-1">Architecture Highlights</h3>
                  <p className="text-xs text-slate-400 mb-4">NullLeak Enterprise Core</p>

                  <div className="space-y-3">
                    <div className="flex items-start space-x-3 p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                      <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                      <div className="text-xs">
                        <span className="font-semibold text-slate-200">Zero-Data-Leak Guardrail</span>
                        <p className="text-slate-400 mt-0.5">Scans Luhn Credit Cards, emails, and Bearer API tokens before sending prompt upstream.</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3 p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                      <Zap className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      <div className="text-xs">
                        <span className="font-semibold text-slate-200">Semantic Vector Cache</span>
                        <p className="text-slate-400 mt-0.5">Cosine similarity matching cuts upstream token expenses by up to 50%.</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3 p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                      <Database className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                      <div className="text-xs">
                        <span className="font-semibold text-slate-200">Async Telemetry Queue</span>
                        <p className="text-slate-400 mt-0.5">BullMQ worker ingests audits and token usage without blocking the user HTTP stream.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-800 text-center">
                  <button
                    onClick={() => setActiveTab('playground')}
                    className="w-full py-2 px-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs transition shadow-md shadow-cyan-600/20"
                  >
                    Open Live Guardrail Playground →
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PLAYGROUND TAB */}
        {activeTab === 'playground' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-white">Live Guardrail & Cache Tester</h2>
                <p className="text-xs text-slate-400">
                  Input prompts containing sensitive PII (emails, credit cards, API secrets) to see real-time redaction & semantic caching.
                </p>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-medium text-slate-300">Target Model</label>
                <select
                  value={sandboxModel}
                  onChange={(e) => setSandboxModel(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="gpt-4o">gpt-4o (OpenAI)</option>
                  <option value="gpt-4o-mini">gpt-4o-mini (OpenAI)</option>
                  <option value="gemini-1.5-flash">gemini-1.5-flash (Google)</option>
                  <option value="claude-3-5-sonnet">claude-3-5-sonnet (Anthropic)</option>
                </select>

                <label className="text-xs font-medium text-slate-300">Input Prompt (Contains Sensitive PII)</label>
                <textarea
                  rows={5}
                  value={sandboxPrompt}
                  onChange={(e) => setSandboxPrompt(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono resize-none"
                />

                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="text-slate-400">Quick Test Templates:</span>
                  <button
                    onClick={() =>
                      setSandboxPrompt(
                        'Hi team, please charge my card 4111 1111 1111 1111 for the enterprise tier and notify me at billing@acmecorp.com.'
                      )
                    }
                    className="text-cyan-400 hover:underline"
                  >
                    Credit Card + Email
                  </button>
                  <span>•</span>
                  <button
                    onClick={() =>
                      setSandboxPrompt(
                        'My AWS root key is AKIA1234567890ABCDEF and bearer token is sk-99887766554433221100. How do I rotate them?'
                      )
                    }
                    className="text-cyan-400 hover:underline"
                  >
                    API Secret Leak
                  </button>
                  <span>•</span>
                  <button
                    onClick={() =>
                      setSandboxPrompt('How do I reset my account password?')
                    }
                    className="text-cyan-400 hover:underline"
                  >
                    Cache Hit Test
                  </button>
                </div>
              </div>

              <button
                onClick={handleTestSandbox}
                disabled={isSandboxRunning}
                className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-medium flex items-center justify-center space-x-2 transition shadow-md shadow-cyan-600/20"
              >
                {isSandboxRunning ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Executing Pipeline...</span>
                  </>
                ) : (
                  <>
                    <Terminal className="w-4 h-4" />
                    <span>Run Through NullLeak Gateway</span>
                  </>
                )}
              </button>
            </div>

            {/* Playground Results */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
              <div>
                <h3 className="text-base font-semibold text-white mb-1">Gateway Execution Output</h3>
                <p className="text-xs text-slate-400 mb-4">Inspection of redaction headers, cache status, and LLM output</p>

                {sandboxResult ? (
                  <div className="space-y-4">
                    {/* Header Chips */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${
                          sandboxResult.cacheStatus === 'HIT'
                            ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800'
                            : 'bg-amber-950/80 text-amber-400 border-amber-800'
                        }`}
                      >
                        Cache: {sandboxResult.cacheStatus}
                      </span>
                      <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-cyan-950/80 text-cyan-400 border border-cyan-800">
                        Redacted: {sandboxResult.guardrail.redactedCount} items
                      </span>
                      <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-purple-950/80 text-purple-400 border border-purple-800">
                        Latency: {sandboxResult.latency}
                      </span>
                    </div>

                    {/* Scrubbed Prompt */}
                    <div>
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Sanitized Prompt (Sent Upstream)
                      </span>
                      <div className="mt-1 p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-emerald-300 break-words">
                        {sandboxResult.guardrail.sanitizedPrompt}
                      </div>
                    </div>

                    {/* Detected Findings */}
                    {sandboxResult.guardrail.findings.length > 0 && (
                      <div>
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                          Scrubbed Entities
                        </span>
                        <div className="mt-1 space-y-1">
                          {sandboxResult.guardrail.findings.map((f: any, i: number) => (
                            <div
                              key={i}
                              className="text-xs p-2 rounded-lg bg-rose-950/40 border border-rose-900/60 flex items-center justify-between text-rose-300"
                            >
                              <span className="font-semibold">[{f.type}]</span>
                              <span className="font-mono text-slate-400">{f.original}</span>
                              <span className="text-slate-200">→ {f.replacement}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Completion Snippet */}
                    <div>
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        LLM Completion Response
                      </span>
                      <div className="mt-1 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200">
                        {sandboxResult.completion}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-64 flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-800 rounded-xl">
                    <ShieldCheck className="w-8 h-8 text-slate-600 mb-2" />
                    <p className="text-xs text-slate-400">Click &quot;Run Through NullLeak Gateway&quot; to test prompt sanitization and caching.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* API KEYS TAB */}
        {activeTab === 'keys' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">API Keys & Multi-Tenant Access</h2>
                <p className="text-xs text-slate-400">
                  Manage gateway client secrets, rate limiting (RPM), and allowed model access.
                </p>
              </div>
              <button
                onClick={() => {
                  setCreatedKeySecret(null);
                  setShowKeyModal(true);
                }}
                className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition shadow-md shadow-cyan-600/20"
              >
                <Plus className="w-4 h-4" />
                <span>Generate Key</span>
              </button>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900 text-slate-400 font-medium border-b border-slate-800">
                  <tr>
                    <th className="p-3.5">Name</th>
                    <th className="p-3.5">Key Prefix</th>
                    <th className="p-3.5">RPM Limit</th>
                    <th className="p-3.5">Allowed Models</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {apiKeys.map((key) => (
                    <tr key={key._id} className="hover:bg-slate-800/40">
                      <td className="p-3.5 font-medium text-white">{key.name}</td>
                      <td className="p-3.5 font-mono text-cyan-400">{key.keyPrefix}</td>
                      <td className="p-3.5">{key.rateLimitRpm} req/min</td>
                      <td className="p-3.5">
                        <div className="flex flex-wrap gap-1">
                          {key.allowedModels.map((m) => (
                            <span key={m} className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300">
                              {m}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            key.isEnabled ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}
                        >
                          {key.isEnabled ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="p-3.5 text-right">
                        <button
                          onClick={() => handleDeleteApiKey(key._id)}
                          className="p-1 rounded hover:bg-rose-950/60 text-rose-400 transition"
                          title="Revoke key"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Key Creation Modal */}
            {showKeyModal && (
              <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4">
                  <h3 className="text-base font-semibold text-white">Create New Gateway API Key</h3>

                  {createdKeySecret ? (
                    <div className="space-y-4">
                      <div className="p-3 rounded-xl bg-amber-950/50 border border-amber-800 text-amber-300 text-xs">
                        ⚠️ Please copy your key now. You will not be able to see it again!
                      </div>
                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-cyan-400 break-all flex items-center justify-between">
                        <span>{createdKeySecret}</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(createdKeySecret);
                            setCopiedKey(true);
                            setTimeout(() => setCopiedKey(false), 2000);
                          }}
                          className="p-1 text-slate-400 hover:text-white"
                        >
                          {copiedKey ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                      <button
                        onClick={() => setShowKeyModal(false)}
                        className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-medium"
                      >
                        Done
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleCreateApiKey} className="space-y-3">
                      <div>
                        <label className="text-xs text-slate-300 font-medium">Key Name</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Production Mobile App"
                          value={newKeyName}
                          onChange={(e) => setNewKeyName(e.target.value)}
                          className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-300 font-medium">Rate Limit (RPM)</label>
                        <input
                          type="number"
                          value={newKeyRpm}
                          onChange={(e) => setNewKeyRpm(e.target.value)}
                          className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div className="flex justify-end space-x-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setShowKeyModal(false)}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium"
                        >
                          Generate
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* AUDIT LOGS TAB */}
        {activeTab === 'logs' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-white">Live Request Audit Trail</h2>
              <p className="text-xs text-slate-400">
                Detailed telemetry stream persisted asynchronously via BullMQ worker.
              </p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900 text-slate-400 font-medium border-b border-slate-800">
                  <tr>
                    <th className="p-3.5">Time</th>
                    <th className="p-3.5">Model</th>
                    <th className="p-3.5">Cache</th>
                    <th className="p-3.5">PII Filtered</th>
                    <th className="p-3.5">Tokens</th>
                    <th className="p-3.5">Latency</th>
                    <th className="p-3.5">Cost</th>
                    <th className="p-3.5">Prompt Preview</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-slate-500">
                        No requests recorded yet. Try testing prompts in the Playground tab.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log._id} className="hover:bg-slate-800/40">
                        <td className="p-3.5 font-mono text-[11px] text-slate-400">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="p-3.5 font-medium text-slate-200">{log.modelRequested}</td>
                        <td className="p-3.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              log.wasCacheHit
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {log.wasCacheHit ? 'HIT' : 'MISS'}
                          </span>
                        </td>
                        <td className="p-3.5">
                          {log.piiRedactedCount > 0 ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-950 text-rose-400 border border-rose-800">
                              {log.piiRedactedCount} blocked
                            </span>
                          ) : (
                            <span className="text-slate-500">0</span>
                          )}
                        </td>
                        <td className="p-3.5 font-mono text-slate-300">{log.totalTokens}</td>
                        <td className="p-3.5 font-mono text-cyan-400">{log.latencyMs}ms</td>
                        <td className="p-3.5 font-mono text-slate-300">
                          ${log.estimatedCostUsd.toFixed(4)}
                        </td>
                        <td className="p-3.5 font-mono text-[11px] text-slate-400 max-w-xs truncate">
                          {log.sanitizedPrompt || log.rawPrompt || 'N/A'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;

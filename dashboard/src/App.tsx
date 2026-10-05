import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Zap,
  Key,
  Terminal,
  Activity,
  Copy,
  CheckCircle2,
  Plus,
  Trash2,
  Lock,
  RefreshCw,
  Search,
  Layers,
  ArrowUpRight,
  ThumbsUp,
  ThumbsDown,
  MessageSquare
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

interface IFeedbackItem {
  _id: string;
  logId?: string;
  promptSnippet?: string;
  rating: 'positive' | 'negative';
  category: 'guardrail_accuracy' | 'cache_quality' | 'latency' | 'general';
  comment: string;
  source: 'dashboard' | 'mcp' | 'api';
  createdAt: string;
}

export function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'playground' | 'keys' | 'logs' | 'feedback'>('overview');
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [logs, setLogs] = useState<RequestLogItem[]>([]);
  const [feedbacks, setFeedbacks] = useState<IFeedbackItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Quick feedback form state
  const [fbRating, setFbRating] = useState<'positive' | 'negative'>('positive');
  const [fbCategory, setFbCategory] = useState<'guardrail_accuracy' | 'cache_quality' | 'latency' | 'general'>('guardrail_accuracy');
  const [fbComment, setFbComment] = useState('');
  const [fbSubmittedToast, setFbSubmittedToast] = useState(false);

  // Command Palette State
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [cmdSearch, setCmdSearch] = useState('');

  // Selected audit log drawer
  const [selectedLog, setSelectedLog] = useState<RequestLogItem | null>(null);

  // Table filter state
  const [logFilter, setLogFilter] = useState<'all' | 'hit' | 'pii'>('all');

  // Playground state
  const [sandboxPrompt, setSandboxPrompt] = useState(
    'Please charge Visa card 4111 1111 1111 1111 and contact alice.support@nullleak.com. Master token: sk-live9876543210abcdef1234.'
  );
  const [sandboxModel, setSandboxModel] = useState('gpt-4o');
  const [sandboxResult, setSandboxResult] = useState<any>(null);
  const [isSandboxRunning, setIsSandboxRunning] = useState(false);

  // API Key creation modal state
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyRpm, setNewKeyRpm] = useState('60');
  const [createdKeySecret, setCreatedKeySecret] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      const [sumRes, keysRes, logsRes, fbRes] = await Promise.all([
        fetch('/api/v1/analytics/summary').then((r) => r.json()),
        fetch('/api/v1/api-keys').then((r) => r.json()),
        fetch('/api/v1/logs?limit=50').then((r) => r.json()),
        fetch('/api/v1/feedback?limit=50').then((r) => r.json()),
      ]);
      setAnalytics(sumRes);
      setApiKeys(keysRes.keys || []);
      setLogs(logsRes.logs || []);
      setFeedbacks(fbRes.feedbacks || []);
    } catch (err) {
      console.error('Failed fetching data from gateway', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 5000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcut for Cmd+K command palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setShowCommandPalette(false);
        setSelectedLog(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleTestSandbox = async () => {
    setIsSandboxRunning(true);
    try {
      const testRes = await fetch('/api/v1/sandbox/test-guardrails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: sandboxPrompt, model: sandboxModel }),
      }).then((r) => r.json());

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

  const filteredLogs = logs.filter((log) => {
    if (logFilter === 'hit') return log.wasCacheHit;
    if (logFilter === 'pii') return log.piiRedactedCount > 0;
    return true;
  });

  return (
    <div className="min-h-screen bg-[#090a0f] text-slate-100 flex flex-col font-sans antialiased selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* 1. Global Calm Header / Navbar (SaaS UI Pattern) */}
      <header className="sticky top-0 z-40 w-full border-b border-white/[0.08] bg-[#090a0f]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          {/* Brand & Workspace Switcher */}
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-inner shadow-white/20 border border-white/10">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-sm tracking-tight text-white">NullLeak</span>
            </div>
          </div>

          {/* Quick Search / Command Palette Trigger (Linear/Attio pattern) */}
          <button
            onClick={() => setShowCommandPalette(true)}
            className="hidden md:flex items-center space-x-2 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-slate-400 text-xs transition duration-150"
          >
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <span>Search or jump to...</span>
            <kbd className="ml-3 font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/[0.08] text-slate-300 border border-white/10">
              ⌘K
            </kbd>
          </button>

          {/* Nav Tabs & Status */}
          <div className="flex items-center space-x-3">
            <nav className="flex space-x-1 p-1 bg-white/[0.03] rounded-lg border border-white/[0.06]">
              <button
                onClick={() => setActiveTab('overview')}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-medium transition ${
                  activeTab === 'overview'
                    ? 'bg-white/[0.08] text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Overview</span>
              </button>
              <button
                onClick={() => setActiveTab('playground')}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-medium transition ${
                  activeTab === 'playground'
                    ? 'bg-white/[0.08] text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Sandbox</span>
              </button>
              <button
                onClick={() => setActiveTab('keys')}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-medium transition ${
                  activeTab === 'keys'
                    ? 'bg-white/[0.08] text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                <span>API Keys</span>
              </button>
              <button
                onClick={() => setActiveTab('logs')}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-medium transition ${
                  activeTab === 'logs'
                    ? 'bg-white/[0.08] text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Audits</span>
              </button>
              <button
                onClick={() => setActiveTab('feedback')}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-medium transition ${
                  activeTab === 'feedback'
                    ? 'bg-white/[0.08] text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Feedback</span>
              </button>
            </nav>

            <button
              onClick={fetchAllData}
              title="Refresh"
              className="p-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-slate-300 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Main SaaS Shell */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Top SaaS Metric Cards (Attio / Mixpanel style) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Cost Savings Card */}
              <div className="p-4 rounded-xl border border-white/[0.08] bg-[#11131c]/60 hover:border-white/[0.14] transition relative overflow-hidden group">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-medium">Total Cost Saved</span>
                  <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Zap className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-2xl font-semibold text-white tracking-tight">
                    ${analytics?.savedCostUsd.toFixed(2) || '0.00'}
                  </div>
                  <div className="flex items-center space-x-1 text-[11px] text-emerald-400 mt-1">
                    <span>100% token cost bypass via semantic cache</span>
                  </div>
                </div>
              </div>

              {/* Cache Hit Ratio Card */}
              <div className="p-4 rounded-xl border border-white/[0.08] bg-[#11131c]/60 hover:border-white/[0.14] transition relative overflow-hidden group">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-medium">Cache Hit Rate</span>
                  <div className="p-1.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    <Activity className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-2xl font-semibold text-white tracking-tight">
                    {((analytics?.cacheHitRate || 0) * 100).toFixed(1)}%
                  </div>
                  <div className="flex items-center space-x-1 text-[11px] text-slate-400 mt-1">
                    <span>{analytics?.cacheHits || 0} hits of {analytics?.totalRequests || 0} total calls</span>
                  </div>
                </div>
              </div>

              {/* PII Blocked Card */}
              <div className="p-4 rounded-xl border border-white/[0.08] bg-[#11131c]/60 hover:border-white/[0.14] transition relative overflow-hidden group">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-medium">PII & Secrets Scrubbed</span>
                  <div className="p-1.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    <Lock className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-2xl font-semibold text-white tracking-tight">
                    {analytics?.piiBlockedCount || 0}
                  </div>
                  <div className="flex items-center space-x-1 text-[11px] text-slate-400 mt-1">
                    <span>Zero data leaks to upstream LLMs</span>
                  </div>
                </div>
              </div>

              {/* Budget Limit Card */}
              <div className="p-4 rounded-xl border border-white/[0.08] bg-[#11131c]/60 hover:border-white/[0.14] transition relative overflow-hidden group">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-medium">Monthly Spend Cap</span>
                  <div className="p-1.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-2xl font-semibold text-white tracking-tight">
                    ${analytics?.currentMonthSpendUsd.toFixed(2) || '0.00'}{' '}
                    <span className="text-xs font-normal text-slate-400">/ ${analytics?.monthlySpendLimitUsd || 250}</span>
                  </div>
                  <div className="w-full bg-white/[0.08] rounded-full h-1 mt-2.5 overflow-hidden">
                    <div
                      className="bg-indigo-500 h-full rounded-full transition-all duration-300"
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

            {/* Middle Section: Latency Telemetry Chart (Full Width) */}
            <div className="p-5 rounded-xl border border-white/[0.08] bg-[#11131c]/60">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-medium text-white">Gateway Response Latency</h3>
                  <p className="text-xs text-slate-400">Time-to-first-token & cache response benchmarks</p>
                </div>
                <div className="flex items-center space-x-2 text-xs">
                  <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
                    p95: {analytics?.p95LatencyMs || 0}ms
                  </span>
                  <span className="px-2 py-0.5 rounded bg-white/[0.05] text-slate-300 border border-white/[0.08] font-mono">
                    avg: {analytics?.avgLatencyMs || 0}ms
                  </span>
                </div>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={
                      analytics?.timeline && analytics.timeline.length > 0
                        ? analytics.timeline
                        : [{ time: '00:00', latency: 15, tokens: 0, isHit: 0, pii: 0 }]
                    }
                  >
                    <defs>
                      <linearGradient id="latencySaaS" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="time" stroke="#475569" fontSize={11} tickLine={false} />
                    <YAxis stroke="#475569" fontSize={11} unit="ms" tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f111a',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderRadius: '0.5rem',
                        fontSize: '12px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="latency"
                      stroke="#6366f1"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#latencySaaS)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* PLAYGROUND / SANDBOX TAB */}
        {activeTab === 'playground' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Input Config Form */}
            <div className="p-5 rounded-xl border border-white/[0.08] bg-[#11131c]/60 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-white">Interactive Guardrail & Cache Sandbox</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Verify PII masking, Luhn credit card validation, and semantic cache triggers before deploying to production.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-300">Model Destination</label>
                  <span className="text-[11px] text-slate-500">Drop-in OpenAI format</span>
                </div>
                <select
                  value={sandboxModel}
                  onChange={(e) => setSandboxModel(e.target.value)}
                  className="w-full bg-[#0a0c13] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
                >
                  <option value="gpt-4o">gpt-4o (OpenAI)</option>
                  <option value="gpt-4o-mini">gpt-4o-mini (OpenAI)</option>
                  <option value="gemini-1.5-flash">gemini-1.5-flash (Google Gemini)</option>
                  <option value="claude-3-5-sonnet">claude-3-5-sonnet (Anthropic)</option>
                </select>

                <div className="flex items-center justify-between pt-1">
                  <label className="text-xs font-medium text-slate-300">Prompt with Sensitive Content</label>
                  <div className="flex space-x-2 text-[11px]">
                    <button
                      onClick={() =>
                        setSandboxPrompt(
                          'Charge my card 4111 1111 1111 1111 for enterprise and email invoice to billing@acmecorp.com.'
                        )
                      }
                      className="text-indigo-400 hover:text-indigo-300 transition"
                    >
                      Credit Card + Email
                    </button>
                    <span className="text-slate-600">•</span>
                    <button
                      onClick={() =>
                        setSandboxPrompt(
                          'My AWS root key is AKIA1234567890ABCDEF and secret token is sk-99887766554433221100.'
                        )
                      }
                      className="text-indigo-400 hover:text-indigo-300 transition"
                    >
                      API Key Leak
                    </button>
                  </div>
                </div>

                <textarea
                  rows={5}
                  value={sandboxPrompt}
                  onChange={(e) => setSandboxPrompt(e.target.value)}
                  className="w-full bg-[#0a0c13] border border-white/[0.08] rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono resize-none transition"
                />
              </div>

              <button
                onClick={handleTestSandbox}
                disabled={isSandboxRunning}
                className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium flex items-center justify-center space-x-2 transition duration-150 shadow-sm shadow-indigo-600/20"
              >
                {isSandboxRunning ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing through pipeline...</span>
                  </>
                ) : (
                  <>
                    <Terminal className="w-3.5 h-3.5" />
                    <span>Execute via NullLeak Proxy</span>
                  </>
                )}
              </button>
            </div>

            {/* Output Inspection Panel */}
            <div className="p-5 rounded-xl border border-white/[0.08] bg-[#11131c]/60 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white mb-0.5">Execution & Guardrail Trace</h3>
                <p className="text-xs text-slate-400 mb-4">Live inspection of headers, redacted tokens, and sanitized payload</p>

                {sandboxResult ? (
                  <div className="space-y-4">
                    {/* Status Badges */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-[11px] px-2.5 py-1 rounded-md font-medium border ${
                          sandboxResult.cacheStatus === 'HIT'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}
                      >
                        Cache: {sandboxResult.cacheStatus}
                      </span>
                      <span className="text-[11px] px-2.5 py-1 rounded-md font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        {sandboxResult.guardrail.redactedCount} Secrets Masked
                      </span>
                      <span className="text-[11px] px-2.5 py-1 rounded-md font-medium bg-white/[0.04] text-slate-300 border border-white/[0.08]">
                        Latency: {sandboxResult.latency}
                      </span>
                    </div>

                    {/* Masked Output */}
                    <div>
                      <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                        Sanitized Prompt (What Leaves Network)
                      </span>
                      <div className="mt-1 p-3 rounded-lg bg-[#0a0c13] border border-white/[0.08] font-mono text-xs text-emerald-300 break-words">
                        {sandboxResult.guardrail.sanitizedPrompt}
                      </div>
                    </div>

                    {/* Detected Findings */}
                    {sandboxResult.guardrail.findings.length > 0 && (
                      <div>
                        <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                          Redaction Audit Detail
                        </span>
                        <div className="mt-1 space-y-1">
                          {sandboxResult.guardrail.findings.map((f: any, i: number) => (
                            <div
                              key={i}
                              className="text-xs p-2 rounded-md bg-rose-500/10 border border-rose-500/20 flex items-center justify-between text-rose-300"
                            >
                              <span className="font-semibold text-[11px]">[{f.type}]</span>
                              <span className="font-mono text-slate-400 text-[11px]">{f.original}</span>
                              <span className="text-slate-200 text-[11px]">→ {f.replacement}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Completion Snippet */}
                    <div>
                      <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                        Upstream / Cached Response
                      </span>
                      <div className="mt-1 p-3 rounded-lg bg-[#0a0c13] border border-white/[0.08] text-xs text-slate-200 leading-relaxed">
                        {sandboxResult.completion}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-64 flex flex-col items-center justify-center text-center p-6 border border-dashed border-white/[0.08] rounded-lg">
                    <ShieldCheck className="w-8 h-8 text-slate-600 mb-2" />
                    <p className="text-xs text-slate-400">Click &quot;Execute via NullLeak Proxy&quot; to test guardrails.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* API KEYS TAB (Attio Asset Management Pattern) */}
        {activeTab === 'keys' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">Client API Key Assets</h2>
                <p className="text-xs text-slate-400">Manage client secrets, allowed models, and per-key rate limits.</p>
              </div>
              <button
                onClick={() => {
                  setCreatedKeySecret(null);
                  setShowKeyModal(true);
                }}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition duration-150 shadow-sm shadow-indigo-600/20"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Key</span>
              </button>
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-[#11131c]/60 overflow-hidden">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-white/[0.02] text-slate-400 font-medium border-b border-white/[0.06]">
                  <tr>
                    <th className="p-3.5">Name</th>
                    <th className="p-3.5">Key Prefix</th>
                    <th className="p-3.5">Rate Limit</th>
                    <th className="p-3.5">Model Permissions</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {apiKeys.map((key) => (
                    <tr key={key._id} className="hover:bg-white/[0.02] transition">
                      <td className="p-3.5 font-medium text-white">{key.name}</td>
                      <td className="p-3.5 font-mono text-indigo-400">{key.keyPrefix}</td>
                      <td className="p-3.5">{key.rateLimitRpm} RPM</td>
                      <td className="p-3.5">
                        <div className="flex flex-wrap gap-1">
                          {key.allowedModels.map((m) => (
                            <span
                              key={m}
                              className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-[10px] text-slate-300"
                            >
                              {m}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                            key.isEnabled
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                          }`}
                        >
                          {key.isEnabled ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="p-3.5 text-right">
                        <button
                          onClick={() => handleDeleteApiKey(key._id)}
                          className="p-1 rounded hover:bg-rose-500/10 text-rose-400 transition"
                          title="Revoke key"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Creation Modal */}
            {showKeyModal && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                <div className="bg-[#11131c] border border-white/[0.1] rounded-xl p-6 max-w-md w-full space-y-4 shadow-2xl">
                  <h3 className="text-sm font-semibold text-white">Generate Client Gateway Key</h3>

                  {createdKeySecret ? (
                    <div className="space-y-4">
                      <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
                        ⚠️ Please copy this secret now. It will not be revealed again.
                      </div>
                      <div className="p-3 rounded-lg bg-[#0a0c13] border border-white/[0.08] font-mono text-xs text-indigo-400 break-all flex items-center justify-between">
                        <span>{createdKeySecret}</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(createdKeySecret);
                            setCopiedKey(true);
                            setTimeout(() => setCopiedKey(false), 2000);
                          }}
                          className="p-1 text-slate-400 hover:text-white"
                        >
                          {copiedKey ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      <button
                        onClick={() => setShowKeyModal(false)}
                        className="w-full py-2 bg-white/[0.08] hover:bg-white/[0.12] text-white rounded-lg text-xs font-medium"
                      >
                        Done
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleCreateApiKey} className="space-y-3">
                      <div>
                        <label className="text-xs text-slate-300 font-medium">Key Identifier</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Customer Support AI Assistant"
                          value={newKeyName}
                          onChange={(e) => setNewKeyName(e.target.value)}
                          className="w-full mt-1 bg-[#0a0c13] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-300 font-medium">Rate Limit (RPM)</label>
                        <input
                          type="number"
                          value={newKeyRpm}
                          onChange={(e) => setNewKeyRpm(e.target.value)}
                          className="w-full mt-1 bg-[#0a0c13] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div className="flex justify-end space-x-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setShowKeyModal(false)}
                          className="px-3 py-1.5 rounded-lg bg-white/[0.04] text-slate-300 text-xs font-medium"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
                        >
                          Generate Secret
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* AUDIT LOGS TAB (Attio Table + Detail Drawer Pattern) */}
        {activeTab === 'logs' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">Live Request Audits & Telemetry</h2>
                <p className="text-xs text-slate-400">Click any row to inspect full payload & redaction findings.</p>
              </div>

              {/* Filter controls */}
              <div className="flex items-center space-x-1 p-1 bg-white/[0.03] rounded-lg border border-white/[0.06] text-xs">
                <button
                  onClick={() => setLogFilter('all')}
                  className={`px-2.5 py-1 rounded-md transition ${
                    logFilter === 'all' ? 'bg-white/[0.08] text-white' : 'text-slate-400'
                  }`}
                >
                  All ({logs.length})
                </button>
                <button
                  onClick={() => setLogFilter('hit')}
                  className={`px-2.5 py-1 rounded-md transition ${
                    logFilter === 'hit' ? 'bg-white/[0.08] text-white' : 'text-slate-400'
                  }`}
                >
                  Cache Hits
                </button>
                <button
                  onClick={() => setLogFilter('pii')}
                  className={`px-2.5 py-1 rounded-md transition ${
                    logFilter === 'pii' ? 'bg-white/[0.08] text-white' : 'text-slate-400'
                  }`}
                >
                  PII Scrubbed
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-[#11131c]/60 overflow-hidden">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-white/[0.02] text-slate-400 font-medium border-b border-white/[0.06]">
                  <tr>
                    <th className="p-3.5">Timestamp</th>
                    <th className="p-3.5">Model</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5">PII Filtered</th>
                    <th className="p-3.5">Tokens</th>
                    <th className="p-3.5">Latency</th>
                    <th className="p-3.5">Cost</th>
                    <th className="p-3.5">Prompt Preview</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-500">
                        No requests matching filter. Run queries in the Sandbox tab.
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log) => (
                      <tr
                        key={log._id}
                        onClick={() => setSelectedLog(log)}
                        className="hover:bg-white/[0.02] cursor-pointer transition"
                      >
                        <td className="p-3.5 font-mono text-[11px] text-slate-400">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="p-3.5 font-medium text-slate-200">{log.modelRequested}</td>
                        <td className="p-3.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                              log.wasCacheHit
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-white/[0.04] text-slate-400 border-white/[0.06]'
                            }`}
                          >
                            {log.wasCacheHit ? 'CACHE HIT' : 'MISS'}
                          </span>
                        </td>
                        <td className="p-3.5">
                          {log.piiRedactedCount > 0 ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              {log.piiRedactedCount} masked
                            </span>
                          ) : (
                            <span className="text-slate-500">0</span>
                          )}
                        </td>
                        <td className="p-3.5 font-mono text-slate-300">{log.totalTokens}</td>
                        <td className="p-3.5 font-mono text-indigo-400">{log.latencyMs}ms</td>
                        <td className="p-3.5 font-mono text-slate-300">${log.estimatedCostUsd.toFixed(4)}</td>
                        <td className="p-3.5 font-mono text-[11px] text-slate-400 max-w-xs truncate">
                          {log.sanitizedPrompt || log.rawPrompt || 'N/A'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Slide-over Inspection Drawer for Selected Log */}
            {selectedLog && (
              <div className="fixed inset-y-0 right-0 w-full max-w-md bg-[#11131c] border-l border-white/[0.1] shadow-2xl p-6 z-50 flex flex-col justify-between overflow-y-auto">
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
                    <h3 className="text-sm font-semibold text-white">Audit Record Detail</h3>
                    <button
                      onClick={() => setSelectedLog(null)}
                      className="p-1 rounded text-slate-400 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-slate-400">Request ID:</span>
                      <span className="font-mono text-slate-200">{selectedLog._id}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-slate-400">Model:</span>
                      <span className="text-slate-200">{selectedLog.modelRequested}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-slate-400">Cache Result:</span>
                      <span className={selectedLog.wasCacheHit ? 'text-emerald-400' : 'text-slate-400'}>
                        {selectedLog.wasCacheHit ? 'HIT ($0.00)' : 'MISS (Forwarded Upstream)'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-slate-400">Latency:</span>
                      <span className="font-mono text-indigo-400">{selectedLog.latencyMs}ms</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-slate-400">PII Detected:</span>
                      <span className="text-rose-400">{selectedLog.piiRedactedCount} items</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                      Sanitized Prompt
                    </span>
                    <div className="mt-1 p-3 rounded-lg bg-[#0a0c13] border border-white/[0.08] font-mono text-xs text-emerald-300 break-words">
                      {selectedLog.sanitizedPrompt || selectedLog.rawPrompt || 'N/A'}
                    </div>
                  </div>

                  {/* One-click Feedback on this specific request log */}
                  <div className="pt-2 border-t border-white/[0.06] space-y-2">
                    <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                      Rate this Gateway Execution
                    </span>
                    <div className="flex space-x-2">
                      <button
                        onClick={async () => {
                          await fetch('/api/v1/feedback', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              logId: selectedLog._id,
                              promptSnippet: (selectedLog.sanitizedPrompt || selectedLog.rawPrompt || '').slice(0, 100),
                              rating: 'positive',
                              category: selectedLog.wasCacheHit ? 'cache_quality' : 'guardrail_accuracy',
                              comment: 'Execution met expected guardrail and performance criteria.',
                              source: 'dashboard',
                            }),
                          });
                          fetchAllData();
                          alert('Positive feedback recorded!');
                        }}
                        className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs transition"
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                        <span>Good Result</span>
                      </button>
                      <button
                        onClick={async () => {
                          const note = prompt('What went wrong? (e.g. false positive PII, cache mismatch, high latency)') || '';
                          await fetch('/api/v1/feedback', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              logId: selectedLog._id,
                              promptSnippet: (selectedLog.sanitizedPrompt || selectedLog.rawPrompt || '').slice(0, 100),
                              rating: 'negative',
                              category: 'guardrail_accuracy',
                              comment: note,
                              source: 'dashboard',
                            }),
                          });
                          fetchAllData();
                          alert('Feedback logged for gateway tuning!');
                        }}
                        className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs transition"
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
                        <span>Report Issue</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/[0.06]">
                  <button
                    onClick={() => setSelectedLog(null)}
                    className="w-full py-2 bg-white/[0.06] hover:bg-white/[0.1] text-white rounded-lg text-xs font-medium"
                  >
                    Close Inspector
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* FEEDBACK TAB */}
        {activeTab === 'feedback' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Submit Feedback Card */}
              <div className="p-5 rounded-xl border border-white/[0.08] bg-[#11131c]/60 space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-white">Submit Gateway Feedback</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Help tune the PII regex, cosine cache threshold, or latency expectations.
                  </p>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await fetch('/api/v1/feedback', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        rating: fbRating,
                        category: fbCategory,
                        comment: fbComment,
                        source: 'dashboard',
                      }),
                    });
                    setFbComment('');
                    setFbSubmittedToast(true);
                    setTimeout(() => setFbSubmittedToast(false), 3000);
                    fetchAllData();
                  }}
                  className="space-y-3 text-xs"
                >
                  <div>
                    <label className="text-slate-300 font-medium">Rating</label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => setFbRating('positive')}
                        className={`flex items-center justify-center space-x-1.5 py-2 rounded-lg border transition ${
                          fbRating === 'positive'
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-white/[0.02] text-slate-400 border-white/[0.06]'
                        }`}
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                        <span>Positive</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFbRating('negative')}
                        className={`flex items-center justify-center space-x-1.5 py-2 rounded-lg border transition ${
                          fbRating === 'negative'
                            ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                            : 'bg-white/[0.02] text-slate-400 border-white/[0.06]'
                        }`}
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
                        <span>Issue / Bug</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-300 font-medium">Category</label>
                    <select
                      value={fbCategory}
                      onChange={(e: any) => setFbCategory(e.target.value)}
                      className="w-full mt-1 bg-[#0a0c13] border border-white/[0.08] rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="guardrail_accuracy">PII & Secret Guardrail Accuracy</option>
                      <option value="cache_quality">Semantic Cache Matching Quality</option>
                      <option value="latency">Response Latency & Streaming</option>
                      <option value="general">General Gateway Experience</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-300 font-medium">Comment / Notes</label>
                    <textarea
                      rows={3}
                      value={fbComment}
                      onChange={(e) => setFbComment(e.target.value)}
                      placeholder="e.g. Credit card Luhn filter correctly caught card number; cache returned in 12ms."
                      className="w-full mt-1 bg-[#0a0c13] border border-white/[0.08] rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 resize-none font-mono text-[11px]"
                    />
                  </div>

                  {fbSubmittedToast && (
                    <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-center text-[11px]">
                      ✓ Feedback submitted and stored in Gateway database!
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition"
                  >
                    Submit Feedback
                  </button>
                </form>
              </div>

              {/* Feedbacks Stream / List */}
              <div className="lg:col-span-2 p-5 rounded-xl border border-white/[0.08] bg-[#11131c]/60 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Feedback History ({feedbacks.length})</h3>
                    <p className="text-xs text-slate-400">User ratings and quality reports on guardrails & caching</p>
                  </div>
                  <div className="flex items-center space-x-2 text-xs">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                      {feedbacks.filter((f) => f.rating === 'positive').length} Positive
                    </span>
                    <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono">
                      {feedbacks.filter((f) => f.rating === 'negative').length} Negative
                    </span>
                  </div>
                </div>

                <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                  {feedbacks.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 border border-dashed border-white/[0.08] rounded-lg text-xs">
                      No feedback submitted yet. Rate requests in the Audits drawer or submit notes using the form.
                    </div>
                  ) : (
                    feedbacks.map((fb) => (
                      <div
                        key={fb._id}
                        className="p-3 rounded-lg border border-white/[0.06] bg-white/[0.02] flex items-start justify-between space-x-3 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center space-x-1 ${
                                fb.rating === 'positive'
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/25'
                              }`}
                            >
                              {fb.rating === 'positive' ? (
                                <ThumbsUp className="w-3 h-3 mr-1 inline" />
                              ) : (
                                <ThumbsDown className="w-3 h-3 mr-1 inline" />
                              )}
                              <span>{fb.rating.toUpperCase()}</span>
                            </span>
                            <span className="text-[10px] text-indigo-300 font-mono">
                              [{fb.category.replace('_', ' ')}]
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {new Date(fb.createdAt).toLocaleTimeString()}
                            </span>
                          </div>
                          {fb.promptSnippet && (
                            <p className="font-mono text-[11px] text-slate-400 truncate max-w-md">
                              Prompt: &quot;{fb.promptSnippet}&quot;
                            </p>
                          )}
                          <p className="text-slate-200 text-xs mt-0.5">{fb.comment || 'No comment provided.'}</p>
                        </div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{fb.source}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 2. Linear-Style Cmd+K Command Palette Modal */}
      {showCommandPalette && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-24 p-4 z-50"
          onClick={() => setShowCommandPalette(false)}
        >
          <div
            className="bg-[#11131c] border border-white/[0.1] rounded-xl max-w-lg w-full overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center px-4 py-3 border-b border-white/[0.06]">
              <Search className="w-4 h-4 text-slate-400 mr-3" />
              <input
                autoFocus
                type="text"
                placeholder="Type a command or search..."
                value={cmdSearch}
                onChange={(e) => setCmdSearch(e.target.value)}
                className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
              />
              <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-400 border border-white/[0.08]">
                ESC
              </kbd>
            </div>
            <div className="p-2 space-y-1 text-xs">
              <button
                onClick={() => {
                  setActiveTab('overview');
                  setShowCommandPalette(false);
                }}
                className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.04] text-slate-300 hover:text-white transition"
              >
                <div className="flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-indigo-400" />
                  <span>Go to Overview Dashboard</span>
                </div>
                <span className="text-[10px] text-slate-500">Navigation</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('playground');
                  setShowCommandPalette(false);
                }}
                className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.04] text-slate-300 hover:text-white transition"
              >
                <div className="flex items-center space-x-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <span>Open Guardrail Sandbox</span>
                </div>
                <span className="text-[10px] text-slate-500">Testing</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('keys');
                  setShowCommandPalette(false);
                  setShowKeyModal(true);
                }}
                className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.04] text-slate-300 hover:text-white transition"
              >
                <div className="flex items-center space-x-2">
                  <Key className="w-4 h-4 text-amber-400" />
                  <span>Generate New API Key</span>
                </div>
                <span className="text-[10px] text-slate-500">Action</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('logs');
                  setShowCommandPalette(false);
                }}
                className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.04] text-slate-300 hover:text-white transition"
              >
                <div className="flex items-center space-x-2">
                  <Layers className="w-4 h-4 text-purple-400" />
                  <span>Inspect Audit Records</span>
                </div>
                <span className="text-[10px] text-slate-500">Audits</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

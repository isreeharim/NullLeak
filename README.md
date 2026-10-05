# 🛡️ NullLeak: Enterprise AI Guardrail & Cost-Optimizer Gateway

> A production-grade reverse proxy, developer portal, and observability gateway designed to sit between client applications and Large Language Model (LLM) providers (OpenAI, Anthropic, Gemini). NullLeak enforces zero-data-leak security guardrails (PII redaction, secret scrubbing), slashes token costs via semantic caching, and guarantees zero budget overruns.

---

## 📑 Table of Contents
1. [Executive Summary & Problem Statement](#1-executive-summary--problem-statement)
2. [Key Value Propositions & Features](#2-key-value-propositions--features)
3. [System Architecture & Request Flow](#3-system-architecture--request-flow)
4. [Technology Stack](#4-technology-stack)
5. [Database Schema (MongoDB)](#5-database-schema-mongodb)
6. [Core Gateway Modules (Deep Dive)](#6-core-gateway-modules-deep-dive)
   - [Authentication & Multi-Tenant Rate Limiting](#61-authentication--multi-tenant-rate-limiting)
   - [PII & Secret Sanitization Pipeline](#62-pii--secret-sanitization-pipeline)
   - [Semantic Caching Engine (Redis + Vector Sim)](#63-semantic-caching-engine-redis--vector-sim)
   - [Reverse Proxy & SSE Token Streaming](#64-reverse-proxy--sse-token-streaming)
   - [Asynchronous Telemetry & Worker Queue (BullMQ)](#65-asynchronous-telemetry--worker-queue-bullmq)
7. [Frontend Developer Dashboard (React)](#7-frontend-developer-dashboard-react)
8. [API Specification](#8-api-specification)
9. [Development Roadmap & Milestones (A to Z)](#9-development-roadmap--milestones-a-to-z)
10. [Resume Bullet Points & Interview Talking Points](#10-resume-bullet-points--interview-talking-points)

---

## 1. Executive Summary & Problem Statement

### The Problem
As companies scale their AI initiatives, engineering leaders and CTOs face critical roadblocks:
1. **Unpredictable & Skyrocketing Costs:** Teams repeatedly query LLMs with identical or near-identical prompts (FAQ queries, repetitive classifications, document lookups), burning thousands of dollars on duplicate tokens.
2. **Data Privacy & Compliance Violations (GDPR / HIPAA / SOC2):** Employees and end-users unwittingly input Personally Identifiable Information (PII) like SSNs, credit card numbers, passwords, and API keys into prompts, exposing companies to massive regulatory fines.
3. **No Centralized Governance or Auditing:** Different product teams use different API keys with zero global rate limiting, budget caps, or visibility into latency and error spikes.

### The Solution: NullLeak Gateway
A **drop-in reverse proxy** that is 100% compliant with the standard OpenAI API specification (`POST /v1/chat/completions`). Any application can point its base URL to `https://gateway.yourdomain.com/v1` instead of `https://api.openai.com/v1`. 

The gateway transparently:
- Redacts secrets and PII before prompts leave your network.
- Serves cached responses from memory in **< 25ms** at **$0 cost**.
- Streams tokens smoothly back to the client using **Server-Sent Events (SSE)**.
- Dispatches analytics asynchronously without slowing down user-facing requests.

---

## 2. Key Value Propositions & Features

* ⚡ **Semantic Caching:** Uses vector embeddings and cosine similarity in Redis to recognize semantically identical prompts (e.g., *"How do I reset my password?"* vs. *"Guide to resetting password"*), cutting token costs by **30–50%**.
* 🔒 **Real-Time PII & Secret Redaction:** Employs high-speed regex engines and lightweight Named Entity Recognition (NER) to detect and mask emails, credit cards, SSNs, and Bearer tokens before forwarding.
* 🚦 **Multi-Tenant Rate Limiting & Budget Guardrails:** Token-bucket rate limiting per API key, plus hard monthly spend caps that automatically cut off or throttle abusive clients.
* 📡 **Zero-Latency SSE Streaming:** Native chunk-by-chunk HTTP response streaming to preserve the fast time-to-first-token (TTFT) expected of modern AI apps.
* 📊 **Enterprise Developer Portal:** React dashboard displaying live spend, token consumption breakdowns (prompt vs. completion), cache hit rates, blocked PII incidents, and API key lifecycle management.

---

## 3. System Architecture & Request Flow

```
+-------------------------------------------------------------------------+
|                              CLIENT APPS                                |
|        (React Frontend, Mobile Apps, Internal Backend Services)         |
+-------------------------------------------------------------------------+
                                     │
                     HTTP POST /v1/chat/completions
                     Header: Authorization: Bearer <GATEWAY_KEY>
                                     ▼
+═════════════════════════════════════════════════════════════════════════+
║                         NULLLEAK GATEWAY PROXY                          ║
║                                                                         ║
║  1. [Auth & Quota Guard] ────────► Redis Token Bucket Check             ║
║     (Validates Key, Checks Monthly Budget Cap)                          ║
║                                                                         ║
║  2. [PII & Secret Sanitizer] ────► Regex / NER Engine (Masks PII)       ║
║                                                                         ║
║  3. [Semantic Cache Check] ──────► Redis / Vector Store                 ║
║                                                                         ║
║        ┌─────────────────────────┴─────────────────────────┐            ║
║        ▼ [CACHE HIT: Score >= 0.92]                        ▼ [CACHE MISS]║
║   Return Cached Response                             Generate Upstream  ║
║   (Latency < 25ms | Cost: $0.00)                     Provider Payload   ║
║   (Stream directly to client)                              │            ║
+════════════════════════════════════════════════════════════╪════════════+
                                                             │
                                                             ▼
                                                +────────────────────────+
                                                |   UPSTREAM PROVIDER    |
                                                | (OpenAI / Gemini / etc)|
                                                +────────────────────────+
                                                             │
                                                    Chunked Token Stream
                                                             │
                                                             ▼
+═════════════════════════════════════════════════════════════════════════+
║  4. [Streaming Proxy Handler]                                           ║
║     - Pipes raw chunks to Client via Server-Sent Events (SSE)           ║
║     - Accumulates complete completion text in memory buffer             ║
║                                                                         ║
║  5. [Post-Processing & Worker Dispatch]                                 ║
║     - Writes complete prompt/completion vector to Redis Cache           ║
║     - Pushes telemetry job to BullMQ queue (Non-blocking)               ║
+═════════════════════════════════════════════════════════════════════════+
                                     │
                                     ▼ Background Job
+-------------------------------------------------------------------------+
|                           BULLMQ ASYNC WORKER                           |
|  - Calculates token cost (Input vs. Output rate table)                  |
|  - Increments Tenant monthly billing tally                              |
|  - Persists Audit Log entry to MongoDB                                  |
+-------------------------------------------------------------------------+
```

---

## 4. Technology Stack

### Backend & Gateway Core
* **Runtime:** Node.js (v20+ LTS)
* **Framework:** Express.js (optimized for low overhead) or Fastify
* **Language:** TypeScript
* **Caching & In-Memory Store:** Redis (v7+) with RedisVL / Vector similarity capabilities (with zero-config in-memory fallback for local dev)
* **Job Queue:** BullMQ (backed by Redis) for non-blocking asynchronous analytics processing (with in-process fallback worker)

### Database & Storage
* **Primary DB:** MongoDB (v7+) / Embedded In-memory Store
* **ODM:** Mongoose / Native MongoDB Driver
* **Vector Indexing:** Redis Stack (Vector Similarity Search) or Cosine Vector Search engine

### Frontend Dashboard
* **Framework:** React 18 / Vite + TypeScript
* **Styling:** Tailwind CSS + Lucide Icons
* **Charts & Telemetry:** Recharts
* **State Management:** TanStack Query + Zustand

---

## 5. Quick Start

### 1. Install & Build
```bash
npm run install:all
npm run build
```

### 2. Run Locally
```bash
npm run dev
```
- Gateway API: `http://localhost:4000`
- Developer Dashboard: `http://localhost:5173`

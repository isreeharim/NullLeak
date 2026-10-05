# 🚀 NullLeak Hosting & Deployment Guide

This guide covers the three most popular methods for hosting NullLeak in production:
1. **Self-Hosted VPS (Docker Compose)** — DigitalOcean, AWS EC2, Hetzner, Linode
2. **Serverless / PaaS (Cloud Services)** — Render / Railway (Gateway) + Vercel (Dashboard) + MongoDB Atlas + Upstash Redis
3. **Enterprise Kubernetes / Cloud Run** — Google Cloud Run / AWS ECS

---

## Architecture Overview

```
                        [ Client Applications ]
                                  │
                                  ▼
         ┌─────────────────────────────────────────────────┐
         │     Reverse Proxy / Custom Domain               │
         │  (e.g., https://gateway.yourdomain.com)         │
         └───────────────────────┬─────────────────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
       [ NullLeak Gateway API ]        [ Developer Dashboard ]
             (Port 4000)                     (Port 3000 / 80)
                 │
         ┌───────┴───────┐
         ▼               ▼
     [ MongoDB ]    [ Redis Stack ]
```

---

## Option 1: One-Click Docker Compose (Recommended for VPS)

The fastest and most reliable way to self-host NullLeak on any Linux server (Ubuntu/Debian):

### 1. Prerequisites
- A VPS instance (1 vCPU, 2GB+ RAM recommended)
- Docker & Docker Compose installed

```bash
sudo apt update && sudo apt install -y docker.io docker-compose
```

### 2. Clone the Repository
```bash
git clone https://github.com/isreeharim/NullLeak.git
cd NullLeak
```

### 3. Configure Environment Variables
Create `.env` file in the root directory:
```bash
# Upstream LLM Keys
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...

# Gateway Settings
PORT=4000
NODE_ENV=production
SEMANTIC_CACHE_THRESHOLD=0.75
DEFAULT_GATEWAY_KEY=nl_live_prod_your_secure_random_key_here
```

### 4. Start the Full Stack
```bash
docker-compose up -d --build
```

### 5. Verify Running Services
```bash
docker-compose ps
```
- **Gateway API**: `http://<your-vps-ip>:4000`
- **Dashboard UI**: `http://<your-vps-ip>:3000`
- **Redis GUI**: `http://<your-vps-ip>:8001`

---

## Option 2: Cloud PaaS (Render / Railway + Vercel)

If you prefer managed serverless hosting without maintaining servers:

### A. Managed Databases
1. **MongoDB**: Create a free M0 cluster on [MongoDB Atlas](https://www.mongodb.com/atlas) and copy the connection string (`mongodb+srv://...`).
2. **Redis**: Create a database on [Upstash Redis](https://upstash.com) or Redis Cloud and copy the `rediss://...` URL.

### B. Deploy Gateway Backend (Render or Railway)
1. Go to [Railway.app](https://railway.app) or [Render.com](https://render.com).
2. Connect your GitHub repository `isreeharim/NullLeak`.
3. Set **Root Directory** to `gateway`.
4. Configure Build & Start commands:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `node dist/index.js`
5. Add Environment Variables:
   - `PORT`: `4000`
   - `NODE_ENV`: `production`
   - `MONGODB_URI`: `<Your MongoDB Atlas URI>`
   - `REDIS_URL`: `<Your Upstash Redis URL>`
   - `OPENAI_API_KEY`: `<Your OpenAI Key>`
   - `USE_IN_MEMORY_FALLBACK`: `false`

### C. Deploy Dashboard Frontend (Vercel)
1. Go to [Vercel](https://vercel.com) and click **Add New Project**.
2. Import `isreeharim/NullLeak`.
3. Set **Root Directory** to `dashboard`.
4. Framework Preset: **Vite**.
5. Deploy!

---

## Option 3: Setting Up Custom Domain with SSL (Nginx + Certbot)

To route production traffic securely via `https://gateway.yourdomain.com`:

```nginx
# /etc/nginx/sites-available/nullleak
server {
    server_name gateway.yourdomain.com;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_buffering off; # Essential for LLM SSE token streaming
        proxy_read_timeout 300s;
    }
}
```

Enable SSL via Let's Encrypt:
```bash
sudo certbot --nginx -d gateway.yourdomain.com
```

---

## Testing Your Production Deployment

Run an OpenAI completion request against your newly hosted gateway:

```bash
curl -X POST https://gateway.yourdomain.com/v1/chat/completions \
  -H "Authorization: Bearer nl_live_test_7f8e9d0a1b2c3d4e5f6a" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "Hello! My card is 4111 1111 1111 1111 and email is test@example.com"}
    ]
  }'
```
Check response headers:
- `x-nullleak-cache`: `MISS` (or `HIT` on repeated queries)
- `x-nullleak-pii-redacted`: `2`

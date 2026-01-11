# Claude Code Project Context

## Project Overview

Centrifuge Realtime Message - A production-ready real-time messaging application built with Clean Architecture.

## Architecture

- **Backend**: Cloudflare Workers + Hono (TypeScript)
- **Realtime**: Centrifugo (WebSocket server on Fly.io)
- **Frontend**: React + Vite + TailwindCSS

## Production URLs

| Service              | URL                                                              |
| -------------------- | ---------------------------------------------------------------- |
| Workers API          | `https://centrifuge-realtime-message-api.leeoxiang.workers.dev`  |
| Centrifugo WebSocket | `wss://centrifuge-realtime-message.fly.dev/connection/websocket` |
| Frontend             | Deploy to Vercel/Netlify/Cloudflare Pages                        |

## Environment Variables

### Cloudflare Workers (`packages/workers`)

Secrets (set via `wrangler secret put <NAME>`):

| Variable            | Description                                    |
| ------------------- | ---------------------------------------------- |
| `JWT_SECRET`        | JWT signing secret for authentication tokens   |
| `CENTRIFUGO_SECRET` | Shared secret for Centrifugo API communication |

Public vars (in `wrangler.toml`):

| Variable       | Value                         |
| -------------- | ----------------------------- |
| `LOG_LEVEL`    | `debug` (dev) / `info` (prod) |
| `FRONTEND_URL` | Frontend origin for CORS      |

### Fly.io Centrifugo (`packages/centrifugo`)

Secrets (set via `fly secrets set <NAME>=<VALUE>`):

| Variable                           | Description                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| `CENTRIFUGO_TOKEN_HMAC_SECRET_KEY` | Token verification secret (must match `CENTRIFUGO_SECRET`)                           |
| `PROXY_CONNECT_ENDPOINT`           | `https://centrifuge-realtime-message-api.leeoxiang.workers.dev/centrifugo/connect`   |
| `PROXY_SUBSCRIBE_ENDPOINT`         | `https://centrifuge-realtime-message-api.leeoxiang.workers.dev/centrifugo/subscribe` |
| `PROXY_PUBLISH_ENDPOINT`           | `https://centrifuge-realtime-message-api.leeoxiang.workers.dev/centrifugo/publish`   |

## Deployment Commands

### Deploy Workers

```bash
cd packages/workers

# Set secrets (first time only)
wrangler secret put JWT_SECRET
wrangler secret put CENTRIFUGO_SECRET

# Deploy
npm run deploy:workers
```

### Deploy Centrifugo

```bash
cd packages/centrifugo

# Set secrets (first time only)
fly secrets set CENTRIFUGO_TOKEN_HMAC_SECRET_KEY=<your-secret>
fly secrets set PROXY_CONNECT_ENDPOINT=https://centrifuge-realtime-message-api.leeoxiang.workers.dev/centrifugo/connect
fly secrets set PROXY_SUBSCRIBE_ENDPOINT=https://centrifuge-realtime-message-api.leeoxiang.workers.dev/centrifugo/subscribe
fly secrets set PROXY_PUBLISH_ENDPOINT=https://centrifuge-realtime-message-api.leeoxiang.workers.dev/centrifugo/publish

# Deploy
fly deploy
```

## Local Development

```bash
# Start all services
npm run dev

# Services:
# - Workers API: http://localhost:8787
# - Centrifugo: http://localhost:8000
# - Frontend: http://localhost:5173
```

## Key Files

| Path                           | Description                             |
| ------------------------------ | --------------------------------------- |
| `packages/workers/src/`        | Workers backend with Clean Architecture |
| `packages/centrifugo/fly.toml` | Centrifugo Fly.io configuration         |
| `frontend/src/`                | React frontend application              |
| `docs/DESIGN.md`               | System design documentation             |

## Testing

```bash
npm run test           # Run all tests
npm run test:coverage  # Run with coverage
npm run lint           # Lint all files
npm run typecheck      # Type check all packages
```

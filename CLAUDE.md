# Claude Code Project Context

## Project Overview

Centrifuge Realtime Message - A Realtime Message Gateway combining Centrifugo WebSocket server with a callback handler service in a single Docker container.

## Architecture

- **Centrifugo**: WebSocket server for real-time messaging (port 8000)
- **Callback Service**: Express.js HTTP server for Centrifugo callbacks (port 3000)
- **Redis**: External message storage via Redis Streams

## Project Structure

```
.
├── Dockerfile           # Combined Docker image
├── docker-compose.yml   # Development environment with Redis
├── supervisord.conf     # Process management
├── centrifugo/
│   └── config.json      # Centrifugo configuration
├── src/
│   ├── index.ts         # Express server entry
│   ├── redis.ts         # Redis client
│   ├── config/
│   │   └── partition.ts # Partitioning logic
│   └── handlers/
│       ├── connect.ts   # Connect handler
│       ├── subscribe.ts # Subscribe handler
│       └── publish.ts   # Publish handler
├── package.json
└── tsconfig.json
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `PORT` | Callback service port | `3000` |
| `CENTRIFUGO_TOKEN_HMAC_SECRET_KEY` | JWT signing secret | Required |

## Development Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build TypeScript
npm run build

# Type check
npm run typecheck
```

## Docker Commands

### Single Instance (Development)

```bash
# Build image
docker build -t centrifuge-realtime-message .

# Run with docker-compose (includes Redis)
docker-compose up -d

# Run standalone (external Redis)
docker run -d \
  -p 8000:8000 \
  -p 3000:3000 \
  -e REDIS_URL=redis://your-redis:6379 \
  -e CENTRIFUGO_TOKEN_HMAC_SECRET_KEY=secret \
  centrifuge-realtime-message
```

### Multi-Instance (Production)

Multiple Centrifugo instances can share messages through Redis Engine.

```bash
# Start multi-instance deployment (default: 2 Realtime Message Gateway instances)
docker-compose -f docker-compose.multi-instance.yml up -d

# Scale Centrifugo to 3 instances
docker-compose -f docker-compose.multi-instance.yml up -d --scale centrifugo=3

# Scale Callback service to 4 instances
docker-compose -f docker-compose.multi-instance.yml up -d --scale callback=4
```

**Architecture (Multi-Instance):**
```
                    ┌─────────────┐
                    │   Nginx LB  │ :8000
                    │  (ip_hash)  │
                    └──────┬──────┘
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌────────────┐  ┌────────────┐  ┌────────────┐
    │Centrifugo 1│  │Centrifugo 2│  │Centrifugo 3│
    └─────┬──────┘  └─────┬──────┘  └─────┬──────┘
          │               │               │
          └───────────────┼───────────────┘
                          │ Redis Engine
                          ▼
                   ┌─────────────┐
                   │    Redis    │
                   │  (Broker +  │
                   │  Presence)  │
                   └─────────────┘
```

**Key Features:**
- **Redis Engine**: All Centrifugo instances share Pub/Sub, History, Presence via Redis
- **Nginx ip_hash**: Same client IP always routes to same Centrifugo instance (WebSocket persistence)
- **Horizontal Scaling**: Scale instances independently with `--scale` flag

## Key Endpoints

| Port | Path | Description |
|------|------|-------------|
| 3000 | `/centrifugo/connect` | Handle client connections |
| 3000 | `/centrifugo/subscribe` | Handle channel subscriptions |
| 3000 | `/centrifugo/publish` | Handle message publishing |
| 3000 | `/health` | Callback service health check |
| 8000 | `/connection/websocket` | WebSocket endpoint |
| 8000 | `/health` | Centrifugo health check |

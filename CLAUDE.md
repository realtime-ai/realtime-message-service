# Claude Code Project Context

## Project Overview

Centrifuge Realtime Message - A real-time messaging service using the Centrifuge library for Go.

## Architecture

Single Go process with embedded WebSocket server using the [Centrifuge library](https://github.com/centrifugal/centrifuge).

```
realtime-message-gateway/
├── cmd/gateway/main.go     # Entry point
├── internal/
│   ├── config/             # Configuration
│   ├── gateway/            # Centrifuge Node + event handlers
│   ├── routing/            # Sticky channel routing
│   ├── redis/              # Redis client
│   └── metrics/            # Prometheus metrics
├── go.mod
├── Dockerfile
└── docker-compose.yml
```

**Ports:**
- 8000: WebSocket (`/connection/websocket`)
- 3000: HTTP API (`/health`)
- 2112: Prometheus metrics (`/metrics`)

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `WEBSOCKET_PORT` | WebSocket port | `8000` |
| `HTTP_PORT` | HTTP API port | `3000` |
| `METRICS_PORT` | Prometheus metrics port | `2112` |
| `CENTRIFUGO_TOKEN_HMAC_SECRET_KEY` | JWT signing secret | Required |
| `ROUTE_CACHE_TTL` | Local routing cache TTL | `30s` |
| `MAX_TEXT_LENGTH` | Max message text length | `5000` |

## Development Commands

### Gateway

```bash
cd realtime-message-gateway

# Build locally
go build -o gateway ./cmd/gateway

# Run locally
./gateway

# Run tests
go test ./...

# Docker
docker-compose up -d --build
```

### TypeScript Workers

```bash
# Start a worker with custom ID
WORKER_ID=worker-0 npm run worker

# Start with auto-generated ID
npm run worker
```

## Key Endpoints

| Port | Path | Description |
|------|------|-------------|
| 8000 | `/connection/websocket` | WebSocket endpoint |
| 3000 | `/health` | Health check |
| 2112 | `/metrics` | Prometheus metrics |

## Channel Validation Rules

- `chat` - Global chat channel (allowed for all users)
- `chat:*` - Room channels (allowed for all users)
- `user:{userId}` - User-specific channel (only allowed for matching user)

## Code Maintenance Rules

### Deprecated Code Cleanup

**Critical Rule**: Do NOT keep deprecated code in the codebase.

- **Never** comment out old code "just in case"
- **Never** keep unused files, functions, or imports
- **Always** delete obsolete code immediately
- **Always** use git history to recover old code if needed
- **Always** clean up imports, dependencies, and related files

**Rationale**:
- Git history preserves all code - no need to keep it "just in case"
- Dead code increases maintenance burden and confusion
- Clean codebase is easier to understand and navigate

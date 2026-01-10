# Centrifuge Realtime Message

[![CI](https://github.com/realtime-ai/centrifuge-realtime-message/actions/workflows/ci.yml/badge.svg)](https://github.com/realtime-ai/centrifuge-realtime-message/actions/workflows/ci.yml)

A production-ready real-time messaging application built with Clean Architecture principles.

## Tech Stack

- **Backend**: Cloudflare Workers + Hono (TypeScript)
- **Realtime**: Centrifugo (WebSocket server on Fly.io)
- **Frontend**: React + Vite + TailwindCSS

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend  │────▶│  Centrifugo  │────▶│   Workers    │
│   (React)   │◀────│  (Fly.io)    │◀────│ (Cloudflare) │
└─────────────┘     └──────────────┘     └──────────────┘
```

### Project Structure

```
├── packages/
│   ├── shared/          # Shared domain entities and types
│   ├── workers/         # Cloudflare Workers backend (Clean Architecture)
│   │   ├── src/
│   │   │   ├── core/
│   │   │   │   ├── ports/       # Interface definitions
│   │   │   │   └── use-cases/   # Business logic
│   │   │   ├── adapters/
│   │   │   │   ├── controllers/ # HTTP handlers
│   │   │   │   ├── repositories/# Data access
│   │   │   │   └── services/    # External services
│   │   │   └── infrastructure/  # DI container, entry point
│   │   └── wrangler.toml
│   └── centrifugo/      # Centrifugo configuration for Fly.io
├── frontend/            # React frontend application
└── docs/                # System design documentation
```

## Quick Start

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/) (for Centrifugo deployment)

### Development Setup

1. **Clone and install dependencies**:

   ```bash
   git clone https://github.com/realtime-ai/centrifuge-realtime-message.git
   cd centrifuge-realtime-message
   npm install
   ```

2. **Set up environment variables**:

   ```bash
   # Frontend
   cp frontend/.env.example frontend/.env

   # Workers (for local development, create .dev.vars)
   echo "JWT_SECRET=your-jwt-secret" > packages/workers/.dev.vars
   echo "CENTRIFUGO_SECRET=your-centrifugo-secret" >> packages/workers/.dev.vars
   ```

3. **Download Centrifugo binary** (for local development):

   ```bash
   mkdir -p centrifugo-bin
   # macOS ARM64
   curl -L https://github.com/centrifugal/centrifugo/releases/download/v5.4.8/centrifugo_5.4.8_darwin_arm64.tar.gz | tar xz -C centrifugo-bin/
   ```

4. **Start all services**:

   ```bash
   npm run dev
   ```

   This starts:
   - Workers API: http://localhost:8787
   - Centrifugo: http://localhost:8000
   - Frontend: http://localhost:5173

## Scripts

| Command                  | Description                        |
| ------------------------ | ---------------------------------- |
| `npm run dev`            | Start all services for development |
| `npm run build`          | Build all packages                 |
| `npm run test`           | Run all tests                      |
| `npm run test:coverage`  | Run tests with coverage            |
| `npm run lint`           | Lint all files                     |
| `npm run lint:fix`       | Fix linting issues                 |
| `npm run format`         | Format all files                   |
| `npm run format:check`   | Check formatting                   |
| `npm run typecheck`      | Type check all packages            |
| `npm run deploy:workers` | Deploy to Cloudflare Workers       |

## Deployment

### Cloudflare Workers

1. **Set secrets**:

   ```bash
   cd packages/workers
   wrangler secret put JWT_SECRET
   wrangler secret put CENTRIFUGO_SECRET
   ```

2. **Deploy**:

   ```bash
   npm run deploy:workers
   ```

### Centrifugo (Fly.io)

1. **Create app**:

   ```bash
   cd packages/centrifugo
   fly launch --no-deploy
   ```

2. **Set secrets**:

   ```bash
   fly secrets set CENTRIFUGO_TOKEN_HMAC_SECRET_KEY=your-secret
   fly secrets set PROXY_CONNECT_ENDPOINT=https://your-worker.workers.dev/centrifugo/connect
   fly secrets set PROXY_SUBSCRIBE_ENDPOINT=https://your-worker.workers.dev/centrifugo/subscribe
   fly secrets set PROXY_PUBLISH_ENDPOINT=https://your-worker.workers.dev/centrifugo/publish
   ```

3. **Deploy**:

   ```bash
   fly deploy
   ```

## API Endpoints

### Authentication

| Method | Endpoint      | Description         |
| ------ | ------------- | ------------------- |
| POST   | `/auth/login` | Login with username |

### Centrifugo Proxy

| Method | Endpoint                | Description                   |
| ------ | ----------------------- | ----------------------------- |
| POST   | `/centrifugo/connect`   | Handle client connection      |
| POST   | `/centrifugo/subscribe` | Validate channel subscription |
| POST   | `/centrifugo/publish`   | Process message publication   |

### Health Check

| Method | Endpoint  | Description          |
| ------ | --------- | -------------------- |
| GET    | `/health` | Check service health |

## Testing

```bash
# Run all tests
npm run test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test -w @centrifuge-realtime-message/shared -- --watch
```

## Design Documentation

For detailed system design, see [docs/DESIGN.md](docs/DESIGN.md)

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT

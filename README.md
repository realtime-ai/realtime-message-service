# Centrifuge Realtime Message

[![CI](https://github.com/realtime-ai/centrifuge-realtime-message/actions/workflows/ci.yml/badge.svg)](https://github.com/realtime-ai/centrifuge-realtime-message/actions/workflows/ci.yml)

[English](#english) | [中文](#中文)

---

## English

A production-ready real-time messaging application built with Clean Architecture principles.

### Tech Stack

- **Backend**: Cloudflare Workers + Hono (TypeScript)
- **Realtime**: Centrifugo (WebSocket server on Fly.io)
- **Frontend**: React + Vite + TailwindCSS

### Architecture

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

### Quick Start

#### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/) (for Centrifugo deployment)

#### Development Setup

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

### Scripts

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

### Deployment

#### Cloudflare Workers

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

#### Centrifugo (Fly.io)

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

### API Endpoints

#### Authentication

| Method | Endpoint      | Description         |
| ------ | ------------- | ------------------- |
| POST   | `/auth/login` | Login with username |

#### Centrifugo Proxy

| Method | Endpoint                | Description                   |
| ------ | ----------------------- | ----------------------------- |
| POST   | `/centrifugo/connect`   | Handle client connection      |
| POST   | `/centrifugo/subscribe` | Validate channel subscription |
| POST   | `/centrifugo/publish`   | Process message publication   |

#### Health Check

| Method | Endpoint  | Description          |
| ------ | --------- | -------------------- |
| GET    | `/health` | Check service health |

### Testing

```bash
# Run all tests
npm run test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test -w @centrifuge-realtime-message/shared -- --watch
```

### Design Documentation

For detailed system design, see [docs/DESIGN.md](docs/DESIGN.md)

---

## 中文

一个基于 Clean Architecture 原则构建的生产级实时消息应用。

### 技术栈

- **后端**: Cloudflare Workers + Hono (TypeScript)
- **实时通信**: Centrifugo (部署在 Fly.io 的 WebSocket 服务器)
- **前端**: React + Vite + TailwindCSS

### 架构

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│    前端     │────▶│  Centrifugo  │────▶│   Workers    │
│   (React)   │◀────│  (Fly.io)    │◀────│ (Cloudflare) │
└─────────────┘     └──────────────┘     └──────────────┘
```

### 项目结构

```
├── packages/
│   ├── shared/          # 共享的领域实体和类型
│   ├── workers/         # Cloudflare Workers 后端 (Clean Architecture)
│   │   ├── src/
│   │   │   ├── core/
│   │   │   │   ├── ports/       # 接口定义
│   │   │   │   └── use-cases/   # 业务逻辑
│   │   │   ├── adapters/
│   │   │   │   ├── controllers/ # HTTP 处理器
│   │   │   │   ├── repositories/# 数据访问
│   │   │   │   └── services/    # 外部服务
│   │   │   └── infrastructure/  # 依赖注入容器、入口点
│   │   └── wrangler.toml
│   └── centrifugo/      # Fly.io 的 Centrifugo 配置
├── frontend/            # React 前端应用
└── docs/                # 系统设计文档
```

### 快速开始

#### 前置要求

- Node.js >= 20.0.0
- npm >= 10.0.0
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/) (用于 Centrifugo 部署)

#### 开发环境设置

1. **克隆并安装依赖**:

   ```bash
   git clone https://github.com/realtime-ai/centrifuge-realtime-message.git
   cd centrifuge-realtime-message
   npm install
   ```

2. **设置环境变量**:

   ```bash
   # 前端
   cp frontend/.env.example frontend/.env

   # Workers (本地开发，创建 .dev.vars)
   echo "JWT_SECRET=your-jwt-secret" > packages/workers/.dev.vars
   echo "CENTRIFUGO_SECRET=your-centrifugo-secret" >> packages/workers/.dev.vars
   ```

3. **下载 Centrifugo 二进制文件** (用于本地开发):

   ```bash
   mkdir -p centrifugo-bin
   # macOS ARM64
   curl -L https://github.com/centrifugal/centrifugo/releases/download/v5.4.8/centrifugo_5.4.8_darwin_arm64.tar.gz | tar xz -C centrifugo-bin/
   ```

4. **启动所有服务**:

   ```bash
   npm run dev
   ```

   这将启动:
   - Workers API: http://localhost:8787
   - Centrifugo: http://localhost:8000
   - Frontend: http://localhost:5173

### 脚本命令

| 命令                     | 描述                      |
| ------------------------ | ------------------------- |
| `npm run dev`            | 启动所有开发服务          |
| `npm run build`          | 构建所有包                |
| `npm run test`           | 运行所有测试              |
| `npm run test:coverage`  | 运行测试并生成覆盖率报告  |
| `npm run lint`           | 检查所有文件              |
| `npm run lint:fix`       | 修复代码规范问题          |
| `npm run format`         | 格式化所有文件            |
| `npm run format:check`   | 检查格式                  |
| `npm run typecheck`      | 类型检查所有包            |
| `npm run deploy:workers` | 部署到 Cloudflare Workers |

### 部署

#### Cloudflare Workers

1. **设置密钥**:

   ```bash
   cd packages/workers
   wrangler secret put JWT_SECRET
   wrangler secret put CENTRIFUGO_SECRET
   ```

2. **部署**:

   ```bash
   npm run deploy:workers
   ```

#### Centrifugo (Fly.io)

1. **创建应用**:

   ```bash
   cd packages/centrifugo
   fly launch --no-deploy
   ```

2. **设置密钥**:

   ```bash
   fly secrets set CENTRIFUGO_TOKEN_HMAC_SECRET_KEY=your-secret
   fly secrets set PROXY_CONNECT_ENDPOINT=https://your-worker.workers.dev/centrifugo/connect
   fly secrets set PROXY_SUBSCRIBE_ENDPOINT=https://your-worker.workers.dev/centrifugo/subscribe
   fly secrets set PROXY_PUBLISH_ENDPOINT=https://your-worker.workers.dev/centrifugo/publish
   ```

3. **部署**:

   ```bash
   fly deploy
   ```

### API 端点

#### 认证

| 方法 | 端点          | 描述           |
| ---- | ------------- | -------------- |
| POST | `/auth/login` | 使用用户名登录 |

#### Centrifugo 代理

| 方法 | 端点                    | 描述           |
| ---- | ----------------------- | -------------- |
| POST | `/centrifugo/connect`   | 处理客户端连接 |
| POST | `/centrifugo/subscribe` | 验证频道订阅   |
| POST | `/centrifugo/publish`   | 处理消息发布   |

#### 健康检查

| 方法 | 端点      | 描述         |
| ---- | --------- | ------------ |
| GET  | `/health` | 检查服务健康 |

### 测试

```bash
# 运行所有测试
npm run test

# 运行测试并生成覆盖率报告
npm run test:coverage

# 监听模式运行测试
npm run test -w @centrifuge-realtime-message/shared -- --watch
```

### 设计文档

详细的系统设计请查看 [docs/DESIGN.md](docs/DESIGN.md)

---

## Contributing / 贡献

1. Fork the repository / Fork 本仓库
2. Create your feature branch / 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. Commit your changes / 提交更改 (`git commit -m 'Add amazing feature'`)
4. Push to the branch / 推送到分支 (`git push origin feature/amazing-feature`)
5. Open a Pull Request / 发起 Pull Request

## License / 许可证

MIT

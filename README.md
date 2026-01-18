# Centrifuge Realtime Message

实时消息服务，使用 Go 语言的 [Centrifuge 库](https://github.com/centrifugal/centrifuge) 实现高性能 WebSocket 网关。

## 系统架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Load Balancer                                   │
│                         (Nginx / Cloud LB / K8s)                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                 ┌────────────────────┼────────────────────┐
                 │                    │                    │
                 ▼                    ▼                    ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│   Go Gateway 1      │  │   Go Gateway 2      │  │   Go Gateway N      │
│  ┌───────────────┐  │  │  ┌───────────────┐  │  │  ┌───────────────┐  │
│  │  Centrifuge   │  │  │  │  Centrifuge   │  │  │  │  Centrifuge   │  │
│  │  (WS: 8000)   │  │  │  │  (WS: 8000)   │  │  │  │  (WS: 8000)   │  │
│  │  (HTTP: 3000) │  │  │  │  (HTTP: 3000) │  │  │  │  (HTTP: 3000) │  │
│  │  (Metrics:    │  │  │  │  (Metrics:    │  │  │  │  (Metrics:    │  │
│  │   2112)       │  │  │  │   2112)       │  │  │  │   2112)       │  │
│  └───────┬───────┘  │  │  └───────┬───────┘  │  │  └───────┬───────┘  │
└─────────┬───────────┘  └─────────┬───────────┘  └─────────┬───────────┘
          │                        │                        │
          └────────────────────────┼────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Redis Cluster                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                       Redis Streams                                  │    │
│  │  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐     │    │
│  │  │ messages:worker: │ │ messages:worker: │ │ messages:worker: │     │    │
│  │  │    worker-0      │ │    worker-1      │ │    worker-N      │     │    │
│  │  └──────────────────┘ └──────────────────┘ └──────────────────┘     │    │
│  │                   Sticky Channel Routing                             │    │
│  │        (同一 channel 始终路由到同一 Worker)                             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
          ▼                        ▼                        ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│      Worker 0       │  │      Worker 1       │  │      Worker N       │
│  ┌───────────────┐  │  │  ┌───────────────┐  │  │  ┌───────────────┐  │
│  │  TypeScript   │  │  │  │  TypeScript   │  │  │  │  TypeScript   │  │
│  │  消息处理     │  │  │  │  消息处理     │  │  │  │  消息处理     │  │
│  └───────────────┘  │  │  └───────────────┘  │  │  └───────────────┘  │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
```

## 组件说明

| 组件 | 说明 | 技术栈 |
|------|------|--------|
| **Go Gateway** | WebSocket 网关，内嵌 Centrifuge 库 | Go + Centrifuge |
| **Redis Streams** | 消息队列，每个 Worker 独立 Stream | Redis |
| **Worker** | 消费消息，处理业务逻辑 | TypeScript + ioredis |

## 数据流

```
Client → WebSocket → Go Gateway → Redis Stream → Worker
```

## 快速开始

### 1. 启动 Redis

```bash
# 使用 Docker
docker run -d -p 6379:6379 redis:7-alpine

# 或使用本地 Redis
redis-server
```

### 2. 启动 Gateway

```bash
cd realtime-message-gateway

# 创建配置
cp .env.example .env

# 构建并运行
go build -o gateway ./cmd/gateway
./gateway
```

### 3. 启动 Workers

```bash
# 安装依赖
npm install

# 启动 Worker（不同终端）
WORKER_ID=worker-0 npm run worker:stats
WORKER_ID=worker-1 npm run worker:stats
```

### 4. 运行压测

```bash
# 小规模测试
NUM_CLIENTS=100 npm run loadtest:ws

# 大规模测试（500 客户端，1 分钟）
NUM_CLIENTS=500 MESSAGES_PER_CLIENT=1200 npm run loadtest:ws
```

### 使用 Docker Compose

```bash
cd realtime-message-gateway

# 启动 Gateway + Redis
docker-compose up -d

# 查看日志
docker-compose logs -f
```

## 端口

| 端口 | 服务 | 说明 |
|------|------|------|
| 8000 | WebSocket | `/connection/websocket` |
| 3000 | HTTP API | `/health` |
| 2112 | Prometheus | `/metrics` |

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `REDIS_URL` | Redis 连接地址 | `redis://localhost:6379` |
| `WEBSOCKET_PORT` | WebSocket 端口 | `8000` |
| `HTTP_PORT` | HTTP API 端口 | `3000` |
| `METRICS_PORT` | Prometheus 端口 | `2112` |
| `CENTRIFUGO_TOKEN_HMAC_SECRET_KEY` | JWT 签名密钥 | - |
| `ROUTE_CACHE_TTL` | 路由缓存 TTL | `30s` |
| `MAX_TEXT_LENGTH` | 最大消息长度 | `5000` |

### HTTP API (:3000)

- `/health` - 健康检查

### Metrics (:2112)

- `/metrics` - Prometheus 指标
- `/health` - 健康检查

## 频道验证规则

- `chat` - 全局聊天频道（所有用户可访问）
- `chat:*` - 房间频道（所有用户可访问）
- `user:{userId}` - 用户专属频道（仅匹配用户可访问）

## WebSocket 重连机制

### 客户端自动重连

centrifuge-js 客户端内置了自动重连机制：

```typescript
import { createReconnectClient } from './lib/reconnect-client.js';

const client = createReconnectClient({
  url: 'ws://localhost:8000/connection/websocket',
  data: { name: 'MyUser' },
  minReconnectDelay: 500,      // 最小重连延迟 (ms)
  maxReconnectDelay: 30000,    // 最大重连延迟 (ms)
  maxServerPingDelay: 10000,   // 服务器 ping 超时
  debug: true,
});

// 监听重连事件
client.on('reconnecting', (ctx) => {
  console.log(`正在重连，第 ${ctx.attempt} 次尝试，延迟 ${ctx.delay}ms`);
});

client.on('reconnected', (ctx) => {
  console.log(`重连成功，clientId: ${ctx.clientId}`);
});

client.on('disconnected', (ctx) => {
  console.log(`断开连接: ${ctx.reason}, reconnect: ${ctx.reconnect}`);
});

client.connect();
```

### 重连配置参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `minReconnectDelay` | 最小重连延迟 | `500ms` |
| `maxReconnectDelay` | 最大重连延迟 | `20000ms` |
| `maxServerPingDelay` | 服务器 ping 超时 | `10000ms` |

### 服务端 Ping/Pong 保活

| 参数 | 环境变量 | 默认值 | 说明 |
|------|----------|--------|------|
| Ping 间隔 | `WS_PING_INTERVAL` | `25s` | 服务器发送 PING 的间隔 |
| Pong 超时 | `WS_PONG_TIMEOUT` | `10s` | 等待 PONG 响应的超时时间 |

### 重连 Metrics

服务端提供以下 Prometheus 指标用于监控重连：

| 指标名称 | 类型 | 说明 |
|----------|------|------|
| `gateway_disconnect_total` | Counter | 断开连接总数，按原因和代码分类 |
| `gateway_reconnect_total` | Counter | 重连次数 |
| `gateway_connection_duration_seconds` | Histogram | 连接持续时间分布 |

### 运行重连演示

```bash
# 启动重连演示（会显示连接状态和统计信息）
npm run reconnect:demo

# 自定义配置
GATEWAY_URL=ws://localhost:8000/connection/websocket \
CHANNEL=chat \
USER_NAME=TestUser \
npm run reconnect:demo
```

## 项目结构

```
.
├── realtime-message-gateway/       # Go Gateway
│   ├── cmd/gateway/main.go         # 入口
│   ├── internal/
│   │   ├── config/                 # 配置
│   │   ├── gateway/                # Centrifuge Node + 重连处理
│   │   ├── routing/                # Sticky Channel Routing
│   │   ├── redis/                  # Redis 客户端
│   │   └── metrics/                # Prometheus 指标（含重连 metrics）
│   ├── Dockerfile
│   └── docker-compose.yml
├── lib/
│   ├── routing.ts                  # 共享路由工具
│   └── reconnect-client.ts         # WebSocket 重连客户端
├── examples/
│   ├── worker-simple.ts            # 简单 Worker
│   ├── worker-stats.ts             # 带统计的 Worker
│   ├── loadtest-websocket.ts       # WebSocket 压测
│   └── reconnect-demo.ts           # 重连演示
├── package.json
└── CLAUDE.md                       # 项目上下文
```

## 性能指标

基于 500 并发连接、1 分钟压测：

| 指标 | 值 |
|------|-----|
| 吞吐量 | 7,400+ msg/s |
| 延迟 P50 | 28ms |
| 延迟 P95 | 54ms |
| 延迟 P99 | 72ms |
| 成功率 | 100% |

## Channel 规则

| Pattern | 说明 | 权限 |
|---------|------|------|
| `chat` | 全局聊天频道 | 所有用户 |
| `chat:*` | 房间频道 | 所有用户 |
| `user:{userId}` | 用户私有频道 | 仅匹配用户 |

## 开发命令

```bash
# Gateway
cd realtime-message-gateway
go build -o gateway ./cmd/gateway    # 构建
go test ./...                         # 测试
./gateway                             # 运行

# Workers
npm run worker                        # 简单 Worker
npm run worker:stats                  # 带统计 Worker

# 压测
npm run loadtest:ws                   # WebSocket 压测

# 重连演示
npm run reconnect:demo                # 运行重连演示
```

## License

MIT

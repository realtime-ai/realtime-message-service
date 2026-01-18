# Centrifuge Realtime Message

实时消息服务，使用 [Centrifuge library](https://github.com/centrifugal/centrifuge) 构建的 Go 网关。

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
│     Instance 1      │  │     Instance 2      │  │     Instance N      │
│  ┌───────────────┐  │  │  ┌───────────────┐  │  │  ┌───────────────┐  │
│  │  Go Gateway   │  │  │  │  Go Gateway   │  │  │  │  Go Gateway   │  │
│  │   (WS:8000)   │  │  │  │   (WS:8000)   │  │  │  │   (WS:8000)   │  │
│  │  (HTTP:3000)  │  │  │  │  (HTTP:3000)  │  │  │  │  (HTTP:3000)  │  │
│  │ (Metrics:2112)│  │  │  │ (Metrics:2112)│  │  │  │ (Metrics:2112)│  │
│  └───────────────┘  │  │  └───────────────┘  │  │  └───────────────┘  │
└─────────┬───────────┘  └─────────┬───────────┘  └─────────┬───────────┘
          │                        │                        │
          └────────────────────────┼────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Redis Cluster                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                       Redis Streams                                  │    │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                 │    │
│  │  │  worker:w1   │ │  worker:w2   │ │  worker:wN   │                 │    │
│  │  └──────────────┘ └──────────────┘ └──────────────┘                 │    │
│  │                   Sticky Channel Routing                             │    │
│  │        (同一 channel 始终路由到同一 Worker)                             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
          ▼                        ▼                        ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│      Worker 1       │  │      Worker 2       │  │      Worker N       │
│  ┌───────────────┐  │  │  ┌───────────────┐  │  │  ┌───────────────┐  │
│  │  动态注册到    │  │  │  │  动态注册到    │  │  │  │  动态注册到    │  │
│  │  Redis        │  │  │  │  Redis        │  │  │  │  Redis        │  │
│  └───────────────┘  │  │  └───────────────┘  │  │  └───────────────┘  │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
```

## 组件说明

| 组件 | 说明 | 扩展方式 |
|------|------|----------|
| **Go Gateway** | 单进程 Go 网关，内嵌 WebSocket 服务器 | 水平扩展，通过 LB 分发 |
| **Redis Streams** | 消息队列，每个 Worker 独立 Stream | 按 Worker 数量动态扩展 |
| **Worker** | 消费消息，处理业务逻辑 | 水平扩展，使用 Sticky Channel Routing |

## 数据流

```
Client → WebSocket → Go Gateway → Redis Stream → Worker
```

## 快速开始

### 使用 Docker Compose（含 Redis）

```bash
cd realtime-message-gateway

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f
```

### 本地构建运行

```bash
cd realtime-message-gateway

# 构建
go build -o gateway ./cmd/gateway

# 运行
./gateway
```

### 运行测试

```bash
cd realtime-message-gateway
go test ./...
```

### 运行示例 Worker

```bash
# 安装依赖
npm install

# 运行单个 worker
npm run worker

# 指定 Worker ID
WORKER_ID=worker-0 npm run worker

# 运行带统计的 worker
npm run worker:stats
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `REDIS_URL` | Redis 连接地址 | `redis://localhost:6379` |
| `WEBSOCKET_PORT` | WebSocket 端口 | `8000` |
| `HTTP_PORT` | HTTP API 端口 | `3000` |
| `METRICS_PORT` | Prometheus 指标端口 | `2112` |
| `CENTRIFUGO_TOKEN_HMAC_SECRET_KEY` | JWT 签名密钥 | 必填 |
| `ROUTE_CACHE_TTL` | 本地路由缓存 TTL | `30s` |
| `MAX_TEXT_LENGTH` | 最大消息文本长度 | `5000` |

## 端口

| 端口 | 服务 | 说明 |
|------|------|------|
| 8000 | WebSocket | `/connection/websocket` |
| 3000 | HTTP API | `/health` 健康检查 |
| 2112 | Prometheus | `/metrics` 指标 |

## API 端点

### WebSocket (:8000)

- `/connection/websocket` - WebSocket 连接端点
- `/health` - 健康检查

### HTTP API (:3000)

- `/health` - 健康检查

### Metrics (:2112)

- `/metrics` - Prometheus 指标
- `/health` - 健康检查

## 频道验证规则

- `chat` - 全局聊天频道（所有用户可访问）
- `chat:*` - 房间频道（所有用户可访问）
- `user:{userId}` - 用户专属频道（仅匹配用户可访问）

## 项目结构

```
.
├── realtime-message-gateway/   # Go 网关
│   ├── cmd/gateway/main.go     # 入口点
│   ├── internal/
│   │   ├── config/             # 配置
│   │   ├── gateway/            # Centrifuge Node + 事件处理
│   │   ├── routing/            # Sticky Channel 路由
│   │   ├── redis/              # Redis 客户端
│   │   └── metrics/            # Prometheus 指标
│   ├── go.mod
│   ├── Dockerfile
│   └── docker-compose.yml
├── examples/                   # 示例代码
│   ├── worker-simple.ts        # 简单 Worker
│   ├── worker-stats.ts         # 带统计的 Worker
│   └── loadtest*.ts            # 负载测试
├── lib/                        # 共享库
│   └── routing.ts              # 路由工具
└── package.json
```

## License

MIT

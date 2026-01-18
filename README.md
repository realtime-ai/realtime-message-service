# Centrifuge Realtime Message

实时消息服务，将 Centrifugo WebSocket 服务器与回调处理服务打包在单个 Docker 容器中。

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
│  │  Centrifugo   │  │  │  │  Centrifugo   │  │  │  │  Centrifugo   │  │
│  │   (WS:8000)   │  │  │  │   (WS:8000)   │  │  │  │   (WS:8000)   │  │
│  └───────┬───────┘  │  │  └───────┬───────┘  │  │  └───────┬───────┘  │
│          │          │  │          │          │  │          │          │
│  ┌───────▼───────┐  │  │  ┌───────▼───────┐  │  │  ┌───────▼───────┐  │
│  │   Callback    │  │  │  │   Callback    │  │  │  │   Callback    │  │
│  │   Service     │  │  │  │   Service     │  │  │  │   Service     │  │
│  │  (HTTP:3000)  │  │  │  │  (HTTP:3000)  │  │  │  │  (HTTP:3000)  │  │
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
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐  │    │
│  │  │ partition:0  │ │ partition:1  │ │ partition:2  │ │    ...     │  │    │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
          ▼                        ▼                        ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│      Worker 1       │  │      Worker 2       │  │      Worker N       │
│  ┌───────────────┐  │  │  ┌───────────────┐  │  │  ┌───────────────┐  │
│  │ Consumer Group│  │  │  │ Consumer Group│  │  │  │ Consumer Group│  │
│  │ partition:0,3 │  │  │  │ partition:1,4 │  │  │  │ partition:2,5 │  │
│  └───────────────┘  │  │  └───────────────┘  │  │  └───────────────┘  │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
```

## 组件说明

| 组件 | 说明 | 扩展方式 |
|------|------|----------|
| **Instance** | Centrifugo + Callback Service 容器 | 水平扩展，通过 LB 分发 |
| **Redis Streams** | 消息队列，按 channel 哈希分区 | 8 个分区（可配置） |
| **Worker** | 消费消息，处理业务逻辑 | 水平扩展，自动分配分区 |

## 数据流

```
Client → WebSocket → Centrifugo → Callback Service → Redis Stream → Worker
```

## 快速开始

### 使用 Docker Compose（含 Redis）

```bash
# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f
```

### 使用 Podman

```bash
# 构建镜像
podman build -t centrifuge-realtime-message .

# 运行（连接外部 Redis）
podman run -d \
  -p 8000:8000 \
  -p 3000:3000 \
  -e REDIS_URL=redis://your-redis:6379 \
  -e CENTRIFUGO_TOKEN_HMAC_SECRET_KEY=your-secret \
  centrifuge-realtime-message
```

### 运行示例 Worker

```bash
# 安装依赖
npm install

# 运行单个 worker
npx tsx examples/worker.ts

# 运行多个 worker（不同终端）
WORKER_ID=0 TOTAL_WORKERS=2 npx tsx examples/worker.ts
WORKER_ID=1 TOTAL_WORKERS=2 npx tsx examples/worker.ts
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `REDIS_URL` | Redis 连接地址 | `redis://localhost:6379` |
| `PORT` | Callback 服务端口 | `3000` |
| `CENTRIFUGO_TOKEN_HMAC_SECRET_KEY` | JWT 签名密钥 | 必填 |

## 端口

| 端口 | 服务 | 协议 |
|------|------|------|
| 8000 | Centrifugo | WebSocket |
| 3000 | Callback Service | HTTP |

## API 端点

### Callback Service (HTTP :3000)

- `POST /centrifugo/connect` - 处理客户端连接
- `POST /centrifugo/subscribe` - 处理频道订阅
- `POST /centrifugo/publish` - 处理消息发布
- `GET /health` - 健康检查

### Centrifugo (WebSocket :8000)

- `/connection/websocket` - WebSocket 端点
- `/health` - 健康检查

## 项目结构

```
.
├── Dockerfile              # Docker 镜像
├── docker-compose.yml      # 开发环境
├── supervisord.conf        # 进程管理
├── ecosystem.config.cjs    # PM2 配置 (2 进程 cluster)
├── centrifugo/
│   └── config.json         # Centrifugo 配置
├── src/
│   ├── index.ts            # Express 入口
│   ├── redis.ts            # Redis 客户端
│   ├── config/
│   │   └── partition.ts    # 分区逻辑
│   └── handlers/
│       ├── connect.ts      # 连接处理
│       ├── subscribe.ts    # 订阅处理
│       └── publish.ts      # 发布处理
├── examples/
│   └── worker.ts           # Worker 示例代码
├── package.json
└── tsconfig.json
```

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务
npm run dev

# 类型检查
npm run typecheck

# 构建
npm run build
```

## License

MIT

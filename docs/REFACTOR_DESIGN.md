# 重构设计方案：单机部署 + Redis Stream 消息队列

## 1. 背景与目标

### 当前架构问题
- Centrifugo 部署在 Fly.io，回调服务部署在 Cloudflare Workers
- 跨网络 HTTP 回调带来延迟和复杂性
- 回调服务承担过多职责（认证、订阅验证、消息处理）

### 重构目标
1. **单机部署**: Centrifugo 和回调服务部署在同一台服务器
2. **本地通信**: 消息回调使用 localhost，减少网络延迟
3. **职责分离**: 回调服务只负责接收消息并写入 Redis Stream
4. **异步处理**: 后端 Worker 从 Redis Stream 消费消息，执行业务逻辑

---

## 2. 新架构设计

### 2.1 架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              客户端层 (Clients)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐            │
│    │  Web App │    │ Mobile   │    │  IoT     │    │  Other   │            │
│    │ (React)  │    │  Client  │    │  Device  │    │  Client  │            │
│    └────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘            │
│         │               │               │               │                   │
│         └───────────────┴───────────────┴───────────────┘                   │
│                                   │                                         │
│                          WebSocket (wss://)                                 │
│                                   │                                         │
└───────────────────────────────────┼─────────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼─────────────────────────────────────────┐
│                         单机部署节点 (Single Server)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Centrifugo Server (:8000)                         │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │  - WebSocket 连接管理                                         │    │   │
│  │  │  - 消息广播 (PUB/SUB)                                         │    │   │
│  │  │  - 在线状态 (Presence)                                        │    │   │
│  │  │  - 消息历史 (History)                                         │    │   │
│  │  │  - JWT Token 验证                                             │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  │                                │                                     │   │
│  │            HTTP Proxy Callbacks (localhost:3000)                     │   │
│  │                                │                                     │   │
│  │    ┌───────────────────────────┼───────────────────────────┐        │   │
│  │    │                           │                           │        │   │
│  │    ▼                           ▼                           ▼        │   │
│  │  /connect                  /subscribe                  /publish     │   │
│  └──────┬─────────────────────────┬───────────────────────────┬────────┘   │
│         │                         │                           │            │
│         │                         │                           │            │
│  ┌──────▼─────────────────────────▼───────────────────────────▼────────┐   │
│  │              Callback Service (轻量级 Express) (:3000)               │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │  职责简化:                                                    │    │   │
│  │  │  1. /connect   - 验证 token，返回 user 信息                   │    │   │
│  │  │  2. /subscribe - 验证订阅权限，返回 allow/deny                │    │   │
│  │  │  3. /publish   - 接收消息，写入 Redis Stream，立即返回        │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  │                                │                                     │   │
│  │                          XADD (写入)                                 │   │
│  │                                │                                     │   │
│  └────────────────────────────────┼────────────────────────────────────┘   │
│                                   │                                        │
│  ┌────────────────────────────────▼────────────────────────────────────┐   │
│  │                        Redis (:6379)                                 │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │  Streams:                                                     │    │   │
│  │  │  ├─ messages:chat:{channel}     # 聊天消息流                  │    │   │
│  │  │  ├─ messages:events             # 系统事件流                  │    │   │
│  │  │  └─ messages:notifications      # 通知消息流                  │    │   │
│  │  │                                                               │    │   │
│  │  │  Data:                                                        │    │   │
│  │  │  ├─ users:{userId}             # 用户信息 (Hash)              │    │   │
│  │  │  ├─ sessions:{sessionId}       # 会话信息 (Hash)              │    │   │
│  │  │  └─ channels:{channelName}     # 频道元数据 (Hash)            │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  │                                │                                     │   │
│  │                    XREADGROUP (消费)                                 │   │
│  │                                │                                     │   │
│  └────────────────────────────────┼────────────────────────────────────┘   │
│                                   │                                        │
└───────────────────────────────────┼────────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────────┐
│                    Backend Workers (可独立部署/扩展)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Message Worker Pool                               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │   │
│  │  │  Worker 1   │  │  Worker 2   │  │  Worker N   │                  │   │
│  │  │             │  │             │  │             │                  │   │
│  │  │ - 消息验证   │  │ - 消息验证   │  │ - 消息验证   │                  │   │
│  │  │ - 内容过滤   │  │ - 内容过滤   │  │ - 内容过滤   │                  │   │
│  │  │ - 消息存储   │  │ - 消息存储   │  │ - 消息存储   │                  │   │
│  │  │ - 通知推送   │  │ - 通知推送   │  │ - 通知推送   │                  │   │
│  │  │ - 业务逻辑   │  │ - 业务逻辑   │  │ - 业务逻辑   │                  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                   │                                         │
│                           ┌───────┴───────┐                                │
│                           │               │                                 │
│                           ▼               ▼                                 │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐          │
│  │      Database (持久存储)     │  │    External Services        │          │
│  │  ├─ PostgreSQL              │  │  ├─ Push Notifications      │          │
│  │  ├─ MongoDB                 │  │  ├─ Email Service           │          │
│  │  └─ etc.                    │  │  └─ Analytics               │          │
│  └─────────────────────────────┘  └─────────────────────────────┘          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流图

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         消息发送流程 (Message Flow)                          │
└────────────────────────────────────────────────────────────────────────────┘

  Client                Centrifugo           Callback           Redis          Worker
    │                      │                 Service             │               │
    │  1. publish(msg)     │                    │                │               │
    │─────────────────────>│                    │                │               │
    │                      │                    │                │               │
    │                      │ 2. POST /publish   │                │               │
    │                      │   {channel, data}  │                │               │
    │                      │───────────────────>│                │               │
    │                      │                    │                │               │
    │                      │                    │ 3. XADD        │               │
    │                      │                    │  messages:chat │               │
    │                      │                    │───────────────>│               │
    │                      │                    │                │               │
    │                      │                    │ 4. OK          │               │
    │                      │                    │<───────────────│               │
    │                      │                    │                │               │
    │                      │ 5. {result: {}}    │                │               │
    │                      │   (立即返回成功)    │                │               │
    │                      │<───────────────────│                │               │
    │                      │                    │                │               │
    │                      │ 6. broadcast       │                │               │
    │   7. message event   │   to subscribers   │                │               │
    │<─────────────────────│                    │                │               │
    │                      │                    │                │               │
    │                      │                    │                │ 8. XREADGROUP │
    │                      │                    │                │<──────────────│
    │                      │                    │                │               │
    │                      │                    │                │ 9. message    │
    │                      │                    │                │──────────────>│
    │                      │                    │                │               │
    │                      │                    │                │   10. process │
    │                      │                    │                │   (async)     │
    │                      │                    │                │      │        │
    │                      │                    │                │      ▼        │
    │                      │                    │                │  - validate   │
    │                      │                    │                │  - store DB   │
    │                      │                    │                │  - notify     │
    │                      │                    │                │               │
```

---

## 3. 组件详细设计

### 3.1 Callback Service (轻量级)

新的回调服务将大幅简化，只保留核心功能：

```typescript
// packages/callback-service/src/index.ts

import express from 'express';
import Redis from 'ioredis';

const app = express();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

app.use(express.json());

// 连接回调 - 验证 token，返回用户信息
app.post('/centrifugo/connect', async (req, res) => {
  const { client, data } = req.body;

  // 简单验证，从 token 中解析用户信息
  // token 已经被 Centrifugo 验证过签名
  const userId = data?.userId;
  const userName = data?.userName;

  if (!userId) {
    return res.json({ error: { code: 4001, message: 'Unauthorized' } });
  }

  // 记录用户会话到 Redis
  await redis.hset(`sessions:${client}`, {
    userId,
    userName,
    connectedAt: Date.now()
  });

  res.json({
    result: {
      user: userId,
      info: { name: userName }
    }
  });
});

// 订阅回调 - 验证订阅权限
app.post('/centrifugo/subscribe', async (req, res) => {
  const { user, channel } = req.body;

  // 简单的频道权限验证
  const allowedPatterns = [
    /^chat$/,
    /^chat:[\w-]+$/,
    /^user:[\w-]+$/
  ];

  const isAllowed = allowedPatterns.some(p => p.test(channel));

  // user: 开头的频道只能订阅自己的
  if (channel.startsWith('user:') && channel !== `user:${user}`) {
    return res.json({ error: { code: 4003, message: 'Forbidden' } });
  }

  if (!isAllowed) {
    return res.json({ error: { code: 4003, message: 'Invalid channel' } });
  }

  res.json({ result: {} });
});

// 发布回调 - 写入 Redis Stream，立即返回
app.post('/centrifugo/publish', async (req, res) => {
  const { client, user, channel, data, info } = req.body;

  const messageId = crypto.randomUUID();
  const timestamp = Date.now();

  // 构造消息数据
  const message = {
    id: messageId,
    channel,
    userId: user,
    userName: info?.name || 'Anonymous',
    text: data?.text || '',
    timestamp: new Date(timestamp).toISOString(),
    raw: JSON.stringify(data)
  };

  // 写入 Redis Stream (异步处理)
  const streamKey = `messages:${channel.replace(':', '/')}`;
  await redis.xadd(
    streamKey,
    '*',  // 自动生成消息 ID
    'payload', JSON.stringify(message)
  );

  // 立即返回成功，Centrifugo 广播消息
  res.json({
    result: {
      data: {
        id: messageId,
        text: message.text,
        user: { id: user, name: message.userName },
        timestamp: message.timestamp
      }
    }
  });
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Callback service listening on port ${PORT}`);
});
```

### 3.2 Centrifugo 配置 (本地回调)

```json
{
  "port": 8000,
  "admin": false,
  "log_level": "info",
  "allowed_origins": ["*"],

  "token_hmac_secret_key": "${CENTRIFUGO_TOKEN_HMAC_SECRET_KEY}",

  "proxy_connect_endpoint": "http://localhost:3000/centrifugo/connect",
  "proxy_subscribe_endpoint": "http://localhost:3000/centrifugo/subscribe",
  "proxy_publish_endpoint": "http://localhost:3000/centrifugo/publish",

  "proxy_connect_timeout": "1s",
  "proxy_subscribe_timeout": "1s",
  "proxy_publish_timeout": "1s",

  "namespaces": [
    {
      "name": "chat",
      "presence": true,
      "join_leave": true,
      "history_size": 100,
      "history_ttl": "300s",
      "proxy_subscribe": true,
      "proxy_publish": true
    }
  ],

  "health": true
}
```

### 3.3 Backend Worker (消息消费者)

```typescript
// packages/worker/src/message-worker.ts

import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const CONSUMER_GROUP = 'message-processors';
const CONSUMER_NAME = `worker-${process.pid}`;
const STREAMS = ['messages:chat', 'messages:chat/*'];

async function initConsumerGroup() {
  for (const stream of STREAMS) {
    try {
      await redis.xgroup('CREATE', stream, CONSUMER_GROUP, '0', 'MKSTREAM');
      console.log(`Created consumer group for ${stream}`);
    } catch (err: any) {
      if (!err.message.includes('BUSYGROUP')) {
        throw err;
      }
    }
  }
}

async function processMessage(streamKey: string, messageId: string, fields: string[]) {
  const payload = JSON.parse(fields[1]); // ['payload', '{"..."}']

  console.log(`Processing message from ${streamKey}:`, payload);

  try {
    // 1. 消息验证
    if (!payload.text || payload.text.length > 5000) {
      console.warn('Invalid message:', payload);
      return;
    }

    // 2. 内容过滤（敏感词等）
    // const filteredText = await filterContent(payload.text);

    // 3. 持久化存储
    // await db.messages.insert({
    //   id: payload.id,
    //   channel: payload.channel,
    //   userId: payload.userId,
    //   text: payload.text,
    //   createdAt: payload.timestamp
    // });

    // 4. 触发通知（如 @mention）
    // if (payload.text.includes('@')) {
    //   await notificationService.notify(payload);
    // }

    // 5. 分析统计
    // await analytics.trackMessage(payload);

    console.log(`Message ${payload.id} processed successfully`);

    // ACK 消息
    await redis.xack(streamKey, CONSUMER_GROUP, messageId);

  } catch (error) {
    console.error(`Error processing message ${messageId}:`, error);
    // 不 ACK，消息会被重新投递
  }
}

async function consumeMessages() {
  while (true) {
    try {
      const results = await redis.xreadgroup(
        'GROUP', CONSUMER_GROUP, CONSUMER_NAME,
        'BLOCK', 5000,  // 阻塞 5 秒等待新消息
        'COUNT', 10,    // 每次最多取 10 条
        'STREAMS', 'messages:chat', 'messages:chat/*',
        '>', '>'        // 只读取新消息
      );

      if (!results) continue;

      for (const [streamKey, messages] of results) {
        for (const [messageId, fields] of messages) {
          await processMessage(streamKey, messageId, fields);
        }
      }
    } catch (error) {
      console.error('Error consuming messages:', error);
      await new Promise(r => setTimeout(r, 1000)); // 错误后等待 1 秒
    }
  }
}

async function main() {
  console.log(`Starting message worker: ${CONSUMER_NAME}`);
  await initConsumerGroup();
  await consumeMessages();
}

main().catch(console.error);
```

### 3.4 Docker Compose 部署配置

```yaml
# docker-compose.yml

version: '3.8'

services:
  centrifugo:
    image: centrifugo/centrifugo:v5
    container_name: centrifugo
    ports:
      - "8000:8000"
    volumes:
      - ./config/centrifugo.json:/centrifugo/config.json:ro
    command: centrifugo -c config.json
    environment:
      - CENTRIFUGO_TOKEN_HMAC_SECRET_KEY=${CENTRIFUGO_SECRET}
    depends_on:
      - callback-service
    networks:
      - realtime-network
    restart: unless-stopped

  callback-service:
    build:
      context: ./packages/callback-service
      dockerfile: Dockerfile
    container_name: callback-service
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - redis
    networks:
      - realtime-network
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    container_name: redis
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes
    networks:
      - realtime-network
    restart: unless-stopped

  message-worker:
    build:
      context: ./packages/worker
      dockerfile: Dockerfile
    container_name: message-worker
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=${DATABASE_URL}
    depends_on:
      - redis
    networks:
      - realtime-network
    restart: unless-stopped
    deploy:
      replicas: 2  # 可扩展多个 worker

  # 可选：Redis 监控
  redis-commander:
    image: rediscommander/redis-commander:latest
    container_name: redis-commander
    ports:
      - "8081:8081"
    environment:
      - REDIS_HOSTS=local:redis:6379
    depends_on:
      - redis
    networks:
      - realtime-network
    profiles:
      - monitoring

volumes:
  redis-data:

networks:
  realtime-network:
    driver: bridge
```

---

## 4. Redis Stream 数据结构设计

### 4.1 Stream Keys

| Stream Key | 用途 | 数据格式 |
|------------|------|----------|
| `messages:chat` | 主聊天频道消息 | MessagePayload |
| `messages:chat/{room}` | 房间特定消息 | MessagePayload |
| `messages:events` | 系统事件 (join/leave) | EventPayload |
| `messages:notifications` | 通知队列 | NotificationPayload |

### 4.2 消息格式

```typescript
// MessagePayload
interface MessagePayload {
  id: string;           // UUID
  channel: string;      // "chat:general"
  userId: string;       // 发送者 ID
  userName: string;     // 发送者名称
  text: string;         // 消息内容
  timestamp: string;    // ISO 8601 时间戳
  metadata?: {          // 可选元数据
    clientId?: string;
    replyTo?: string;
    attachments?: string[];
  };
}

// EventPayload
interface EventPayload {
  type: 'join' | 'leave' | 'subscribe' | 'unsubscribe';
  channel: string;
  userId: string;
  timestamp: string;
}
```

### 4.3 Consumer Group 设计

```
Stream: messages:chat
  └── Consumer Group: message-processors
        ├── Consumer: worker-1 (pending: 0, idle: 1000ms)
        ├── Consumer: worker-2 (pending: 0, idle: 500ms)
        └── Consumer: worker-3 (pending: 2, idle: 0ms)
```

---

## 5. 新目录结构

```
centrifuge-realtime-message/
├── packages/
│   ├── callback-service/          # 新增：轻量回调服务
│   │   ├── src/
│   │   │   ├── index.ts           # Express 入口
│   │   │   ├── handlers/          # 回调处理器
│   │   │   │   ├── connect.ts
│   │   │   │   ├── subscribe.ts
│   │   │   │   └── publish.ts
│   │   │   └── redis.ts           # Redis 客户端
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── worker/                    # 新增：消息处理 Worker
│   │   ├── src/
│   │   │   ├── index.ts           # Worker 入口
│   │   │   ├── consumer.ts        # Stream 消费者
│   │   │   ├── processors/        # 消息处理器
│   │   │   │   ├── chat.ts
│   │   │   │   ├── notification.ts
│   │   │   │   └── analytics.ts
│   │   │   └── services/          # 外部服务
│   │   │       ├── database.ts
│   │   │       └── push.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── shared/                    # 保留：共享类型
│   │   └── src/
│   │       ├── entities/
│   │       └── types/
│   │           ├── centrifugo.types.ts
│   │           └── redis.types.ts  # 新增
│   │
│   ├── centrifugo/                # 更新：配置文件
│   │   ├── config.json            # 生产配置 (localhost 回调)
│   │   └── config.local.json      # 开发配置
│   │
│   └── workers/                   # 保留/可选：原 Cloudflare Workers
│       └── ...                    # 可作为 API Gateway
│
├── frontend/                      # 保留：React 前端
│   └── ...
│
├── config/                        # 新增：配置目录
│   ├── centrifugo.json
│   └── redis.conf
│
├── docker-compose.yml             # 新增：部署配置
├── docker-compose.dev.yml         # 新增：开发配置
│
└── docs/
    ├── DESIGN.md
    └── REFACTOR_DESIGN.md         # 本文档
```

---

## 6. 优势与权衡

### 6.1 优势

| 方面 | 说明 |
|------|------|
| **低延迟** | localhost HTTP 调用 < 1ms，无网络开销 |
| **简化运维** | 单机部署，服务间通信简单 |
| **解耦处理** | 消息立即广播，业务逻辑异步处理 |
| **可扩展** | Worker 可水平扩展，独立处理能力 |
| **可靠性** | Redis Stream 持久化，消息不丢失 |
| **成本降低** | 无需 Cloudflare Workers 费用 |

### 6.2 权衡

| 方面 | 风险 | 缓解措施 |
|------|------|----------|
| **单点故障** | 单机部署存在风险 | 部署多实例 + 负载均衡 |
| **扩展限制** | 单机资源有限 | 后续可迁移到 K8s |
| **消息顺序** | Stream 消费可能乱序 | 使用单 consumer 或排序处理 |
| **复杂度** | 新增 Redis 组件 | Redis 成熟稳定，易维护 |

---

## 7. 迁移步骤

### Phase 1: 基础设施准备
1. 准备单机服务器 (推荐 2C4G+)
2. 安装 Docker & Docker Compose
3. 部署 Redis

### Phase 2: 开发回调服务
1. 创建 `callback-service` 包
2. 实现 connect/subscribe/publish 处理器
3. 集成 Redis Stream 写入
4. 本地测试

### Phase 3: 开发消息 Worker
1. 创建 `worker` 包
2. 实现 Consumer Group 消费逻辑
3. 实现消息处理器
4. 本地测试

### Phase 4: 部署与切换
1. 更新 Centrifugo 配置 (localhost 回调)
2. 部署 Docker Compose 服务
3. 更新前端 WebSocket 地址
4. 流量切换

### Phase 5: 监控与优化
1. 添加日志和监控
2. 配置告警
3. 性能调优

---

## 8. 监控指标

### 关键指标

| 指标 | 描述 | 告警阈值 |
|------|------|----------|
| `centrifugo_connected_clients` | 在线连接数 | > 10000 |
| `callback_latency_ms` | 回调延迟 | > 100ms |
| `redis_stream_length` | Stream 积压长度 | > 1000 |
| `worker_processing_rate` | 消息处理速率 | < 100/s |
| `worker_error_rate` | 处理错误率 | > 1% |

---

## 9. 总结

本重构方案通过：
1. **单机部署** - 简化架构，降低复杂度
2. **本地通信** - 消除网络延迟
3. **Redis Stream** - 异步解耦，可靠传递
4. **Worker 消费** - 独立扩展，灵活处理

实现了一个更简洁、高效、可维护的实时消息系统架构。

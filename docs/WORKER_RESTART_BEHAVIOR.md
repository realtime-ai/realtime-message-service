# Worker 重启与 Channel 重新分配行为

## 当前实现分析

### 场景 1: Worker 优雅重启（使用相同 WORKER_ID）✅

```bash
# Terminal 1
WORKER_ID=worker-0 npx tsx examples/worker-simple.ts
# Ctrl+C 停止
WORKER_ID=worker-0 npx tsx examples/worker-simple.ts
```

**行为：**
1. Worker 关闭时调用 `unregisterWorker()` → 从 `workers:active` 移除
2. **`channel:route:{channel}` 映射保留**（不删除）
3. Worker 重启时调用 `registerWorker()` → 重新加入 `workers:active`
4. Channel 消息继续路由到同一个 worker

**结果：Channel 不会重新分配** ✅

**Redis 状态变化：**
```
# 运行中
workers:active = { "worker-0": 1234567890 }
channel:route:chat-room-1 = "worker-0"

# 关闭后
workers:active = {}
channel:route:chat-room-1 = "worker-0"  # 保留

# 重启后
workers:active = { "worker-0": 1234567899 }
channel:route:chat-room-1 = "worker-0"  # 仍然有效
```

---

### 场景 2: Worker 异常崩溃（未执行 graceful shutdown）❌

```bash
# Worker 进程崩溃或被 kill -9
```

**行为：**
1. Worker 崩溃，**未调用 `unregisterWorker()`**
2. Worker 仍在 `workers:active` 中（僵尸记录）
3. `channel:route:{channel}` 仍指向已崩溃的 worker
4. 新消息写入该 worker 的 stream，但无人消费

**结果：Channel 消息丢失，直到超时检测** ❌

**Redis 状态：**
```
# 崩溃后
workers:active = { "worker-0": 1234567890 }  # 僵尸记录
channel:route:chat-room-1 = "worker-0"       # 指向已崩溃的 worker
messages:worker:worker-0 = [msg1, msg2, ...]  # 消息堆积，无人消费
```

**当前缓解措施：**
- 本地缓存 60 秒 TTL（部分缓解，但不彻底）
- 需要人工清理或等待超时

---

### 场景 3: Worker 使用新 WORKER_ID 重启（自动生成 ID）⚠️

```bash
# 启动时自动生成 ID
npx tsx examples/worker-simple.ts
# 重启后生成不同的 ID
npx tsx examples/worker-simple.ts
```

**行为：**
1. 旧 worker 关闭，从 `workers:active` 移除
2. 新 worker 启动，使用新 ID 注册
3. 已分配的 channel 仍指向旧 worker ID
4. 下次消息验证失败（旧 worker 不在活跃列表），触发重新分配

**结果：所有 channel 逐步重新分配**（惰性重分配）⚠️

---

## 改进方案

### 方案 A: Worker 心跳机制（推荐）

**实现：**
1. Worker 每 10 秒更新 `workers:active` 的 score（心跳）
2. `getWorkerForChannel()` 检查 worker 的最后心跳时间
3. 如果 worker 超过 30 秒未心跳，视为离线，重新分配

**优点：**
- 自动检测崩溃的 worker
- 不依赖 graceful shutdown
- 可配置超时时间

**缺点：**
- 增加 Redis 写入频率（每个 worker 每 10 秒 1 次写入）

**代码示例：**
```typescript
// routing.ts
const HEARTBEAT_INTERVAL_MS = 10_000; // 10 秒
const WORKER_TIMEOUT_MS = 30_000; // 30 秒

export async function isWorkerActive(redis: Redis, workerId: string): Promise<boolean> {
  const score = await redis.zscore(ROUTING_KEYS.ACTIVE_WORKERS, workerId);
  if (score === null) return false;

  const lastHeartbeat = parseInt(score, 10);
  const now = Date.now();
  return (now - lastHeartbeat) < WORKER_TIMEOUT_MS;
}

// worker-simple.ts
let heartbeatTimer: NodeJS.Timeout;

function startHeartbeat() {
  heartbeatTimer = setInterval(async () => {
    await redis.zadd(ROUTING_KEYS.ACTIVE_WORKERS, Date.now(), WORKER_ID);
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
  clearInterval(heartbeatTimer);
}
```

---

### 方案 B: Worker 使用固定 ID + 删除旧映射（简单）

**实现：**
1. 强制要求 WORKER_ID 为固定值（通过环境变量）
2. Worker 启动时删除所有指向自己的 channel 映射（可选）
3. 依赖 graceful shutdown

**优点：**
- 实现简单
- 无额外 Redis 开销

**缺点：**
- 无法处理异常崩溃
- 需要手动清理僵尸记录

---

### 方案 C: Channel 映射带 TTL（激进）

**实现：**
1. `channel:route:{channel}` 使用 `SETEX` 设置过期时间（例如 5 分钟）
2. Channel 定期"续约"（每次消息发送时更新 TTL）
3. Worker 崩溃后，映射自动过期，触发重新分配

**优点：**
- 自动清理失效映射
- 无需心跳机制

**缺点：**
- 增加 Redis 写入（每次消息都要更新 TTL）
- 可能导致活跃 channel 意外过期

---

### 方案 D: 使用 Redis Pub/Sub 健康检查（复杂）

**实现：**
1. Publish handler 发送健康检查请求到特定 channel
2. Worker 订阅并响应健康检查
3. 超时未响应视为离线

**优点：**
- 实时健康检查
- 可检测网络分区

**缺点：**
- 实现复杂
- 增加系统复杂度

---

## 推荐方案

**开发/测试环境：**
- 使用固定 WORKER_ID（方案 B）
- 依赖 graceful shutdown
- 简单可靠

**生产环境：**
- 实现心跳机制（方案 A）
- 自动检测崩溃
- 配置合理的超时时间（30-60 秒）

---

## 实现心跳机制的代码改动

如果需要实现方案 A，需要修改以下文件：

1. **src/config/routing.ts** - 添加 `isWorkerActive()` 检查心跳
2. **src/config/routing.ts** - 修改 `getWorkerForChannel()` 使用新的健康检查
3. **examples/worker-simple.ts** - 添加心跳定时器
4. **src/config/routing.ts** - 添加配置常量

是否需要我实现完整的心跳机制？

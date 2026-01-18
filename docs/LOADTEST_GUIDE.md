# 压测指南

## 测试配置

| 参数 | 值 |
|------|------|
| Channels | 100 |
| Messages/Channel/Second | 10 |
| Total Throughput | 1,000 msg/s |
| Duration | 60 seconds |
| Total Messages | 60,000 |
| Workers | 2 |
| Callback Services | 2 |

## 前置要求

1. Redis 运行在 `localhost:6379`
2. Node.js >= 18
3. 已安装依赖：`npm install`

## 快速启动

### 步骤 1: 启动 Redis

```bash
# 如果使用 Docker
docker run -d -p 6379:6379 redis:7-alpine

# 或者使用 docker-compose
docker-compose up -d redis
```

### 步骤 2: 设置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 确保以下变量设置正确
export REDIS_URL=redis://localhost:6379
export CENTRIFUGO_TOKEN_HMAC_SECRET_KEY=test-secret-key
export CENTRIFUGO_REDIS_ADDRESS=redis://localhost:6379
```

### 步骤 3: 启动组件（分别在不同终端）

#### Terminal 1 & 2: 启动 2 个 Callback Services

```bash
# Terminal 1
PORT=3000 npm start

# Terminal 2
PORT=3001 npm start
```

> **注意**: Centrifugo 配置中只使用 `localhost:3000`，所以 `localhost:3001` 作为备用或轮询使用。
> 你可以修改 `centrifugo/config.json` 来启用负载均衡。

#### Terminal 3 & 4: 启动 2 个 Workers

```bash
# Terminal 3
WORKER_ID=worker-0 npx tsx examples/worker-monitor.ts

# Terminal 4
WORKER_ID=worker-1 npx tsx examples/worker-monitor.ts
```

**Worker 每 10 秒输出一次统计信息**，包括：
- 处理的消息数量
- 吞吐量
- 延迟统计
- Top 10 活跃 channels

#### Terminal 5: 启动 Centrifugo

```bash
cd centrifugo
centrifugo --config=config.json
```

如果没有安装 Centrifugo，可以下载：
```bash
# macOS
brew install centrifugo/tap/centrifugo

# 或使用 Docker
docker run -d -p 8000:8000 \
  -v $(pwd)/centrifugo:/centrifugo \
  -e CENTRIFUGO_TOKEN_HMAC_SECRET_KEY=test-secret-key \
  -e CENTRIFUGO_REDIS_ADDRESS=redis://host.docker.internal:6379 \
  centrifugo/centrifugo:v5 \
  centrifugo --config=/centrifugo/config.json
```

### 步骤 4: 运行压测

```bash
# Terminal 6
npx tsx examples/loadtest.ts
```

**压测会：**
1. 显示测试配置
2. 倒计时 3 秒
3. 开始发送消息（每秒显示进度）
4. 60 秒后停止
5. 输出完整统计报告

## 自定义配置

### 环境变量

```bash
# 修改 channel 数量
NUM_CHANNELS=50 npx tsx examples/loadtest.ts

# 修改每个 channel 的消息速率
MSG_PER_SEC=20 npx tsx examples/loadtest.ts

# 修改压测时长
DURATION=120 npx tsx examples/loadtest.ts

# 修改 callback service URL
CALLBACK_SERVICE_URL=http://localhost:3001 npx tsx examples/loadtest.ts

# 组合使用
NUM_CHANNELS=200 MSG_PER_SEC=5 DURATION=30 npx tsx examples/loadtest.ts
```

## 预期输出

### 压测实时输出

```
[15s] Sent: 15,234 | Success: 15,189 | Failed: 45 | Rate: 99.7% | Throughput: 1012 msg/s | Avg Latency: 12.3ms
```

### 压测最终报告

```
======================================================================
Load Test Statistics
======================================================================
Duration:           60.12s
Total Sent:         60,000
Total Success:      59,876
Total Failed:       124
Success Rate:       99.79%
Throughput:         996.23 msg/s

Latency Statistics:
  Min:              3.12ms
  Max:              156.45ms
  Average:          15.34ms
  P50:              12.56ms
  P95:              28.91ms
  P99:              45.67ms
======================================================================
```

### Worker 统计报告 (每 10 秒)

```
============================================================
Worker: worker-0 - Runtime: 20s
============================================================
Processed:       10,123 messages
Errors:          0
Error Rate:      0.00%
Throughput:      506.15 msg/s
Unique Channels: 52

Latency:
  Min:           5.23ms
  Max:           89.12ms
  Average:       18.45ms

Top 10 Channels:
  chat:room-5: 215 messages
  chat:room-12: 209 messages
  chat:room-23: 204 messages
  ...
============================================================
```

## 监控 Redis

### 查看活跃 Workers

```bash
redis-cli ZRANGE workers:active 0 -1 WITHSCORES
```

### 查看 Channel 路由

```bash
redis-cli KEYS "channel:route:*"
redis-cli GET "channel:route:chat:room-1"
```

### 查看 Stream 长度

```bash
redis-cli XLEN messages:worker:worker-0
redis-cli XLEN messages:worker:worker-1
```

### 监控 Redis 性能

```bash
redis-cli --stat
redis-cli MONITOR
```

## 验证 Sticky Routing

### 检查 Channel 分配

```bash
# 查看 channel:route:chat:room-1 是否总是指向同一个 worker
redis-cli GET "channel:route:chat:room-1"

# 多次运行，验证结果一致
for i in {1..10}; do
  redis-cli GET "channel:route:chat:room-1"
  sleep 1
done
```

### 分析 Worker 负载均衡

压测结束后，检查两个 worker 的最终统计：
- 每个 worker 应该处理大约 50 个 channel
- 每个 worker 应该处理大约 30,000 条消息
- Channel 分配应该相对均匀（round-robin）

## 故障排查

### Worker 没有收到消息

1. 检查 worker 是否已注册：
   ```bash
   redis-cli ZRANGE workers:active 0 -1
   ```

2. 检查 stream 是否有消息堆积：
   ```bash
   redis-cli XLEN messages:worker:worker-0
   ```

3. 检查 callback service 日志，确认消息已写入

### 高延迟

1. 检查 Redis 性能：`redis-cli --latency`
2. 检查 callback service CPU/内存使用率
3. 减少并发量：`NUM_CHANNELS=50 MSG_PER_SEC=5`

### 高错误率

1. 检查 callback service 是否正常运行
2. 检查 Redis 连接是否稳定
3. 查看 callback service 错误日志

## 清理

### 清理 Redis 数据

```bash
# 删除所有测试数据
redis-cli FLUSHDB

# 或选择性删除
redis-cli DEL workers:active
redis-cli KEYS "channel:route:*" | xargs redis-cli DEL
redis-cli KEYS "messages:worker:*" | xargs redis-cli DEL
```

### 停止所有服务

按 `Ctrl+C` 停止所有终端中的进程。

## 性能基准

基于 MacBook Pro (M1, 16GB RAM)：

| 指标 | 预期值 |
|------|--------|
| 吞吐量 | 900-1100 msg/s |
| 平均延迟 | 10-30ms |
| P95 延迟 | 30-50ms |
| P99 延迟 | 50-100ms |
| 成功率 | > 99.5% |

实际性能取决于硬件配置、网络延迟和 Redis 性能。

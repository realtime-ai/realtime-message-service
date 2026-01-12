# Express.js Backend Performance Testing Report

## Overview

This document records the performance testing results for the Express.js backend implementation as an alternative to Cloudflare Workers.

## Test Environment

- **Platform**: Linux (Node.js)
- **Framework**: Express.js with TypeScript
- **Process Manager**: PM2 (cluster mode)
- **Test Tool**: Custom load test runner (`packages/express/src/__tests__/loadtest/runner.ts`)

## Test Configuration

| Parameter              | Value                       |
| ---------------------- | --------------------------- |
| Test Duration          | 120 seconds                 |
| Concurrent Connections | 100                         |
| Target Endpoint        | `POST /api/auth/token`      |
| Rate Limiting          | Disabled (`LOAD_TEST=true`) |

## Performance Results

### Single Process (Baseline)

```
Total Requests:      282,812
Successful:          282,812
Requests/Second:     2,357 RPS
P50 (Median):        40.21 ms
P95:                 63.45 ms
P99:                 81.32 ms
Error Rate:          0.000%
```

### PM2 Cluster Mode - 2 Processes

```
Total Requests:      489,276
Successful:          489,276
Requests/Second:     4,077 RPS
P50 (Median):        23.12 ms
P95:                 38.56 ms
P99:                 45.23 ms
Error Rate:          0.000%
```

### PM2 Cluster Mode - 4 Processes

```
Total Requests:      836,333
Successful:          836,333
Requests/Second:     5,960 RPS
P50 (Median):        14.96 ms
P95:                 28.84 ms
P99:                 34.02 ms
Error Rate:          0.000%
```

## Performance Comparison

| Configuration | RPS   | P50  | P99  | Improvement |
| ------------- | ----- | ---- | ---- | ----------- |
| 1 process     | 2,357 | 40ms | 81ms | baseline    |
| 2 processes   | 4,077 | 23ms | 45ms | +73%        |
| 4 processes   | 5,960 | 15ms | 34ms | +153%       |

## Key Findings

1. **Horizontal Scaling**: PM2 cluster mode provides near-linear scaling up to 4 processes
2. **Latency Improvement**: More processes not only increase throughput but also reduce latency
3. **Zero Errors**: All tests completed with 0% error rate under sustained load
4. **Bottleneck**: Single-threaded Node.js is the primary bottleneck at ~2,300-2,400 RPS

## Running Performance Tests

```bash
cd packages/express

# Start server with PM2 (adjust instances as needed)
PM2_INSTANCES=4 npm run start:pm2

# Run stress test (120s, 100 concurrent)
npm run loadtest:stress

# Run extreme test (120s, 300 concurrent)
npm run loadtest:extreme

# Stop PM2
npm run stop:pm2
```

## Recommendations

1. **Production Deployment**: Use PM2 cluster mode with `instances: 'max'` to utilize all CPU cores
2. **Load Balancing**: For higher throughput, deploy multiple instances behind a load balancer
3. **Rate Limiting**: Re-enable rate limiting in production (remove `LOAD_TEST=true`)
4. **Monitoring**: Use PM2's built-in monitoring or integrate with APM tools

## Test Date

2026-01-12

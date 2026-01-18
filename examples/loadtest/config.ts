/**
 * Load Test Configuration
 */

export interface LoadTestConfig {
  // 目标服务
  callbackUrl: string;
  centrifugoUrl: string;
  centrifugoWsUrl: string;
  redisUrl: string;

  // 测试参数
  duration: number;           // 测试持续时间 (秒)
  rampUpTime: number;         // 爬坡时间 (秒)

  // 发布测试
  publishRps: number;         // 每秒发布消息数
  numChannels: number;        // 频道数量
  messageSize: number;        // 消息大小 (字节)

  // WebSocket 测试
  numConnections: number;     // 并发连接数
  connectionsPerSecond: number; // 每秒建立连接数

  // 报告
  reportInterval: number;     // 报告间隔 (秒)
}

export const defaultConfig: LoadTestConfig = {
  callbackUrl: process.env.CALLBACK_URL || 'http://localhost:3000',
  centrifugoUrl: process.env.CENTRIFUGO_URL || 'http://localhost:8000',
  centrifugoWsUrl: process.env.CENTRIFUGO_WS_URL || 'ws://localhost:8000/connection/websocket',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  duration: parseInt(process.env.DURATION || '60', 10),
  rampUpTime: parseInt(process.env.RAMP_UP || '10', 10),

  publishRps: parseInt(process.env.PUBLISH_RPS || '100', 10),
  numChannels: parseInt(process.env.NUM_CHANNELS || '10', 10),
  messageSize: parseInt(process.env.MESSAGE_SIZE || '256', 10),

  numConnections: parseInt(process.env.NUM_CONNECTIONS || '100', 10),
  connectionsPerSecond: parseInt(process.env.CONN_PER_SEC || '10', 10),

  reportInterval: parseInt(process.env.REPORT_INTERVAL || '5', 10),
};

export function printConfig(config: LoadTestConfig): void {
  console.log('═'.repeat(60));
  console.log('📋 Load Test Configuration');
  console.log('═'.repeat(60));
  console.log(`  Callback URL:     ${config.callbackUrl}`);
  console.log(`  Centrifugo URL:   ${config.centrifugoUrl}`);
  console.log(`  WebSocket URL:    ${config.centrifugoWsUrl}`);
  console.log(`  Redis URL:        ${config.redisUrl}`);
  console.log('─'.repeat(60));
  console.log(`  Duration:         ${config.duration}s`);
  console.log(`  Ramp-up Time:     ${config.rampUpTime}s`);
  console.log('─'.repeat(60));
  console.log(`  Publish RPS:      ${config.publishRps}`);
  console.log(`  Num Channels:     ${config.numChannels}`);
  console.log(`  Message Size:     ${config.messageSize} bytes`);
  console.log('─'.repeat(60));
  console.log(`  Num Connections:  ${config.numConnections}`);
  console.log(`  Conn/sec:         ${config.connectionsPerSecond}`);
  console.log('═'.repeat(60));
}

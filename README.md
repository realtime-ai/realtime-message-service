# Centrifuge 实时消息聊天室

基于 [Centrifugo](https://centrifugal.dev/) 构建的实时聊天室应用，支持多频道聊天、在线用户列表、消息历史等功能。

## 功能特性

- 实时消息发送与接收
- 多聊天频道 (Channel) 支持
- 用户加入/离开频道的实时通知
- 在线用户列表 (Presence)
- 消息历史记录
- 用户认证 (JWT)

## 技术栈

### 后端
- Node.js + Express + TypeScript
- JWT 认证
- Centrifugo Server API 集成

### 前端
- React 18 + TypeScript
- Vite 构建工具
- Tailwind CSS
- centrifuge-js SDK

### 实时服务
- Centrifugo v5.x

## 项目结构

```
centrifuge-realtime-message-play/
├── docs/
│   └── DESIGN.md          # 详细设计文档
├── backend/               # 后端服务 (Node.js)
├── frontend/              # 前端应用 (React)
├── centrifugo/           # Centrifugo 配置
└── docker-compose.yml    # Docker 编排
```

## 快速开始

### 1. 启动 Centrifugo

```bash
# 下载 Centrifugo
# https://github.com/centrifugal/centrifugo/releases

# 使用项目配置启动
./centrifugo --config=centrifugo/config.json
```

### 2. 启动后端

```bash
cd backend
npm install
npm run dev
```

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
```

## 架构概览

```
┌─────────────┐      WebSocket      ┌─────────────┐     HTTP Proxy     ┌─────────────┐
│   Frontend  │ ◄─────────────────► │  Centrifugo │ ◄─────────────────► │   Backend   │
│   (React)   │                     │   Server    │                     │  (Node.js)  │
└─────────────┘                     └─────────────┘                     └─────────────┘
```

## 设计文档

详细的系统设计请查看 [docs/DESIGN.md](docs/DESIGN.md)

## License

MIT

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
- Centrifugo Proxy 回调

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
├── backend/               # 后端服务 (Node.js, Port 3001)
├── frontend/              # 前端应用 (React, Port 5173)
└── centrifugo/            # Centrifugo 配置 (Port 8000)
```

## 快速开始

### 1. 安装 Centrifugo

从 [GitHub Releases](https://github.com/centrifugal/centrifugo/releases) 下载适合你系统的版本。

```bash
# macOS (使用 Homebrew)
brew install centrifugo

# 或手动下载
# Linux
wget https://github.com/centrifugal/centrifugo/releases/download/v5.4.0/centrifugo_5.4.0_linux_amd64.tar.gz
tar -xzf centrifugo_5.4.0_linux_amd64.tar.gz

# 启动 Centrifugo (在项目根目录)
./centrifugo --config=centrifugo/config.json
```

### 2. 启动后端

```bash
cd backend
npm install
npm run dev
# 服务运行在 http://localhost:3001
```

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
# 应用运行在 http://localhost:5173
```

### 4. 使用应用

1. 打开浏览器访问 http://localhost:5173
2. 输入用户名登录
3. 输入频道名称 (如 `general`) 加入聊天室
4. 开始聊天!

可以打开多个浏览器窗口/标签页测试多用户聊天。

## 架构概览

```
┌─────────────┐      WebSocket      ┌─────────────┐     HTTP Proxy     ┌─────────────┐
│   Frontend  │ ◄─────────────────► │  Centrifugo │ ◄─────────────────► │   Backend   │
│   (React)   │     :5173           │   :8000     │                     │  (Node.js)  │
└─────────────┘                     └─────────────┘                     └─────────────┘
                                          │                                   :3001
                                          │
                              ┌───────────┴───────────┐
                              │ Proxy Endpoints:      │
                              │ • /centrifugo/connect │
                              │ • /centrifugo/subscribe│
                              │ • /centrifugo/publish │
                              └───────────────────────┘
```

## Centrifugo 配置说明

配置文件位于 `centrifugo/config.json`:

- **Proxy 端点**: 连接、订阅、发布事件都会回调到后端处理
- **chat 命名空间**:
  - `presence`: 启用在线用户列表
  - `join_leave`: 启用加入/离开通知
  - `history_size/ttl`: 消息历史配置

## API 端点

### 后端 REST API

- `POST /api/auth/login` - 用户登录 (仅需用户名)

### Centrifugo Proxy 端点

- `POST /centrifugo/connect` - 处理连接请求
- `POST /centrifugo/subscribe` - 处理订阅请求
- `POST /centrifugo/publish` - 处理消息发布

## 设计文档

详细的系统设计请查看 [docs/DESIGN.md](docs/DESIGN.md)

## License

MIT

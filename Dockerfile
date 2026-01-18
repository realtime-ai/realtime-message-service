# Multi-stage build for Centrifugo + Callback Service
# Stage 1: Build environment
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for build)
RUN npm install

# Copy source code
COPY src/ ./src/
COPY tsconfig.json ./

# Build TypeScript to JavaScript
RUN npm run build

# Stage 2: Runtime environment
FROM node:18-alpine

# Install supervisor and wget for health checks
RUN apk add --no-cache supervisor wget

# Download and install Centrifugo (auto-detect architecture)
ENV CENTRIFUGO_VERSION=5.4.8
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then \
      CENTRIFUGO_ARCH="arm64"; \
    else \
      CENTRIFUGO_ARCH="amd64"; \
    fi && \
    wget -q https://github.com/centrifugal/centrifugo/releases/download/v${CENTRIFUGO_VERSION}/centrifugo_${CENTRIFUGO_VERSION}_linux_${CENTRIFUGO_ARCH}.tar.gz \
    && tar -xzf centrifugo_${CENTRIFUGO_VERSION}_linux_${CENTRIFUGO_ARCH}.tar.gz \
    && mv centrifugo /usr/local/bin/ \
    && rm centrifugo_${CENTRIFUGO_VERSION}_linux_${CENTRIFUGO_ARCH}.tar.gz

WORKDIR /app

# Copy production dependencies and built files
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Copy Centrifugo configuration
COPY centrifugo/config.json ./centrifugo/config.json

# Copy supervisor and pm2 configuration
COPY supervisord.conf /etc/supervisord.conf
COPY ecosystem.config.cjs ./

# Install pm2 globally
RUN npm install -g pm2 && npm prune --production

# Environment variables (can be overridden)
ENV PORT=3000 \
    REDIS_URL=redis://localhost:6379 \
    CENTRIFUGO_REDIS_ADDRESS=localhost:6379 \
    CENTRIFUGO_PORT=8000

# Expose ports
# 8000 - Centrifugo WebSocket
# 3000 - Callback Service HTTP (2 instances via pm2 cluster)
EXPOSE 8000 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health && \
        wget --no-verbose --tries=1 --spider http://localhost:8000/health || exit 1

# Start supervisor to manage both processes
CMD ["supervisord", "-c", "/etc/supervisord.conf"]

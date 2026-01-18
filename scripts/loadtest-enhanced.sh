#!/bin/bash

# Enhanced Load Test Script
# 1 Realtime Message Gateway + 4 Callback Services + 2 Workers
# 400 channels, 10 msg/s per channel, 1KB message size
# Total: 4000 msg/s, ~4 MB/s bandwidth

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
REDIS_URL=${REDIS_URL:-redis://localhost:6379}
SECRET_KEY=${CENTRIFUGO_TOKEN_HMAC_SECRET_KEY:-test-secret-enhanced}
NUM_CALLBACKS=4
NUM_WORKERS=2

# Directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="/tmp/centrifuge-loadtest"

echo -e "${GREEN}==================================================================${NC}"
echo -e "${GREEN}Enhanced Load Test Setup${NC}"
echo -e "${GREEN}==================================================================${NC}"
echo "  Redis:             $REDIS_URL"
echo "  Callback Services: $NUM_CALLBACKS (ports 3000-3003)"
echo "  Load Balancer:     port 8080"
echo "  Workers:           $NUM_WORKERS"
echo "  Log Directory:     $LOG_DIR"
echo -e "${GREEN}==================================================================${NC}"
echo ""

# Create log directory
mkdir -p "$LOG_DIR"

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}Cleaning up processes...${NC}"

    # Kill all background processes
    pkill -f "tsx src/index.ts" || true
    pkill -f "tsx examples/proxy-loadbalancer.ts" || true
    pkill -f "tsx examples/worker-monitor.ts" || true
    pkill -f "centrifugo" || true

    sleep 1
    echo -e "${GREEN}Cleanup complete${NC}"
}

# Trap exit signals
trap cleanup EXIT INT TERM

# Step 1: Check Redis
echo -e "${YELLOW}[1/7] Checking Redis connection...${NC}"
if ! redis-cli -u "$REDIS_URL" ping > /dev/null 2>&1; then
    echo -e "${RED}ERROR: Redis is not running at $REDIS_URL${NC}"
    echo "Please start Redis first: docker run -d -p 6379:6379 redis:7-alpine"
    exit 1
fi
echo -e "${GREEN}✓ Redis is running${NC}"

# Step 2: Clean Redis
echo -e "${YELLOW}[2/7] Cleaning Redis database...${NC}"
redis-cli -u "$REDIS_URL" FLUSHDB > /dev/null
echo -e "${GREEN}✓ Redis cleaned${NC}"

# Step 3: Start Callback Services
echo -e "${YELLOW}[3/7] Starting $NUM_CALLBACKS callback services...${NC}"
for i in $(seq 0 $((NUM_CALLBACKS - 1))); do
    PORT=$((3000 + i))
    LOG_FILE="$LOG_DIR/callback-$PORT.log"

    PORT=$PORT \
    REDIS_URL="$REDIS_URL" \
    CENTRIFUGO_TOKEN_HMAC_SECRET_KEY="$SECRET_KEY" \
    npx tsx "$PROJECT_DIR/src/index.ts" > "$LOG_FILE" 2>&1 &

    echo "  Started callback service on port $PORT (PID: $!)"
done

# Wait for callback services to be ready
sleep 3

# Verify callback services
echo -e "${YELLOW}Verifying callback services...${NC}"
for i in $(seq 0 $((NUM_CALLBACKS - 1))); do
    PORT=$((3000 + i))
    if curl -s "http://localhost:$PORT/health" > /dev/null; then
        echo -e "  ${GREEN}✓ Callback service on port $PORT is ready${NC}"
    else
        echo -e "  ${RED}✗ Callback service on port $PORT failed to start${NC}"
        exit 1
    fi
done

# Step 4: Start Load Balancer Proxy
echo -e "${YELLOW}[4/7] Starting load balancer proxy...${NC}"
BACKENDS="http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3003"
PORT=8080 \
BACKENDS="$BACKENDS" \
npx tsx "$PROJECT_DIR/examples/proxy-loadbalancer.ts" > "$LOG_DIR/proxy.log" 2>&1 &
PROXY_PID=$!
echo "  Started proxy on port 8080 (PID: $PROXY_PID)"

sleep 2

if curl -s "http://localhost:8080/health" > /dev/null; then
    echo -e "  ${GREEN}✓ Load balancer proxy is ready${NC}"
else
    echo -e "  ${RED}✗ Load balancer proxy failed to start${NC}"
    exit 1
fi

# Step 5: Start Workers
echo -e "${YELLOW}[5/7] Starting $NUM_WORKERS workers...${NC}"
for i in $(seq 0 $((NUM_WORKERS - 1))); do
    WORKER_ID="worker-$i"
    LOG_FILE="$LOG_DIR/worker-$i.log"

    WORKER_ID="$WORKER_ID" \
    REDIS_URL="$REDIS_URL" \
    npx tsx "$PROJECT_DIR/examples/worker-monitor.ts" > "$LOG_FILE" 2>&1 &

    echo "  Started worker $WORKER_ID (PID: $!)"
done

sleep 2

# Verify workers registered
echo -e "${YELLOW}Verifying worker registration...${NC}"
REGISTERED=$(redis-cli -u "$REDIS_URL" ZCARD workers:active)
if [ "$REGISTERED" -eq "$NUM_WORKERS" ]; then
    echo -e "  ${GREEN}✓ All $NUM_WORKERS workers registered${NC}"
    redis-cli -u "$REDIS_URL" ZRANGE workers:active 0 -1 | while read worker; do
        echo "    - $worker"
    done
else
    echo -e "  ${RED}✗ Only $REGISTERED/$NUM_WORKERS workers registered${NC}"
    exit 1
fi

# Step 6: Check Centrifugo
echo -e "${YELLOW}[6/7] Checking Centrifugo...${NC}"
if command -v centrifugo &> /dev/null; then
    echo -e "${GREEN}✓ Centrifugo is installed${NC}"
    echo -e "${YELLOW}You need to manually start Centrifugo in another terminal:${NC}"
    echo ""
    echo "  cd centrifugo"
    echo "  CENTRIFUGO_TOKEN_HMAC_SECRET_KEY=$SECRET_KEY \\"
    echo "  CENTRIFUGO_REDIS_ADDRESS=$REDIS_URL \\"
    echo "  centrifugo --config=config.json"
    echo ""
    echo -e "${YELLOW}Press Enter when Centrifugo is running...${NC}"
    read
else
    echo -e "${YELLOW}WARNING: Centrifugo not found. Install it or use Docker:${NC}"
    echo ""
    echo "  brew install centrifugo/tap/centrifugo"
    echo ""
    echo "Or skip Centrifugo for direct callback testing."
    echo ""
fi

# Step 7: All services ready
echo -e "${GREEN}==================================================================${NC}"
echo -e "${GREEN}All services are ready!${NC}"
echo -e "${GREEN}==================================================================${NC}"
echo ""
echo "Architecture:"
echo "  Centrifugo (port 8000) → Load Balancer (port 8080)"
echo "                        ↓"
echo "  ┌──────────┬──────────┬──────────┬──────────┐"
echo "  │  CB:3000 │  CB:3001 │  CB:3002 │  CB:3003 │"
echo "  └──────────┴──────────┴──────────┴──────────┘"
echo "                        ↓"
echo "               Redis (localhost:6379)"
echo "                        ↓"
echo "  ┌──────────────┬──────────────┐"
echo "  │   Worker-0   │   Worker-1   │"
echo "  └──────────────┴──────────────┘"
echo ""
echo "Log files:"
echo "  Callback Services: $LOG_DIR/callback-*.log"
echo "  Proxy:            $LOG_DIR/proxy.log"
echo "  Workers:          $LOG_DIR/worker-*.log"
echo ""
echo -e "${YELLOW}Press Enter to start the load test...${NC}"
read

# Run load test
echo -e "${GREEN}==================================================================${NC}"
echo -e "${GREEN}Starting Enhanced Load Test${NC}"
echo -e "${GREEN}==================================================================${NC}"
echo ""

CALLBACK_SERVICE_URL=http://localhost:8080 \
NUM_CHANNELS=400 \
MSG_PER_SEC=10 \
MESSAGE_SIZE=1024 \
DURATION=60 \
CENTRIFUGO_TOKEN_HMAC_SECRET_KEY="$SECRET_KEY" \
npx tsx "$PROJECT_DIR/examples/loadtest.ts"

# Show final statistics
echo ""
echo -e "${GREEN}==================================================================${NC}"
echo -e "${GREEN}Load Test Complete - Gathering Statistics${NC}"
echo -e "${GREEN}==================================================================${NC}"
echo ""

sleep 2

# Show proxy stats
echo -e "${YELLOW}Load Balancer Distribution:${NC}"
curl -s http://localhost:8080/stats | npx json -o inspect
echo ""

# Show worker stats
echo -e "${YELLOW}Worker Statistics:${NC}"
for i in $(seq 0 $((NUM_WORKERS - 1))); do
    echo ""
    echo "Worker-$i (last 30 lines):"
    tail -30 "$LOG_DIR/worker-$i.log"
done

echo ""
echo -e "${GREEN}==================================================================${NC}"
echo -e "${GREEN}Test Complete!${NC}"
echo -e "${GREEN}==================================================================${NC}"
echo ""
echo "View full logs:"
echo "  tail -f $LOG_DIR/*.log"
echo ""
echo -e "${YELLOW}Press Enter to stop all services and cleanup...${NC}"
read

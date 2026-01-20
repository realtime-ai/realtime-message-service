package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/centrifugal/centrifuge"
	"github.com/google/uuid"

	"realtime-message-gateway/internal/config"
	"realtime-message-gateway/internal/metrics"
	"realtime-message-gateway/internal/redis"
	"realtime-message-gateway/internal/routing"
)

// connectionMeta stores metadata about a connection for metrics
type connectionMeta struct {
	connectTime time.Time
	userID      string
}

// Gateway wraps Centrifuge node with business logic
type Gateway struct {
	node   *centrifuge.Node
	config *config.Config
	redis  *redis.Client
	router *routing.Router

	// Connection tracking for reconnection detection
	connectionsMu   sync.RWMutex
	connections     map[string]*connectionMeta // clientID -> meta
	recentUsersMu   sync.RWMutex
	recentUsers     map[string]time.Time // userID -> last disconnect time
	reconnectWindow time.Duration        // Time window to consider as reconnect
}

// EventType defines the type of stream event
type EventType string

const (
	EventTypeMessage EventType = "message"
	EventTypeJoin    EventType = "join"
	EventTypeLeave   EventType = "leave"
)

// StreamMessage matches the TypeScript worker message format
type StreamMessage struct {
	ID        string    `json:"id"`
	Type      EventType `json:"type"`
	Channel   string    `json:"channel"`
	WorkerID  string    `json:"workerId"`
	UserID    string    `json:"userId"`
	UserName  string    `json:"userName"`
	Text      string    `json:"text,omitempty"`
	Timestamp string    `json:"timestamp"`
	Raw       string    `json:"raw,omitempty"`
	ClientID  string    `json:"clientId"`
}

// PresenceInfo represents a user in a channel
type PresenceInfo struct {
	UserID   string `json:"userId"`
	UserName string `json:"userName"`
	ClientID string `json:"clientId"`
}

// NewGateway creates a new Gateway instance
func NewGateway(cfg *config.Config, redisClient *redis.Client) (*Gateway, error) {
	node, err := centrifuge.New(centrifuge.Config{
		LogLevel:   centrifuge.LogLevelInfo,
		LogHandler: logHandler,
	})
	if err != nil {
		return nil, err
	}

	gw := &Gateway{
		node:            node,
		config:          cfg,
		redis:           redisClient,
		router:          routing.NewRouter(redisClient, cfg.RouteCacheTTL),
		connections:     make(map[string]*connectionMeta),
		recentUsers:     make(map[string]time.Time),
		reconnectWindow: 60 * time.Second, // Consider reconnect if within 60 seconds
	}

	gw.setupHandlers()

	// Start cleanup goroutine for old user entries
	go gw.cleanupRecentUsers()

	return gw, nil
}

// cleanupRecentUsers periodically removes old entries from recentUsers map
func (g *Gateway) cleanupRecentUsers() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		g.recentUsersMu.Lock()
		now := time.Now()
		for userID, lastDisconnect := range g.recentUsers {
			if now.Sub(lastDisconnect) > g.reconnectWindow*2 {
				delete(g.recentUsers, userID)
			}
		}
		g.recentUsersMu.Unlock()
	}
}

// Node returns the underlying Centrifuge node
func (g *Gateway) Node() *centrifuge.Node {
	return g.node
}

// Run starts the Centrifuge node
func (g *Gateway) Run() error {
	return g.node.Run()
}

// Shutdown gracefully stops the node
func (g *Gateway) Shutdown(ctx context.Context) error {
	return g.node.Shutdown(ctx)
}

// GetChannelPresence returns the list of users currently subscribed to a channel
func (g *Gateway) GetChannelPresence(channel string) ([]PresenceInfo, error) {
	result, err := g.node.Presence(channel)
	if err != nil {
		return nil, err
	}

	users := make([]PresenceInfo, 0, len(result.Presence))
	for clientID, clientInfo := range result.Presence {
		userName := "Anonymous"
		if len(clientInfo.ChanInfo) > 0 {
			var info struct {
				Name string `json:"name"`
			}
			if json.Unmarshal(clientInfo.ChanInfo, &info) == nil && info.Name != "" {
				userName = info.Name
			}
		}
		// Also try conn info if chan info is empty
		if userName == "Anonymous" && len(clientInfo.ConnInfo) > 0 {
			var info struct {
				Name string `json:"name"`
			}
			if json.Unmarshal(clientInfo.ConnInfo, &info) == nil && info.Name != "" {
				userName = info.Name
			}
		}

		users = append(users, PresenceInfo{
			UserID:   clientInfo.UserID,
			UserName: userName,
			ClientID: clientID,
		})
	}

	return users, nil
}

// logHandler converts Centrifuge logs to slog
func logHandler(e centrifuge.LogEntry) {
	switch e.Level {
	case centrifuge.LogLevelDebug:
		slog.Debug(e.Message, "fields", e.Fields)
	case centrifuge.LogLevelInfo:
		slog.Info(e.Message, "fields", e.Fields)
	case centrifuge.LogLevelWarn:
		slog.Warn(e.Message, "fields", e.Fields)
	case centrifuge.LogLevelError:
		slog.Error(e.Message, "fields", e.Fields)
	}
}

// setupHandlers configures all Centrifuge event handlers
func (g *Gateway) setupHandlers() {
	// OnConnecting - authenticate and set credentials
	g.node.OnConnecting(func(ctx context.Context, e centrifuge.ConnectEvent) (centrifuge.ConnectReply, error) {
		return g.handleConnecting(ctx, e)
	})

	// OnConnect - called after successful connection
	g.node.OnConnect(func(client *centrifuge.Client) {
		g.handleConnect(client)
	})
}

// handleConnecting handles authentication before connection is established
func (g *Gateway) handleConnecting(ctx context.Context, e centrifuge.ConnectEvent) (centrifuge.ConnectReply, error) {
	metrics.ConnectTotal.WithLabelValues("attempt").Inc()

	// Extract user info from connection data
	var connectData struct {
		Name string `json:"name"`
	}
	if len(e.Data) > 0 {
		json.Unmarshal(e.Data, &connectData)
	}

	// For now, generate a user ID if not provided via token
	// In production, you would validate JWT token here
	userID := uuid.New().String()
	userName := connectData.Name
	if userName == "" {
		userName = "Anonymous"
	}

	// Store user info in connection info
	info, _ := json.Marshal(map[string]string{
		"name": userName,
	})

	metrics.ConnectTotal.WithLabelValues("success").Inc()
	metrics.WebSocketConnections.Inc()

	slog.Info("client connecting", "userId", userID, "userName", userName)

	return centrifuge.ConnectReply{
		Credentials: &centrifuge.Credentials{
			UserID: userID,
			Info:   info,
		},
		Data: []byte(`{"version":"1.0.0"}`),
	}, nil
}

// handleConnect sets up per-client handlers
func (g *Gateway) handleConnect(client *centrifuge.Client) {
	transport := client.Transport()
	clientID := client.ID()
	userID := client.UserID()

	// Check if this is a reconnection
	isReconnect := false
	g.recentUsersMu.RLock()
	if lastDisconnect, ok := g.recentUsers[userID]; ok {
		if time.Since(lastDisconnect) < g.reconnectWindow {
			isReconnect = true
		}
	}
	g.recentUsersMu.RUnlock()

	// Track connection metadata
	g.connectionsMu.Lock()
	g.connections[clientID] = &connectionMeta{
		connectTime: time.Now(),
		userID:      userID,
	}
	g.connectionsMu.Unlock()

	// Record reconnection metric
	if isReconnect {
		metrics.ReconnectTotal.WithLabelValues("success").Inc()
		slog.Info("client reconnected",
			"clientId", clientID,
			"userId", userID,
			"transport", transport.Name(),
			"protocol", transport.Protocol(),
		)
	} else {
		slog.Info("client connected",
			"clientId", clientID,
			"userId", userID,
			"transport", transport.Name(),
			"protocol", transport.Protocol(),
		)
	}

	// Subscribe handler
	client.OnSubscribe(func(e centrifuge.SubscribeEvent, cb centrifuge.SubscribeCallback) {
		g.handleSubscribe(client, e, cb)
	})


	// Unsubscribe handler - push leave event
	client.OnUnsubscribe(func(e centrifuge.UnsubscribeEvent) {
		g.handleUnsubscribe(client, e)
	})

	// Publish handler
	client.OnPublish(func(e centrifuge.PublishEvent, cb centrifuge.PublishCallback) {
		g.handlePublish(client, e, cb)
	})

	// Disconnect handler
	client.OnDisconnect(func(e centrifuge.DisconnectEvent) {
		g.handleDisconnect(client, e)
	})
}

// handleSubscribe validates channel subscription
func (g *Gateway) handleSubscribe(client *centrifuge.Client, e centrifuge.SubscribeEvent, cb centrifuge.SubscribeCallback) {
	channel := e.Channel
	userID := client.UserID()

	// Validate channel format
	if !g.isValidChannel(channel, userID) {
		metrics.SubscribeTotal.WithLabelValues("rejected", "invalid_channel").Inc()
		slog.Warn("subscription rejected", "channel", channel, "userId", userID, "reason", "invalid_channel")
		cb(centrifuge.SubscribeReply{}, centrifuge.ErrorPermissionDenied)
		return
	}

	metrics.SubscribeTotal.WithLabelValues("success", "").Inc()
	slog.Info("client subscribed", "channel", channel, "userId", userID, "clientId", client.ID())

	cb(centrifuge.SubscribeReply{
		Options: centrifuge.SubscribeOptions{
			EmitPresence:  true,
			EmitJoinLeave: true,
			PushJoinLeave: true,
		},
	}, nil)

	// Push join event to worker stream after successful subscription
	g.pushPresenceEvent(client, channel, EventTypeJoin)
}

// handleUnsubscribe pushes leave event to worker stream
func (g *Gateway) handleUnsubscribe(client *centrifuge.Client, e centrifuge.UnsubscribeEvent) {
	g.pushPresenceEvent(client, e.Channel, EventTypeLeave)
}

// pushPresenceEvent sends a join/leave event to the worker stream
func (g *Gateway) pushPresenceEvent(client *centrifuge.Client, channel string, eventType EventType) {
	ctx := context.Background()

	// Get worker for this channel
	workerID, err := g.router.GetWorkerForChannel(ctx, channel)
	if err != nil {
		slog.Error("failed to get worker for presence event",
			"channel", channel,
			"eventType", eventType,
			"error", err,
		)
		return
	}

	streamKey := routing.GetWorkerStreamKey(workerID)
	messageID := uuid.New().String()
	timestamp := time.Now().UTC()

	// Get user name from client info
	userName := "Anonymous"
	if info := client.Info(); len(info) > 0 {
		var userInfo struct {
			Name string `json:"name"`
		}
		if json.Unmarshal(info, &userInfo) == nil && userInfo.Name != "" {
			userName = userInfo.Name
		}
	}

	// Construct presence event
	event := StreamMessage{
		ID:        messageID,
		Type:      eventType,
		Channel:   channel,
		WorkerID:  workerID,
		UserID:    client.UserID(),
		UserName:  userName,
		Timestamp: timestamp.Format(time.RFC3339Nano),
		ClientID:  client.ID(),
	}

	// Marshal event payload
	payload, err := json.Marshal(event)
	if err != nil {
		slog.Error("failed to marshal presence event", "error", err)
		return
	}

	// Write to worker's stream
	_, err = g.redis.XAdd(ctx, streamKey, map[string]interface{}{
		"payload": string(payload),
	})
	if err != nil {
		slog.Error("failed to write presence event to stream",
			"streamKey", streamKey,
			"error", err,
		)
		return
	}

	slog.Info("presence event published",
		"eventType", eventType,
		"channel", channel,
		"userId", client.UserID(),
		"workerId", workerID,
	)
}

// isValidChannel checks if channel name is valid
func (g *Gateway) isValidChannel(channel, userID string) bool {
	// Global chat channel
	if channel == "chat" {
		return true
	}

	// Room channels: chat:room-xxx
	if strings.HasPrefix(channel, "chat:") {
		return true
	}

	// User-specific channels: user:{userId}
	if strings.HasPrefix(channel, "user:") {
		expectedUserID := strings.TrimPrefix(channel, "user:")
		return expectedUserID == userID
	}

	return false
}

// handlePublish processes message publication
func (g *Gateway) handlePublish(client *centrifuge.Client, e centrifuge.PublishEvent, cb centrifuge.PublishCallback) {
	timer := metrics.NewTimer(metrics.PublishLatency)
	defer timer.ObserveDuration()

	ctx := context.Background()
	channel := e.Channel
	userID := client.UserID()

	// Parse message data
	var data map[string]interface{}
	if err := json.Unmarshal(e.Data, &data); err != nil {
		metrics.PublishTotal.WithLabelValues("rejected", "invalid_json").Inc()
		cb(centrifuge.PublishReply{}, centrifuge.ErrorBadRequest)
		return
	}

	// Extract text
	text, _ := data["text"].(string)
	if text == "" {
		metrics.PublishTotal.WithLabelValues("rejected", "missing_text").Inc()
		cb(centrifuge.PublishReply{}, centrifuge.ErrorBadRequest)
		return
	}

	// Validate text length
	if len(text) > g.config.MaxTextLength {
		metrics.PublishTotal.WithLabelValues("rejected", "text_too_long").Inc()
		cb(centrifuge.PublishReply{}, centrifuge.ErrorBadRequest)
		return
	}

	// Get worker for this channel
	workerID, err := g.router.GetWorkerForChannel(ctx, channel)
	if err != nil {
		metrics.PublishTotal.WithLabelValues("error", "no_worker").Inc()
		slog.Error("failed to get worker for channel", "channel", channel, "error", err)
		cb(centrifuge.PublishReply{}, centrifuge.ErrorInternal)
		return
	}

	streamKey := routing.GetWorkerStreamKey(workerID)
	messageID := uuid.New().String()
	timestamp := time.Now().UTC()

	// Get user name from client info
	userName := "Anonymous"
	if info := client.Info(); len(info) > 0 {
		var userInfo struct {
			Name string `json:"name"`
		}
		if json.Unmarshal(info, &userInfo) == nil && userInfo.Name != "" {
			userName = userInfo.Name
		}
	}

	// Marshal raw data for storage
	rawJSON, err := json.Marshal(data)
	if err != nil {
		metrics.PublishTotal.WithLabelValues("error", "marshal_error").Inc()
		slog.Error("failed to marshal raw data", "error", err)
		cb(centrifuge.PublishReply{}, centrifuge.ErrorInternal)
		return
	}

	// Construct message payload
	message := StreamMessage{
		ID:        messageID,
		Type:      EventTypeMessage,
		Channel:   channel,
		WorkerID:  workerID,
		UserID:    userID,
		UserName:  userName,
		Text:      strings.TrimSpace(text),
		Timestamp: timestamp.Format(time.RFC3339Nano),
		Raw:       string(rawJSON),
		ClientID:  client.ID(),
	}

	// Marshal message payload
	payload, err := json.Marshal(message)
	if err != nil {
		metrics.PublishTotal.WithLabelValues("error", "marshal_error").Inc()
		slog.Error("failed to marshal message", "error", err)
		cb(centrifuge.PublishReply{}, centrifuge.ErrorInternal)
		return
	}

	// Write to worker's stream
	_, err = g.redis.XAdd(ctx, streamKey, map[string]interface{}{
		"payload": string(payload),
	})
	if err != nil {
		metrics.PublishTotal.WithLabelValues("error", "redis_error").Inc()
		slog.Error("failed to write to stream", "streamKey", streamKey, "error", err)
		cb(centrifuge.PublishReply{}, centrifuge.ErrorInternal)
		return
	}

	metrics.PublishTotal.WithLabelValues("success", "").Inc()
	metrics.WebSocketMessagesTotal.WithLabelValues("inbound").Inc()

	slog.Info("message published",
		"messageId", messageID,
		"streamKey", streamKey,
		"workerId", workerID,
		"channel", channel,
	)

	// Allow the publication to be broadcast to subscribers
	cb(centrifuge.PublishReply{}, nil)
}

// handleDisconnect cleans up on client disconnect
func (g *Gateway) handleDisconnect(client *centrifuge.Client, e centrifuge.DisconnectEvent) {
	clientID := client.ID()
	userID := client.UserID()

	metrics.WebSocketConnections.Dec()

	// Get connection metadata and calculate duration
	g.connectionsMu.Lock()
	meta, ok := g.connections[clientID]
	if ok {
		duration := time.Since(meta.connectTime)
		metrics.ConnectionDuration.Observe(duration.Seconds())
		delete(g.connections, clientID)
	}
	g.connectionsMu.Unlock()

	// Track user's last disconnect time for reconnection detection
	g.recentUsersMu.Lock()
	g.recentUsers[userID] = time.Now()
	g.recentUsersMu.Unlock()

	// Determine if this disconnect is likely to result in a reconnection
	// Codes < 3000 are typically reconnectable
	isReconnectable := e.Disconnect.Code < 3000

	// Record disconnect metrics with reason and code
	metrics.DisconnectTotal.WithLabelValues(
		e.Disconnect.Reason,
		fmt.Sprintf("%d", e.Disconnect.Code),
		fmt.Sprintf("%t", isReconnectable),
	).Inc()

	slog.Info("client disconnected",
		"clientId", clientID,
		"userId", userID,
		"reason", e.Disconnect.Reason,
		"code", e.Disconnect.Code,
		"reconnect", isReconnectable,
	)
}

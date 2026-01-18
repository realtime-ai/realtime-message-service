package gateway

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"time"

	"github.com/centrifugal/centrifuge"
	"github.com/google/uuid"

	"realtime-message-gateway/internal/config"
	"realtime-message-gateway/internal/metrics"
	"realtime-message-gateway/internal/redis"
	"realtime-message-gateway/internal/routing"
)

// Gateway wraps Centrifuge node with business logic
type Gateway struct {
	node   *centrifuge.Node
	config *config.Config
	redis  *redis.Client
	router *routing.Router
}

// EventType represents the type of event
type EventType string

const (
	EventTypePublish    EventType = "publish"
	EventTypeConnect    EventType = "connect"
	EventTypeDisconnect EventType = "disconnect"
	EventTypeSubscribe  EventType = "subscribe"
)

// StreamMessage matches the TypeScript worker message format
type StreamMessage struct {
	ID        string    `json:"id"`
	Type      EventType `json:"type"`
	Channel   string    `json:"channel,omitempty"`
	WorkerID  string    `json:"workerId"`
	UserID    string    `json:"userId"`
	UserName  string    `json:"userName"`
	Text      string    `json:"text,omitempty"`
	Timestamp string    `json:"timestamp"`
	Raw       string    `json:"raw,omitempty"`
	ClientID  string    `json:"clientId"`
	// Disconnect-specific fields
	Reason string `json:"reason,omitempty"`
	// Connection metadata
	Transport string `json:"transport,omitempty"`
	Protocol  string `json:"protocol,omitempty"`
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
		node:   node,
		config: cfg,
		redis:  redisClient,
		router: routing.NewRouter(redisClient, cfg.RouteCacheTTL),
	}

	gw.setupHandlers()

	return gw, nil
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

	// Get user name from client info
	userName := g.getUserName(client)

	// Write connect event to Redis (routed by userId for user-level tracking)
	ctx := context.Background()
	userChannel := "user:" + client.UserID()
	err := g.writeEventToStream(ctx, StreamMessage{
		ID:        uuid.New().String(),
		Type:      EventTypeConnect,
		Channel:   userChannel,
		UserID:    client.UserID(),
		UserName:  userName,
		ClientID:  client.ID(),
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		Transport: transport.Name(),
		Protocol:  string(transport.Protocol()),
	})
	if err != nil {
		slog.Error("failed to write connect event", "error", err)
	}

	slog.Info("client connected",
		"clientId", client.ID(),
		"userId", client.UserID(),
		"transport", transport.Name(),
		"protocol", transport.Protocol(),
	)

	// Subscribe handler
	client.OnSubscribe(func(e centrifuge.SubscribeEvent, cb centrifuge.SubscribeCallback) {
		g.handleSubscribe(client, e, cb)
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

	// Get user name from client info
	userName := g.getUserName(client)

	// Write subscribe event to Redis (routed to the channel's worker)
	ctx := context.Background()
	err := g.writeEventToStream(ctx, StreamMessage{
		ID:        uuid.New().String(),
		Type:      EventTypeSubscribe,
		Channel:   channel,
		UserID:    userID,
		UserName:  userName,
		ClientID:  client.ID(),
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
	})
	if err != nil {
		slog.Error("failed to write subscribe event", "error", err)
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
	userName := g.getUserName(client)

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
		Type:      EventTypePublish,
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
	metrics.WebSocketConnections.Dec()

	// Get user name from client info
	userName := g.getUserName(client)

	// Write disconnect event to Redis (routed by userId for user-level tracking)
	ctx := context.Background()
	userChannel := "user:" + client.UserID()
	err := g.writeEventToStream(ctx, StreamMessage{
		ID:        uuid.New().String(),
		Type:      EventTypeDisconnect,
		Channel:   userChannel,
		UserID:    client.UserID(),
		UserName:  userName,
		ClientID:  client.ID(),
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		Reason:    e.Disconnect.Reason,
	})
	if err != nil {
		slog.Error("failed to write disconnect event", "error", err)
	}

	slog.Info("client disconnected",
		"clientId", client.ID(),
		"userId", client.UserID(),
		"reason", e.Disconnect.Reason,
	)
}

// getUserName extracts user name from client info
func (g *Gateway) getUserName(client *centrifuge.Client) string {
	userName := "Anonymous"
	if info := client.Info(); len(info) > 0 {
		var userInfo struct {
			Name string `json:"name"`
		}
		if json.Unmarshal(info, &userInfo) == nil && userInfo.Name != "" {
			userName = userInfo.Name
		}
	}
	return userName
}

// writeEventToStream writes an event message to the appropriate worker stream
func (g *Gateway) writeEventToStream(ctx context.Context, msg StreamMessage) error {
	// Get worker for this channel
	workerID, err := g.router.GetWorkerForChannel(ctx, msg.Channel)
	if err != nil {
		return err
	}

	msg.WorkerID = workerID
	streamKey := routing.GetWorkerStreamKey(workerID)

	payload, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	_, err = g.redis.XAdd(ctx, streamKey, map[string]interface{}{
		"payload": string(payload),
	})
	return err
}

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/centrifugal/centrifuge"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"realtime-message-gateway/internal/config"
	"realtime-message-gateway/internal/gateway"
	"realtime-message-gateway/internal/redis"
)

func main() {
	// Setup structured logging
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))

	slog.Info("Starting realtime-message-gateway")

	// Load configuration
	cfg := config.Load()

	// Validate required config
	if cfg.TokenHMACSecret == "" {
		slog.Warn("CENTRIFUGO_TOKEN_HMAC_SECRET_KEY not set, authentication disabled")
	}

	// Connect to Redis
	redisClient, err := redis.NewClient(cfg)
	if err != nil {
		slog.Error("failed to connect to Redis", "error", err)
		os.Exit(1)
	}
	defer redisClient.Close()

	// Create gateway
	gw, err := gateway.NewGateway(cfg, redisClient)
	if err != nil {
		slog.Error("failed to create gateway", "error", err)
		os.Exit(1)
	}

	// Run the Centrifuge node
	if err := gw.Run(); err != nil {
		slog.Error("failed to run gateway", "error", err)
		os.Exit(1)
	}

	// Setup HTTP handlers
	mux := http.NewServeMux()

	// WebSocket endpoint
	wsHandler := centrifuge.NewWebsocketHandler(gw.Node(), centrifuge.WebsocketConfig{
		ReadBufferSize:     cfg.ReadBufferSize,
		WriteBufferSize:    cfg.WriteBufferSize,
		UseWriteBufferPool: true,
		MessageSizeLimit:   cfg.MessageSizeLimit,
		WriteTimeout:       cfg.WriteTimeout,
		Compression:        true,
		CompressionLevel:   4,
		CompressionMinSize: 1024,
		PingPongConfig: centrifuge.PingPongConfig{
			PingInterval: cfg.PingInterval,
			PongTimeout:  cfg.PongTimeout,
		},
		CheckOrigin: func(r *http.Request) bool {
			// Allow all origins if not configured
			if len(cfg.AllowedOrigins) == 0 {
				return true
			}
			origin := r.Header.Get("Origin")
			for _, allowed := range cfg.AllowedOrigins {
				if origin == allowed {
					return true
				}
			}
			return false
		},
	})
	mux.Handle("/connection/websocket", wsHandler)

	// Health check endpoint
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()

		if err := redisClient.Ping(ctx); err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			w.Write([]byte(`{"status":"unhealthy","error":"redis connection failed"}`))
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"healthy"}`))
	})

	// Start WebSocket server
	wsServer := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.WebSocketPort),
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		slog.Info("WebSocket server starting", "port", cfg.WebSocketPort)
		if err := wsServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("WebSocket server error", "error", err)
			os.Exit(1)
		}
	}()

	// Start HTTP server (for health checks and API endpoints)
	httpMux := http.NewServeMux()
	httpMux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()

		if err := redisClient.Ping(ctx); err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			w.Write([]byte(`{"status":"unhealthy","error":"redis connection failed"}`))
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"healthy"}`))
	})

	// Channel presence API endpoint
	httpMux.HandleFunc("/channels/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		// Parse channel name from path: /channels/{channel}/presence
		path := r.URL.Path
		const prefix = "/channels/"
		const suffix = "/presence"

		if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
			w.WriteHeader(http.StatusNotFound)
			w.Write([]byte(`{"error":"not found"}`))
			return
		}

		channel := path[len(prefix) : len(path)-len(suffix)]
		if channel == "" {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error":"channel name required"}`))
			return
		}

		// Get presence info
		users, err := gw.GetChannelPresence(channel)
		if err != nil {
			slog.Error("failed to get channel presence", "channel", channel, "error", err)
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte(`{"error":"failed to get presence"}`))
			return
		}

		// Return response
		w.Header().Set("Content-Type", "application/json")
		response := struct {
			Channel string                `json:"channel"`
			Users   []gateway.PresenceInfo `json:"users"`
			Count   int                   `json:"count"`
		}{
			Channel: channel,
			Users:   users,
			Count:   len(users),
		}

		if err := json.NewEncoder(w).Encode(response); err != nil {
			slog.Error("failed to encode presence response", "error", err)
		}
	})

	httpServer := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.HTTPPort),
		Handler:      httpMux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	go func() {
		slog.Info("HTTP server starting", "port", cfg.HTTPPort)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("HTTP server error", "error", err)
		}
	}()

	// Start metrics server
	metricsMux := http.NewServeMux()
	metricsMux.Handle("/metrics", promhttp.Handler())
	metricsMux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("OK"))
	})

	metricsServer := &http.Server{
		Addr:    fmt.Sprintf(":%d", cfg.MetricsPort),
		Handler: metricsMux,
	}

	go func() {
		slog.Info("Metrics server starting", "port", cfg.MetricsPort)
		if err := metricsServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("Metrics server error", "error", err)
		}
	}()

	// Print startup info
	slog.Info("realtime-message-gateway started",
		"websocket_port", cfg.WebSocketPort,
		"http_port", cfg.HTTPPort,
		"metrics_port", cfg.MetricsPort,
	)

	// Wait for shutdown signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("Shutting down...")

	// Graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Shutdown servers
	if err := wsServer.Shutdown(ctx); err != nil {
		slog.Error("WebSocket server shutdown error", "error", err)
	}
	if err := httpServer.Shutdown(ctx); err != nil {
		slog.Error("HTTP server shutdown error", "error", err)
	}
	if err := metricsServer.Shutdown(ctx); err != nil {
		slog.Error("Metrics server shutdown error", "error", err)
	}

	// Shutdown gateway
	if err := gw.Shutdown(ctx); err != nil {
		slog.Error("Gateway shutdown error", "error", err)
	}

	slog.Info("Shutdown complete")
}

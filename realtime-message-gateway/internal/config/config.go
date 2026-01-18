package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	// Server ports
	WebSocketPort int
	HTTPPort      int
	MetricsPort   int

	// Redis
	RedisURL         string
	RedisPoolSize    int
	RedisMinIdle     int
	RedisMaxRetries  int
	RedisDialTimeout time.Duration

	// JWT
	TokenHMACSecret string

	// Routing
	RouteCacheTTL time.Duration

	// Message limits
	MaxTextLength int

	// WebSocket
	WriteTimeout      time.Duration
	PingInterval      time.Duration
	PongTimeout       time.Duration
	MessageSizeLimit  int
	ReadBufferSize    int
	WriteBufferSize   int
	AllowedOrigins    []string
}

func Load() *Config {
	return &Config{
		// Server ports
		WebSocketPort: getEnvInt("WEBSOCKET_PORT", 8000),
		HTTPPort:      getEnvInt("HTTP_PORT", 3000),
		MetricsPort:   getEnvInt("METRICS_PORT", 2112),

		// Redis
		RedisURL:         getEnv("REDIS_URL", "redis://localhost:6379"),
		RedisPoolSize:    getEnvInt("REDIS_POOL_SIZE", 10),
		RedisMinIdle:     getEnvInt("REDIS_MIN_IDLE", 2),
		RedisMaxRetries:  getEnvInt("REDIS_MAX_RETRIES", 3),
		RedisDialTimeout: getEnvDuration("REDIS_DIAL_TIMEOUT", 5*time.Second),

		// JWT
		TokenHMACSecret: getEnv("CENTRIFUGO_TOKEN_HMAC_SECRET_KEY", ""),

		// Routing
		RouteCacheTTL: getEnvDuration("ROUTE_CACHE_TTL", 30*time.Second),

		// Message limits
		MaxTextLength: getEnvInt("MAX_TEXT_LENGTH", 5000),

		// WebSocket
		WriteTimeout:     getEnvDuration("WS_WRITE_TIMEOUT", time.Second),
		PingInterval:     getEnvDuration("WS_PING_INTERVAL", 25*time.Second),
		PongTimeout:      getEnvDuration("WS_PONG_TIMEOUT", 10*time.Second),
		MessageSizeLimit: getEnvInt("WS_MESSAGE_SIZE_LIMIT", 65536),
		ReadBufferSize:   getEnvInt("WS_READ_BUFFER_SIZE", 4096),
		WriteBufferSize:  getEnvInt("WS_WRITE_BUFFER_SIZE", 4096),
		AllowedOrigins:   []string{}, // empty = allow all
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
		}
	}
	return defaultValue
}

func getEnvDuration(key string, defaultValue time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if duration, err := time.ParseDuration(value); err == nil {
			return duration
		}
	}
	return defaultValue
}

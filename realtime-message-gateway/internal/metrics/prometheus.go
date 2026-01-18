package metrics

import (
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	// Connect metrics
	ConnectTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "gateway",
		Name:      "connect_total",
		Help:      "Total connect requests by status",
	}, []string{"status"})

	// Subscribe metrics
	SubscribeTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "gateway",
		Name:      "subscribe_total",
		Help:      "Total subscribe requests by status",
	}, []string{"status", "reason"})

	// Publish metrics
	PublishTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "gateway",
		Name:      "publish_total",
		Help:      "Total publish requests by status",
	}, []string{"status", "reason"})

	PublishLatency = promauto.NewHistogram(prometheus.HistogramOpts{
		Namespace: "gateway",
		Name:      "publish_latency_seconds",
		Help:      "Publish request latency",
		Buckets:   []float64{.001, .005, .01, .025, .05, .1, .25, .5, 1},
	})

	// WebSocket metrics
	WebSocketConnections = promauto.NewGauge(prometheus.GaugeOpts{
		Namespace: "gateway",
		Name:      "websocket_connections",
		Help:      "Current number of WebSocket connections",
	})

	WebSocketMessagesTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "gateway",
		Name:      "websocket_messages_total",
		Help:      "Total WebSocket messages by direction",
	}, []string{"direction"})

	// HTTP metrics
	HTTPRequestsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "gateway",
		Name:      "http_requests_total",
		Help:      "Total HTTP requests by method, path, status",
	}, []string{"method", "path", "status"})

	HTTPRequestDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: "gateway",
		Name:      "http_request_duration_seconds",
		Help:      "HTTP request duration",
		Buckets:   prometheus.DefBuckets,
	}, []string{"method", "path"})

	// Routing cache metrics
	RouteCacheHits = promauto.NewCounter(prometheus.CounterOpts{
		Namespace: "gateway",
		Name:      "route_cache_hits_total",
		Help:      "Route cache hits",
	})

	RouteCacheMisses = promauto.NewCounter(prometheus.CounterOpts{
		Namespace: "gateway",
		Name:      "route_cache_misses_total",
		Help:      "Route cache misses",
	})

	// Redis metrics
	RedisOperations = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "gateway",
		Name:      "redis_operations_total",
		Help:      "Total Redis operations",
	}, []string{"operation", "status"})

	RedisLatency = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: "gateway",
		Name:      "redis_latency_seconds",
		Help:      "Redis operation latency",
		Buckets:   []float64{.0005, .001, .005, .01, .025, .05, .1},
	}, []string{"operation"})
)

// Timer helps measure operation duration
type Timer struct {
	start    time.Time
	observer prometheus.Observer
}

// NewTimer creates a new timer for the given histogram
func NewTimer(observer prometheus.Observer) *Timer {
	return &Timer{
		start:    time.Now(),
		observer: observer,
	}
}

// ObserveDuration records the duration since timer creation
func (t *Timer) ObserveDuration() time.Duration {
	d := time.Since(t.start)
	t.observer.Observe(d.Seconds())
	return d
}

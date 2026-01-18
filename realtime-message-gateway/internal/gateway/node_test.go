package gateway

import (
	"testing"
)

func TestIsValidChannel(t *testing.T) {
	gw := &Gateway{}

	tests := []struct {
		name    string
		channel string
		userID  string
		want    bool
	}{
		// Valid channels
		{"global chat", "chat", "user-123", true},
		{"room channel", "chat:room-abc", "user-123", true},
		{"room with numbers", "chat:room-123", "user-123", true},
		{"own user channel", "user:user-123", "user-123", true},

		// Invalid channels
		{"other user channel", "user:other-user", "user-123", false},
		{"invalid prefix", "invalid:channel", "user-123", false},
		{"random channel", "random", "user-123", false},
		{"empty channel", "", "user-123", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := gw.isValidChannel(tt.channel, tt.userID)
			if got != tt.want {
				t.Errorf("isValidChannel(%q, %q) = %v, want %v", tt.channel, tt.userID, got, tt.want)
			}
		})
	}
}

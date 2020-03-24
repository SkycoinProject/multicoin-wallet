package api

import (
	"net/http"
)

//go:generate mockery -name Gatewayer -case underscore -inpkg -testonly

// Gateway is the api gateway
type Gateway struct {
	*CoinManager
}

// NewGateway creates a Gateway
func NewGateway(m *CoinManager) *Gateway {
	return &Gateway{
		CoinManager: m,
	}
}

// Gatewayer interface for Gateway methods
type Gatewayer interface {
	MultiCoiner
}

type MultiCoiner interface {
	SetupCoinRoutes(prefix string, webHandler func(endpoint string, handler http.Handler))
}

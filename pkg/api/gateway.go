package api

import (
	"net/http"

	"github.com/SkycoinProject/multicoin-wallet/pkg/coin"
)

//go:generate mockery -name Gatewayer -case underscore -inpkg -testonly

// Gateway is the api gateway
type Gateway struct {
	*coin.CoinManager
}

// NewGateway creates a Gateway
func NewGateway(cm *coin.CoinManager) *Gateway {
	return &Gateway{
		cm,
	}
}

// Gatewayer interface for Gateway methods
type Gatewayer interface {
	SetupMultiCoinRoutes(prefix string, handler func(endpoint string, handler http.Handler))
}

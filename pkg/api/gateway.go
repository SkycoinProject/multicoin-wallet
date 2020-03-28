package api

import (
	"net/http"

	"github.com/SkycoinProject/multicoin-wallet/pkg/coin"
)

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
	SetupCoinRoutes(prefix string, webhandler func(string, http.Handler))
}

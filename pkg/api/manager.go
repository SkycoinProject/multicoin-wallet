package api

import (
	"fmt"
	"net/http"

	"github.com/SkycoinProject/multicoin-wallet/pkg/wallet"
)

type Ticker string

//var (
//    logger = logging.MustGetLogger("multicoin")
//)

// CoinManager is a manager for coins
type CoinManager struct {
	Coins map[Ticker]wallet.Coiner
}

// NewAltManager constructs new manager according to the config
func NewCoinManager(coins map[Ticker]wallet.Coiner) (*CoinManager, error) {
	m := &CoinManager{
		Coins: coins,
	}

	return m, nil
}

func (am *CoinManager) SetupCoinRoutes(prefix string, webHandler func(endpoint string, handler http.Handler)) {
	// TODO(therealssj): add all routes
	for ticker, coin := range am.Coins {
		webHandler(fmt.Sprintf("%s/%s/getbalance", prefix, ticker), walletCreateHandler(coin))

	}
}

package coin

import (
	"fmt"
	"net/http"
)

type Ticker string

//var (
//   logger = logging.MustGetLogger("multicoin")
//)

// CoinManager is a manager for coins
type CoinManager struct {
	coins map[Ticker]Coin
}

// NewAltManager constructs new manager according to the config
func NewCoinManager(coins map[Ticker]Coin) (*CoinManager, error) {
	m := &CoinManager{
		coins,
	}

	return m, nil
}

func (am *CoinManager) SetupCoinRoutes(prefix string, webHandler func(endpoint string, handler http.Handler)) {
	for ticker, coin := range am.coins {
		coin.SetupRoutes(fmt.Sprintf("%s/%s", prefix, ticker), webHandler)
	}
}

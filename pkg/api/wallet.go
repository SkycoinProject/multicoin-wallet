package api

import (
	"net/http"

	"github.com/SkycoinProject/multicoin-wallet/pkg/wallet"
)

func walletCreateHandler(coin wallet.Coiner) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		coin.CreateWallet()
	}
}

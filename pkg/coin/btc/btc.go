package btc

import (
	"net/http"

	"github.com/btcsuite/btcd/rpcclient"
)

type BTC struct {
	rpc *rpcclient.Client
}

func New() *BTC {
	return &BTC{
		rpc: &rpcclient.Client{},
	}
}

func (btc *BTC) SetupRoutes(prefix string, handler func(endpoint string, handler http.Handler)) {

}

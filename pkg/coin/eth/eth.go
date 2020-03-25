package eth

import (
	"net/http"

	"github.com/btcsuite/btcd/rpcclient"
)

type ETH struct {
	rpc *rpcclient.Client
}

func New() *ETH {
	return &ETH{
		rpc: &rpcclient.Client{},
	}
}

func (eth *ETH) SetupRoutes(prefix string, handler func(endpoint string, handler http.Handler)) {

}

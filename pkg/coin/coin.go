package coin

import (
	"net/http"
)

type Coin interface {
	SetupRoutes(prefix string, handler func(endpoint string, handler http.Handler))
}

package coin

import (
	"net/http"
)

type Coin interface {
	SetupRoutes(prefix string, webhandler func(string, http.Handler))
}

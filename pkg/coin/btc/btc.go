package btc

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/SkycoinProject/multicoin-wallet/pkg/coin/btc/rpc"
)

type BTC struct {
	rpc *rpc.Client
}

func New() *BTC {
	// run btcd node with --notls flag
	client := rpc.NewClient("dmsg://0311607e59d1d0dc07fa33c641d31af10b8081de57b1c3c0d732804099f6a64dcb:8080/")
	return &BTC{
		rpc: client,
	}
}

func (btc *BTC) SetupRoutes(prefix string, webhandler func(string, http.Handler)) {
	webhandler(fmt.Sprintf("%s/balance", prefix), BalanceHandler(btc.rpc))
}

func BalanceHandler(rpc *rpc.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		amt, err := rpc.GetBalance("account1")
		if err != nil {
			Error500(w, err.Error())
		}

		SendJSONOr500(w, amt)
	}
}

// SendJSONOr500 writes an object as JSON, writing a 500 error if it fails
func SendJSONOr500(w http.ResponseWriter, m interface{}) {
	out, err := json.MarshalIndent(m, "", "    ")
	if err != nil {
		Error500(w, err.Error())
		return
	}

	w.Header().Add("Content-Type", "application/json")

	if _, err := w.Write(out); err != nil {
		Error500(w, err.Error())
	}
}

func Error500(w http.ResponseWriter, msg string) {
	ErrorXXX(w, http.StatusInternalServerError, msg)
}

func ErrorXXX(w http.ResponseWriter, status int, msg string) {
	httpMsg := fmt.Sprintf("%d %s", status, http.StatusText(status))
	if msg != "" {
		httpMsg = fmt.Sprintf("%s - %s", httpMsg, msg)
	}

	http.Error(w, httpMsg, status)
}

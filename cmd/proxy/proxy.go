package main

import (
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"time"

	"github.com/SkycoinProject/dmsg"
	"github.com/SkycoinProject/dmsg/cipher"
	"github.com/SkycoinProject/dmsg/disc"
)

var (
	PK = "0311607e59d1d0dc07fa33c641d31af10b8081de57b1c3c0d732804099f6a64dcb"
	SK = "f36543b56f5bd8b93cac088c1550c9081e9bd8302b18f09fc7e42ed9270aae65"
)

func main() {
	var sPK cipher.PubKey
	var sSK cipher.SecKey
	_ = sPK.Set(PK)
	_ = sSK.Set(SK)

	dmsgClient := dmsg.NewClient(sPK, sSK, disc.NewHTTP("http://dmsg.discovery.skywire.cc"), dmsg.DefaultConfig())
	go dmsgClient.Serve()

	time.Sleep(time.Second) // wait for dmsg client to be ready

	// port where server will listen
	serverPort := uint16(8080)

	btcdrpcurl, err := url.Parse("http://127.0.0.1:18554")
	if err != nil {
		panic(err)
	}

	proxy := httputil.NewSingleHostReverseProxy(btcdrpcurl)

	// prepare server route handling
	mux := http.NewServeMux()
	mux.HandleFunc("/", handler(proxy))

	// run the server
	srv := &http.Server{
		Handler: mux,
	}

	list, err := dmsgClient.Listen(serverPort)
	if err != nil {
		panic(err)
	}

	sErr := make(chan error, 1)
	go func() {
		sErr <- srv.Serve(list)
		close(sErr)
	}()

	var retErr error
	select {
	case retErr = <-sErr:
		fmt.Println(retErr)
	}
}

func handler(p *httputil.ReverseProxy) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		log.Println(r.URL)
		p.ServeHTTP(w, r)
	}
}

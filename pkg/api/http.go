package api

import (
	"net"
	"net/http"

	"github.com/NYTimes/gziphandler"
	wh "github.com/SkycoinProject/skycoin/src/util/http"
	"github.com/SkycoinProject/skycoin/src/util/logging"
)

const (
	// ContentTypeJSON json content type header
	ContentTypeJSON = "application/json"
	// ContentTypeForm form data content type header
	ContentTypeForm = "application/x-www-form-urlencoded"

	apiVersion1 = "v1"
)

var (
	logger = logging.MustGetLogger("multicoin-api")
)

type muxConfig struct {
	host string
}

// Server exposes an HTTP API
type Server struct {
	server   *http.Server
	listener net.Listener
	done     chan struct{}
}

// Serve serves the web interface on the configured host
func (s *Server) Serve() error {
	defer close(s.done)

	if err := s.server.Serve(s.listener); err != nil {
		if err != http.ErrServerClosed {
			return err
		}
	}
	return nil
}

// Shutdown closes the HTTP service. This can only be called after Serve or ServeHTTPS has been called.
func (s *Server) Shutdown() {
	if s == nil {
		return
	}

	logger.Info("Shutting down web interface")
	defer logger.Info("Web interface shut down")
	if err := s.listener.Close(); err != nil {
		logger.WithError(err).Warning("s.listener.Close() error")
	}
	<-s.done
}

func create(host string, gateway *Gateway) *Server {
	mc := muxConfig{
		host: host,
	}

	srvMux := newServerMux(mc, gateway)

	srv := &http.Server{
		Handler: srvMux,
	}

	return &Server{
		server: srv,
		done:   make(chan struct{}),
	}
}

// Create create a new http server
func Create(host string, gateway *Gateway) (*Server, error) {
	listener, err := net.Listen("tcp", host)
	if err != nil {
		return nil, err
	}

	// If the host did not specify a port, allowing the kernel to assign one,
	// we need to get the assigned address to know the full hostname
	host = listener.Addr().String()

	s := create(host, gateway)

	s.listener = listener

	return s, nil
}

func newServerMux(c muxConfig, gateway Gatewayer) *http.ServeMux {
	mux := http.NewServeMux()

	webHandlerWithOptionals := func(endpoint string, handlerFunc http.Handler) {
		handler := wh.ElapsedHandler(logger, handlerFunc)

		handler = gziphandler.GzipHandler(handler)

		mux.Handle(endpoint, handler)
	}

	webHandler := func(endpoint string, handler http.Handler) {
		webHandlerWithOptionals(endpoint, handler)
	}

	webHandlerV1 := func(endpoint string, handler http.Handler) {
		webHandler("/api/"+apiVersion1+endpoint, handler)
	}

	gateway.SetupCoinRoutes("/multicoin", webHandlerV1)
	return mux
}

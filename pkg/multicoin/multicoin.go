package multicoin

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"runtime/pprof"
	"sync"
	"time"

	"github.com/SkycoinProject/multicoin-wallet/pkg/coin"
	"github.com/SkycoinProject/multicoin-wallet/pkg/coin/btc"

	"github.com/SkycoinProject/skycoin/src/util/apputil"
	"github.com/SkycoinProject/skycoin/src/util/logging"

	"github.com/SkycoinProject/multicoin-wallet/pkg/api"
)

// MultiCoin represents a multcoin instance
type MultiCoin struct {
	config Config
	logger *logging.Logger
}

// NewMultiCoin returns a new multicoin instance
func NewMultiCoin(config Config, logger *logging.Logger) *MultiCoin {
	return &MultiCoin{
		config: config,
		logger: logger,
	}
}

// Run starts the multicoin api server
func (m *MultiCoin) Run() error {
	var apiServer *api.Server
	var retErr error
	errC := make(chan error, 10)

	logLevel, err := logging.LevelFromString(m.config.LogLevel)
	if err != nil {
		err = fmt.Errorf("invalid -log-level: %v", err)
		m.logger.Error(err)
		return err
	}

	logging.SetLevel(logLevel)

	if m.config.ColorLog {
		logging.EnableColors()
	} else {
		logging.DisableColors()
	}

	var logFile *os.File
	if m.config.LogToFile {
		var err error
		logFile, err = m.initLogFile()
		if err != nil {
			m.logger.Error(err)
			return err
		}
	}

	host := fmt.Sprintf("%s:%d", m.config.WebInterfaceAddr, m.config.WebInterfacePort)

	if m.config.ProfileCPU {
		f, err := os.Create(m.config.ProfileCPUFile)
		if err != nil {
			m.logger.Error(err)
			return err
		}

		if err := pprof.StartCPUProfile(f); err != nil {
			m.logger.Error(err)
			return err
		}
		defer pprof.StopCPUProfile()
	}

	if m.config.HTTPProf {
		go func() {
			if err := http.ListenAndServe(m.config.HTTPProfHost, nil); err != nil {
				m.logger.WithError(err).Errorf("Listen on HTTP profiling interface %s failed", m.config.HTTPProfHost)
			}
		}()
	}

	var wg sync.WaitGroup

	quit := make(chan struct{})

	// Catch SIGINT (CTRL-C) (closes the quit channel)
	go apputil.CatchInterrupt(quit)

	// Catch SIGUSR1 (prints runtime stack to stdout)
	go apputil.CatchDebug()

	btcInstance := btc.New()
	coins := map[coin.Ticker]coin.Coin{
		"btc": btcInstance,
	}
	manager, err := coin.NewCoinManager(coins)
	if err != nil {
		m.logger.Error(err)
		retErr = err
		goto earlyShutdown
	}

	apiServer, err = m.createServer(host, api.NewGateway(manager))
	if err != nil {
		m.logger.Error(err)
		retErr = err
		goto earlyShutdown
	}

	wg.Add(1)
	go func() {
		defer wg.Done()

		if err := apiServer.Serve(); err != nil {
			m.logger.Error(err)
			errC <- err
		}
	}()

	select {
	case <-quit:
	case retErr = <-errC:
		m.logger.Error(retErr)
	}

	m.logger.Info("Shutting down...")

	if apiServer != nil {
		m.logger.Info("Closing api server")
		apiServer.Shutdown()
	}

	m.logger.Info("Waiting for goroutines to finish")
	wg.Wait()

earlyShutdown:
	m.logger.Info("Goodbye")

	if logFile != nil {
		if err := logFile.Close(); err != nil {
			fmt.Println("Failed to close log file")
		}
	}

	return retErr
}

func (m *MultiCoin) initLogFile() (*os.File, error) {
	logDir := filepath.Join(m.config.DataDirectory, "logs")
	if err := createDirIfNotExist(logDir); err != nil {
		m.logger.Errorf("createDirIfNotExist(%s) failed: %v", logDir, err)
		return nil, fmt.Errorf("createDirIfNotExist(%s) failed: %v", logDir, err)
	}

	// open log file
	tf := "2006-01-02-030405"
	logfile := filepath.Join(logDir, fmt.Sprintf("%s.log", time.Now().Format(tf)))

	f, err := os.OpenFile(logfile, os.O_WRONLY|os.O_CREATE|os.O_APPEND, 0600)
	if err != nil {
		m.logger.Errorf("os.OpenFile(%s) failed: %v", logfile, err)
		return nil, err
	}

	hook := logging.NewWriteHook(f)
	logging.AddHook(hook)

	return f, nil
}

func createDirIfNotExist(dir string) error {
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		return nil
	}

	return os.Mkdir(dir, 0750)
}

func (m *MultiCoin) createServer(host string, gateway *api.Gateway) (*api.Server, error) {

	var s *api.Server

	var err error
	s, err = api.Create(host, gateway)
	if err != nil {
		m.logger.Errorf("Failed to start web GUI: %v", err)
		return nil, err
	}

	return s, nil
}

// ParseConfig prepare the config
func (m *MultiCoin) ParseConfig() error {
	return m.config.postProcess()
}

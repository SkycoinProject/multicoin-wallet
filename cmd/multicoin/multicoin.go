package multicoin

import (
	"flag"
	"os"

	"github.com/SkycoinProject/skycoin/src/util/logging"

	"github.com/SkycoinProject/multicoin-wallet/pkg/multicoin"
)

const (
	serverPort = 7420
	dataDir    = "$HOME/.multicoin"
)

var (
	logger = logging.MustGetLogger("main")

	multiCoinConfig = multicoin.NewConfig(serverPort, dataDir)
	parseFlags      = true
)

func init() {

}

func main() {
	if parseFlags {
		flag.Parse()
	}

	// create a new multicoin instance
	multiCoin := multicoin.NewMultiCoin(multiCoinConfig, logger)

	if err := multiCoin.ParseConfig(); err != nil {
		logger.Error(err)
		os.Exit(1)
	}

	if err := multiCoin.Run(); err != nil {
		os.Exit(1)
	}
}

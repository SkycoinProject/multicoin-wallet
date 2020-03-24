package wallet

import (
	"github.com/SkycoinProject/skycoin/src/wallet"
)

type Coiner interface {
	Walleter
	DmsgBlockhainer
}

// DmsgBlockhainer interface for all blockchain methods executed over remote api using dmsg
type DmsgBlockhainer interface {
	GetWalletBalance(wltID string) func()
	GetTransaction(txid string) func()
	GetFeeEstimate(coin CoinType) func()
	CreateTransaction() func()
	SignTransaction() func()
	SendTransaction() func()
}

// Walleter interface for wallet.Service methods used by the API
type Walleter interface {
	UnloadWallet(wltID string) error
	EncryptWallet(wltID string, password []byte) (wallet.Wallet, error)
	DecryptWallet(wltID string, password []byte) (wallet.Wallet, error)
	GetWalletSeed(wltID string, password []byte) (string, string, error)
	CreateWallet(wltName string, options wallet.Options) (wallet.Wallet, error)
	RecoverWallet(wltID, seed, seedPassphrase string, password []byte) (wallet.Wallet, error)
	NewAddresses(wltID string, password []byte, n uint64) ([]Address, error)
	ScanAddresses(wltID string, password []byte, n uint64) ([]Address, error)
	GetWallet(wltID string) (wallet.Wallet, error)
	GetWallets() (wallet.Wallets, error)
	UpdateWalletLabel(wltID, label string) error
	WalletDir() (string, error)
}

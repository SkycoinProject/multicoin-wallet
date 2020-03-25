package eth

import (
	"crypto/subtle"

	"github.com/SkycoinProject/skycoin/src/cipher/bip44"

	"github.com/SkycoinProject/skycoin/src/cipher"
	"github.com/SkycoinProject/skycoin/src/cipher/secp256k1-go"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

const (
	CoinTypeEthereum bip44.CoinType = 60
)

// EthereumAddress is a eth address
type EthereumAddress struct {
	Addr common.Address // 20 byte address of an Ethereum account
}

func (addr EthereumAddress) Bytes() []byte {
	return addr.Addr.Bytes()
}

func (addr EthereumAddress) String() string {
	return addr.Addr.String()
}

func (addr EthereumAddress) Checksum() cipher.Checksum {
	return cipher.Checksum{}
}

func (addr EthereumAddress) Verify(key cipher.PubKey) error {
	if subtle.ConstantTimeCompare(addr.Bytes(), crypto.Keccak256(secp256k1.UncompressPubkey(key[:])[1:])[12:]) == 0 {
		return cipher.ErrAddressInvalidPubKey
	}

	return nil
}

func (addr EthereumAddress) Null() bool {
	return addr == EthereumAddress{}
}

// EthereumAddressFromPubKey creates a EthereumAddress from a compressed PubKey
func EthereumAddressFromPubKey(pubKey cipher.PubKey) EthereumAddress {
	return EthereumAddress{
		Addr: common.BytesToAddress(crypto.Keccak256(secp256k1.UncompressPubkey(pubKey[:])[1:])[12:]),
	}
}

// DecodeHexToEthereumAddress creates a EthereumAddress from a EIP55-compliant hex string
func DecodeHexToEthereumAddress(addr string) EthereumAddress {
	return EthereumAddress{
		Addr: common.HexToAddress(addr),
	}
}

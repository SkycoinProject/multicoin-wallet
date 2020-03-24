package eth

import (
	"github.com/SkycoinProject/skycoin/src/cipher"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

// EthereumAddress is a eth address
type EthereumAddress struct {
	Key  common.Hash    // 32 byte pubkey hash
	Addr common.Address // 20 byte address
}

func (addr EthereumAddress) Bytes() []byte {
	return addr.Addr[:]
}

func (addr EthereumAddress) String() string {
	return addr.String()
}

func (addr EthereumAddress) Checksum() cipher.Checksum {
	return cipher.Checksum{}
}

func (addr EthereumAddress) Verify(key cipher.PubKey) error {
	if addr.Key != crypto.Keccak256Hash(key[:]) {
		return cipher.ErrAddressInvalidPubKey
	}

	return nil
}

func (addr EthereumAddress) Null() bool {
	return addr == EthereumAddress{}
}

// EthereumAddressFromPubKey creates a EthereumAddress from PubKey as keccak256hash(pubkey)
func EthereumAddressFromPubKey(pubKey cipher.PubKey) EthereumAddress {
	return EthereumAddress{
		Key: crypto.Keccak256Hash(pubKey[:]),
	}
}

func DecodeEthereumAddress() (EthereumAddress, error) {
	return EthereumAddress{}, nil
}

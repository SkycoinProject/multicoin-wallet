package wallet

import (
	"encoding/hex"
	"errors"
	"fmt"

	"github.com/SkycoinProject/skycoin/src/cipher"
	"github.com/SkycoinProject/skycoin/src/util/file"
)

// DeterministicWallet manages keys using the original Skycoin deterministic
// keypair generator method.
// With this generator, a single chain of addresses is created, each one dependent
// on the previous.
type DeterministicWallet struct {
	Meta
	Entries Entries
}

// newDeterministicWallet creates a DeterministicWallet
func newDeterministicWallet(meta Meta) (*DeterministicWallet, error) { //nolint:unparam
	return &DeterministicWallet{
		Meta: meta,
	}, nil
}

// PackSecrets copies data from decrypted wallets into the secrets container
func (w *DeterministicWallet) PackSecrets(ss Secrets) {
	ss.set(secretSeed, w.Meta.Seed())
	ss.set(secretLastSeed, w.Meta.LastSeed())

	// Saves entry secret keys in secrets
	for _, e := range w.Entries {
		ss.set(e.Address.String(), e.Secret.Hex())
	}
}

// UnpackSecrets copies data from decrypted secrets into the wallet
func (w *DeterministicWallet) UnpackSecrets(ss Secrets) error {
	seed, ok := ss.get(secretSeed)
	if !ok {
		return errors.New("seed doesn't exist in secrets")
	}
	w.Meta.setSeed(seed)

	lastSeed, ok := ss.get(secretLastSeed)
	if !ok {
		return errors.New("lastSeed doesn't exist in secrets")
	}
	w.Meta.setLastSeed(lastSeed)

	return w.Entries.unpackSecretKeys(ss)
}

// Clone clones the wallet a new wallet object
func (w *DeterministicWallet) Clone() Wallet {
	return &DeterministicWallet{
		Meta:    w.Meta.clone(),
		Entries: w.Entries.clone(),
	}
}

// CopyFrom copies the src wallet to w
func (w *DeterministicWallet) CopyFrom(src Wallet) {
	w.Meta = src.(*DeterministicWallet).Meta.clone()
	w.Entries = src.(*DeterministicWallet).Entries.clone()
}

// CopyFromRef copies the src wallet with a pointer dereference
func (w *DeterministicWallet) CopyFromRef(src Wallet) {
	*w = *(src.(*DeterministicWallet))
}

// Erase wipes secret fields in wallet
func (w *DeterministicWallet) Erase() {
	w.Meta.eraseSeeds()
	w.Entries.erase()
}

// ToReadable converts the wallet to its readable (serializable) format
func (w *DeterministicWallet) ToReadable() Readable {
	return NewReadableDeterministicWallet(w)
}

// Validate validates the wallet
func (w *DeterministicWallet) Validate() error {
	return w.Meta.validate()
}

// GetAddresses returns all addresses in wallet
func (w *DeterministicWallet) GetAddresses() []cipher.Addresser {
	return w.Entries.getAddresses()
}

// GetEntries returns a copy of all entries held by the wallet
func (w *DeterministicWallet) GetEntries() Entries {
	return w.Entries.clone()
}

// EntriesLen returns the number of entries in the wallet
func (w *DeterministicWallet) EntriesLen() int {
	return len(w.Entries)
}

// GetEntryAt returns entry at a given index in the entries array
func (w *DeterministicWallet) GetEntryAt(i int) Entry {
	return w.Entries[i]
}

// GetEntry returns entry of given address
func (w *DeterministicWallet) GetEntry(a cipher.Addresser) (Entry, bool) {
	return w.Entries.get(a)
}

// HasEntry returns true if the wallet has an Entry with a given cipher.Address.
func (w *DeterministicWallet) HasEntry(a cipher.Addresser) bool {
	return w.Entries.has(a)
}

// GenerateAddresses generates addresses
func (w *DeterministicWallet) GenerateAddresses(num uint64) ([]cipher.Addresser, error) {
	if w.Meta.IsEncrypted() {
		return nil, ErrWalletEncrypted
	}

	if num == 0 {
		return nil, nil
	}

	var seckeys []cipher.SecKey
	var seed []byte
	if len(w.Entries) == 0 {
		seed, seckeys = cipher.MustGenerateDeterministicKeyPairsSeed([]byte(w.Meta.Seed()), int(num))
	} else {
		sd, err := hex.DecodeString(w.Meta.LastSeed())
		if err != nil {
			return nil, fmt.Errorf("decode hex seed failed: %v", err)
		}
		seed, seckeys = cipher.MustGenerateDeterministicKeyPairsSeed(sd, int(num))
	}

	w.Meta.setLastSeed(hex.EncodeToString(seed))

	addrs := make([]cipher.Addresser, len(seckeys))
	makeAddress := w.Meta.AddressConstructor()
	for i, s := range seckeys {
		p := cipher.MustPubKeyFromSecKey(s)
		a := makeAddress(p)
		addrs[i] = a
		w.Entries = append(w.Entries, Entry{
			Address: a,
			Secret:  s,
			Public:  p,
		})
	}
	return addrs, nil
}

// reset resets the wallet entries and move the lastSeed to origin
func (w *DeterministicWallet) reset() {
	w.Entries = Entries{}
	w.Meta.setLastSeed(w.Meta.Seed())
}

// Fingerprint returns a unique ID fingerprint for this wallet, composed of its initial address
// and wallet type
func (w *DeterministicWallet) Fingerprint() string {
	addr := ""
	if len(w.Entries) == 0 {
		if !w.IsEncrypted() {
			_, pk, _ := cipher.MustDeterministicKeyPairIterator([]byte(w.Meta.Seed()))
			addr = w.Meta.AddressConstructor()(pk).String()
		}
	} else {
		addr = w.Entries[0].Address.String()
	}
	return fmt.Sprintf("%s-%s", w.Type(), addr)
}

// ReadableDeterministicWallet used for [de]serialization of a deterministic wallet
type ReadableDeterministicWallet struct {
	Meta            `json:"meta"`
	ReadableEntries `json:"entries"`
}

// LoadReadableDeterministicWallet loads a deterministic wallet from disk
func LoadReadableDeterministicWallet(wltFile string) (*ReadableDeterministicWallet, error) {
	var rw ReadableDeterministicWallet
	if err := file.LoadJSON(wltFile, &rw); err != nil {
		return nil, err
	}
	if rw.Type() != WalletTypeDeterministic {
		return nil, ErrInvalidWalletType
	}
	return &rw, nil
}

// NewReadableDeterministicWallet creates readable wallet
func NewReadableDeterministicWallet(w *DeterministicWallet) *ReadableDeterministicWallet {
	return &ReadableDeterministicWallet{
		Meta:            w.Meta.clone(),
		ReadableEntries: newReadableEntries(w.Entries, w.Meta.Coin(), w.Meta.Type()),
	}
}

// ToWallet convert readable wallet to Wallet
func (rw *ReadableDeterministicWallet) ToWallet() (Wallet, error) {
	w := &DeterministicWallet{
		Meta: rw.Meta.clone(),
	}

	if err := w.Validate(); err != nil {
		err := fmt.Errorf("invalid wallet %q: %v", w.Filename(), err)
		logger.WithError(err).Error("ReadableDeterministicWallet.ToWallet Validate failed")
		return nil, err
	}

	ets, err := rw.ReadableEntries.toWalletEntries(w.Meta.Coin(), w.Meta.Type(), w.Meta.IsEncrypted())
	if err != nil {
		logger.WithError(err).Error("ReadableDeterministicWallet.ToWallet toWalletEntries failed")
		return nil, err
	}

	w.Entries = ets

	return w, nil
}

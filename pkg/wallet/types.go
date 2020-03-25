package wallet

// TODO: figure out the data types

type Address struct {
	Coin    CoinType
	Address string
}

type Transaction struct {
	Txid   string
	Height uint64
	Raw    []byte
}

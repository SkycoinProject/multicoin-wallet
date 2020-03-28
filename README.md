# multicoin-wallet

- Proxy: forward requests to interal btcd / btcwallet api
- Multicoin: serve multicoin api


### Wallet:
The wallet struture is copied over from skycoin with some modifications.

The available wallets are:
1) Skycoin Deterministic Wallet (Sequential Deterministic Wallet)
2) Bip44 Wallet
3) Collections Wallet
4) XPub Wallet ( Watch only wallets )


> Note: The public keys for skycoin and bitcoin are compressed public keys while eth pubkeys are uncompressed.




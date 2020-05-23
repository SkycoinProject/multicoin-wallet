import { Coin } from './coin';
import { CoinTypes } from './coin-types';
import { BtcCoinConfig } from './config/btc.coin-config';
import { SkywalletSupportedCoinTypes } from './skywallet-supported-coin-types';

export class BtcCoin extends Coin {
  coinType = CoinTypes.BTC;
  devOnly = true;
  isLocal = false;
  nodeUrl = '/local-btc';
  indexerUrl = '/local-blockbook';
  coinName = 'Bitcoin';
  coinSymbol = 'BTC';
  feePaymentCoinUnit = 'Sats';
  uriSpecificatioPrefix = 'bitcoin';
  priceTickerId = 'btc-bitcoin';
  explorerUrl = 'https://explorer.testcoin.net';
  assetsFolderName = 'bitcoin';
  confirmationsNeeded = 3;
  skywalletCoinType = SkywalletSupportedCoinTypes.BTC;
  config = new BtcCoinConfig();
}

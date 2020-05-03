import { Coin } from './coin';
import { CoinTypes } from './coin-types';

export class BtcCoin extends Coin {
  coinType = CoinTypes.BTC;
  devOnly = true;
  isLocal = false;
  nodeUrl = 'https://127.0.0.1:18556';
  coinName = 'Bitcoin';
  coinSymbol = 'BTC';
  hoursName = '';
  hoursNameSingular = '';
  uriSpecificatioPrefix = 'bitcoin';
  priceTickerId = 'btc-bitcoin';
  explorerUrl = 'https://explorer.testcoin.net';
  assetsFolderName = 'testcoin';
}

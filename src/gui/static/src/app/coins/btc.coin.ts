import { Coin } from './coin';
import { CoinTypes } from './coin-types';

export class BtcCoin extends Coin {
  coinType = CoinTypes.BTC;
  devOnly = true;
  isLocal = false;
  nodeUrl = '/local-btcd';
  coinName = 'Bitcoin';
  coinSymbol = 'BTC';
  hoursName = '';
  hoursNameSingular = '';
  uriSpecificatioPrefix = 'bitcoin';
  priceTickerId = 'btc-bitcoin';
  explorerUrl = 'https://explorer.testcoin.net';
  assetsFolderName = 'testcoin';
}

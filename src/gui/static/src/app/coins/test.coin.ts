import { Coin } from './coin';
import { environment } from '../../environments/environment';
import { CoinTypes } from './settings/coin-types';
import { SkywalletSupportedCoinTypes } from './settings/skywallet-supported-coin-types';
import { CoinStyleBase } from './settings/coin-style-base';

export class TestCoin extends Coin {
  coinType = CoinTypes.Fiber;
  devOnly = true;
  isLocal = false;
  nodeUrl = environment.nodeUrl;
  coinName = 'Testcoin';
  coinSymbol = 'TST';
  hoursName = 'Test Hours';
  hoursNameSingular = 'Test Hour';
  uriSpecificatioPrefix = 'testcoin';
  priceTickerId = 'btc-bitcoin';
  explorerUrl = 'https://explorer.testcoin.net';
  assetsFolderName = 'testcoin';
  normalConfirmationsNeeded = 1;
  skywalletCoinType = SkywalletSupportedCoinTypes.SKY;
  styleConfig = new CoinStyleBase();
}

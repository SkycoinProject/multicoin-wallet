import { Coin } from './coin';
import { environment } from '../../environments/environment';
import { CoinTypes } from './coin-types';
import { SkywalletSupportedCoinTypes } from './skywallet-supported-coin-types';

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
  confirmationsNeeded = 1;
  skywalletCoinType = SkywalletSupportedCoinTypes.SKY;
}

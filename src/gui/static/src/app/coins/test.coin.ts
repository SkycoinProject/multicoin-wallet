import { Coin } from './coin';
import { environment } from '../../environments/environment';
import { CoinTypes } from './coin-types';

export class TestCoin extends Coin {
  coinType = CoinTypes.Fiber;
  devOnly = true;
  isLocal = false;
  nodeUrl = environment.nodeUrl;
  coinName = 'Testcoin';
  coinSymbol = 'TST';
  hoursName = 'Test Hours';
  minimumPartsName = 'Test Droplets';
  minimumPartsSmallName = 'T Drops';
  hoursNameSingular = 'Test Hour';
  uriSpecificatioPrefix = 'testcoin';
  priceTickerId = 'btc-bitcoin';
  explorerUrl = 'https://explorer.testcoin.net';
  assetsFolderName = 'testcoin';
  confirmationsNeeded = 1;
}

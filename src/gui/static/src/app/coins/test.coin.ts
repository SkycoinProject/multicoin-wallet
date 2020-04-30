import { Coin } from './coin';
import { environment } from '../../environments/environment';

export class TestCoin extends Coin {
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
}

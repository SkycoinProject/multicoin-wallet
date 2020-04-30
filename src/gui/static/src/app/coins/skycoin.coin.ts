import { Coin } from './coin';
import { environment } from '../../environments/environment';

export class SkycoinCoin extends Coin {
  devOnly = false;
  isLocal = true;
  nodeUrl = environment.nodeUrl;
  coinName = 'Skycoin';
  coinSymbol = 'SKY';
  hoursName = 'Coin Hours';
  hoursNameSingular = 'Coin Hour';
  uriSpecificatioPrefix = 'skycoin';
  priceTickerId = 'sky-skycoin';
  explorerUrl = 'https://explorer.skycoin.com';
  assetsFolderName = 'skycoin';
}

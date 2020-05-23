import { Coin } from './coin';
import { environment } from '../../environments/environment';
import { CoinTypes } from './coin-types';
import { SkywalletSupportedCoinTypes } from './skywallet-supported-coin-types';

export class SkycoinCoin extends Coin {
  coinType = CoinTypes.Fiber;
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
  confirmationsNeeded = 1;
  skywalletCoinType = SkywalletSupportedCoinTypes.SKY;
}

import { Coin } from './coin';
import { environment } from '../../environments/environment';
import { CoinTypes } from './settings/coin-types';
import { SkywalletSupportedCoinTypes } from './settings/skywallet-supported-coin-types';
import { CoinStyleBase } from './settings/coin-style-base';

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
  normalConfirmationsNeeded = 1;
  skywalletCoinType = SkywalletSupportedCoinTypes.SKY;
  styleConfig = new CoinStyleBase();
}

import { Coin } from './coin';
import { CoinTypes } from './settings/coin-types';
import { BtcCoinConfig } from './coin-type-configs/btc.coin-config';
import { SkywalletSupportedCoinTypes } from './settings/skywallet-supported-coin-types';
import { CoinStyleBase } from './settings/coin-style-base';

export class BtcCoin extends Coin {
  coinType = CoinTypes.BTC;
  devOnly = true;
  isLocal = false;
  nodeUrl = '/local-btc';
  indexerUrl = '/local-blockbook';
  coinName = 'Bitcoin';
  coinSymbol = 'BTC';
  feePaymentCoinUnit = 'sats';
  uriSpecificatioPrefix = 'bitcoin';
  priceTickerId = 'btc-bitcoin';
  assetsFolderName = 'bitcoin';
  normalConfirmationsNeeded = 3;
  skywalletCoinType = SkywalletSupportedCoinTypes.BTC;
  config = new BtcCoinConfig();
  styleConfig = new CoinStyleBase();

  constructor() {
    super();

    this.styleConfig.mainColor = '#ff7600';
    this.styleConfig.gradientDark = '#ff7600';
    this.styleConfig.gradientLight = '#ff9900';
    this.styleConfig.onboardingGradientDark = '#ff6a00';
    this.styleConfig.onboardingGradientLight = '#ff8d00';

    this.styleConfig.mainColorImagesFilter = 'invert(55%) sepia(72%) saturate(3833%) hue-rotate(1deg) brightness(103%) contrast(104%)';
  }
}

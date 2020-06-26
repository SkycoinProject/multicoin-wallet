import { Coin } from './coin';
import { CoinTypes } from './settings/coin-types';
import { EthCoinConfig } from './coin-type-configs/eth.coin-config';
import { CoinStyleBase } from './settings/coin-style-base';

export class EthCoin extends Coin {
  coinType = CoinTypes.ETH;
  devOnly = true;
  isLocal = false;
  nodeUrl = '/local-eth';
  indexerUrl = '/local-blockbook';
  coinName = 'Ethereum';
  coinSymbol = 'ETH';
  feePaymentCoinUnit = 'gwei';
  uriSpecificatioPrefix = 'ethereum';
  priceTickerId = 'eth-ethereum';
  assetsFolderName = 'ethereum';
  confirmationsNeeded = 30;
  config = new EthCoinConfig('32576');
  styleConfig = new CoinStyleBase();
}

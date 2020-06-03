import { Coin } from './coin';
import { CoinTypes } from './coin-types';
import { EthCoinConfig } from './config/eth.coin-config';

export class EthCoin extends Coin {
  coinType = CoinTypes.ETH;
  devOnly = true;
  isLocal = false;
  nodeUrl = 'http://localhost:8545';
  coinName = 'Ethereum';
  coinSymbol = 'ETH';
  feePaymentCoinUnit = 'Gwei';
  uriSpecificatioPrefix = 'ethereum';
  priceTickerId = 'eth-ethereum';
  assetsFolderName = 'ethereum';
  confirmationsNeeded = 30;
  config = new EthCoinConfig('32576');
}

import { CoinTypes } from './coin-types';
import { SkywalletSupportedCoinTypes } from './skywallet-supported-coin-types';
import { CoinTypeFeatures } from './features/coin-type-features';
import { FiberFeatures } from './features/fiber-features';
import { BtcFeatures } from './features/btc-features';
import { EthFeatures } from './features/eth-features';

/**
 * Base class with the properties of the coins this wallet can work with.
 */
export abstract class Coin {
  abstract coinType: CoinTypes;
  abstract devOnly: boolean;
  abstract isLocal: boolean;
  nodeUrl: string;
  indexerUrl: string;
  abstract coinName: string;
  abstract coinSymbol: string;
  feePaymentCoinUnit: string;
  hoursName: string;
  hoursNameSingular: string;
  /**
   * This wallet uses the Skycoin URI Specification and BIP-21 when creating QR codes and
   * requesting coins. This variable defines the prefix that will be used for creating QR codes
   * and URLs. IT MUST BE UNIQUE FOR EACH COIN.
   */
  abstract uriSpecificatioPrefix: string;
  /**
   * ID of the coin on the coin price service. If null, the wallet will not show the USD price.
   */
  priceTickerId: string;
  explorerUrl: string;
  abstract assetsFolderName: string;
  headerHasGradient = true;
  /**
   * How many confirmations a transaction must have to be considered final. IMPORTANT: the
   * backend may have its own number of required confirmations, if this value is different
   * the UI could end showing inconsistent data.
   */
  abstract confirmationsNeeded: number;
  skywalletCoinType: SkywalletSupportedCoinTypes;
  config: any;

  /**
   * Returns an object indicating which features of the app or general properties are compatible
   * and/or valid for all the coins with the type this coin has.
   */
  get coinTypeFeatures(): CoinTypeFeatures {
    if (this.coinType === CoinTypes.Fiber) {
      return new FiberFeatures();
    } else if (this.coinType === CoinTypes.BTC) {
      return new BtcFeatures();
    } else if (this.coinType === CoinTypes.ETH) {
      return new EthFeatures();
    }

    return null;
  }
}

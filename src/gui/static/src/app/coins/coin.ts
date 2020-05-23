import { CoinTypes } from './coin-types';

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
  config: any;
}

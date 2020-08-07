import { CoinTypes } from './settings/coin-types';
import { SkywalletSupportedCoinTypes } from './settings/skywallet-supported-coin-types';
import { CoinTypeFeatures } from './features/coin-type-features';
import { FiberFeatures } from './features/fiber-features';
import { BtcFeatures } from './features/btc-features';
import { EthFeatures } from './features/eth-features';
import { CoinStyleBase } from './settings/coin-style-base';

/**
 * Base class with the properties of the coins this wallet can work with.
 */
export abstract class Coin {
  /**
   * The type of the coin.
   */
  abstract coinType: CoinTypes;
  /**
   * If true, the coin will not be available in production builds.
   */
  abstract devOnly: boolean;
  /**
   * Set to true if the local node is the one which must manage the software wallets. A max of
   * one coin can be managed by the local node.
   */
  abstract isLocal: boolean;
  /**
   * URL of the remote node which must be used for this coin. Only if isLocal is false.
   */
  nodeUrl: string;
  /**
   * URL of the Blockbook instance which must be used for this coin, if it is applicable.
   */
  indexerUrl: string;
  /**
   * Name of the coin. Must be unique, as it is used as ID.
   */
  abstract coinName: string;
  /**
   * Small name of the coin, like SKY for Skycoin.
   */
  abstract coinSymbol: string;
  /**
   * Name of the unit in which the transaction fees are paid. For Bitcoin it would be "sats",
   * and "gwei" for Ethereum. Only if the fees are paid in coins and not hours.
   */
  feePaymentCoinUnit: string;
  /**
   * Name of the coin hours, if the coin uses them.
   */
  hoursName: string;
  /**
   * Singular form of the name of the coin hours, if the coin uses them.
   */
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
  /**
   * URL for accessing the blockchain explorer.
   */
  explorerUrl: string;
  /**
   * Name of the folder with the assets for the coin. The folder must be inside src/assets/coins.
   */
  abstract assetsFolderName: string;
  /**
   * If the assets folder includes a "gradient.png" file to be used as an overlay in the header.
   */
  headerHasGradient = true;
  /**
   * How many confirmations a transaction must normally have to be considered final, without
   * taking into account the selections made by the user. Must be at least 1.
   */
  abstract normalConfirmationsNeeded: number;
  /**
   * The type identifying how the Skywallet should work with this coin. If not set, the
   * compatibility with the Skywallet is deactivated.
   */
  skywalletCoinType: SkywalletSupportedCoinTypes;
  /**
   * Configuration for the coin. Take into account that this param must have an object
   * corresponding to the selected coin type. For example, if coinType === CoinTypes.BTC, then
   * this property must have an instance of BtcCoinConfig.
   */
  config: any;
  /**
   * Styling configuration for the coin.
   */
  abstract styleConfig: CoinStyleBase;


  /***************************************************
   * 
   * The following properties don't have to be added in subclasses when creating a new coin.
   * 
   ***************************************************/

  /**
   * How many confirmations a transaction must have to be considered final, as selected by
   * the user.
   */
  confirmationsNeeded: number;

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

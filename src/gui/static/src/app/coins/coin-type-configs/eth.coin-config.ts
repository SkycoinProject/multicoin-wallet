import BigNumber from 'bignumber.js';

/**
 * Configuration for all coins with the CoinTypes.ETH type. It includes default values for
 * each property.
 */
export class EthCoinConfig {
  /**
   * Max number of decimals in which each coin can be divided.
   */
  decimals = 18;
  /**
   * ID of the blockchain.
   */
  chainId = '1';
  /**
   * Minimum fee (in Gwei per gas) the node accepts.
   */
  minFee = new BigNumber(0.001);

  constructor(chainId: string) {
    this.chainId = chainId;
  }
}

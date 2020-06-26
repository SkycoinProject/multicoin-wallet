import BigNumber from 'bignumber.js';

/**
 * Configuration for all coins with the CoinTypes.BTC type. It includes default values for
 * each property.
 */
export class BtcCoinConfig {
  /**
   * Max number of decimals in which each coin can be divided.
   */
  decimals = 8;
  /**
   * How many coins the miners get per block before the first halving.
   */
  initialMiningReward = 50;
  /**
   * Numbers of blocks which must be mined for a halving to occur.
   */
  halvingBlocks = 210000;
  /**
   * How old, in minutes, the last block known by the node can be before the app starts
   * considering the blockchain to be out of sync.
   */
  outOfSyncMinutes = 90;
  /**
   * Max amount of coins that will be created
   */
  totalSupply = 21000000;
  /**
   * Minimum fee (in sats per byte) the node accepts. In Bitcoin Core it is the value of the
   * -minrelaytxfee param multiplied by 100,000. IMPORTANT: as the code may calculate a size
   * different than the one the node will take into account, it is recommended to use a value
   * greater than the one set in the node.
   */
  minFee = new BigNumber(1.5);
}

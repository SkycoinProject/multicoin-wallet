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
}

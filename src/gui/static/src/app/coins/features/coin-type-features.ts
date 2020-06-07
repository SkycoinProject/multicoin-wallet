/**
 * Indicates which features of the app or general properties are compatible and/or valid for all
 * the coins of a specific type.
 */
export interface CoinTypeFeatures {
  /**
   * If the app can manage software wallets for the coin type.
   */
  softwareWallets: boolean;
  /**
   * If the coin type uses outputs for managing the balances.
   */
  outputs: boolean;
  /**
   * If the app can show network stats for the coin type.
   */
  networkingStats: boolean;
  /**
   * If the app can show information about the progress while the backend is synchronizing.
   */
  blockchainSyncProgress: boolean;
  /**
   * If the app can show all the pending transactions and not only the ones related to
   * the user wallets.
   */
  showAllPendingTransactions: boolean;
  /**
   * If the coin type generates coin hours.
   */
  coinHours: boolean;
  /**
   * If the coin only allows to send transactions to a single destination and does not allow
   * to select the change address.
   */
  limitedSendingOptions: boolean;
}

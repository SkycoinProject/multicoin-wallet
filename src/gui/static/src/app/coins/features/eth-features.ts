import { CoinTypeFeatures } from './coin-type-features';

export class EthFeatures implements CoinTypeFeatures {
  softwareWallets = false;
  legacySoftwareWallets = false;
  bip44SoftwareWallets = false;
  xPubSoftwareWallets = false;
  outputs = false;
  networkingStats = false;
  blockchainSyncProgress = true;
  showAllPendingTransactions = false;
  coinHours = false;
  limitedSendingOptions = true;
}

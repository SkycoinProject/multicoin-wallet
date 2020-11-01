import { CoinTypeFeatures } from './coin-type-features';

export class FiberFeatures implements CoinTypeFeatures {
  softwareWallets = true;
  legacySoftwareWallets = true;
  bip44SoftwareWallets = true;
  xPubSoftwareWallets = true;
  outputs = true;
  networkingStats = true;
  blockchainSyncProgress = true;
  showAllPendingTransactions = true;
  coinHours = true;
  limitedSendingOptions = false;
}

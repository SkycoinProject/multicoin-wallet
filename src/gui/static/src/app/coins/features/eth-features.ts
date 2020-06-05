import { CoinTypeFeatures } from './coin-type-features';

export class EthFeatures implements CoinTypeFeatures {
  softwareWallets = false;
  outputs = false;
  networkingStats = false;
  showAllPendingTransactions = false;
  coinHours = false;
  limitedSendingOptions = true;
}

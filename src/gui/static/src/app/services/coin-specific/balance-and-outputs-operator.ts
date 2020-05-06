import { Observable } from 'rxjs';

import { WalletWithBalance, WalletBase, WalletWithOutputs } from '../wallet-operations/wallet-objects';
import { Output } from '../wallet-operations/transaction-objects';

/**
 * Interface with the elements the operators for BalanceAndOutputsService must have.
 * Much of it is similar to BalanceAndOutputsService, so you can find more info in that class.
 */
export interface BalanceAndOutputsOperator {
  // Properties for getting access to general info. Documented on the service.
  lastBalancesUpdateTime: Observable<Date>;
  walletsWithBalance: Observable<WalletWithBalance[]>;
  hasPendingTransactions: Observable<boolean>;
  firstFullUpdateMade: Observable<boolean>;
  hadErrorRefreshingBalance: Observable<boolean>;
  refreshingBalance: Observable<boolean>;
  outputsWithWallets: Observable<WalletWithOutputs[]>;

  /**
   * Makes the operator close all observables and run cleaning procedures. Must be called when
   * the operator is going to be replaced.
   */
  dispose(): void;

  // Functions related to the balance and the outputs. Documented on the service.
  getOutputs(addresses: string): Observable<Output[]>;
  getWalletUnspentOutputs(wallet: WalletBase): Observable<Output[]>;
  refreshBalance(): void;
}

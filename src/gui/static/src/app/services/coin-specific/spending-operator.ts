import { Observable } from 'rxjs';

import { WalletBase } from '../wallet-operations/wallet-objects';
import { GeneratedTransaction, Output } from '../wallet-operations/transaction-objects';
import { TransactionDestination, HoursDistributionOptions, RecommendedFees } from '../wallet-operations/spending.service';

/**
 * Interface with the elements the operators for SpendingService must have.
 * Much of it is similar to SpendingService, so you can find more info in that class.
 */
export interface SpendingOperator {
  /**
   * Makes the operator close all observables and run cleaning procedures. Must be called when
   * the operator is going to be replaced.
   */
  dispose();

  // Functions for creating and sending transactions. Documented on the service.
  createTransaction(
    wallet: WalletBase|null,
    addresses: string[]|null,
    unspents: Output[]|null,
    destinations: TransactionDestination[],
    hoursDistributionOptions: HoursDistributionOptions,
    changeAddress: string|null,
    password: string|null,
    unsigned: boolean,
    fee: string): Observable<GeneratedTransaction>;

  signTransaction(
    wallet: WalletBase,
    password: string|null,
    transaction: GeneratedTransaction,
    rawTransactionString?): Observable<string>;

  injectTransaction(encodedTx: string, note: string|null): Observable<boolean>;

  getCurrentRecommendedFees(): Observable<RecommendedFees>;
}

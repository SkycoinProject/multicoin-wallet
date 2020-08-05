import { Observable } from 'rxjs';

/**
 * Interface with the elements the operators for WalletUtilsService must have.
 * Much of it is similar to WalletUtilsService, so you can find more info in that class.
 */
export interface WalletUtilsOperator {
  /**
   * Makes the operator close all observables and run cleaning procedures. Must be called when
   * the operator is going to be replaced.
   */
  dispose(): void;

  // Functions with utils related to the wallets. Documented on the service.
  verifyAddress(address: string): Observable<boolean>;
}

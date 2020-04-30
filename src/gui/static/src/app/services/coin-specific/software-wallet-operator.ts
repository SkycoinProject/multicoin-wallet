import { Observable } from 'rxjs';

import { WalletBase } from '../wallet-operations/wallet-objects';
import { SeedResponse } from '../wallet-operations/software-wallet.service';

/**
 * Interface with the elements the operators for SoftwareWalletService must have.
 * Much of it is similar to SoftwareWalletService, so you can find more info in that class.
 */
export interface SoftwareWalletOperator {
  /**
   * Makes the operator close all observables and run cleaning procedures. Must be called when
   * the operator is going to be replaced.
   */
  dispose();

  // Functions for the software wallets. Documented on the service.
  renameWallet(wallet: WalletBase, label: string): Observable<void>;
  toggleEncryption(wallet: WalletBase, password: string): Observable<void>;
  resetPassword(wallet: WalletBase, seed: string, password: string, passphrase: string): Observable<void>;
  getWalletSeed(wallet: WalletBase, password: string): Observable<SeedResponse>;
}

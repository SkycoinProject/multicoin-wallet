import { Observable } from 'rxjs';
import { Injectable } from '@angular/core';

import { WalletBase, WalletTypes } from './wallet-objects';
import { SoftwareWalletOperator } from '../coin-specific/software-wallet-operator';
import { OperatorService } from '../operators.service';

export interface SeedResponse {
  seed: String;
  passphrase: String;
  walletType: WalletTypes;
}

/**
 * Allows to perform operations related to a software wallet.
 */
@Injectable()
export class SoftwareWalletService {
  /**
   * Instance with the actual code for making most of the operations of this service. It is
   * specific for the currently selected coin.
   */
  private operator: SoftwareWalletOperator;

  constructor(operatorService: OperatorService) {
    // Maintain the operator updated.
    operatorService.currentOperators.subscribe(operators => {
      if (operators) {
        this.operator = operators.softwareWalletOperator;
      } else {
        this.operator = null;
      }
    });
  }

  /**
   * Allows to change the name or label which identifies a wallet.
   * @param wallet Wallet to modify.
   * @param label New name or label.
   * @returns The returned observable returns nothing, but it can fail in case of error.
   */
  renameWallet(wallet: WalletBase, label: string): Observable<void> {
    return this.operator.renameWallet(wallet, label);
  }

  /**
   * Makes an encrypted wallet to be unencrypted, or an unencrypted wallet to be encrypted.
   * @param wallet Wallet to modify.
   * @param password If the wallet is encrypted, the password of the wallet, to be able to
   * disable the encryptation. If the wallet is unencrypted, the password that will be used
   * for encrypting it.
   * @returns The returned observable returns nothing, but it can fail in case of error.
   */
  toggleEncryption(wallet: WalletBase, password: string): Observable<void> {
    return this.operator.toggleEncryption(wallet, password);
  }

  /**
   * Removes or changes the password of an encrypted wallet.
   * @param wallet Wallet to modify.
   * @param seed Seed of the wallet.
   * @param password New password for the wallet. If empty or null, the wallet will be
   * unencrypted after finishing the operation.
   */
  resetPassword(wallet: WalletBase, seed: string, password: string, passphrase: string): Observable<void> {
    return this.operator.resetPassword(wallet, seed, password, passphrase);
  }

  /**
   * Gets the seed of an encrypted wallet.
   * @param wallet Wallet to get the seed from.
   * @param password Wallet password.
   */
  getWalletSeed(wallet: WalletBase, password: string): Observable<SeedResponse> {
    return this.operator.getWalletSeed(wallet, password);
  }
}

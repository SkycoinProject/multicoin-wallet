import { Observable, Subscription } from 'rxjs';
import { map, filter, first } from 'rxjs/operators';
import { Injector } from '@angular/core';

import { WalletBase } from '../../wallet-operations/wallet-objects';
import { Coin } from '../../../coins/coin';
import { SoftwareWalletOperator } from '../software-wallet-operator';
import { SeedResponse } from '../../wallet-operations/software-wallet.service';
import { FiberApiService } from '../../api/fiber-api.service';
import { WalletsAndAddressesOperator } from '../wallets-and-addresses-operator';
import { OperatorService } from '../../operators.service';

/**
 * Operator for SoftwareWalletService to be used with Fiber coins.
 *
 * NOTE: The compatibility with coins not being managed by the local node is extremely limited
 * at this time.
 *
 * You can find more information about the functions and properties this class implements by
 * checking SoftwareWalletOperator and SoftwareWalletService.
 */
export class FiberSoftwareWalletOperator implements SoftwareWalletOperator {
  // Coin the current instance will work with.
  private currentCoin: Coin;

  private operatorsSubscription: Subscription;

  // Services and operators used by this operator.
  private fiberApiService: FiberApiService;
  private walletsAndAddressesOperator: WalletsAndAddressesOperator;

  constructor(injector: Injector, currentCoin: Coin) {
    // Get the services.
    this.fiberApiService = injector.get(FiberApiService);

    // Get the operators.
    this.operatorsSubscription = injector.get(OperatorService).currentOperators.pipe(filter(operators => !!operators), first()).subscribe(operators => {
      this.walletsAndAddressesOperator = operators.walletsAndAddressesOperator;
    });

    this.currentCoin = currentCoin;
  }

  dispose() {
    this.operatorsSubscription.unsubscribe();
  }

  renameWallet(wallet: WalletBase, label: string): Observable<void> {
    return this.fiberApiService.post(this.currentCoin.nodeUrl, 'wallet/update', { id: wallet.id, label: label }).pipe(map(() => {
      wallet.label = label;
      this.walletsAndAddressesOperator.informValuesUpdated(wallet);
    }));
  }

  toggleEncryption(wallet: WalletBase, password: string): Observable<void> {
    return this.fiberApiService.post(this.currentCoin.nodeUrl, 'wallet/' + (wallet.encrypted ? 'decrypt' : 'encrypt'), { id: wallet.id, password }).pipe(map(w => {
      wallet.encrypted = w.meta.encrypted;
      this.walletsAndAddressesOperator.informValuesUpdated(wallet);
    }));
  }

  resetPassword(wallet: WalletBase, seed: string, password: string, passphrase: string): Observable<void> {
    const params = new Object();
    params['id'] = wallet.id;
    params['seed'] = seed;
    if (password) {
      params['password'] = password;
    }
    if (passphrase) {
      params['seed_passphrase'] = passphrase;
    }

    return this.fiberApiService.post(this.currentCoin.nodeUrl, 'wallet/recover', params, {useV2: true}).pipe(map(w => {
      wallet.encrypted = w.data.meta.encrypted;
      this.walletsAndAddressesOperator.informValuesUpdated(wallet);
    }));
  }

  getWalletSeed(wallet: WalletBase, password: string): Observable<SeedResponse> {
    return this.fiberApiService.post(this.currentCoin.nodeUrl, 'wallet/seed', { id: wallet.id, password }).pipe(map(response => {
      return {
        seed: response.seed,
        passphrase: response.seed_passphrase,
        walletType: wallet.walletType,
      };
    }));
  }
}

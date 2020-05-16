import { of, Observable, Subscription } from 'rxjs';
import { first, mergeMap, filter, map } from 'rxjs/operators';
import { Injector } from '@angular/core';
import BigNumber from 'bignumber.js';

import { StorageService } from '../../storage.service';
import { WalletBase } from '../../wallet-operations/wallet-objects';
import { OldTransaction } from '../../wallet-operations/transaction-objects';
import { Coin } from '../../../coins/coin';
import { PendingTransactionsResponse, AddressesHistoryResponse, PendingTransactionData } from '../../wallet-operations/history.service';
import { HistoryOperator } from '../history-operator';
import { WalletsAndAddressesOperator } from '../wallets-and-addresses-operator';
import { OperatorService } from '../../operators.service';
import { BtcApiService } from '../../api/btc-api.service';

/**
 * Operator for HistoryService to be used with eth-like coins.
 *
 * NOTE: still under heavy development.
 *
 * You can find more information about the functions and properties this class implements by
 * checking HistoryOperator and HistoryService.
 */
export class EthHistoryOperator implements HistoryOperator {
  // Coin the current instance will work with.
  private currentCoin: Coin;

  private operatorsSubscription: Subscription;

  // Services and operators used by this operator.
  private btcApiService: BtcApiService;
  private storageService: StorageService;
  private walletsAndAddressesOperator: WalletsAndAddressesOperator;

  constructor(injector: Injector, currentCoin: Coin) {
    // Get the services.
    this.btcApiService = injector.get(BtcApiService);
    this.storageService = injector.get(StorageService);

    // Get the operators.
    this.operatorsSubscription = injector.get(OperatorService).currentOperators.pipe(filter(operators => !!operators), first()).subscribe(operators => {
      this.walletsAndAddressesOperator = operators.walletsAndAddressesOperator;
    });

    this.currentCoin = currentCoin;
  }

  dispose() {
    this.operatorsSubscription.unsubscribe();
  }

  getTransactionsHistory(wallet: WalletBase|null): Observable<OldTransaction[]> {
    return of([]);
  }

  getPendingTransactions(): Observable<PendingTransactionsResponse> {
    return null;
  }

  getAddressesHistory(wallet: WalletBase): Observable<AddressesHistoryResponse> {
    return null;
  }
}

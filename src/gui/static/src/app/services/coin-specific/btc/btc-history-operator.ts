import { of, Observable, Subscription } from 'rxjs';
import { first, mergeMap, filter, map } from 'rxjs/operators';
import { Injector } from '@angular/core';
import BigNumber from 'bignumber.js';

import { StorageService } from '../../storage.service';
import { WalletBase } from '../../wallet-operations/wallet-objects';
import { OldTransaction } from '../../wallet-operations/transaction-objects';
import { Coin } from '../../../coins/coin';
import { getTransactionsHistory, recursivelyGetTransactions } from './utils/history-utils';
import { PendingTransactionsResponse, AddressesHistoryResponse, PendingTransactionData } from '../../wallet-operations/history.service';
import { HistoryOperator } from '../history-operator';
import { WalletsAndAddressesOperator } from '../wallets-and-addresses-operator';
import { OperatorService } from '../../operators.service';
import { BtcApiService } from '../../api/btc-api.service';

/**
 * Operator for HistoryService to be used with btc-like coins.
 *
 * NOTE: still under heavy development.
 *
 * You can find more information about the functions and properties this class implements by
 * checking HistoryOperator and HistoryService.
 */
export class BtcHistoryOperator implements HistoryOperator {
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
    // Use the provided wallet or get all wallets.
    let initialRequest: Observable<WalletBase[]>;
    if (wallet) {
      initialRequest = of([wallet]);
    } else {
      initialRequest = this.walletsAndAddressesOperator.currentWallets;
    }

    // Get the history.
    return initialRequest.pipe(first(), mergeMap(wallets => {
      return getTransactionsHistory(this.currentCoin, wallets, this.btcApiService, this.storageService);
    }));
  }

  getPendingTransactions(): Observable<PendingTransactionsResponse> {
    return this.walletsAndAddressesOperator.currentWallets.pipe(first(), mergeMap(wallets => {
      // Allows to avoid repeating addresses.
      const addressesMap = new Map<string, boolean>();

      // Get all the addresses of the wallets.
      const addresses: string[] = [];
      wallets.forEach(w => {
        w.addresses.map(add => {
          if (!addressesMap.has(add.address)) {
            addresses.push(add.address);
            addressesMap.set(add.address, true);
          }
        });
      });

      // Get the full history.
      return recursivelyGetTransactions(this.currentCoin, this.btcApiService, addresses);
    }), map(transactions => {
      // Get only the pending transactions.
      transactions = transactions.filter(tx => !tx.confirmations || tx.confirmations < this.currentCoin.confirmationsNeeded);

      return {
        user: transactions.map(tx => this.processTransactionData(tx)).sort((a, b) => b.confirmations - a.confirmations),
        all: [],
      };
    }));
  }

  getAddressesHistory(wallet: WalletBase): Observable<AddressesHistoryResponse> {
    return null;
  }

  /**
   * Converts a pending transaction returned by the server to a PendingTransactionData instance.
   * @param transaction Transaction returned by the server.
   */
  private processTransactionData(transaction: any): PendingTransactionData {
    let coins = new BigNumber('0');
    transaction.vout.map(output => {
      coins = coins.plus(output.value);
    });

    return {
      coins: coins.toString(),
      hours: '0',
      timestamp: transaction.time ? transaction.time : null,
      id: transaction.txid,
      confirmations: transaction.confirmations ? transaction.confirmations : 0,
    };
  }
}

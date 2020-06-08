import { of, Observable, throwError, Subscription } from 'rxjs';
import { first, mergeMap, map, filter, switchMap } from 'rxjs/operators';
import { Injector } from '@angular/core';
import { BigNumber } from 'bignumber.js';

import * as moment from 'moment';

import { StorageService } from '../../storage.service';
import { WalletBase, WalletWithBalance, WalletTypes } from '../../wallet-operations/wallet-objects';
import { OldTransaction } from '../../wallet-operations/transaction-objects';
import { Coin } from '../../../coins/coin';
import { getTransactionsHistory, getIfAddressesUsed } from './utils/fiber-history-utils';
import { PendingTransactionsResponse, AddressesHistoryResponse, AddressesState, PendingTransactionData, TransactionHistory } from '../../wallet-operations/history.service';
import { HistoryOperator } from '../history-operator';
import { FiberApiService } from '../../api/fiber-api.service';
import { WalletsAndAddressesOperator } from '../wallets-and-addresses-operator';
import { BalanceAndOutputsOperator } from '../balance-and-outputs-operator';
import { OperatorService } from '../../operators.service';

/**
 * Operator for HistoryService to be used with Fiber coins.
 *
 * NOTE: The compatibility with coins not being managed by the local node is extremely limited
 * at this time.
 *
 * You can find more information about the functions and properties this class implements by
 * checking HistoryOperator and HistoryService.
 */
export class FiberHistoryOperator implements HistoryOperator {
  // Coin the current instance will work with.
  private currentCoin: Coin;

  private operatorsSubscription: Subscription;

  // Services and operators used by this operator.
  private fiberApiService: FiberApiService;
  private storageService: StorageService;
  private walletsAndAddressesOperator: WalletsAndAddressesOperator;
  private balanceAndOutputsOperator: BalanceAndOutputsOperator;

  constructor(injector: Injector, currentCoin: Coin) {
    // Get the services.
    this.fiberApiService = injector.get(FiberApiService);
    this.storageService = injector.get(StorageService);

    // Get the operators.
    this.operatorsSubscription = injector.get(OperatorService).currentOperators.pipe(filter(operators => !!operators), first()).subscribe(operators => {
      this.walletsAndAddressesOperator = operators.walletsAndAddressesOperator;
      this.balanceAndOutputsOperator = operators.balanceAndOutputsOperator;
    });

    this.currentCoin = currentCoin;
  }

  dispose() {
    this.operatorsSubscription.unsubscribe();
  }

  getIfAddressesUsed(wallet: WalletBase): Observable<Map<string, boolean>> {
    return getIfAddressesUsed(this.currentCoin, wallet, this.fiberApiService, this.storageService);
  }

  getTransactionsHistory(wallet: WalletBase|null): Observable<TransactionHistory> {
    // Use the provided wallet or get all wallets.
    let initialRequest: Observable<WalletBase[]>;
    if (wallet) {
      initialRequest = of([wallet]);
    } else {
      initialRequest = this.walletsAndAddressesOperator.currentWallets;
    }

    // Get the history.
    return initialRequest.pipe(first(), mergeMap(wallets => {
      return getTransactionsHistory(this.currentCoin, wallets, this.fiberApiService, this.storageService);
    }), map(transactions => {
      const response: TransactionHistory = {
        transactions: transactions,
        // This operator always returns the complete history.
        hasMore: false,
      };

      return response;
    }));
  }

  getPendingTransactions(): Observable<PendingTransactionsResponse> {
    return this.fiberApiService.get(this.currentCoin.nodeUrl, 'pendingTxs', { verbose: true }).pipe(
      mergeMap((transactions: any[]) => {
        // Default response if no transactions were found.
        if (transactions.length === 0) {
          return of({
            user: [],
            all: [],
          });
        }

        return this.walletsAndAddressesOperator.currentWallets.pipe(first(), map((wallets: WalletBase[]) => {
          const walletAddresses = new Set<string>();
          wallets.forEach(wallet => {
            wallet.addresses.forEach(address => walletAddresses.add(address.address));
          });

          // Build an array with the transactions affecting the user.
          const userTransactions = transactions.filter(tran => {
            return tran.transaction.inputs.some(input => walletAddresses.has(input.owner)) ||
              tran.transaction.outputs.some(output => walletAddresses.has(output.dst));
          });

          return {
            user: userTransactions.map(tx => this.processTransactionData(tx)).sort((a, b) => b.timestamp - a.timestamp),
            all: transactions.map(tx => this.processTransactionData(tx)).sort((a, b) => b.timestamp - a.timestamp),
          };
        }));
      }));
  }

  getAddressesHistory(wallet: WalletBase): Observable<AddressesHistoryResponse> {
    if (wallet.walletType === WalletTypes.Deterministic) {
      return throwError('Invalid wallet.');
    }

    // Local object with the data of the requested wallet and its balance.
    let currentWallet: WalletWithBalance;
    // Response returned by the node when asked for the details of the requested wallet.
    let nodeWallet;

    // Get data about the wallet.
    return this.balanceAndOutputsOperator.firstFullUpdateMade.pipe(filter(response => response), switchMap(() => {
      return this.balanceAndOutputsOperator.walletsWithBalance;
    }), switchMap(response => {
      currentWallet = response.find(w => w.id === wallet.id);
      if (!currentWallet) {
        return throwError('Invalid wallet.');
      }

      return this.fiberApiService.get(this.currentCoin.nodeUrl, 'wallet', { id: wallet.id });
    }), switchMap(response => {
      nodeWallet = response;
      if (!nodeWallet || !nodeWallet.entries) {
        return throwError('Invalid wallet.');
      }

      return this.getIfAddressesUsed(wallet);
    }), map(usedMap => {
      // Create a map with all the addresses the node says the wallet has.
      const nodeAddressMap = new Map<string, any>();
      (nodeWallet.entries as any[]).forEach(currentAddress => {
        nodeAddressMap.set(currentAddress.address, currentAddress);
      });

      const finalResponse: AddressesHistoryResponse = {
        externalAddresses: [],
        changeAddresses: [],
        omitedAddresses: false,
      };

      currentWallet.addresses.forEach(currentAddress => {
        // Create a response object for the current address.
        const processedAddress: AddressesState = {
          address: currentAddress,
          indexInWallet: nodeAddressMap.has(currentAddress.address) ? nodeAddressMap.get(currentAddress.address).child_number : 0,
          alreadyUsed: usedMap.has(currentAddress.address) && usedMap.get(currentAddress.address),
        };

        // Add the address to the appropiate array.
        if (nodeAddressMap.has(currentAddress.address)) {
          if (!nodeAddressMap.get(currentAddress.address).change || nodeAddressMap.get(currentAddress.address).change === 0) {
            finalResponse.externalAddresses.push(processedAddress);
          } else if (nodeAddressMap.get(currentAddress.address).change === 1) {
            finalResponse.changeAddresses.push(processedAddress);
          } else {
            finalResponse.omitedAddresses = true;
          }
        } else {
          finalResponse.omitedAddresses = true;
        }
      });

      return finalResponse;
    }));
  }

  /**
   * Converts a pending transaction returned by the server to a PendingTransactionData instance.
   * @param transaction Transaction returned by the server.
   */
  private processTransactionData(transaction: any): PendingTransactionData {
    let coins = new BigNumber('0');
    let hours = new BigNumber('0');
    transaction.transaction.outputs.map(output => {
      coins = coins.plus(output.coins);
      hours = hours.plus(output.hours);
    });

    return {
      coins: coins.toString(),
      hours: hours.toString(),
      timestamp: moment(transaction.received).unix(),
      id: transaction.transaction.txid,
      confirmations: 0,
    };
  }
}

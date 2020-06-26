import { of, Observable, Subscription } from 'rxjs';
import { first, mergeMap, filter, map } from 'rxjs/operators';
import { Injector } from '@angular/core';
import BigNumber from 'bignumber.js';

import { StorageService } from '../../storage.service';
import { WalletBase } from '../../wallet-operations/wallet-objects';
import { Coin } from '../../../coins/coin';
import { PendingTransactionsResponse, AddressesHistoryResponse, PendingTransactionData, TransactionHistory, TransactionLimits } from '../../wallet-operations/history.service';
import { HistoryOperator } from '../history-operator';
import { WalletsAndAddressesOperator } from '../wallets-and-addresses-operator';
import { OperatorService } from '../../operators.service';
import { BlockbookApiService } from '../../api/blockbook-api.service';
import { recursivelyGetTransactions, getTransactionsHistory } from './utils/eth-history-utils';
import { EthCoinConfig } from '../../../coins/coin-type-configs/eth.coin-config';
import { AppConfig } from '../../../app.config';

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
  private blockbookApiService: BlockbookApiService;
  private storageService: StorageService;
  private walletsAndAddressesOperator: WalletsAndAddressesOperator;

  constructor(injector: Injector, currentCoin: Coin) {
    // Get the services.
    this.blockbookApiService = injector.get(BlockbookApiService);
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

  getIfAddressesUsed(wallet: WalletBase): Observable<Map<string, boolean>> {
    const addresses = wallet.addresses.map(address => address.address);

    return this.recursivelyGetIfAddressesUsed(addresses);
  }

  /**
   * Checks the provided addresses and returns a map indicating which ones have been used,
   * defined as having received coins.
   * @param addresses Addresses to check. The list will be altered by the function.
   * @param currentElements Already obtained data. For internal use.
   */
  private recursivelyGetIfAddressesUsed(addresses: string[], currentElements = new Map<string, boolean>()): Observable<Map<string, boolean>> {
    if (addresses.length === 0) {
      return of(currentElements);
    }

    // Get the information of the address.
    this.blockbookApiService.get(this.currentCoin.indexerUrl, 'address/' + addresses[addresses.length - 1], {details: 'basic'})
      .pipe(mergeMap((response) => {
        // Check is the address has received coins.
        currentElements.set(addresses[addresses.length - 1], response.totalReceived && new BigNumber(response.totalReceived).isGreaterThan(0));

        addresses.pop();

        if (addresses.length === 0) {
          return of(currentElements);
        }

        // Continue to the next step.
        return this.recursivelyGetIfAddressesUsed(addresses, currentElements);
      }));
  }

  getTransactionsHistory(wallet: WalletBase|null, transactionLimitperAddress: TransactionLimits): Observable<TransactionHistory> {
    // Use the provided wallet or get all wallets.
    let initialRequest: Observable<WalletBase[]>;
    if (wallet) {
      initialRequest = of([wallet]);
    } else {
      initialRequest = this.walletsAndAddressesOperator.currentWallets;
    }

    // Get the history.
    return initialRequest.pipe(first(), mergeMap(wallets => {
      return getTransactionsHistory(this.currentCoin, wallets, transactionLimitperAddress, this.blockbookApiService, this.storageService);
    }));
  }

  getPendingTransactions(): Observable<PendingTransactionsResponse> {
    let wallets: WalletBase[];

    return this.walletsAndAddressesOperator.currentWallets.pipe(first(), mergeMap(response => {
      wallets = response;

      // Get the basic backend info to know the number of the lastest block.
      return this.blockbookApiService.get(this.currentCoin.indexerUrl, 'api');
    }), mergeMap(generalData => {
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

      // Calculate how many transactions to get per address.
      const hasManyAddresses = addresses.length > AppConfig.fewAddressesLimit;
      const transactionsToGet = hasManyAddresses ? AppConfig.maxTxPerAddressIfManyAddresses : AppConfig.maxTxPerAddressIfFewAddresses;

      // Determine the initial block to get only the pending transactions.
      const startingBlock = generalData.blockbook.bestHeight - (this.currentCoin.confirmationsNeeded - 1);

      // Get the history.
      return recursivelyGetTransactions(this.currentCoin, this.blockbookApiService, addresses, transactionsToGet, startingBlock);
    }), map(response => {
      // Security measure for race conditions, as 2 request were made.
      response.transactions = response.transactions.filter(tx => !tx.confirmations || tx.confirmations < this.currentCoin.confirmationsNeeded);

      return {
        user: response.transactions.map(tx => this.processTransactionData(tx)).sort((a, b) => b.confirmations - a.confirmations),
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
    // Value which will allow to get the value in coins, instead of sats.
    const decimalsCorrector = new BigNumber(10).exponentiatedBy((this.currentCoin.config as EthCoinConfig).decimals);

    let coins = new BigNumber('0');
    transaction.vout.map(output => {
      coins = coins.plus(new BigNumber(output.value).dividedBy(decimalsCorrector));
    });

    return {
      coins: coins.toString(),
      timestamp: transaction.blockTime ? transaction.blockTime : null,
      id: transaction.txid,
      confirmations: transaction.confirmations ? transaction.confirmations : 0,
    };
  }
}

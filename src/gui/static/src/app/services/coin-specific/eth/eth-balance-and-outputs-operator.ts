import { of, Observable, ReplaySubject, Subscription, BehaviorSubject, forkJoin } from 'rxjs';
import { NgZone, Injector } from '@angular/core';
import { mergeMap, map, delay, tap, first, filter } from 'rxjs/operators';
import BigNumber from 'bignumber.js';

import { WalletWithBalance, walletWithBalanceFromBase, WalletBase, WalletWithOutputs } from '../../wallet-operations/wallet-objects';
import { Output } from '../../wallet-operations/transaction-objects';
import { Coin } from '../../../coins/coin';
import { BalanceAndOutputsOperator } from '../balance-and-outputs-operator';
import { OperatorService } from '../../operators.service';
import { EthCoinConfig } from '../../../coins/config/eth.coin-config';
import { BlockbookApiService } from '../../api/blockbook-api.service';

/**
 * Balance of a wallet, for internal use.
 */
class WalletBalance {
  current = new BigNumber(0);
  predicted = new BigNumber(0);
  available = new BigNumber(0);
  addresses = new Map<string, AddressBalance>();
}

/**
 * Balance of an address, for internal use.
 */
class AddressBalance {
  current = new BigNumber(0);
  predicted = new BigNumber(0);
  available = new BigNumber(0);
}

/**
 * Operator for BalanceAndOutputsService to be used with eth-like coins.
 *
 * NOTE: eth-like coins don't use outputs.
 *
 * You can find more information about the functions and properties this class implements by
 * checking BalanceAndOutputsOperator and BalanceAndOutputsService.
 */
export class EthBalanceAndOutputsOperator implements BalanceAndOutputsOperator {
  // The list of wallets with balance and the subject used for informing when the list has been modified.
  private walletsWithBalanceList: WalletWithBalance[];
  private walletsWithBalanceSubject: ReplaySubject<WalletWithBalance[]> = new ReplaySubject<WalletWithBalance[]>(1);

  // Subject for providing information in the getters below.
  private lastBalancesUpdateTimeSubject: ReplaySubject<Date> = new ReplaySubject<Date>(1);
  private hasPendingTransactionsSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  private firstFullUpdateMadeSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  private hadErrorRefreshingBalanceSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  private refreshingBalanceSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  private dataRefreshSubscription: Subscription;
  private walletsSubscription: Subscription;
  private operatorsSubscription: Subscription;

  /**
   * Time interval in which periodic data updates will be made.
   */
  private updatePeriod = 10 * 1000;
  /**
   * Time interval in which the periodic data updates will be restarted after an error.
   */
  private errorUpdatePeriod = 2 * 1000;

  /**
   * After the service retrieves the balance of each wallet, the balance returned
   * by the backend for each wallet is saved here, accessible via the wallet id.
   */
  private savedBalanceData = new Map<string, WalletBalance>();
  /**
   * Temporal map for updating savedBalanceData only after retrieving the data of all wallets,
   * to avoid problems when the balance update procedure is cancelled early.
   */
  private temporalSavedBalanceData = new Map<string, WalletBalance>();
  /**
   * Saves the lastest, most up to date, wallet list obtained from the wallets service.
   */
  private savedWalletsList: WalletBase[];

  // Coin the current instance will work with.
  private currentCoin: Coin;

  // Services and operators used by this operator.
  private blockbookApiService: BlockbookApiService;
  private ngZone: NgZone;

  constructor(injector: Injector, currentCoin: Coin) {
    // Get the services.
    this.blockbookApiService = injector.get(BlockbookApiService);
    this.ngZone = injector.get(NgZone);

    // Intervals for updating the data must be longer if connecting to a remote backend.
    if (!currentCoin.isLocal) {
      this.updatePeriod = 600 * 1000;
      this.errorUpdatePeriod = 60 * 1000;
    }

    // Get the operators and only then start using them.
    this.operatorsSubscription = injector.get(OperatorService).currentOperators.pipe(filter(operators => !!operators), first()).subscribe(operators => {
      // Update the balance immediately each time the wallets are updated.
      this.walletsSubscription = operators.walletsAndAddressesOperator.currentWallets.subscribe(wallets => {
        this.savedWalletsList = wallets;
        this.startDataRefreshSubscription(0, true);
      });
    });

    this.currentCoin = currentCoin;
  }

  dispose() {
    this.operatorsSubscription.unsubscribe();
    if (this.walletsSubscription) {
      this.walletsSubscription.unsubscribe();
    }
    if (this.dataRefreshSubscription) {
      this.dataRefreshSubscription.unsubscribe();
    }

    this.lastBalancesUpdateTimeSubject.complete();
    this.walletsWithBalanceSubject.complete();
    this.hasPendingTransactionsSubject.complete();
    this.firstFullUpdateMadeSubject.complete();
    this.hadErrorRefreshingBalanceSubject.complete();
    this.refreshingBalanceSubject.complete();
  }

  get lastBalancesUpdateTime(): Observable<Date> {
    return this.lastBalancesUpdateTimeSubject.asObservable();
  }

  get walletsWithBalance(): Observable<WalletWithBalance[]> {
    return this.walletsWithBalanceSubject.asObservable();
  }

  get hasPendingTransactions(): Observable<boolean> {
    return this.hasPendingTransactionsSubject.asObservable();
  }

  get firstFullUpdateMade(): Observable<boolean> {
    return this.firstFullUpdateMadeSubject.asObservable();
  }

  get hadErrorRefreshingBalance(): Observable<boolean> {
    return this.hadErrorRefreshingBalanceSubject.asObservable();
  }

  get refreshingBalance(): Observable<boolean> {
    return this.refreshingBalanceSubject.asObservable();
  }

  get outputsWithWallets(): Observable<WalletWithOutputs[]> {
    return of([]);
  }

  getOutputs(addresses: string): Observable<Output[]> {
    return of([]);
  }

  getWalletUnspentOutputs(wallet: WalletBase): Observable<Output[]> {
    return of([]);
  }

  refreshBalance() {
    this.startDataRefreshSubscription(0, false);
  }

  /**
   * Makes the service start updating the balance periodically. If this function was called
   * before, the previous updating procedure is cancelled.
   * @param delayMs Delay before starting to update the balance.
   * @param updateWalletsFirst If true, after the delay the function will inmediatelly update
   * the wallet list with the data on savedWalletsList and using the last balance data obtained
   * from the backend (or will set all the wallets to 0, if no data exists) and only after that
   * will try to get the balance data from the backend and update the wallet list again. This
   * allows to inmediatelly reflect changes made to the wallet list, without having to wait for
   * the backend to respond.
   */
  private startDataRefreshSubscription(delayMs: number, updateWalletsFirst: boolean) {
    if (this.dataRefreshSubscription) {
      this.dataRefreshSubscription.unsubscribe();
    }

    if (this.savedWalletsList) {
      this.ngZone.runOutsideAngular(() => {
        this.dataRefreshSubscription = of(0).pipe(delay(delayMs), mergeMap(() => {
          // Inform the balance is being updated.
          this.ngZone.run(() => {
            this.refreshingBalanceSubject.next(true);
          });

          // Update the wallet list with the last saved data, if requested.
          if (updateWalletsFirst) {
            return this.refreshBalances(this.savedWalletsList, true);
          } else {
            return of(0);
          }
        }), mergeMap(() => {
          // Refresh the balance.
          return this.refreshBalances(this.savedWalletsList, false);
        })).subscribe(
          () => {
            this.ngZone.run(() => {
              this.hadErrorRefreshingBalanceSubject.next(false);
              this.refreshingBalanceSubject.next(false);
            });

            // Repeat the operation after a delay.
            this.startDataRefreshSubscription(this.updatePeriod, false);
          },
          () => {
            this.ngZone.run(() => {
              this.hadErrorRefreshingBalanceSubject.next(true);
              this.refreshingBalanceSubject.next(false);
            });

            // Repeat the operation after a delay.
            this.startDataRefreshSubscription(this.errorUpdatePeriod, false);
          },
        );
      });
    }
  }

  /**
   * Refreshes the wallets on walletsWithBalanceList and their balances.
   * @param wallets The current wallet lists.
   * @param forceQuickCompleteArrayUpdate If true, the balance data saved on savedBalanceData
   * will be used to set the balance of the wallet list, instead of getting the data from
   * the backend. If false, the balance data is obtained from the backend and savedBalanceData is
   * updated.
   */
  private refreshBalances(wallets: WalletBase[], forceQuickCompleteArrayUpdate: boolean): Observable<any> {
    // Create a copy of the wallet list.
    const temporalWallets: WalletWithBalance[] = [];
    wallets.forEach(wallet => {
      temporalWallets.push(walletWithBalanceFromBase(wallet));
    });

    // This will help to update savedBalanceData when finishing the procedure.
    if (!forceQuickCompleteArrayUpdate) {
      this.temporalSavedBalanceData = new Map<string, any>();
    }

    let procedure: Observable<boolean[]>;
    if (wallets.length > 0) {
      if (!forceQuickCompleteArrayUpdate) {
        procedure = this.blockbookApiService.get(this.currentCoin.indexerUrl, 'api').pipe(mergeMap(response => {
          // Get the balance of each wallet.
          return forkJoin(temporalWallets.map(wallet => this.retrieveWalletBalance(wallet, response.blockbook.bestHeight, forceQuickCompleteArrayUpdate)));
        }));
      } else {
        procedure = forkJoin(temporalWallets.map(wallet => this.retrieveWalletBalance(wallet, 0, forceQuickCompleteArrayUpdate)));
      }
    } else {
      // Create a fake response, as there are no wallets.
      procedure = of([false]);
    }

    // Calculate the balance of each wallet.
    return procedure.pipe(tap(walletHasPendingTx => {
      this.hasPendingTransactionsSubject.next(walletHasPendingTx.some(value => value));

      if (!forceQuickCompleteArrayUpdate) {
        this.ngZone.run(() => {
          this.lastBalancesUpdateTimeSubject.next(new Date());
        });
      }

      if (!this.walletsWithBalanceList || forceQuickCompleteArrayUpdate || this.walletsWithBalanceList.length !== temporalWallets.length) {
        // Update the whole list.
        this.walletsWithBalanceList = temporalWallets;
        this.informDataUpdated();
      } else {
        // If there is a change in the IDs of the wallet list, update the whole list.
        let changeDetected = false;
        this.walletsWithBalanceList.forEach((currentWallet, i) => {
          if (currentWallet.id !== temporalWallets[i].id) {
            changeDetected = true;
          }
        });

        if (changeDetected) {
          this.walletsWithBalanceList = temporalWallets;
          this.informDataUpdated();
        } else {
          // Update only the balances with changes. This allows to show updated data without
          // having to completelly replace the wallet array.
          this.walletsWithBalanceList.forEach((currentWallet, i) => {
            if (!currentWallet.coins.isEqualTo(temporalWallets[i].coins) || !currentWallet.confirmedCoins.isEqualTo(temporalWallets[i].confirmedCoins)) {
              currentWallet.coins = temporalWallets[i].coins;
              currentWallet.confirmedCoins = temporalWallets[i].confirmedCoins;
              currentWallet.availableCoins = temporalWallets[i].availableCoins;
              currentWallet.hasPendingCoins = temporalWallets[i].hasPendingCoins;

              changeDetected = true;
            }

            if (currentWallet.addresses.length !== temporalWallets[i].addresses.length) {
              currentWallet.addresses = temporalWallets[i].addresses;
              changeDetected = true;
            } else {
              currentWallet.addresses.forEach((currentAddress, j) => {
                if (!currentAddress.coins.isEqualTo(temporalWallets[i].addresses[j].coins) || !currentAddress.confirmedCoins.isEqualTo(temporalWallets[i].addresses[j].confirmedCoins)) {
                  currentAddress.coins = temporalWallets[i].addresses[j].coins;
                  currentAddress.confirmedCoins = temporalWallets[i].addresses[j].confirmedCoins;
                  currentAddress.availableCoins = temporalWallets[i].addresses[j].availableCoins;
                  currentAddress.hasPendingCoins = temporalWallets[i].addresses[j].hasPendingCoins;

                  changeDetected = true;
                }
              });
            }
          });

          // If any of the balances changed, inform that there were changes.
          if (changeDetected) {
            this.informDataUpdated();
          }
        }
      }

      if (!forceQuickCompleteArrayUpdate) {
        this.savedBalanceData = this.temporalSavedBalanceData;
        if (!this.firstFullUpdateMadeSubject.value) {
          // Inform that the service already obtained the balance from the backend for the
          // first time.
          this.ngZone.run(() => {
            this.firstFullUpdateMadeSubject.next(true);
          });
        }
      }
    }));
  }

  /**
   * Gets from the backend the balance of a wallet and uses the retrieved data to update an
   * instamce of WalletWithBalance. It also saves the retrieved data on temporalSavedBalanceData.
   * @param wallet Wallet to update.
   * @param lastBlock Number of the last block on the blockchain. Used only if
   * useSavedBalanceData is true.
   * @param useSavedBalanceData If true, the balance data saved on savedBalanceData
   * will be used instead of retrieving the data from the backend.
   * @returns True if there are one or more pending transactions that will affect the balance of
   * the provided walled, false otherwise. If useSavedBalanceData is true, the value of
   * hasPendingTransactionsSubject will be returned.
   */
  private retrieveWalletBalance(wallet: WalletWithBalance, lastBlock: number, useSavedBalanceData: boolean): Observable<boolean> {
    let query: Observable<WalletBalance>;

    if (!useSavedBalanceData) {
      // Get the balance of all addresses.
      const addresses = wallet.addresses.map(a => a.address);
      query = this.recursivelyGetBalances(addresses, lastBlock).pipe(mergeMap(result => {
        const response = new WalletBalance();

        result.forEach((addressBalance, address) => {
          // Add the values to the balance of the wallet.
          response.addresses.set(address, addressBalance);
          response.current = response.current.plus(addressBalance.current);
          response.predicted = response.predicted.plus(addressBalance.predicted);
          response.available = response.available.plus(addressBalance.available);
        });

        return of(response);
      }));
    } else {
      // Get the balance from the saved data, if possible.
      if (this.savedBalanceData.has(wallet.id)) {
        query = of(this.savedBalanceData.get(wallet.id));
      } else {
        query = of(new WalletBalance());
      }
    }

    // Add the values to the wallet object.
    return query.pipe(map(balance => {
      this.temporalSavedBalanceData.set(wallet.id, balance);

      wallet.coins = balance.predicted;
      wallet.confirmedCoins = balance.current;
      wallet.availableCoins = balance.available;
      wallet.hasPendingCoins = !wallet.coins.isEqualTo(wallet.confirmedCoins);

      wallet.addresses.forEach(address => {
        if (balance.addresses.has(address.address)) {
          address.coins = balance.addresses.get(address.address).predicted;
          address.confirmedCoins = balance.addresses.get(address.address).current;
          address.availableCoins = balance.addresses.get(address.address).available;
          address.hasPendingCoins = !address.coins.isEqualTo(address.confirmedCoins);
        } else {
          address.coins = new BigNumber(0);
          address.confirmedCoins = new BigNumber(0);
          address.availableCoins = new BigNumber(0);
          address.hasPendingCoins = false;
        }
      });

      if (!useSavedBalanceData) {
        return !balance.current.isEqualTo(balance.predicted);
      } else {
        return this.hasPendingTransactionsSubject.value;
      }
    }));
  }

  /**
   * Gets the balances of the addresses in the provided address list.
   * @param addresses Addresses to check. The list will be altered by the function.
   * @param lastBlock Number of the last block on the blockchain.
   * @param currentElements Already obtained balances. For internal use.
   * @returns Map with the balances of the provided address list.
   */
  private recursivelyGetBalances(addresses: string[], lastBlock: number, currentElements = new Map<string, AddressBalance>()): Observable<Map<string, AddressBalance>> {
    if (addresses.length === 0) {
      return of(currentElements);
    }

    const requestParams = {
      details: 'txslight',
    };

    // When requesting the balance, the transactions of the blocks considered unconfirmed
    // will be obtained too, to consider the balance moved in them as pending. This is
    // because Blockbook only considers as pending the balance in the transactions which
    // are still in the mempool.
    if (this.currentCoin.confirmationsNeeded > 1) {
      const lastUnconfirmedBlock = lastBlock - (this.currentCoin.confirmationsNeeded - 2);
      requestParams['from'] = lastUnconfirmedBlock;
    } else {
      // Get only the transactions in the mempool, as only 1 confirmation is needed.
      requestParams['from'] = -1;
    }

    // Get the balance of the address.
    return this.blockbookApiService.get(this.currentCoin.indexerUrl, 'address/' + addresses[addresses.length - 1], requestParams).pipe(mergeMap((response) => {
      // Blockbook returns in the "balance" property the balance considering all the transactions
      // already in a block and the "unconfirmedBalance" property should contain the variance
      // in the balance after confirming the transactions currently in the mempool, but this last
      // property does not work well for ETH. Because of this the balnce of the transaction
      // currently in mempool is calculated here.
      let transactionsInMempool: any[] = [];
      if (response.transactions && (response.transactions as any[]).length > 0) {
        transactionsInMempool = (response.transactions as any[]).filter(transactions => transactions.confirmations === 0);
      }
      const mempoolBalance = this.calculateBalanceFromTransactions(transactionsInMempool, addresses[addresses.length - 1]);

      // The mempool balance is added to the balance in the transactions already in blocks.
      const predicted = response.balance ? new BigNumber(response.balance).plus(mempoolBalance) : new BigNumber(0);

      // If the response has transactions, the balance in those transactions is
      // considered as unconfirmed.
      const unconfirmed = this.calculateBalanceFromTransactions(response.transactions, addresses[addresses.length - 1]);
      // Calculate the currently confirmed balance.
      const balance = predicted.minus(unconfirmed);

      // Calculate how many coins are entering the address in the pending transactions.
      const incomingBalance = this.calculateBalanceFromTransactions(response.transactions, addresses[addresses.length - 1], true);
      // The available balance is all the confirmed coins minus all coins going out.
      let available = predicted.minus(incomingBalance);
      // This prevents problems if the address sends coins to itself.
      if (available.isLessThan(0)) {
        available = new BigNumber(0);
      }

      // Value which will allow to get the balances in coins, instead of wei.
      const decimalsCorrector = new BigNumber(10).exponentiatedBy((this.currentCoin.config as EthCoinConfig).decimals);

      // Create the response object.
      currentElements.set(addresses[addresses.length - 1], {
        current: balance.dividedBy(decimalsCorrector),
        predicted: predicted.dividedBy(decimalsCorrector),
        available: available.dividedBy(decimalsCorrector),
      });

      addresses.pop();

      if (addresses.length === 0) {
        return of(currentElements);
      }

      // Continue to the next step.
      return this.recursivelyGetBalances(addresses, lastBlock, currentElements);
    }));
  }

  /**
   * Calculates the final balance of an address after several transactions, assuming that the
   * initial balance is 0.
   * @param transactions Transactions to check. Must be the array returned by Blockbook when
   * calling the "address/" API endpoint. Can be null, as the api may not return any value.
   * @param address Address to check.
   * @param onlyIncoming If true, only the balance entering the address will be taken
   * into account.
   */
  private calculateBalanceFromTransactions(transactions: any[], address: string, onlyIncoming = false): BigNumber {
    let balance = new BigNumber(0);

    if (transactions && transactions.length > 0) {
      transactions.forEach(transaction => {
        // If the input is from the current address, consider the output and fee as outgoing coins.
        if (!onlyIncoming && transaction.vin && (transaction.vin as any[]).length === 1 && (transaction.vin as any[])[0].isAddress) {
          if ((transaction.vin as any[])[0].addresses.length === 1 && (transaction.vin as any[])[0].addresses[0] === address) {
            // Only compute the balance is the transaction did not fail.
            if (transaction.ethereumSpecific.status !== 0) {
              balance = balance.minus(this.getOutputValue(transaction));
            }

            // gasUsed is not available if the transaction is still in the mempool.
            const gas = transaction.ethereumSpecific.gasUsed ? transaction.ethereumSpecific.gasUsed : transaction.ethereumSpecific.gasLimit;
            if (gas && transaction.ethereumSpecific.gasPrice) {
              balance = balance.minus(new BigNumber(gas).multipliedBy(transaction.ethereumSpecific.gasPrice));
            }
          }
        }

        // If the output is for the current address, consider the output as incoming coins.
        // Only compute the balance is the transaction did not fail.
        if (transaction.ethereumSpecific.status !== 0) {
          balance = balance.plus(this.getOutputValue(transaction, address));
        }
      });
    }

    return balance;
  }

  /**
   * Checks a transaction and returns the value of the output.
   * @param transaction Transaction to check. Must be an object returned by Blockbook when
   * calling the "address/" API endpoint.
   * @param addressFilter If provided, the value of the output will be returned only if the
   * output is for the provided address. If the output is for another address, the returned
   * value is 0.
   */
  private getOutputValue(transaction: any, addressFilter: string = null): BigNumber {
    if (transaction.vout && (transaction.vout as any[]).length === 1 && (transaction.vout as any[])[0].isAddress) {
      if (!addressFilter || ((transaction.vout as any[])[0].addresses.length === 1 && (transaction.vout as any[])[0].addresses[0] === addressFilter)) {
        if ((transaction.vout as any[])[0].value) {
          return new BigNumber((transaction.vout as any[])[0].value);
        }
      }
    }

    return new BigNumber(0);
  }

  /**
   * Makes walletsWithBalanceSubject emit, to inform that the wallet list has been updated.
   */
  private informDataUpdated() {
    this.ngZone.run(() => {
      this.walletsWithBalanceSubject.next(this.walletsWithBalanceList);
    });
  }
}

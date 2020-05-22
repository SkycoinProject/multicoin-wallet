import { of, Observable, ReplaySubject, Subscription, BehaviorSubject, forkJoin, Subject } from 'rxjs';
import { NgZone, Injector } from '@angular/core';
import { mergeMap, map, switchMap, delay, tap, first, filter } from 'rxjs/operators';
import BigNumber from 'bignumber.js';

import { WalletWithBalance, walletWithBalanceFromBase, WalletBase, WalletWithOutputs, walletWithOutputsFromBase } from '../../wallet-operations/wallet-objects';
import { Output } from '../../wallet-operations/transaction-objects';
import { Coin } from '../../../coins/coin';
import { BalanceAndOutputsOperator } from '../balance-and-outputs-operator';
import { OperatorService } from '../../operators.service';
import { WalletsAndAddressesOperator } from '../wallets-and-addresses-operator';
import { getOutputId } from './utils/btc-history-utils';
import { BlockbookApiService } from '../../api/blockbook-api.service';
import { BtcCoinConfig } from 'src/app/coins/config/btc.coin-config';

/**
 * Balance of a wallet, for internal use.
 */
class WalletBalance {
  current = new BigNumber(0);
  predicted = new BigNumber(0);
  addresses = new Map<string, AddressBalance>();
}

/**
 * Balance of an address, for internal use.
 */
class AddressBalance {
  current = new BigNumber(0);
  predicted = new BigNumber(0);
}

/**
 * Operator for BalanceAndOutputsService to be used with btc-like coins.
 *
 * You can find more information about the functions and properties this class implements by
 * checking BalanceAndOutputsOperator and BalanceAndOutputsService.
 */
export class BtcBalanceAndOutputsOperator implements BalanceAndOutputsOperator {
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
   * After the service retrieves the balance of each wallet, the balance and outputs returned
   * by the backend for each wallet is saved here, accessible via the wallet id.
   */
  private savedBalanceData = new Map<string, WalletBalance>();
  /**
   * Allows to know when the value of savedBalanceData has been updated.
   */
  private savedBalanceDataSubject: Subject<void> = new Subject<void>();
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
  private walletsAndAddressesOperator: WalletsAndAddressesOperator;

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
      this.walletsAndAddressesOperator = operators.walletsAndAddressesOperator;

      // Update the balance immediately each time the wallets are updated.
      this.walletsSubscription = this.walletsAndAddressesOperator.currentWallets.subscribe(wallets => {
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
    this.savedBalanceDataSubject.complete();
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
    // Run each time the wallet list changes.
    return this.walletsWithBalance.pipe(switchMap(wallets => {
      const addresses: string[] = [];
      wallets.forEach(wallet => wallet.addresses.forEach(address => addresses.push(address.address)));

      // Get the unspent outputs of the list of addresses.
      return this.recursivelyGetOutputs(addresses);
    }), map(outputs => {
      // Build the response.
      const walletsList: WalletWithOutputs[] = [];
      this.walletsWithBalanceList.forEach(wallet => {
        const newWallet = walletWithOutputsFromBase(wallet);
        walletsList.push(newWallet);

        newWallet.addresses.forEach(address => {
          address.outputs = outputs.filter(output => output.address === address.address);
        });
      });

      return walletsList;
    }));
  }

  getOutputs(addresses: string): Observable<Output[]> {
    const addressesArray = addresses.split(',');
    for (let i = 0; i < addressesArray.length; i++) {
      addressesArray[i] = addressesArray[i].trim();
    }

    return this.recursivelyGetOutputs(addressesArray);
  }

  /**
   * Gets the unspent outputs of the addresses in the provided address list.
   * @param addresses Addresses to check. The list will be altered by the function.
   * @param currentElements Already obtained outputs. For internal use.
   * @returns Array with all the unspent outputs related to the provided address list.
   */
  private recursivelyGetOutputs(addresses: string[], currentElements: Output[] = []): Observable<Output[]> {
    if (addresses.length === 0) {
      return of(currentElements);
    }

    // Value which will allow to get the value in coins, instead of sats.
    const decimalsCorrector = new BigNumber(10).exponentiatedBy((this.currentCoin.config as BtcCoinConfig).decimals);

    // Get the outputs of the address.
    return this.blockbookApiService.get(this.currentCoin.indexerUrl, 'utxo/' + addresses[addresses.length - 1])
      .pipe(mergeMap((response) => {

        // Process the outputs.
        (response as any[]).forEach(output => {
          const processedOutput: Output = {
            address: addresses[addresses.length - 1],
            coins: new BigNumber(output.value).dividedBy(decimalsCorrector),
            hash: getOutputId(output.txid, output.vout),
            confirmations: output.confirmations ? output.confirmations : 0,
          };

          currentElements.push(processedOutput);
        });

        addresses.pop();

        if (addresses.length === 0) {
          return of(currentElements);
        }

        // Continue to the next step.
        return this.recursivelyGetOutputs(addresses, currentElements);
      }));
  }

  getWalletUnspentOutputs(wallet: WalletBase): Observable<Output[]> {
    const addresses: string[] = [];
    wallet.addresses.forEach(address => addresses.push(address.address));

    return this.recursivelyGetOutputs(addresses);
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
      // Get the balance of each wallet.
      procedure = forkJoin(temporalWallets.map(wallet => this.retrieveWalletBalance(wallet, forceQuickCompleteArrayUpdate)));
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
          // Update only the balances with changes.
          this.walletsWithBalanceList.forEach((currentWallet, i) => {
            if (!currentWallet.coins.isEqualTo(temporalWallets[i].coins)) {
              currentWallet.coins = temporalWallets[i].coins;
              changeDetected = true;
            }

            if (currentWallet.addresses.length !== temporalWallets[i].addresses.length) {
              currentWallet.addresses = temporalWallets[i].addresses;
              changeDetected = true;
            } else {
              currentWallet.addresses.forEach((currentAddress, j) => {
                if (!currentAddress.coins.isEqualTo(temporalWallets[i].addresses[j].coins)) {
                  currentAddress.coins = temporalWallets[i].addresses[j].coins;
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
        this.ngZone.run(() => this.savedBalanceDataSubject.next());
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
   * @param useSavedBalanceData If true, the balance data saved on savedBalanceData
   * will be used instead of retrieving the data from the backend.
   * @returns True if there are one or more pending transactions that will affect the balance of
   * the provided walled, false otherwise. If useSavedBalanceData is true, the value of
   * hasPendingTransactionsSubject will be returned.
   */
  private retrieveWalletBalance(wallet: WalletWithBalance, useSavedBalanceData: boolean): Observable<boolean> {
    let query: Observable<WalletBalance>;

    let hasUnconfirmedTxs = false;

    if (!useSavedBalanceData) {
      // Get the balance of all addresses.
      const addresses = wallet.addresses.map(a => a.address);
      query = this.recursivelyGetBalances(addresses).pipe(mergeMap(result => {
        const response = new WalletBalance();

        result.forEach((addressBalance, address) => {
          // Add the values to the balance of the wallet.
          response.addresses.set(address, addressBalance);
          response.current = response.current.plus(addressBalance.current);
          response.predicted = response.predicted.plus(addressBalance.predicted);

          if (!addressBalance.current.isEqualTo(addressBalance.predicted)) {
            hasUnconfirmedTxs = true;
          }
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

      wallet.addresses.forEach(address => {
        if (balance.addresses.has(address.address)) {
          address.coins = balance.addresses.get(address.address).predicted;
        } else {
          address.coins = new BigNumber(0);
        }
      });

      if (!useSavedBalanceData) {
        return hasUnconfirmedTxs;
      } else {
        return this.hasPendingTransactionsSubject.value;
      }
    }));
  }

  /**
   * Gets the balance of the addresses in the provided address list.
   * @param addresses Addresses to check. The list will be altered by the function.
   * @param currentElements Already obtained balance. For internal use.
   * @returns Array with all the balance of the provided address list.
   */
  private recursivelyGetBalances(addresses: string[], currentElements = new Map<string, AddressBalance>()): Observable<Map<string, AddressBalance>> {
    if (addresses.length === 0) {
      return of(currentElements);
    }

    // Value which will allow to get the value in coins, instead of sats.
    const decimalsCorrector = new BigNumber(10).exponentiatedBy((this.currentCoin.config as BtcCoinConfig).decimals);

    // Get the balance of the address.
    return this.blockbookApiService.get(this.currentCoin.indexerUrl, 'address/' + addresses[addresses.length - 1], {details: 'basic'})
      .pipe(mergeMap((response) => {
        // Calculate the balances and create the balance object.
        const balance = response.balance ? new BigNumber(response.balance).dividedBy(decimalsCorrector) : new BigNumber(0);
        const unconfirmed = response.unconfirmedBalance ? new BigNumber(response.unconfirmedBalance).dividedBy(decimalsCorrector) : new BigNumber(0);
        const predicted = balance.plus(unconfirmed);
        currentElements.set(addresses[addresses.length - 1], {
          current: balance,
          predicted: predicted,
        });

        addresses.pop();

        if (addresses.length === 0) {
          return of(currentElements);
        }

        // Continue to the next step.
        return this.recursivelyGetBalances(addresses, currentElements);
      }));
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

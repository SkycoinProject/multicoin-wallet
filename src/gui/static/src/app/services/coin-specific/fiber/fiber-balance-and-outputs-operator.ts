import { forkJoin as observableForkJoin, of, Observable, ReplaySubject, Subscription, BehaviorSubject } from 'rxjs';
import { mergeMap, map, switchMap, tap, delay, filter, first } from 'rxjs/operators';
import { NgZone, Injector } from '@angular/core';
import { BigNumber } from 'bignumber.js';

import { WalletWithBalance, walletWithBalanceFromBase, WalletBase, walletWithOutputsFromBase, WalletWithOutputs } from '../../wallet-operations/wallet-objects';
import { Output } from '../../wallet-operations/transaction-objects';
import { FiberWalletsAndAddressesOperator } from './fiber-wallets-and-addresses-operator';
import { Coin } from '../../../coins/coin';
import { BalanceAndOutputsOperator } from '../balance-and-outputs-operator';
import { FiberApiService } from '../../api/fiber-api.service';
import { OperatorService } from '../../operators.service';
import { WalletsAndAddressesOperator } from '../wallets-and-addresses-operator';

/**
 * Operator for BalanceAndOutputsService to be used with Fiber coins.
 *
 * NOTE: The compatibility with coins not being managed by the local node is extremely limited
 * at this time.
 *
 * You can find more information about the functions and properties this class implements by
 * checking BalanceAndOutputsOperator and BalanceAndOutputsService.
 */
export class FiberBalanceAndOutputsOperator implements BalanceAndOutputsOperator {
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
   * After the service retrieves the balance of each wallet, the response returned by the node for each
   * wallet is saved here, accessible via the wallet id.
   */
  private savedBalanceData = new Map<string, any>();
  /**
   * Temporal map for updating savedBalanceData only after retrieving the data of all wallets, to avoid
   * problems when the balance update procedure is cancelled early.
   */
  private temporalSavedBalanceData = new Map<string, any>();
  /**
   * Saves the lastest, most up to date, wallet list obtained from the wallets service.
   */
  private savedWalletsList: WalletBase[];

  // Coin the current instance will work with.
  private currentCoin: Coin;

  // Services and operators used by this operator.
  private fiberApiService: FiberApiService;
  private ngZone: NgZone;
  private walletsAndAddressesOperator: WalletsAndAddressesOperator;

  constructor(injector: Injector, currentCoin: Coin) {
    // Get the services.
    this.fiberApiService = injector.get(FiberApiService);
    this.ngZone = injector.get(NgZone);

    // Intervals for updating the data must be longer if connecting to a remote node.
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
      const addresses = wallets.map(wallet => wallet.addresses.map(address => address.address).join(',')).join(',');

      // Get the unspent outputs of the list of addresses.
      return this.obtainOutputsList(addresses, false);
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
    return this.obtainOutputsList(addresses, true);
  }

  /**
   * Gets the list of unspent outputs owned by any of the addresses passed in the addresses param.
   * @param addresses List of addresses, comma separated.
   * @param confirmedOnly If true, only confirmed outputs will be returned.
   * @returns Array with all the unspent outputs owned by any of the provide addresses.
   */
  private obtainOutputsList(addresses: string, confirmedOnly: boolean): Observable<Output[]> {
    if (!addresses) {
      return of([]);
    } else {
      // Get the outputs from the node and process the response.
      return this.fiberApiService.post(this.currentCoin.nodeUrl, 'outputs', { addrs: addresses }).pipe(map((response) => {
        const outputs: Output[] = [];

        let outputsToUse: any[];
        if (confirmedOnly) {
          outputsToUse = response.head_outputs;
        } else {
          outputsToUse = (response.head_outputs as any[]).concat(response.incoming_outputs);
        }

        outputsToUse.forEach(output => {
          const processedOutput: Output = {
            address: output.address,
            coins: new BigNumber(output.coins),
            hash: output.hash,
            hours: new BigNumber(output.calculated_hours),
          };

          outputs.push(processedOutput);
        });

        return outputs;
      }));
    }
  }

  getWalletUnspentOutputs(wallet: WalletBase): Observable<Output[]> {
    const addresses = wallet.addresses.map(a => a.address).join(',');

    return this.obtainOutputsList(addresses, true);
  }

  refreshBalance() {
    this.startDataRefreshSubscription(0, false);
  }

  /**
   * Makes the service start updating the balance periodically. If it detects that the wallet
   * address have been changed in the node (if apply), it will update the wallet data first. If
   * this function was called before, the previous updating procedure is cancelled.
   * @param delayMs Delay before starting to update the balance.
   * @param updateWalletsFirst If true, after the delay the function will inmediatelly update
   * the wallet list with the data on savedWalletsList and using the last balance data obtained
   * from the node (or will set all the wallets to 0, if no data exists) and only after that will
   * try to get the balance data from the node and update the wallet list again. This allows to
   * inmediatelly reflect changes made to the wallet list, without having to wait for the node
   * to respond.
   */
  private startDataRefreshSubscription(delayMs: number, updateWalletsFirst: boolean) {
    if (this.dataRefreshSubscription) {
      this.dataRefreshSubscription.unsubscribe();
    }

    // If the address list of one or more wallets has been changed in the node.
    let addressesChanged = false;

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
          // Get the current state of the wallet list in the node.
          return this.fiberApiService.get(this.currentCoin.nodeUrl, 'wallets');
        }), mergeMap(response => {
          // Get the wallet list as it is in the node.
          const nodeWallets: Map<string, WalletBase> = new Map<string, WalletBase>();
          response.forEach(wallet => {
            const processedWallet = FiberWalletsAndAddressesOperator.processWallet(wallet, this.currentCoin.coinName);
            nodeWallets.set(processedWallet.id, processedWallet);
          });

          // Check if the address list of any of the saved wallets has changed in the node.
          const outdatedWallets: WalletBase[] = [];
          for (let i = 0; i < this.savedWalletsList.length; i++) {
            // The case of wallets removed from the node is not considered.
            if (nodeWallets.has(this.savedWalletsList[i].id)) {
              if (nodeWallets.get(this.savedWalletsList[i].id).addresses.length !== this.savedWalletsList[i].addresses.length) {
                addressesChanged = true;
                outdatedWallets.push(this.savedWalletsList[i]);
              }
            }
          }

          // If there was a change in the node, instead of refreshing the balance, the wallet
          // is updated. This method will be called immediately after that for refreshing
          // the balance.
          if (addressesChanged) {
            return this.recursivelyUpdateWallets(outdatedWallets);
          } else {
            return this.refreshBalances(this.savedWalletsList, false);
          }
        })).subscribe(
          () => {
            this.ngZone.run(() => {
              this.hadErrorRefreshingBalanceSubject.next(false);
              this.refreshingBalanceSubject.next(false);
            });

            // Repeat the operation after a delay.
            this.startDataRefreshSubscription(addressesChanged ? 0 : this.updatePeriod, false);
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
   * Recursively updates the address list of the provided wallets, with the data stored on
   * the node.
   * @param outdatedWallets Wallets to update.
   * @returns An observable for updating all the wallets.
   */
  private recursivelyUpdateWallets(outdatedWallets: WalletBase[]): Observable<any> {
    let response = this.walletsAndAddressesOperator.updateWallet(outdatedWallets[outdatedWallets.length - 1]);
    if (outdatedWallets.length > 1) {
      outdatedWallets.pop();

      response = response.pipe(mergeMap(() => this.recursivelyUpdateWallets(outdatedWallets)));
    }

    return response;
  }

  /**
   * Refreshes the wallets on walletsWithBalanceList and their balances.
   * @param wallets The current wallet lists.
   * @param forceQuickCompleteArrayUpdate If true, the balance data saved on savedBalanceData
   * will be used to set the balance of the wallet list, instead of getting the data from
   * the node. If false, the balance data is obtained from the node and savedBalanceData is
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
      procedure = observableForkJoin(temporalWallets.map(wallet => this.retrieveWalletBalance(wallet, forceQuickCompleteArrayUpdate)));
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
            if (
              !currentWallet.coins.isEqualTo(temporalWallets[i].coins) ||
              !currentWallet.confirmedCoins.isEqualTo(temporalWallets[i].confirmedCoins) ||
              !currentWallet.hours.isEqualTo(temporalWallets[i].hours) ||
              !currentWallet.confirmedHours.isEqualTo(temporalWallets[i].confirmedHours)
            ) {
              currentWallet.coins = temporalWallets[i].coins;
              currentWallet.confirmedCoins = temporalWallets[i].confirmedCoins;
              currentWallet.availableCoins = temporalWallets[i].availableCoins;
              currentWallet.hours = temporalWallets[i].hours;
              currentWallet.confirmedHours = temporalWallets[i].confirmedHours;
              currentWallet.availableHours = temporalWallets[i].availableHours;
              currentWallet.hasPendingCoins = temporalWallets[i].hasPendingCoins;
              currentWallet.hasPendingHours = temporalWallets[i].hasPendingHours;

              changeDetected = true;
            }

            if (currentWallet.addresses.length !== temporalWallets[i].addresses.length) {
              currentWallet.addresses = temporalWallets[i].addresses;
              changeDetected = true;
            } else {
              currentWallet.addresses.forEach((currentAddress, j) => {
                if (
                  !currentAddress.coins.isEqualTo(temporalWallets[i].addresses[j].coins) ||
                  !currentAddress.confirmedCoins.isEqualTo(temporalWallets[i].addresses[j].confirmedCoins) ||
                  !currentAddress.hours.isEqualTo(temporalWallets[i].addresses[j].hours) ||
                  !currentAddress.confirmedHours.isEqualTo(temporalWallets[i].addresses[j].confirmedHours)
                ) {
                  currentAddress.coins = temporalWallets[i].addresses[j].coins;
                  currentAddress.confirmedCoins = temporalWallets[i].addresses[j].confirmedCoins;
                  currentAddress.availableCoins = temporalWallets[i].addresses[j].availableCoins;
                  currentAddress.hours = temporalWallets[i].addresses[j].hours;
                  currentAddress.confirmedHours = temporalWallets[i].addresses[j].confirmedHours;
                  currentAddress.availableHours = temporalWallets[i].addresses[j].availableHours;
                  currentAddress.hasPendingCoins = temporalWallets[i].addresses[j].hasPendingCoins;
                  currentAddress.hasPendingHours = temporalWallets[i].addresses[j].hasPendingHours;

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
          // Inform that the service already obtained the balance from the node for the first time.
          this.ngZone.run(() => {
            this.firstFullUpdateMadeSubject.next(true);
          });
        }
      }
    }));
  }

  /**
   * Gets from the node the balance of a wallet and used the retrieved data to update an instamce
   * of WalletWithBalance. It also saves the retrieved data on temporalSavedBalanceData.
   * @param wallet Wallet to update.
   * @param useSavedBalanceData If true, the balance data saved on savedBalanceData
   * will be used instead of retrieving the data from the node.
   * @returns True if there are one or more pending transactions that will affect the balance of
   * the provided walled, false otherwise. If useSavedBalanceData is true, the value of
   * hasPendingTransactionsSubject will be returned.
   */
  private retrieveWalletBalance(wallet: WalletWithBalance, useSavedBalanceData: boolean): Observable<boolean> {
    let query: Observable<any>;

    if (!useSavedBalanceData) {
      if (!wallet.isHardware) {
        query = this.fiberApiService.get(this.currentCoin.nodeUrl, 'wallet/balance', { id: wallet.id });
      } else {
        const formattedAddresses = wallet.addresses.map(a => a.address).join(',');
        query = this.fiberApiService.post(this.currentCoin.nodeUrl, 'balance', { addrs: formattedAddresses });
      }
    } else {
      if (this.savedBalanceData.has(wallet.id)) {
        query = of(this.savedBalanceData.get(wallet.id));
      } else {
        query = of({ addresses: [] });
      }
    }

    return query.pipe(map(balance => {
      this.temporalSavedBalanceData.set(wallet.id, balance);

      // TODO: the available balance should be all the confirmed coins or hours minus all
      // coins or hours going out.

      if (balance.confirmed) {
        wallet.coins = new BigNumber(balance.predicted.coins).dividedBy(1000000);
        wallet.hours = new BigNumber(balance.predicted.hours);
        wallet.confirmedCoins = new BigNumber(balance.confirmed.coins).dividedBy(1000000);
        wallet.confirmedHours = new BigNumber(balance.confirmed.hours);
        wallet.availableCoins = wallet.coins;
        wallet.availableHours = wallet.hours;
        wallet.hasPendingCoins = !wallet.coins.isEqualTo(wallet.confirmedCoins);
        wallet.hasPendingHours = !wallet.hours.isEqualTo(wallet.confirmedHours);
      } else {
        wallet.coins = new BigNumber(0);
        wallet.hours = new BigNumber(0);
        wallet.confirmedCoins = new BigNumber(0);
        wallet.confirmedHours = new BigNumber(0);
        wallet.availableCoins = wallet.coins;
        wallet.availableHours = wallet.hours;
        wallet.hasPendingCoins = false;
        wallet.hasPendingHours = false;
      }

      wallet.addresses.forEach(address => {
        if (balance.addresses[address.address]) {
          address.coins = new BigNumber(balance.addresses[address.address].predicted.coins).dividedBy(1000000);
          address.hours = new BigNumber(balance.addresses[address.address].predicted.hours);
          address.confirmedCoins = new BigNumber(balance.addresses[address.address].confirmed.coins).dividedBy(1000000);
          address.confirmedHours = new BigNumber(balance.addresses[address.address].confirmed.hours);
          address.availableCoins = address.coins;
          address.availableHours = address.hours;
          address.hasPendingCoins = !address.coins.isEqualTo(address.confirmedCoins);
          address.hasPendingHours = !address.hours.isEqualTo(address.confirmedHours);
        } else {
          address.coins = new BigNumber(0);
          address.hours = new BigNumber(0);
          address.confirmedCoins = new BigNumber(0);
          address.confirmedHours = new BigNumber(0);
          address.availableCoins = address.coins;
          address.availableHours = address.hours;
          address.hasPendingCoins = false;
          address.hasPendingHours = false;
        }
      });

      if (!useSavedBalanceData) {
        return !wallet.confirmedCoins.isEqualTo(wallet.coins) || !wallet.confirmedHours.isEqualTo(wallet.hours);
      } else {
        return this.hasPendingTransactionsSubject.value;
      }
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

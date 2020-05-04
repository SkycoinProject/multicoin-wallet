import { of, Observable, ReplaySubject, Subscription, BehaviorSubject } from 'rxjs';
import { NgZone, Injector } from '@angular/core';

import { WalletWithBalance, walletWithBalanceFromBase, WalletBase, WalletWithOutputs } from '../../wallet-operations/wallet-objects';
import { Output } from '../../wallet-operations/transaction-objects';
import { Coin } from '../../../coins/coin';
import { BalanceAndOutputsOperator } from '../balance-and-outputs-operator';
import { OperatorService } from '../../operators.service';
import { WalletsAndAddressesOperator } from '../wallets-and-addresses-operator';
import { BtcApiService } from '../../api/btc-api.service';

/**
 * Operator for BalanceAndOutputsService to be used with btc-like coins.
 *
 * NOTE: still under heavy development.
 *
 * You can find more information about the functions and properties this class implements by
 * checking BalanceAndOutputsOperator and BalanceAndOutputsService.
 */
export class BtcBalanceAndOutputsOperator implements BalanceAndOutputsOperator {
  // The list of wallets with balance and the subject used for informing when the list has been modified.
  private walletsWithBalanceList: WalletWithBalance[];
  private walletsWithBalanceSubject: ReplaySubject<WalletWithBalance[]> = new ReplaySubject<WalletWithBalance[]>(1);

  // Subject for providing information in the getters below.
  private hasPendingTransactionsSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  private firstFullUpdateMadeSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  private hadErrorRefreshingBalanceSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  private refreshingBalanceSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  private dataRefreshSubscription: Subscription;
  private walletsSubscription: Subscription;
  private operatorsSubscription: Subscription;

  /**
   * Saves the lastest, most up to date, wallet list obtained from the wallets service.
   */
  private savedWalletsList: WalletBase[];

  /**
   * Last moment in which the balance was updated.
   */
  get lastBalancesUpdateTime(): Date {
    return this.lastBalancesUpdateTimeInternal;
  }
  private lastBalancesUpdateTimeInternal: Date = new Date();

  // Coin the current instance will work with.
  private currentCoin: Coin;

  // Services and operators used by this operator.
  private btcApiService: BtcApiService;
  private ngZone: NgZone;
  private walletsAndAddressesOperator: WalletsAndAddressesOperator;

  constructor(injector: Injector, currentCoin: Coin) {
    // Get the services.
    this.btcApiService = injector.get(BtcApiService);
    this.ngZone = injector.get(NgZone);

    // Get the operators and only then start using them.
    this.operatorsSubscription = injector.get(OperatorService).currentOperators.subscribe(operators => {
      if (operators) {
        this.walletsAndAddressesOperator = operators.walletsAndAddressesOperator;
        this.operatorsSubscription.unsubscribe();

        // Update the balance immediately each time the wallets are updated.
        this.walletsSubscription = this.walletsAndAddressesOperator.currentWallets.subscribe(wallets => {
          this.savedWalletsList = wallets;
          this.startDataRefreshSubscription(0, true);
        });
      }
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

    this.walletsWithBalanceSubject.complete();
    this.hasPendingTransactionsSubject.complete();
    this.firstFullUpdateMadeSubject.complete();
    this.hadErrorRefreshingBalanceSubject.complete();
    this.refreshingBalanceSubject.complete();
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
   * from the node (or will set all the wallets to 0, if no data exists) and only after that will
   * try to get the balance data from the node and update the wallet list again. This allows to
   * inmediatelly reflect changes made to the wallet list, without having to wait for the node
   * to respond.
   */
  private startDataRefreshSubscription(delayMs: number, updateWalletsFirst: boolean) {
    if (this.dataRefreshSubscription) {
      this.dataRefreshSubscription.unsubscribe();
    }

    // Simulate a 0 balance response.

    this.walletsWithBalanceList = this.savedWalletsList.map(wallet => {
      return walletWithBalanceFromBase(wallet);
    });

    this.hadErrorRefreshingBalanceSubject.next(false);
    this.refreshingBalanceSubject.next(false);
    this.firstFullUpdateMadeSubject.next(true);
    this.hasPendingTransactionsSubject.next(false);

    this.informDataUpdated();
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

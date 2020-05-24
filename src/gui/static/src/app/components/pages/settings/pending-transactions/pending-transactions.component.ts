import { Component, OnDestroy, OnInit } from '@angular/core';
import { SubscriptionLike, of } from 'rxjs';
import { delay, mergeMap } from 'rxjs/operators';

import { NavBarSwitchService } from '../../../../services/nav-bar-switch.service';
import { DoubleButtonActive } from '../../../layout/double-button/double-button.component';
import { HistoryService, PendingTransactionData } from '../../../../services/wallet-operations/history.service';
import { CoinService } from '../../../../services/coin.service';
import { CoinTypes } from '../../../../coins/coin-types';

/**
 * Allows to see the list of pending transactions. It uses the nav bar to know if it must show
 * all pending tx or just the pending tx affecting the user.
 */
@Component({
  selector: 'app-pending-transactions',
  templateUrl: './pending-transactions.component.html',
  styleUrls: ['./pending-transactions.component.scss'],
})
export class PendingTransactionsComponent implements OnInit, OnDestroy {
  // Transactions to show on the UI.
  transactions: PendingTransactionData[] = null;

  private transactionsSubscription: SubscriptionLike;
  private navbarSubscription: SubscriptionLike;

  private selectedNavbarOption: DoubleButtonActive;

  // Time interval in which periodic data updates will be made.
  private updatePeriod = 10 * 1000;
  // Time interval in which the periodic data updates will be restarted after an error.
  private errorUpdatePeriod = 2 * 1000;

  // If true, the page will show a column with how many confirmations the transactions have,
  // instead of the hours column.
  showConfirmations = false;
  // Now many confirmations a transaction must have to be considered fully confirmed.
  confirmationsNeeded = 0;

  constructor(
    private navBarSwitchService: NavBarSwitchService,
    private historyService: HistoryService,
    private coinService: CoinService,
  ) {
    // Intervals for updating the data must be longer if connecting to a remote node.
    if (!coinService.currentCoinInmediate.isLocal) {
      this.updatePeriod = 60 * 1000;
      this.errorUpdatePeriod = 10 * 1000;
    }

    this.showConfirmations = coinService.currentCoinInmediate.coinType !== CoinTypes.Fiber;
    this.confirmationsNeeded = coinService.currentCoinInmediate.confirmationsNeeded;

    if (this.coinService.currentCoinInmediate.coinTypeFeatures.showAllPendingTransactions) {
      this.navbarSubscription = this.navBarSwitchService.activeComponent.subscribe(value => {
        this.selectedNavbarOption = value;
        this.transactions = null;
        this.startDataRefreshSubscription(0);
      });
    } else {
      this.selectedNavbarOption = DoubleButtonActive.LeftButton;
      this.transactions = null;
      this.startDataRefreshSubscription(0);
    }
  }

  ngOnInit() {
    if (this.coinService.currentCoinInmediate.coinTypeFeatures.showAllPendingTransactions) {
      this.navBarSwitchService.showSwitch('pending-txs.my-transactions-button', 'pending-txs.all-transactions-button');
    }
  }

  ngOnDestroy() {
    if (this.navbarSubscription) {
      this.navbarSubscription.unsubscribe();
    }
    this.removeTransactionsSubscription();
    this.navBarSwitchService.hideSwitch();
  }

  /**
   * Makes the page start updating the data periodically. If this function was called before,
   * the previous updating procedure is cancelled.
   * @param delayMs Delay before starting to update the data.
   */
  private startDataRefreshSubscription(delayMs: number) {
    this.removeTransactionsSubscription();

    this.transactionsSubscription = of(0).pipe(delay(delayMs), mergeMap(() => this.historyService.getPendingTransactions())).subscribe(transactions => {
      this.transactions = this.selectedNavbarOption === DoubleButtonActive.LeftButton ? transactions.user : transactions.all;

      // Update again after a delay.
      this.startDataRefreshSubscription(this.updatePeriod);
    }, () => this.startDataRefreshSubscription(this.errorUpdatePeriod));
  }

  private removeTransactionsSubscription() {
    if (this.transactionsSubscription) {
      this.transactionsSubscription.unsubscribe();
    }
  }
}

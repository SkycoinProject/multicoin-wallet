import { mergeMap, delay } from 'rxjs/operators';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { SubscriptionLike, of } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';

import { BlockchainService, BasicBlockInfo, CoinSupply } from '../../../../services/blockchain.service';
import { CoinService } from '../../../../services/coin.service';
import { SelectConfirmationsComponent } from './select-confirmations/select-confirmations.component';
import { ConfirmationParams, DefaultConfirmationButtons, ConfirmationComponent } from '../../../layout/confirmation/confirmation.component';

/**
 * Shows the state of the the blockchain on the node.
 */
@Component({
  selector: 'app-blockchain',
  templateUrl: './blockchain.component.html',
  styleUrls: ['./blockchain.component.scss'],
})
export class BlockchainComponent implements OnInit, OnDestroy {
  // If true, the currently selected coin includes coin hours.
  coinHasHours = false;
  block: BasicBlockInfo;
  coinSupply: CoinSupply;
  // Info about the confirmations needed for considering a transaction final.
  confirmations = 0;
  recommendedConfirmations = 0;

  private operationSubscription: SubscriptionLike;
  private coinSubscription: SubscriptionLike;

  // Time interval in which periodic data updates will be made.
  private updatePeriod = 5 * 1000;
  // Time interval in which the periodic data updates will be restarted after an error.
  private errorUpdatePeriod = 2 * 1000;

  constructor(
    private blockchainService: BlockchainService,
    private dialog: MatDialog,
    coinService: CoinService,
  ) {
    this.coinHasHours = coinService.currentCoinInmediate.coinTypeFeatures.coinHours;

    // Update the confirmations info.
    this.coinSubscription = coinService.currentCoin.subscribe(coin => {
      this.confirmations = coin.confirmationsNeeded;
      this.recommendedConfirmations = coin.normalConfirmationsNeeded;
    });

    // Intervals for updating the data must be longer if connecting to a remote node.
    if (!coinService.currentCoinInmediate.isLocal) {
      this.updatePeriod = 60 * 1000;
      this.errorUpdatePeriod = 10 * 1000;
    }
  }

  ngOnInit() {
    this.startDataRefreshSubscription(0);
  }

  changeConfirmations() {
    // Ask for confirmation before continuing.
    const confirmationParams: ConfirmationParams = {
      redTitle: true,
      headerText: 'common.warning-title',
      text: 'blockchain.edit-confirmations-warning',
      checkboxText: 'common.generic-confirmation-check',
      defaultButtons: DefaultConfirmationButtons.ContinueCancel,
    };

    ConfirmationComponent.openDialog(this.dialog, confirmationParams).afterClosed().subscribe(confirmationResult => {
      if (confirmationResult) {
        SelectConfirmationsComponent.openDialog(this.dialog);
      }
    });
  }

  /**
   * Makes the page start updating the data periodically. If this function was called before,
   * the previous updating procedure is cancelled.
   * @param delayMs Delay before starting to update the data.
   */
  private startDataRefreshSubscription(delayMs: number) {
    this.removeOperationSubscription();

    this.operationSubscription = of(0).pipe(delay(delayMs), mergeMap(() => this.blockchainService.getBlockchainState())).subscribe(state => {
      this.block = state.lastBlock;
      this.coinSupply = state.coinSupply;

      // Update again after a delay.
      this.startDataRefreshSubscription(this.updatePeriod);
    }, () => this.startDataRefreshSubscription(this.errorUpdatePeriod));
  }

  ngOnDestroy() {
    this.removeOperationSubscription();
    this.coinSubscription.unsubscribe();
  }

  private removeOperationSubscription() {
    if (this.operationSubscription) {
      this.operationSubscription.unsubscribe();
    }
  }
}

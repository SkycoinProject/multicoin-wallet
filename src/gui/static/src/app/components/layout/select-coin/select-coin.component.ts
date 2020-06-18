import { Component, Renderer2, OnDestroy } from '@angular/core';
import { Overlay } from '@angular/cdk/overlay';
import { MatDialog } from '@angular/material/dialog';
import { SubscriptionLike } from 'rxjs';

import { Coin } from '../../../coins/coin';
import { SelectCoinOverlayComponent } from '../select-coin-overlay/select-coin-overlay.component';
import { CoinService } from '../../../services/coin.service';

/**
 * Control for selecting the active coin, with the design for showing it in a form.
 */
@Component({
  selector: 'app-select-coin',
  templateUrl: 'select-coin.component.html',
  styleUrls: ['select-coin.component.scss'],
})
export class SelectCoinComponent implements OnDestroy {
  currentCoin: Coin;

  private coinSubscription: SubscriptionLike;

  constructor(
    private dialog: MatDialog,
    private overlay: Overlay,
    private renderer: Renderer2,
    coinService: CoinService,
  ) {
    this.coinSubscription = coinService.currentCoin.subscribe(currentCoin => {
      this.currentCoin = currentCoin;
    });
  }

  ngOnDestroy() {
    this.coinSubscription.unsubscribe();
  }

  // Opens the coin selection screen.
  onInputClick() {
    SelectCoinOverlayComponent.openOverlay(this.dialog, this.renderer, this.overlay);
  }
}

import { Component, Input, OnInit, OnDestroy, NgZone, Renderer2 } from '@angular/core';
import { Subscription, interval } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { Overlay } from '@angular/cdk/overlay';

import { LanguageData, LanguageService } from '../../../../services/language.service';
import { SelectLanguageComponent } from '../../select-language/select-language.component';
import { BalanceAndOutputsService } from '../../../../services/wallet-operations/balance-and-outputs.service';
import { CoinService } from '../../../../services/coin.service';
import { Coin } from '../../../../coins/coin';
import { AppUpdateService } from '../../../../services/app-update.service';
import { SelectCoinOverlayComponent } from '../../select-coin-overlay/select-coin-overlay.component';

/**
 * Area of the header with the title and the menu.
 */
@Component({
  selector: 'app-top-bar',
  templateUrl: './top-bar.component.html',
  styleUrls: ['./top-bar.component.scss'],
})
export class TopBarComponent implements OnInit, OnDestroy {
  @Input() headline: string;

  // Currently selected language.
  language: LanguageData;
  // If the balance is currently beeing refreshed.
  refreshingBalance = false;
  // If the last time the system tried to refresh the balance there was an error.
  problemRefreshingBalance = false;
  // If the app already got the balance from the node.
  balanceObtained = false;
  // How many minutes ago the balance was refreshed.
  timeSinceLastBalanceUpdate = 0;
  // If the app currently allows the user to select more than one coin.
  hasManyCoins = false;
  // Currently selected coin.
  currentCoin: Coin;

  private subscriptionsGroup: Subscription[] = [];

  constructor(
    public appUpdateService: AppUpdateService,
    private languageService: LanguageService,
    private dialog: MatDialog,
    private balanceAndOutputsService: BalanceAndOutputsService,
    private ngZone: NgZone,
    private coinService: CoinService,
    private overlay: Overlay,
    private renderer: Renderer2,
  ) {}

  ngOnInit() {
    this.subscriptionsGroup.push(this.languageService.currentLanguage.subscribe(lang => this.language = lang));

    this.subscriptionsGroup.push(this.coinService.currentCoin.subscribe(coin => {
      this.currentCoin = coin;
    }));

    this.hasManyCoins = this.coinService.coins.length > 1;

    // Update the vars related to the balance.

    this.subscriptionsGroup.push(this.balanceAndOutputsService.firstFullUpdateMade.subscribe(firstFullUpdateMade => {
      this.balanceObtained = firstFullUpdateMade;
    }));

    this.subscriptionsGroup.push(
      this.balanceAndOutputsService.walletsWithBalance.subscribe(() => this.timeSinceLastBalanceUpdate = this.getTimeSinceLastBalanceUpdate()),
    );

    this.subscriptionsGroup.push(
      this.balanceAndOutputsService.refreshingBalance.subscribe(response => this.refreshingBalance = response),
    );

    this.subscriptionsGroup.push(
      this.balanceAndOutputsService.hadErrorRefreshingBalance.subscribe(response => this.problemRefreshingBalance = response),
    );

    this.ngZone.runOutsideAngular(() => {
      this.subscriptionsGroup.push(
        interval(5000).subscribe(() => {
          this.ngZone.run(() => this.timeSinceLastBalanceUpdate = this.getTimeSinceLastBalanceUpdate());
        }),
      );
    });
  }

  ngOnDestroy() {
    this.subscriptionsGroup.forEach(sub => sub.unsubscribe());
  }

  changeCoin() {
    SelectCoinOverlayComponent.openOverlay(this.dialog, this.renderer, this.overlay);
  }

  refresBalance() {
    this.balanceAndOutputsService.refreshBalance();
  }

  changelanguage() {
    SelectLanguageComponent.openDialog(this.dialog);
  }

  // Gets how many minutes ago the balance was refreshed.
  private getTimeSinceLastBalanceUpdate(): number {
    const diffMs: number = new Date().getTime() - this.balanceAndOutputsService.lastBalancesUpdateTime.getTime();

    return Math.floor(diffMs / 60000);
  }
}

import { Component, Input, OnInit, OnDestroy, NgZone, Renderer2, ViewChild } from '@angular/core';
import { Subscription, interval } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { Overlay } from '@angular/cdk/overlay';
import { MatSpinner } from '@angular/material/progress-spinner';

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
  @ViewChild('balanceSpinner') balanceSpinner: MatSpinner;
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
  // The last moment in which the balance was updated.
  lastBalancesUpdateTime = new Date(2000, 1);

  // Vars for showing only the options available for the current coin.
  showNetworkOption: boolean;
  showBackupOption: boolean;
  showOutputsOption: boolean;
  showPendingTxsOption: boolean;

  // Params for the style of some UI elements.
  textColor = '';
  buttonBorder = '';

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
  ) {
    this.showNetworkOption = this.coinService.currentCoinInmediate.coinTypeFeatures.networkingStats;
    this.showBackupOption = this.coinService.currentCoinInmediate.coinTypeFeatures.softwareWallets;
    this.showOutputsOption = this.coinService.currentCoinInmediate.coinTypeFeatures.outputs;
    this.showPendingTxsOption = this.coinService.currentCoinInmediate.coinTypeFeatures.showAllPendingTransactions;
  }

  ngOnInit() {
    this.subscriptionsGroup.push(this.languageService.currentLanguage.subscribe(lang => this.language = lang));

    this.subscriptionsGroup.push(this.coinService.currentCoin.subscribe(coin => {
      this.currentCoin = coin;

      this.textColor = coin.styleConfig.headerTextColor;
      this.buttonBorder = coin.styleConfig.headerTextColor + ' 1px solid';
    }));

    this.hasManyCoins = this.coinService.coins.length > 1;

    // Update the vars related to the balance.

    this.subscriptionsGroup.push(this.balanceAndOutputsService.firstFullUpdateMade.subscribe(firstFullUpdateMade => {
      this.balanceObtained = firstFullUpdateMade;
    }));

    this.subscriptionsGroup.push(
      this.balanceAndOutputsService.lastBalancesUpdateTime.subscribe(date => {
        this.lastBalancesUpdateTime = date;
        this.timeSinceLastBalanceUpdate = this.getTimeSinceLastBalanceUpdate();
      }),
    );

    this.subscriptionsGroup.push(
      this.balanceAndOutputsService.refreshingBalance.subscribe(response => {
        this.refreshingBalance = response;

        if (response) {
          // Update the color of the spinner.
          setTimeout(() => {
            const circle = this.balanceSpinner._elementRef.nativeElement.querySelector('circle');
            if (circle) {
              this.renderer.setStyle(circle, 'stroke', this.textColor);
            }
          });
        }
      }),
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
    if (!this.refreshingBalance) {
      this.balanceAndOutputsService.refreshBalance();
    }
  }

  changelanguage() {
    SelectLanguageComponent.openDialog(this.dialog);
  }

  // Gets how many minutes ago the balance was refreshed.
  private getTimeSinceLastBalanceUpdate(): number {
    const diffMs: number = new Date().getTime() - this.lastBalancesUpdateTime.getTime();

    return Math.floor(diffMs / 60000);
  }
}

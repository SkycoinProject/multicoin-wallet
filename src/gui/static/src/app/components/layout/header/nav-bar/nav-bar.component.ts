import { Component, OnDestroy } from '@angular/core';
import { SubscriptionLike } from 'rxjs';

import { AppConfig } from '../../../../app.config';
import { NavBarSwitchService } from '../../../../services/nav-bar-switch.service';
import { environment } from '../../../../../environments/environment';
import { CoinService } from '../../../../services/coin.service';

/**
 * Navigation bar shown on the header.
 */
@Component({
  selector: 'app-nav-bar',
  templateUrl: './nav-bar.component.html',
  styleUrls: ['./nav-bar.component.scss'],
})
export class NavBarComponent implements OnDestroy {
  otcEnabled = AppConfig.otcEnabled;
  exchangeEnabled = !!environment.swaplab.apiKey;

  private coinSubscription: SubscriptionLike;

  constructor(
    public navBarSwitchService: NavBarSwitchService,
    private coinService: CoinService,
  ) {
    // Currently the exchange option must only appear for Skycoin.
    this.coinSubscription = this.coinService.currentCoin.subscribe(coin => {
      this.exchangeEnabled = !!environment.swaplab.apiKey;

      if (coin.coinName.toLowerCase() !== 'skycoin') {
        this.exchangeEnabled = false;
      }
    });
  }

  ngOnDestroy() {
    this.coinSubscription.unsubscribe();
  }

  changeActiveComponent(value) {
    this.navBarSwitchService.setActiveComponent(value);
  }
}

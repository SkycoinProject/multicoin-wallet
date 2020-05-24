import { Component, OnDestroy } from '@angular/core';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { SubscriptionLike } from 'rxjs';
import { retryWhen, delay } from 'rxjs/operators';

import { BalanceAndOutputsService } from '../../../../services/wallet-operations/balance-and-outputs.service';
import { WalletWithOutputs } from '../../../../services/wallet-operations/wallet-objects';
import { CoinService } from '../../../../services/coin.service';
import { CoinTypes } from '../../../../coins/coin-types';

/**
 * Allows to see the list of unspent outputs of the registered wallets. The list can be
 * limited to one address by setting the"addr" param, on the URL, to the desired address.
 */
@Component({
  selector: 'app-outputs',
  templateUrl: './outputs.component.html',
  styleUrls: ['./outputs.component.scss'],
})
export class OutputsComponent implements OnDestroy {
  wallets: WalletWithOutputs[]|null;

  // If true, the page will show a column with how many confirmations the outputs has, instead
  // of the hours column.
  showConfirmations = false;
  // Now many confirmations a transaction must have to be considered fully confirmed.
  confirmationsNeeded = 0;

  private outputsSubscription: SubscriptionLike;
  private navigationSubscription: SubscriptionLike;

  constructor(
    route: ActivatedRoute,
    private balanceAndOutputsService: BalanceAndOutputsService,
    private coinService: CoinService,
    private router: Router,
  ) {
    // Reload the data every time the url params change.
    this.navigationSubscription = route.queryParams.subscribe(params => {
      this.wallets = null;
      this.loadData(params);
    });

    this.showConfirmations = coinService.currentCoinInmediate.coinType !== CoinTypes.Fiber;
    this.confirmationsNeeded = coinService.currentCoinInmediate.confirmationsNeeded;

    if (!this.coinService.currentCoinInmediate.coinTypeFeatures.outputs) {
      this.router.navigate([''], {replaceUrl: true});
    }
  }

  ngOnDestroy() {
    this.removeOutputsSubscription();
    this.navigationSubscription.unsubscribe();
  }

  private loadData(lastRouteParams: Params) {
    const addr = lastRouteParams['addr'];

    this.removeOutputsSubscription();

    // Periodically get the list of wallets with the outputs.
    this.outputsSubscription = this.balanceAndOutputsService.outputsWithWallets
      .pipe(retryWhen(errors => errors.pipe(delay(2000))))
      .subscribe(wallets => {
        // The original response object is modified. No copy is created before doing this
        // because the data is only used by this page.
        this.wallets = wallets.map(wallet => {
          // Include only addresses with outputs or the requested address.
          wallet.addresses = wallet.addresses.filter(address => {
            if (address.outputs.length > 0) {
              return addr ? address.address === addr : true;
            }
          });

          return wallet;
        }).filter(wallet => wallet.addresses.length > 0);
      });
  }

  private removeOutputsSubscription() {
    if (this.outputsSubscription) {
      this.outputsSubscription.unsubscribe();
    }
  }
}

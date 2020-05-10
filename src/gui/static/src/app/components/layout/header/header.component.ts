import { filter } from 'rxjs/operators';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { SubscriptionLike } from 'rxjs';
import { BigNumber } from 'bignumber.js';

import { PriceService } from '../../../services/price.service';
import { BlockchainService } from '../../../services/blockchain.service';
import { NetworkService } from '../../../services/network.service';
import { AppConfig } from '../../../app.config';
import { BalanceAndOutputsService } from '../../../services/wallet-operations/balance-and-outputs.service';
import { AddressWithBalance } from '../../../services/wallet-operations/wallet-objects';
import { Coin } from '../../../coins/coin';
import { CoinService } from '../../../services/coin.service';
import { AppUpdateService } from '../../../services/app-update.service';
import { NodeService } from '../../../services/node.service';

/**
 * Header shown at the top of most pages.
 */
@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
})
export class HeaderComponent implements OnInit, OnDestroy {
  @Input() headline: string;

  currentCoin: Coin;

  // If true, the currently selected coin includes coin hours.
  coinHasHours = false;
  // Data about the synchronization status of the node.
  synchronizationInfoObtained = false;
  synchronizationPercentage: number;
  // Use synchronizationInfoObtained to know if the value has been already updated.
  synchronized = false;
  currentBlock: number;
  highestBlock: number;

  // Data about the balance.
  coins: string;
  hours: string;

  showPrice = false;
  price: number;
  // If the node has pending transactions potentially affecting the user balance.
  hasPendingTxs: boolean;
  // If the app already got the balance from the node.
  balanceObtained = false;
  walletDownloadUrl = AppConfig.walletDownloadUrl;

  private subscriptionsGroup: SubscriptionLike[] = [];

  constructor(
    public nodeService: NodeService,
    public appUpdateService: AppUpdateService,
    public networkService: NetworkService,
    private blockchainService: BlockchainService,
    private priceService: PriceService,
    private balanceAndOutputsService: BalanceAndOutputsService,
    private coinService: CoinService,
  ) {
    this.coinHasHours = coinService.currentCoinHasHoursInmediate;
  }

  ngOnInit() {
    // Get the currently selected coin.
    this.subscriptionsGroup.push(this.coinService.currentCoin.subscribe((coin: Coin) => {
      this.showPrice = !!coin.priceTickerId;
      this.currentCoin = coin;
    }));

    // Get the synchronization status.
    this.subscriptionsGroup.push(this.blockchainService.progress.pipe(filter(response => !!response)).subscribe(response => {
      this.synchronizationInfoObtained = true;
      this.highestBlock = response.highestBlock;
      this.currentBlock = response.currentBlock;
      this.synchronizationPercentage = this.currentBlock && this.highestBlock ? (this.currentBlock / this.highestBlock) : 0;
      this.synchronized = response.synchronized;
    }));

    // Get the current price.
    this.subscriptionsGroup.push(this.priceService.price.subscribe(price => this.price = price));

    // Get the current balance.
    this.subscriptionsGroup.push(this.balanceAndOutputsService.walletsWithBalance.subscribe(wallets => {
      const addresses = new Map<string, AddressWithBalance>();
      wallets.forEach(wallet => {
        wallet.addresses.forEach(address => {
          if (!addresses.has(address.address)) {
            addresses.set(address.address, address);
          } else {
            // This prevents a minor glich due to an edge case in which, just for a few seconds,
            // some addresses of a newly added hw wallet which has also been added as a software
            // wallet can report 0 coins while the node is reporting some coins on the same
            // addresses on the previously created software wallet.
            const previouslySavedAddress = addresses.get(address.address);
            if (previouslySavedAddress.coins.isLessThan(address.coins)) {
              addresses.set(address.address, address);
            }
          }
        });
      });

      let coins = new BigNumber(0);
      let hours = new BigNumber(0);
      addresses.forEach(addr => {
        coins = coins.plus(addr.coins);
        if (addr.hours) {
          hours = hours.plus(addr.hours);
        }
      });
      this.coins = coins.toString();
      this.hours = hours.toString();

    }));

    // Know if there are pending transactions.
    this.subscriptionsGroup.push(this.balanceAndOutputsService.hasPendingTransactions.subscribe(hasPendingTxs => {
      this.hasPendingTxs = hasPendingTxs;
    }));

    // Know when the app gets the balance from the node.
    this.subscriptionsGroup.push(this.balanceAndOutputsService.firstFullUpdateMade.subscribe(firstFullUpdateMade => {
      this.balanceObtained = firstFullUpdateMade;
    }));
  }

  ngOnDestroy() {
    this.subscriptionsGroup.forEach(sub => sub.unsubscribe());
  }
}

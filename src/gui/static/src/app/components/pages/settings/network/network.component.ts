import { Component, OnDestroy, OnInit } from '@angular/core';
import { SubscriptionLike } from 'rxjs';
import { Router } from '@angular/router';

import { NetworkService } from '../../../../services/network.service';
import { Connection } from '../../../../services/coin-specific/network-operator';
import { CoinService } from '../../../../services/coin.service';

/**
 * Allows to see the list of connections the node currently has with other nodes.
 */
@Component({
  selector: 'app-network',
  templateUrl: './network.component.html',
  styleUrls: ['./network.component.scss'],
})
export class NetworkComponent implements OnInit, OnDestroy {
  peers: Connection[];

  private subscription: SubscriptionLike;

  constructor(
    private networkService: NetworkService,
    private coinService: CoinService,
    private router: Router,
  ) { }

  ngOnInit() {
    // Periodically get the list of connected nodes.
    this.subscription = this.networkService.connections().subscribe(peers => this.peers = peers);

    if (!this.coinService.currentCoinInmediate.coinTypeFeatures.networkingStats) {
      this.router.navigate([''], {replaceUrl: true});
    }
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }
}

import { delay, mergeMap } from 'rxjs/operators';
import { BigNumber } from 'bignumber.js';
import { Subscription, of, Observable, BehaviorSubject } from 'rxjs';
import { Injector } from '@angular/core';

import { NodeOperator } from '../node-operator';
import { Coin } from '../../../coins/coin';
import { BtcApiService } from '../../api/btc-api.service';
import { BtcCoinConfig } from '../../../coins/config/btc.coin-config';

/**
 * Operator for NodeService to be used with btc-like coins.
 *
 * You can find more information about the functions and properties this class implements by
 * checking NodeService and NodeOperator.
 */
export class BtcNodeOperator implements NodeOperator {
  get remoteNodeDataUpdated(): Observable<boolean> {
    return this.remoteNodeDataUpdatedInternal.asObservable();
  }
  private remoteNodeDataUpdatedInternal = new BehaviorSubject<boolean>(false);

  get nodeVersion() {
    return this.nodeVersionInternal;
  }
  private nodeVersionInternal = '';

  get currentMaxDecimals() {
    return (this.currentCoin.config as BtcCoinConfig).decimals;
  }

  get burnRate() {
    return this.burnRateInternal;
  }
  private burnRateInternal = new BigNumber(1);

  // Coin the current instance will work with.
  private currentCoin: Coin;

  // Services used by this operator.
  private btcApiService: BtcApiService;

  private basicInfoSubscription: Subscription;

  constructor(injector: Injector, currentCoin: Coin) {
    // Get the services.
    this.btcApiService = injector.get(BtcApiService);

    this.currentCoin = currentCoin;

    this.updateData(0);
  }

  dispose() {
    if (this.basicInfoSubscription) {
      this.basicInfoSubscription.unsubscribe();
    }

    this.remoteNodeDataUpdatedInternal.complete();
  }

  /**
   * Connects to the node to get the data.
   */
  private updateData(delayMs: number) {
    if (this.basicInfoSubscription) {
      this.basicInfoSubscription.unsubscribe();
    }

    this.basicInfoSubscription = of(1).pipe(
      delay(delayMs),
      mergeMap(() => this.btcApiService.callRpcMethod(this.currentCoin.nodeUrl, 'getnetworkinfo')),
    ).subscribe(response => {
      this.nodeVersionInternal = response.version;

      this.remoteNodeDataUpdatedInternal.next(true);
    }, () => {
      // If there is an error, retry after a delay.
      this.updateData(this.currentCoin.isLocal ? 2000 : 15000);
    });
  }
}

import { mergeMap, delay } from 'rxjs/operators';
import { NgZone, Injector } from '@angular/core';
import { Observable, of, Subscription } from 'rxjs';
import BigNumber from 'bignumber.js';

import { NetworkOperator, Connection } from '../network-operator';
import { Coin } from '../../../coins/coin';
import { environment } from '../../../../environments/environment';
import { EthApiService } from '../../api/eth-api.service';

/**
 * Operator for NetworkService to be used with eth-like coins.
 *
 * NOTE: only for knowing if the node is connected to other nodes. Remote nodes data not
 * available for this coin type.
 *
 * You can find more information about the functions and properties this class implements by
 * checking NetworkService and NetworkOperator.
 */
export class EthNetworkOperator implements NetworkOperator {
  get noConnections(): boolean {
    return this.noConnectionsInternal;
  }
  noConnectionsInternal = false;

  /**
   * Time interval in which periodic data updates will be made.
   */
  private updatePeriod = 5 * 1000;
  /**
   * Time interval in which the periodic data updates will be restarted after an error.
   */
  private errorUpdatePeriod = 5 * 1000;

  private dataRefreshSubscription: Subscription;

  // Coin the current instance will work with.
  private currentCoin: Coin;

  // Services used by this operator.
  private ethApiService: EthApiService;
  private ngZone: NgZone;

  constructor(injector: Injector, currentCoin: Coin) {
    // Get the services.
    this.ethApiService = injector.get(EthApiService);
    this.ngZone = injector.get(NgZone);

    this.currentCoin = currentCoin;

    // Intervals for updating the data must be longer if connecting to a remote node.
    if (!currentCoin.isLocal) {
      this.updatePeriod = 120 * 1000;
      this.errorUpdatePeriod = 30 * 1000;
    }

    // Start updating the data periodically.
    this.startDataRefreshSubscription(0);
  }

  dispose() {
    if (this.dataRefreshSubscription) {
      this.dataRefreshSubscription.unsubscribe();
    }
  }

  connections(): Observable<Connection[]> {
    // Data not available for this coin type
    return of(null);
  }

  /**
   * Makes the operator start updating the data periodically. If this function was called
   * before, the previous updating procedure is cancelled.
   * @param delayMs Delay before starting to update the data.
   */
  private startDataRefreshSubscription(delayMs: number) {
    if (this.dataRefreshSubscription) {
      this.dataRefreshSubscription.unsubscribe();
    }

    this.ngZone.runOutsideAngular(() => {
      this.dataRefreshSubscription = of(0).pipe(delay(delayMs), mergeMap(() => {
        return this.ethApiService.callRpcMethod(this.currentCoin.nodeUrl, 'net_peerCount');
      })).subscribe(result => {
        this.ngZone.run(() => {
          this.noConnectionsInternal = environment.ignoreNonFiberNetworIssues ? false : new BigNumber((result as string).substr(2), 16).isLessThan(1);
        });

        // Repeat the operation after an appropiate delay.
        this.startDataRefreshSubscription(this.updatePeriod);
      }, () => this.startDataRefreshSubscription(this.errorUpdatePeriod));
    });
  }
}

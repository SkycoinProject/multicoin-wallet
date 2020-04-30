import { mergeMap, delay } from 'rxjs/operators';
import { NgZone, Injector } from '@angular/core';
import { Subject, BehaviorSubject, Observable, of, Subscription } from 'rxjs';

import { NetworkOperator, Connection, ConnectionSources } from '../network-operator';
import { Coin } from '../../../coins/coin';
import { FiberApiService } from '../../api/fiber-api.service';

/**
 * Operator for NetworkService to be used with Fiber coins.
 *
 * You can find more information about the functions and properties this class implements by
 * checking NetworkService and NetworkOperator.
 */
export class FiberNetworkOperator implements NetworkOperator {
  get noConnections(): boolean {
    return this.noConnectionsInternal;
  }
  noConnectionsInternal = false;

  /**
   * Time interval in which periodic data updates will be made.
   */
  private readonly updatePeriod = 5 * 1000;
  /**
   * Time interval in which the periodic data updates will be restarted after an error.
   */
  private readonly errorUpdatePeriod = 5 * 1000;

  /**
   * List of default addresses to which the node will always try connect to when started.
   */
  private trustedAddresses: string[];

  private dataRefreshSubscription: Subscription;

  /**
   * Emits the lists of remote nodes to which the node is currently connected.
   */
  private connectionsSubject: Subject<Connection[]> = new BehaviorSubject<Connection[]>([]);

  // Coin the current instance will work with.
  private currentCoin: Coin;

  // Services used by this operator.
  private fiberApiService: FiberApiService;
  private ngZone: NgZone;

  constructor(injector: Injector, currentCoin: Coin) {
    // Get the services.
    this.fiberApiService = injector.get(FiberApiService);
    this.ngZone = injector.get(NgZone);

    this.currentCoin = currentCoin;

    // Start updating the data periodically.
    this.startDataRefreshSubscription(0);
  }

  dispose() {
    if (this.dataRefreshSubscription) {
      this.dataRefreshSubscription.unsubscribe();
    }

    this.connectionsSubject.complete();
  }

  connections(): Observable<Connection[]> {
    return this.connectionsSubject.asObservable();
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
        // Get the list of default remote nodes, but only if the list has not been
        // obtained before.
        if (!this.trustedAddresses) {
          return this.fiberApiService.get(this.currentCoin.nodeUrl, 'network/defaultConnections');
        } else {
          return of(this.trustedAddresses);
        }
      }), mergeMap(defaultConnectionsResponse => {
        this.trustedAddresses = defaultConnectionsResponse;

        // Get the list of current connections.
        return this.fiberApiService.get(this.currentCoin.nodeUrl, 'network/connections');
      })).subscribe(connectionsResponse => {
        if (connectionsResponse.connections === null || connectionsResponse.connections.length === 0) {
          this.noConnectionsInternal = true;
          this.ngZone.run(() => this.connectionsSubject.next([]));
          this.startDataRefreshSubscription(this.updatePeriod);

          return;
        }

        this.noConnectionsInternal = false;

        // Process the obtained remote connections and convert them to a known object type.
        const currentConnections = (connectionsResponse.connections as any[]).map<Connection>(connection => {
          return {
            address: connection.address,
            listenPort: connection.listen_port,
            outgoing: connection.outgoing,
            height: connection.height,
            lastSent: connection.last_sent,
            lastReceived: connection.last_received,
            source: this.trustedAddresses.find(trustedAddress => trustedAddress === connection.address) ? ConnectionSources.Default : ConnectionSources.Exchange,
          };
        }).sort((a, b) => a.address.localeCompare(b.address));

        this.ngZone.run(() => this.connectionsSubject.next(currentConnections));

        // Repeat the operation after an appropiate delay.
        this.startDataRefreshSubscription(this.updatePeriod);
      }, () => this.startDataRefreshSubscription(this.errorUpdatePeriod));
    });
  }
}

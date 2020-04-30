import { of, Observable } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { Injector } from '@angular/core';

import { Coin } from '../../../coins/coin';
import { FiberApiService } from '../../api/fiber-api.service';
import { WalletUtilsOperator } from '../wallet-utils-operator';

/**
 * Operator for WalletUtilsService to be used with Fiber coins.
 *
 * NOTE: The compatibility with coins not being managed by the local node is extremely limited
 * at this time.
 *
 * You can find more information about the functions and properties this class implements by
 * checking WalletUtilsOperator and WalletUtilsService.
 */
export class FiberWalletUtilsOperator implements WalletUtilsOperator {
  // Coin the current instance will work with.
  private currentCoin: Coin;

  // Services used by this operator.
  private fiberApiService: FiberApiService;

  constructor(injector: Injector, currentCoin: Coin) {
    // Get the services.
    this.fiberApiService = injector.get(FiberApiService);

    this.currentCoin = currentCoin;
  }

  dispose() { }

  verifyAddress(address: string): Observable<boolean> {
    return this.fiberApiService.post(this.currentCoin.nodeUrl, 'address/verify', { address }, {useV2: true})
      .pipe(map(() => true), catchError(() => of(false)));
  }

  verifySeed(seed: string): Observable<boolean> {
    return this.fiberApiService.post(this.currentCoin.nodeUrl, 'wallet/seed/verify', {seed: seed}, {useV2: true})
      .pipe(map(() => true), catchError(() => of(false)));
  }

  generateSeed(entropy: number): Observable<string> {
    return this.fiberApiService.get(this.currentCoin.nodeUrl, 'wallet/newSeed', { entropy }).pipe(map(response => response.seed));
  }
}

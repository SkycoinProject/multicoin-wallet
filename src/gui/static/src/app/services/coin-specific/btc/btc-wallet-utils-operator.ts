import { of, Observable, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { Injector } from '@angular/core';

import { Coin } from '../../../coins/coin';
import { FiberApiService } from '../../api/fiber-api.service';
import { WalletUtilsOperator } from '../wallet-utils-operator';
import { BtcApiService } from '../../api/btc-api.service';
import { OperationError, OperationErrorTypes } from 'app/utils/operation-error';
import { processServiceError } from 'app/utils/errors';

/**
 * Operator for WalletUtilsService to be used with btc-like coins.
 *
 * You can find more information about the functions and properties this class implements by
 * checking WalletUtilsOperator and WalletUtilsService.
 */
export class BtcWalletUtilsOperator implements WalletUtilsOperator {
  // Coin the current instance will work with.
  private currentCoin: Coin;

  // Services used by this operator.
  private fiberApiService: FiberApiService;
  private btcApiService: BtcApiService;

  constructor(injector: Injector, currentCoin: Coin) {
    // Get the services.
    this.fiberApiService = injector.get(FiberApiService);
    this.btcApiService = injector.get(BtcApiService);

    this.currentCoin = currentCoin;
  }

  dispose() { }

  verifyAddress(address: string): Observable<boolean> {
    return this.btcApiService.callRpcMethod(this.currentCoin.nodeUrl, 'validateaddress', [address]).pipe(
      map(result => result.isvalid === true),
      catchError((err: OperationError) => {
        err = processServiceError(err);

        // Return false in case of error, but not if the error was for a connection problem.
        if (err.type !== OperationErrorTypes.NoInternet) {
          return of(false);
        } else {
          return throwError(err);
        }
      }),
    );
  }
}

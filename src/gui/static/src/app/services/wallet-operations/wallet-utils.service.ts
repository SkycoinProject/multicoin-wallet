import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { Injectable } from '@angular/core';

import { FiberApiService } from '../api/fiber-api.service';
import { WalletUtilsOperator } from '../coin-specific/wallet-utils-operator';
import { OperatorService } from '../operators.service';
import { environment } from '../../../environments/environment';

/**
 * Includes help functions for working with the wallets.
 */
@Injectable()
export class WalletUtilsService {
  /**
   * Instance with the actual code for making most of the operations of this service. It is
   * specific for the currently selected coin.
   */
  private operator: WalletUtilsOperator;

  constructor(
    private fiberApiService: FiberApiService,
    operatorService: OperatorService,
  ) {
    // Maintain the operator updated.
    operatorService.currentOperators.subscribe(operators => {
      if (operators) {
        this.operator = operators.walletUtilsOperator;
      } else {
        this.operator = null;
      }
    });
  }

  /**
   * Gets the path of the folder were the local node saves the data of the software wallets it manages.
   */
  folder(): Observable<string> {
    return this.fiberApiService.get(environment.nodeUrl, 'wallets/folderName').pipe(map(response => response.address));
  }

  /**
   * Checks if a string is a valid address.
   * @param address String to check.
   * @returns True if the address is valid or false otherwise.
   */
  verifyAddress(address: string): Observable<boolean> {
    return this.operator.verifyAddress(address);
  }

  /**
   * Checks if a string is a valid seed.
   * @param address String to check.
   * @returns True if the seed is valid or false otherwise.
   */
  verifySeed(seed: string): Observable<boolean> {
    return this.fiberApiService.post(environment.nodeUrl, 'wallet/seed/verify', {seed: seed}, {useV2: true})
      .pipe(map(() => true), catchError(() => of(false)));
  }

  /**
   * Creates a new random seed.
   * @param entropy Use 128 for a 12 word seed or 256 for a 24 word seed.
   */
  generateSeed(entropy: number): Observable<string> {
    if (entropy !== 128 && entropy !== 256) {
      throw new Error('Invalid entropy value.');
    }

    return this.fiberApiService.get(environment.nodeUrl, 'wallet/newSeed', { entropy }).pipe(map(response => response.seed));
  }
}

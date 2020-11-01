import { Injector } from '@angular/core';

import { OperatorSet } from '../operators.service';
import { Coin } from '../../coins/coin';

/**
 * Interface for the classes in charge of creating all the operators of a coin.
 */
export interface OperatorsGenerator {
  /**
   * Generates a complete set of operators for a coin.
   */
  generate(coin: Coin, injector: Injector): OperatorSet;
}

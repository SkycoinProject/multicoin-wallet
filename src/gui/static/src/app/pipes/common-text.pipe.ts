import { Pipe, PipeTransform } from '@angular/core';

import { CoinService } from '../services/coin.service';

/**
 * Returns the name of a commonly used element. The posible values are:
 * hours: returns the name of the coin hours.
 * coin: returns the short name of the coin, like 'SKY' for Skycoin.
 * coinFull: returns the full name of the coin, like 'Skycoin'.
 * The pipe expect the value to be exactly one of the previously listed strings.
 */
@Pipe({
  name: 'commonText',
  pure: false,
})
export class CommonTextPipe implements PipeTransform {

  constructor(
    private coinService: CoinService,
  ) { }

  transform(value: string) {
    if (value === 'hours') {
      return this.coinService.currentCoinInmediate.hoursName;
    } else if (value === 'coinSymbol') {
      return this.coinService.currentCoinInmediate.coinSymbol;
    } else if (value === 'coinFull') {
      return this.coinService.currentCoinInmediate.coinName;
    }

    return '';
  }
}

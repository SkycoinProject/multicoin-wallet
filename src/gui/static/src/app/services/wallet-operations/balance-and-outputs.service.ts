import { Observable } from 'rxjs';
import { Injectable } from '@angular/core';

import { WalletWithBalance, WalletBase, WalletWithOutputs } from './wallet-objects';
import { Output } from './transaction-objects';
import { BalanceAndOutputsOperator } from '../coin-specific/balance-and-outputs-operator';
import { OperatorService } from '../operators.service';

/**
 * Allows to get the balance of the wallets and is in chage of maintaining those balances updated.
 * It also allows to get the unspent outputs of the wallets and lists of addresses.
 */
@Injectable()
export class BalanceAndOutputsService {
  /**
   * Instance with the actual code for making most of the operations of this service. It is
   * specific for the currently selected coin.
   */
  private operator: BalanceAndOutputsOperator;

  constructor(operatorService: OperatorService) {
    // Maintain the operator updated.
    operatorService.currentOperators.subscribe(operators => {
      if (operators) {
        this.operator = operators.balanceAndOutputsOperator;
      } else {
        this.operator = null;
      }
    });
  }

  /**
   * Gets the last moment in which the balance was updated. Emits every time the system
   * finishes checking the balance.
   */
  get lastBalancesUpdateTime(): Observable<Date> {
    return this.operator.lastBalancesUpdateTime;
  }

  /**
   * Gets the wallet list, with the balance of each wallet and address. It emits when the
   * wallet list is updated and when the balance changes. Every time this observable emits,
   * the wallet array is returned, but in fact, if there are not important changes in the
   * structure of the wallets, if the only change was in the balance, the service will try
   * to always update the values in the same array, this means that in most cases you will have
   * the updated balance even if not listening to new events. Please note that the list will
   * tell all the wallets have balance 0 util the service finishes connecting to the
   * backend node for the first time. Also note that if any value of the returned wallets
   * is modified, the changes must be notified to the wallets service or the behavior will
   * be indeterminate.
   */
  get walletsWithBalance(): Observable<WalletWithBalance[]> {
    return this.operator.walletsWithBalance;
  }

  /**
   * Indicates if there are pending transactions affecting any of the wallets of the
   * wallet list.
   */
  get hasPendingTransactions(): Observable<boolean> {
    return this.operator.hasPendingTransactions;
  }

  /**
   * Indicates if the service already got the balances of the wallets from the node for
   * the first time. The wallets returned by walletsWithBalance will always show blance 0
   * until this property returns true.
   */
  get firstFullUpdateMade(): Observable<boolean> {
    return this.operator.firstFullUpdateMade;
  }

  /**
   * Indicates if the last time the system tried to refresh the balance there was an error.
   */
  get hadErrorRefreshingBalance(): Observable<boolean> {
    return this.operator.hadErrorRefreshingBalance;
  }

  /**
   * Indicates if the balance is currently beeing refreshed.
   */
  get refreshingBalance(): Observable<boolean> {
    return this.operator.refreshingBalance;
  }

  /**
   * Gets the wallet list, with the unspent outputs of each address. It emits when the
   * wallet list is updated and when the balance changes. Please note that if any value
   * of the returned wallets is modified, the changes must be notified to the wallets
   * service or the behavior will be indeterminate. The response will include confirmed and
   * unconfirmed outputs.
   */
  get outputsWithWallets(): Observable<WalletWithOutputs[]> {
    return this.operator.outputsWithWallets;
  }

  /**
   * Gets the list of confirmed unspent outputs of a list of addresses. The data is not
   * automatically updated.
   * @param addresses List of addresses, comma separated.
   * @returns Array with all the unspent outputs owned by any of the provide addresses.
   */
  getOutputs(addresses: string): Observable<Output[]> {
    return this.operator.getOutputs(addresses);
  }

  /**
   * Gets the list of confirmed unspent outputs owned by a wallet. The data is not
   * automatically updated.
   * @param wallet Wallet to check.
   * @returns Array with all the unspent outputs owned by any of the addresses of the wallet.
   */
  getWalletUnspentOutputs(wallet: WalletBase): Observable<Output[]> {
    return this.operator.getWalletUnspentOutputs(wallet);
  }

  /**
   * Asks the service to update the balance inmediatelly.
   */
  refreshBalance() {
    return this.operator.refreshBalance();
  }
}

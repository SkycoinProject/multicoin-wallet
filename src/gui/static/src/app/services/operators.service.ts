import { Observable, BehaviorSubject } from 'rxjs';
import { Injectable, Injector } from '@angular/core';

import { BalanceAndOutputsOperator } from './coin-specific/balance-and-outputs-operator';
import { BlockchainOperator } from './coin-specific/blockchain-operator';
import { HistoryOperator } from './coin-specific/history-operator';
import { NetworkOperator } from './coin-specific/network-operator';
import { NodeOperator } from './coin-specific/node-operator';
import { SoftwareWalletOperator } from './coin-specific/software-wallet-operator';
import { SpendingOperator } from './coin-specific/spending-operator';
import { WalletUtilsOperator } from './coin-specific/wallet-utils-operator';
import { WalletsAndAddressesOperator } from './coin-specific/wallets-and-addresses-operator';
import { CoinService } from './coin.service';
import { OperatorsGenerator } from './coin-specific/operators-generator';
import { CoinTypes } from '../coins/coin-types';

/**
 * Set will all the operators needed for a coin.
 */
export interface OperatorSet {
  balanceAndOutputsOperator: BalanceAndOutputsOperator;
  blockchainOperator: BlockchainOperator;
  historyOperator: HistoryOperator;
  networkOperator: NetworkOperator;
  nodeOperator: NodeOperator;
  softwareWalletOperator: SoftwareWalletOperator;
  spendingOperator: SpendingOperator;
  walletUtilsOperator: WalletUtilsOperator;
  walletsAndAddressesOperator: WalletsAndAddressesOperator;
}

/**
 * Service in charge of updating the operators every time the coin changes.
 */
@Injectable()
export class OperatorService {
  /**
   * Currently active operators.
   */
  private operators: OperatorSet;
  private currentOperatorsSubject: BehaviorSubject<OperatorSet> = new BehaviorSubject<OperatorSet>(null);

  constructor(
    private coinService: CoinService,
    private injector: Injector,
  ) { }

  /**
   * Returns the currently active operators. It returns null while the operators
   * are being created.
   */
  get currentOperators(): Observable<OperatorSet> {
    return this.currentOperatorsSubject.asObservable();
  }

  initialize(fiberOperatorsGenerator: OperatorsGenerator, btcOperatorsGenerator: OperatorsGenerator) {
    this.coinService.currentCoin.subscribe(coin => {
      // Wait 1 frame before removing the operators, to give time for the pages to
      // be removed.
      setTimeout(() => {
        if (this.operators) {
          this.operators.balanceAndOutputsOperator.dispose();
          this.operators.blockchainOperator.dispose();
          this.operators.historyOperator.dispose();
          this.operators.networkOperator.dispose();
          this.operators.nodeOperator.dispose();
          this.operators.softwareWalletOperator.dispose();
          this.operators.spendingOperator.dispose();
          this.operators.walletUtilsOperator.dispose();
          this.operators.walletsAndAddressesOperator.dispose();
        }

        this.currentOperatorsSubject.next(null);

        // Replace the current operators.
        if (coin.coinType === CoinTypes.Fiber) {
          this.operators = fiberOperatorsGenerator.generate(coin, this.injector);
        } else {
          this.operators = btcOperatorsGenerator.generate(coin, this.injector);
        }

        this.currentOperatorsSubject.next(this.operators);
      });
    });
  }
}

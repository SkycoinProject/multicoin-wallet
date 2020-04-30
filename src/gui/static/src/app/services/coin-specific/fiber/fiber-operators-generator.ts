import { Injector } from '@angular/core';

import { OperatorSet } from '../../operators.service';
import { Coin } from '../../../coins/coin';
import { OperatorsGenerator } from '../operators-generator';
import { FiberBalanceAndOutputsOperator } from './fiber-balance-and-outputs-operator';
import { FiberBlockchainOperator } from './fiber-blockchain-operator';
import { FiberHistoryOperator } from './fiber-history-operator';
import { FiberNetworkOperator } from './fiber-network-operator';
import { FiberNodeOperator } from './fiber-node-operator';
import { FiberSoftwareWalletOperator } from './fiber-software-wallet-operator';
import { FiberSpendingOperator } from './fiber-spending-operator';
import { FiberWalletUtilsOperator } from './fiber-wallet-utils-operator';
import { FiberWalletsAndAddressesOperator } from './fiber-wallets-and-addresses-operator';

/**
 * Generates the complete set of operators for fiber coins.
 */
export class FiberOperatorsGenerator implements OperatorsGenerator {
  generate(coin: Coin, injector: Injector): OperatorSet {
    return {
      balanceAndOutputsOperator: new FiberBalanceAndOutputsOperator(injector, coin),
      blockchainOperator: new FiberBlockchainOperator(injector, coin),
      historyOperator: new FiberHistoryOperator(injector, coin),
      networkOperator: new FiberNetworkOperator(injector, coin),
      nodeOperator: new FiberNodeOperator(injector, coin),
      softwareWalletOperator: new FiberSoftwareWalletOperator(injector, coin),
      spendingOperator: new FiberSpendingOperator(injector, coin),
      walletUtilsOperator: new FiberWalletUtilsOperator(injector, coin),
      walletsAndAddressesOperator: new FiberWalletsAndAddressesOperator(injector, coin),
    };
  }
}

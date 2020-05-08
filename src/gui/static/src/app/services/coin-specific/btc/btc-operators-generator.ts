import { Injector } from '@angular/core';

import { OperatorSet } from '../../operators.service';
import { Coin } from '../../../coins/coin';
import { OperatorsGenerator } from '../operators-generator';
import { FiberSoftwareWalletOperator } from '../fiber/fiber-software-wallet-operator';
import { FiberSpendingOperator } from '../fiber/fiber-spending-operator';
import { FiberWalletUtilsOperator } from '../fiber/fiber-wallet-utils-operator';
import { BtcNodeOperator } from './btc-node-operator';
import { BtcWalletsAndAddressesOperator } from './btc-wallets-and-addresses-operator';
import { BtcBalanceAndOutputsOperator } from './btc-balance-and-outputs-operator';
import { BtcBlockchainOperator } from './btc-blockchain-operator';
import { BtcNetworkOperator } from './btc-network-operator';
import { BtcHistoryOperator } from './btc-history-operator';

/**
 * Generates the complete set of operators for btc-like coins.
 */
export class BtcOperatorsGenerator implements OperatorsGenerator {
  generate(coin: Coin, injector: Injector): OperatorSet {
    return {
      balanceAndOutputsOperator: new BtcBalanceAndOutputsOperator(injector, coin),
      blockchainOperator: new BtcBlockchainOperator(injector, coin),
      historyOperator: new BtcHistoryOperator(injector, coin),
      networkOperator: new BtcNetworkOperator(injector, coin),
      nodeOperator: new BtcNodeOperator(injector, coin),
      softwareWalletOperator: new FiberSoftwareWalletOperator(injector, coin),
      spendingOperator: new FiberSpendingOperator(injector, coin),
      walletUtilsOperator: new FiberWalletUtilsOperator(injector, coin),
      walletsAndAddressesOperator: new BtcWalletsAndAddressesOperator(injector, coin),
    };
  }
}

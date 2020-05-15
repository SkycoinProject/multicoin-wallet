import { Injector } from '@angular/core';

import { OperatorSet } from '../../operators.service';
import { Coin } from '../../../coins/coin';
import { OperatorsGenerator } from '../operators-generator';
import { FiberSoftwareWalletOperator } from '../fiber/fiber-software-wallet-operator';
import { FiberWalletUtilsOperator } from '../fiber/fiber-wallet-utils-operator';
import { BtcBalanceAndOutputsOperator } from '../btc/btc-balance-and-outputs-operator';
import { BtcHistoryOperator } from '../btc/btc-history-operator';
import { BtcSpendingOperator } from '../btc/btc-spending-operator';
import { EthNetworkOperator } from './eth-network-operator';
import { EthNodeOperator } from './eth-node-operator';
import { EthWalletsAndAddressesOperator } from './eth-wallets-and-addresses-operator';
import { EthBlockchainOperator } from './eth-blockchain-operator';

/**
 * Generates the complete set of operators for eth-like coins.
 */
export class EthOperatorsGenerator implements OperatorsGenerator {
  generate(coin: Coin, injector: Injector): OperatorSet {
    return {
      balanceAndOutputsOperator: new BtcBalanceAndOutputsOperator(injector, coin),
      blockchainOperator: new EthBlockchainOperator(injector, coin),
      historyOperator: new BtcHistoryOperator(injector, coin),
      networkOperator: new EthNetworkOperator(injector, coin),
      nodeOperator: new EthNodeOperator(injector, coin),
      softwareWalletOperator: new FiberSoftwareWalletOperator(injector, coin),
      spendingOperator: new BtcSpendingOperator(injector, coin),
      walletUtilsOperator: new FiberWalletUtilsOperator(injector, coin),
      walletsAndAddressesOperator: new EthWalletsAndAddressesOperator(injector, coin),
    };
  }
}

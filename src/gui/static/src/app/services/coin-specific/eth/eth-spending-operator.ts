import { throwError as observableThrowError, of, Observable, Subscription } from 'rxjs';
import { concat, delay, retryWhen, take, mergeMap, catchError, map, filter, first } from 'rxjs/operators';
import { Injector } from '@angular/core';
import { BigNumber } from 'bignumber.js';
import { TranslateService } from '@ngx-translate/core';

import { HwWalletService } from '../../hw-wallet.service';
import { StorageService, StorageType } from '../../storage.service';
import { WalletBase } from '../../wallet-operations/wallet-objects';
import { GeneratedTransaction, Output, Input } from '../../wallet-operations/transaction-objects';
import { Coin } from '../../../coins/coin';
import { TransactionDestination, HoursDistributionOptions, RecommendedFees } from '../../wallet-operations/spending.service';
import { SpendingOperator } from '../spending-operator';
import { BalanceAndOutputsOperator } from '../balance-and-outputs-operator';
import { OperatorService } from '../../operators.service';
import { EthApiService } from '../../api/eth-api.service';

/**
 * Operator for SpendingService to be used with eth-like coins.
 *
 * NOTE: still under heavy development.
 *
 * You can find more information about the functions and properties this class implements by
 * checking SpendingOperator and SpendingService.
 */
export class EthSpendingOperator implements SpendingOperator {
  // Coin the current instance will work with.
  private currentCoin: Coin;

  private operatorsSubscription: Subscription;

  // Services and operators used by this operator.
  private ethApiService: EthApiService;
  private hwWalletService: HwWalletService;
  private translate: TranslateService;
  private storageService: StorageService;
  private balanceAndOutputsOperator: BalanceAndOutputsOperator;

  constructor(injector: Injector, currentCoin: Coin) {
    // Get the services.
    this.ethApiService = injector.get(EthApiService);
    this.hwWalletService = injector.get(HwWalletService);
    this.translate = injector.get(TranslateService);
    this.storageService = injector.get(StorageService);

    // Get the operators.
    this.operatorsSubscription = injector.get(OperatorService).currentOperators.pipe(filter(operators => !!operators), first()).subscribe(operators => {
      this.balanceAndOutputsOperator = operators.balanceAndOutputsOperator;
    });

    this.currentCoin = currentCoin;
  }

  dispose() {
    this.operatorsSubscription.unsubscribe();
  }

  createTransaction(
    wallet: WalletBase|null,
    addresses: string[]|null,
    unspents: Output[]|null,
    destinations: TransactionDestination[],
    hoursDistributionOptions: HoursDistributionOptions,
    changeAddress: string|null,
    password: string|null,
    unsigned: boolean,
    fee: string): Observable<GeneratedTransaction> {

    // The transaction can only have one source and destination.
    if (destinations.length !== 1) {
      throw new Error('Only one destination is allowed.');
    }
    // Only one input address is used.
    // TODO: prevent problems related to this.
    if (addresses) {
      addresses = [addresses[0]];
    }

    // Create a string indicating where the coins come from.
    let senderString = '';
    if (wallet) {
      senderString = wallet.label;
    } else if (addresses) {
      senderString = addresses[0];
    }

    // Select a change address.
    if (!changeAddress) {
      if (wallet) {
        changeAddress = wallet.addresses[0].address;
      } else if (addresses) {
        changeAddress = addresses[0];
      }
    }

    const txInputs: Input[] = [{
      address: addresses ? addresses[0] : wallet.addresses[0].address,
      coins: new BigNumber(0),
      hash: '',
    }];

    const txOutputs: Output[] = [{
      address: destinations[0].address,
      coins: new BigNumber(destinations[0].coins),
      hash: '',
    }];

    const tx: GeneratedTransaction = {
      inputs: txInputs,
      outputs: txOutputs,
      coinsToSend: new BigNumber(destinations[0].coins),
      fee: new BigNumber(0),
      from: senderString,
      to: destinations[0].address,
      wallet: wallet,
      encoded: null,
      innerHash: '',
    };

    return of(tx);
  }

  signTransaction(
    wallet: WalletBase,
    password: string|null,
    transaction: GeneratedTransaction,
    rawTransactionString = ''): Observable<string> {
      return null;
  }

  injectTransaction(encodedTx: string, note: string|null): Observable<boolean> {
    return null;
  }

  getCurrentRecommendedFees(): Observable<RecommendedFees> {
    // Get the recommended fee from the node.
    return this.ethApiService.callRpcMethod(this.currentCoin.nodeUrl, 'eth_gasPrice').pipe(map(result => {
      return {
        recommendedEthFees: {
          // The response is converted from Wei to Gwei.
          gasPrice: new BigNumber((result as string).substr(2), 16).dividedBy(1000000000),
          // Default gas limit for normal coin sending transactions.
          gasLimit: new BigNumber(21000),
        },
        recommendedBtcFees: null,
      };

    }), retryWhen(errors => errors.pipe(delay(5000))));
  }
}

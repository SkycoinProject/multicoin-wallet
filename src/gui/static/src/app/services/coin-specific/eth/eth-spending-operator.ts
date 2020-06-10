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
import { EthCoinConfig } from '../../../coins/config/eth.coin-config';
import { EthTransactionData, EthTxEncoder } from './utils/eth-tx-encoder';

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

    // Get the gas price (first part of the fee string) and max gas (second part).
    const feeParts = fee.split('/');
    if (feeParts.length !== 2) {
      throw new Error('Invalid fee format.');
    }
    // Aproximate transaction fee.
    const calculatedFee = this.calculateFinalFee(0, 0, new BigNumber(feeParts[0]), new BigNumber(feeParts[1]));

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
      fee: calculatedFee,
      from: senderString,
      to: destinations[0].address,
      wallet: wallet,
      encoded: '',
      innerHash: '',
    };

    // Get how many transactions the address has, for using it as nonce.
    let response = this.ethApiService.callRpcMethod(this.currentCoin.nodeUrl, 'eth_getTransactionCount', [addresses[0], 'pending']).pipe(map((result: string) => {
      // Needed for calculating the value in wei.
      const decimalsCorrector = new BigNumber(10).exponentiatedBy((this.currentCoin.config as EthCoinConfig).decimals);

      // Encode the transaction.
      const txForEncoding: EthTransactionData = {
        data: '',
        destinationAddress: destinations[0].address,
        value: new BigNumber(destinations[0].coins).multipliedBy(decimalsCorrector),
        gasPriceInWei: new BigNumber(feeParts[0]).multipliedBy(1000000000),
        gasLimit: new BigNumber(feeParts[1]),
        nonce: new BigNumber(result.substr(2), 16),
        chainId: new BigNumber((this.currentCoin.config as EthCoinConfig).chainId),
      };
      tx.encoded = EthTxEncoder.encodeUnsigned(txForEncoding);

      return tx;
    }));

    // If required, append to the response the steps needed for signing the transaction.
    if (!unsigned) {
      let unsignedTx: GeneratedTransaction;

      response = response.pipe(mergeMap(transaction => {
        unsignedTx = transaction;

        return this.signTransaction(wallet, null, transaction);
      })).pipe(map(encodedSignedTx => {
        unsignedTx.encoded = encodedSignedTx;

        return unsignedTx;
      }));
    }

    return response;
  }

  calculateFinalFee(howManyInputs: number, howManyOutputs: number, feePerUnit: BigNumber, maxUnits: BigNumber): BigNumber {
    // Needed for returning the value in coins, not wei.
    const decimalsCorrector = new BigNumber(10).exponentiatedBy((this.currentCoin.config as EthCoinConfig).decimals);

    // feePerUnit is in gwei, so it has to be multiplied by 1000000000.
    return maxUnits.multipliedBy(feePerUnit.multipliedBy(1000000000)).dividedBy(decimalsCorrector);
  }

  signTransaction(
    wallet: WalletBase,
    password: string|null,
    transaction: GeneratedTransaction,
    rawTransactionString = ''): Observable<string> {

    const tx = rawTransactionString ? rawTransactionString : transaction.encoded;

    // Get the test signature.
    const signature = this.getSignature();
    const r = signature.substr(0, 64);
    const s = signature.substr(64);

    return of(EthTxEncoder.addSignatureToRawTx(tx, new BigNumber((this.currentCoin.config as EthCoinConfig).chainId), r, s, 0));
  }

  /**
   * Temporal function, only for testing, for getting a signature for signing a transaction. For
   * using it, you must add the signature inside the code.
   */
  private getSignature() {
    return '13b0dbb70d09a3665ec693aec1b1b1a3b2aaefdf3c57f963a0229c83d1883c386b2171092d7e8f3d0087d01832e389392223993e0d14440ad6f0295f8e5e219d';
  }

  injectTransaction(encodedTx: string, note: string|null): Observable<boolean> {
    return this.ethApiService.callRpcMethod(this.currentCoin.nodeUrl, 'eth_sendRawTransaction', [encodedTx]).pipe(map(() => {
      return true;
    }));
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
        thereWereProblems: false,
      };

    }), retryWhen(errors => errors.pipe(delay(5000))));
  }
}

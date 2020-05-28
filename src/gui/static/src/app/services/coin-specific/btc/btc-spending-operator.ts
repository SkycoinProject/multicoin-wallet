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
import { BtcApiService } from '../../api/btc-api.service';
import { getOutputId } from './utils/btc-history-utils';
import { BtcCoinConfig } from '../../../coins/config/btc.coin-config';

/**
 * Operator for SpendingService to be used with btc-like coins.
 *
 * NOTE: still under heavy development.
 *
 * You can find more information about the functions and properties this class implements by
 * checking SpendingOperator and SpendingService.
 */
export class BtcSpendingOperator implements SpendingOperator {
  // Coin the current instance will work with.
  private currentCoin: Coin;

  private operatorsSubscription: Subscription;

  // Services and operators used by this operator.
  private btcApiService: BtcApiService;
  private hwWalletService: HwWalletService;
  private translate: TranslateService;
  private storageService: StorageService;
  private balanceAndOutputsOperator: BalanceAndOutputsOperator;

  constructor(injector: Injector, currentCoin: Coin) {
    // Get the services.
    this.btcApiService = injector.get(BtcApiService);
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

    // TODO: more validations are needed.

    // Create a string indicating where the coins come from.
    let senderString = '';
    if (wallet) {
      senderString = wallet.label;
    } else {
      if (addresses) {
        senderString = addresses.join(', ');
      } else if (unspents) {
        senderString = unspents.map(output => output.hash).join(', ');
      }
    }

    // Select a change address.
    if (!changeAddress) {
      if (wallet) {
        changeAddress = wallet.addresses[0].address;
      } else if (addresses) {
        changeAddress = addresses[0];
      } else if (unspents) {
        changeAddress = unspents[0].address;
      }
    }

    let response: Observable<any>;

    // Get a list with available outputs for the transaction.
    if (unspents) {
      response = of(unspents);
    } else {
      // Get all the outputs of the provided wallet or address list.
      let AddressesToCheck: string[] = [];
      if (addresses) {
        AddressesToCheck = addresses;
      } else {
        wallet.addresses.forEach(address => AddressesToCheck.push(address.address));
      }

      response = this.balanceAndOutputsOperator.getOutputs(AddressesToCheck.join(','));
    }

    // Inputs that will be used for the transaction.
    const inputs: Output[] = [];
    const inputsMap = new Map<string, Output>();
    // Transaction in raw format.
    let rawTransaction: string;
    // How many coins will be sent.
    let amountToSend = new BigNumber(0);
    // How many coin the inputs have.
    let coinsInInputs = new BigNumber(0);
    // Transaction fee.
    let calculatedFee = new BigNumber(0);

    response = response.pipe(mergeMap((availableOutputs: Output[]) => {
      // Order the available outputs from highest to lowest according to the amount of coins.
      availableOutputs = availableOutputs.sort((a, b) => b.coins.minus(a.coins).toNumber());

      destinations.forEach(destination => amountToSend = amountToSend.plus(destination.coins));

      // Start adding inputs until having the coins needed.
      for (let i = 0; i < availableOutputs.length; i++) {
        inputs.push(availableOutputs[i]);
        inputsMap.set(availableOutputs[i].hash, availableOutputs[i]);

        coinsInInputs = coinsInInputs.plus(availableOutputs[i].coins);

        if (coinsInInputs.isGreaterThanOrEqualTo(amountToSend)) {
          break;
        }
      }

      // Convert the inputs to the formar needed by the API.
      const inputsForNode = [];
      inputs.forEach(input => {
        // BTC output hashes are saved as the transaction hash and the output number,
        // separated by '/'.
        const hashParts = input.hash.split('/');
        if (hashParts.length !== 2) {
          throw new Error('Unexpected input hash');
        }

        inputsForNode.push({
          txid: hashParts[0],
          vout: Number.parseInt(hashParts[1], 10),
        });
      });

      calculatedFee = coinsInInputs;

      // Convert the outputs to the formar needed by the API. The coins of each output is
      // removed from the fee.
      const outputsForNode = {};
      destinations.forEach(destination => {
        outputsForNode[destination.address] = new BigNumber(destination.coins).toNumber();
        calculatedFee = calculatedFee.minus(destination.coins);
      });

      // Create an extra output for the remaining coins.
      if (coinsInInputs.minus(amountToSend).isGreaterThan(0)) {
        outputsForNode[changeAddress] = coinsInInputs.minus(amountToSend).toNumber();
        calculatedFee = calculatedFee.minus(coinsInInputs.minus(amountToSend));
      }

      // Create the raw transaction.
      return this.btcApiService.callRpcMethod(this.currentCoin.nodeUrl, 'createrawtransaction', [inputsForNode, outputsForNode]);
    }), mergeMap(generatedRawTransaction => {
      rawTransaction = generatedRawTransaction;

      // Decode the raw transaction.
      return this.btcApiService.callRpcMethod(this.currentCoin.nodeUrl, 'decoderawtransaction', [rawTransaction]);
    }), map(transaction => {
      // Return an error if using a hw wallet and the transaction has too many inputs or outputs.
      if (wallet && wallet.isHardware) {
        if (transaction.vin.length > 8) {
          throw new Error(this.translate.instant('hardware-wallet.errors.too-many-inputs-outputs'));
        }
        if (transaction.vout.length > 8) {
          throw new Error(this.translate.instant('hardware-wallet.errors.too-many-inputs-outputs'));
        }
      }

      // Process the inputs returned by the node and create a known objects.
      const processedInputs: Input[] = (transaction.vin as any[]).map(input => {
        if (inputsMap.has(getOutputId(input.txid, input.vout))) {
          return {
            hash: getOutputId(input.txid, input.vout),
            address: inputsMap.get(getOutputId(input.txid, input.vout)).address,
            coins: inputsMap.get(getOutputId(input.txid, input.vout)).coins,
          };
        } else {
          // Precaution in case of unexpected errors.
          return {
            hash: 'unknown',
            address: 'unknown',
            coins: new BigNumber(0),
          };
        }
      });

      // Process the rest of the node response and create a known object.
      const tx: GeneratedTransaction = {
        inputs: processedInputs,
        outputs: (transaction.vout as any[]).map(output => {
          return {
            hash: getOutputId(transaction.txid, output.n),
            address: output.scriptPubKey.addresses.join(', '),
            coins: new BigNumber(output.value),
          };
        }),
        coinsToSend: amountToSend,
        fee: calculatedFee,
        from: senderString,
        to: destinations.map(destination => destination.address).join(', '),
        wallet: wallet,
        encoded: rawTransaction,
        innerHash: '',
      };

      return tx;
    }));

    return response;
  }

  calculateFinalFee(howManyInputs: number, howManyOutputs: number, feePerUnit: BigNumber, maxUnits: BigNumber): BigNumber {
    // Maultiply the inputs and outputs by their aproximate size.
    const inputsSize = new BigNumber(howManyInputs).multipliedBy(180);
    const outputsSize = new BigNumber(howManyOutputs).multipliedBy(34);

    // Needed for returning the value in coins and not satoshis.
    const decimalsCorrector = new BigNumber(10).exponentiatedBy((this.currentCoin.config as BtcCoinConfig).decimals);

    return inputsSize.plus(outputsSize).plus(10).multipliedBy(feePerUnit).dividedBy(decimalsCorrector);
  }

  signTransaction(
    wallet: WalletBase,
    password: string|null,
    transaction: GeneratedTransaction,
    rawTransactionString = ''): Observable<string> {
      return null;
  }

  injectTransaction(encodedTx: string, note: string|null): Observable<boolean> {
    // Send the transaction.
    return this.btcApiService.callRpcMethod(this.currentCoin.nodeUrl, 'sendrawtransaction', [encodedTx, false]).pipe(
      mergeMap(txId => {
        // Refresh the balance after a small delay.
        setTimeout(() => this.balanceAndOutputsOperator.refreshBalance(), 200);

        if (!note) {
          return of(false);
        } else {
          // Save the note. Retry 3 times if an error is found.
          return this.storageService.store(StorageType.NOTES, txId, note).pipe(
            retryWhen(errors => errors.pipe(delay(1000), take(3), concat(observableThrowError(-1)))),
            catchError(err => err === -1 ? of(-1) : err),
            map(result => result === -1 ? false : true));
        }
      }));
  }

  getCurrentRecommendedFees(): Observable<RecommendedFees> {
    let veryLow: BigNumber;
    let low: BigNumber;
    let normal: BigNumber;

    // Get the recommended fee from the node.
    return this.btcApiService.callRpcMethod(this.currentCoin.nodeUrl, 'estimatesmartfee', [20]).pipe(mergeMap(result => {
      // The node returns the recommended sats per kb (using 1000 bytes instead of 1024 per kb).
      if (!result.errors) {
        veryLow = new BigNumber(result).dividedBy(1000);
      } else {
        veryLow = new BigNumber(1);
      }

      return this.btcApiService.callRpcMethod(this.currentCoin.nodeUrl, 'estimatesmartfee', [10]);
    }), mergeMap(result => {
      if (!result.errors) {
        low = new BigNumber(result).dividedBy(1000);
      } else {
        low = new BigNumber(1);
      }

      return this.btcApiService.callRpcMethod(this.currentCoin.nodeUrl, 'estimatesmartfee', [5]);
    }), mergeMap(result => {
      if (!result.errors) {
        normal = new BigNumber(result).dividedBy(1000);
      } else {
        normal = new BigNumber(1);
      }

      return this.btcApiService.callRpcMethod(this.currentCoin.nodeUrl, 'estimatesmartfee', [1]);
    }), map(result => {
      let high: BigNumber;
      let veryHigh: BigNumber;
      if (!result.errors) {
        high = new BigNumber(result).dividedBy(1000);
        veryHigh = high.multipliedBy(1.1);
      } else {
        high = new BigNumber(1);
        veryHigh = new BigNumber(1);
      }

      return {
        recommendedBtcFees: {
          veryHigh: veryHigh,
          high: high,
          normal: normal,
          low: low,
          veryLow: veryLow,
          gasLimit: null,
        },
        recommendedEthFees: null,
      };
    }), retryWhen(errors => errors.pipe(delay(5000))));
  }
}

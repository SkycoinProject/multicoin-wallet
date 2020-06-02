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
import { BtcCoinConfig } from '../../../coins/config/btc.coin-config';
import { BtcInput, BtcOutput, BtcTxEncoder } from './utils/btc-tx-encoder';

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

    // Get the locking scripts for the destination addresses.
    const addressesToCheck = destinations.map(destination => destination.address);
    let destinationLockingScripts: Map<string, string>;
    response = this.recursivelyGetAddressesScripts(addressesToCheck).pipe(map(result => {
      // If it was not possible to get the script for an address, the address is not valid.
      const invalidAddresses: string[] = [];
      result.forEach((val, key) => {
        if (!val) {
          invalidAddresses.push(key);
        }
      });

      // If there are invalid addresses, show an error.
      if (invalidAddresses.length > 0) {
        let errorString = this.translate.instant('send.invalid-address' + (invalidAddresses.length > 1 ? 'es' : ''));
        errorString += invalidAddresses.join(', ');
        throw new Error(errorString);
      }

      // Save the scripts in a map.
      destinationLockingScripts = result;
    }));

    // Get a list with available outputs for the transaction.
    if (unspents) {
      response = response.pipe(map(() => unspents));
    } else {
      // Get all the outputs of the provided wallet or address list.
      let AddressesToCheck: string[] = [];
      if (addresses) {
        AddressesToCheck = addresses;
      } else {
        wallet.addresses.forEach(address => AddressesToCheck.push(address.address));
      }

      response = response.pipe(mergeMap(() => this.balanceAndOutputsOperator.getOutputs(AddressesToCheck.join(','))));
    }

    // Inputs that will be used for the transaction.
    const inputs: Output[] = [];
    // How many coins will be sent.
    let amountToSend = new BigNumber(0);
    // Amount to send plus the fee.
    let amountNeeded = new BigNumber(0);
    // How many coin the inputs have.
    let coinsInInputs = new BigNumber(0);
    // Transaction fee.
    let calculatedFee = new BigNumber(0);

    response = response.pipe(map((availableOutputs: Output[]) => {
      // Order the available outputs from highest to lowest according to the amount of coins.
      availableOutputs = availableOutputs.sort((a, b) => b.coins.minus(a.coins).toNumber());

      destinations.forEach(destination => amountToSend = amountToSend.plus(destination.coins));

      // Start adding inputs until having the coins needed.
      for (let i = 0; i < availableOutputs.length; i++) {
        inputs.push(availableOutputs[i]);

        coinsInInputs = coinsInInputs.plus(availableOutputs[i].coins);

        if (coinsInInputs.isGreaterThanOrEqualTo(amountToSend)) {
          // Add the fee to the amount of coins needed.
          calculatedFee = this.calculateFinalFee(inputs.length, destinations.length, new BigNumber(fee), new BigNumber(0));
          amountNeeded = amountToSend.plus(calculatedFee);

          // Exit if no more coins are needed.
          if (coinsInInputs.isGreaterThanOrEqualTo(amountNeeded)) {
            break;
          }
        }
      }

      // Convert the inputs to the correct object type.
      const processedInputs: Input[] = inputs.map(input => {
        return {
          hash: input.hash,
          address: input.address,
          coins: input.coins,
        };
      });

      calculatedFee = coinsInInputs;

      // Convert the outputs to the format needed. The coins of each output
      // is removed from the fee.
      const processedOutputs: Output[] = [];
      destinations.forEach(destination => {
        processedOutputs.push({
          hash: '',
          address: destination.address,
          coins: new BigNumber(destination.coins),
          lockingScript: destinationLockingScripts.get(destination.address),
        });

        calculatedFee = calculatedFee.minus(destination.coins);
      });

      // Create an extra output for the remaining coins.
      if (coinsInInputs.minus(amountNeeded).isGreaterThan(0)) {
        processedOutputs.push({
          hash: '',
          address: changeAddress,
          coins: coinsInInputs.minus(amountNeeded),
        });

        calculatedFee = calculatedFee.minus(coinsInInputs.minus(amountNeeded));
      }

      // Return an error if using a hw wallet and the transaction has too many inputs or outputs.
      if (wallet && wallet.isHardware) {
        if (processedInputs.length > 8) {
          throw new Error(this.translate.instant('hardware-wallet.errors.too-many-inputs-outputs'));
        }
        if (processedOutputs.length > 8) {
          throw new Error(this.translate.instant('hardware-wallet.errors.too-many-inputs-outputs'));
        }
      }

      // Create the transaction object.
      const tx: GeneratedTransaction = {
        inputs: processedInputs,
        outputs: processedOutputs,
        coinsToSend: amountToSend,
        fee: calculatedFee,
        from: senderString,
        to: destinations.map(destination => destination.address).join(', '),
        wallet: wallet,
        encoded: '',
        innerHash: '',
      };

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

  /**
   * Gets the locking scripts needed to send coins to the provided addresses.
   * @param addresses Addresses to check. The list will be altered by the function.
   * @param currentElements Already obtained data. For internal use.
   * @returns Map with the scripts of each address. If an address is invalid, the script is null.
   */
  private recursivelyGetAddressesScripts(addresses: string[], currentElements = new Map<string, string>()): Observable<Map<string, string>> {
    if (addresses.length === 0) {
      return of(currentElements);
    }

    // Get the data of the last address.
    return this.btcApiService.callRpcMethod(this.currentCoin.nodeUrl, 'validateaddress', [addresses[addresses.length - 1]]).pipe(mergeMap(response => {
      if (!response.isvalid || !response.scriptPubKey) {
        // Do not accept invalid addresses.
        currentElements.set(addresses[addresses.length - 1], null);
      } else {
        currentElements.set(addresses[addresses.length - 1], response.scriptPubKey);
      }

      addresses.pop();

      if (addresses.length === 0) {
        return of(currentElements);
      }

      // Continue to the next step.
      return this.recursivelyGetAddressesScripts(addresses, currentElements);
    }));
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

    const inputList = transaction.inputs.map(input => input.hash);

    // Get the original info about each input, to known how each one has to be signed.
    return this.recursivelyGetOriginalOutputsInfo(inputList).pipe(map(rawInputs => {
      // Convert the inputs to the format the encoder needs.
      const inputs: BtcInput[] = [];
      transaction.inputs.forEach((input, i) => {
        const processedInput = new BtcInput();

        // Get the transaction id and output number.
        const inputIdParts = input.hash.split('/');
        if (inputIdParts.length !== 2) {
          throw new Error('invalid output.');
        }

        processedInput.transaction = inputIdParts[0];
        processedInput.vout = Number.parseInt(inputIdParts[1], 10);
        // Add the script needed to unlock the input.
        if (rawInputs.has(input.hash)) {
          const rawInput = rawInputs.get(input.hash);

          if (rawInput.scriptPubKey && rawInput.scriptPubKey.type === 'pubkeyhash') {
            processedInput.script = this.getP2pkhScriptSig(i);
          } else {
            processedInput.script = '';
          }
        } else {
          processedInput.script = '';
        }

        inputs.push(processedInput);
      });

      // Needed for converting the coin amounts to sats.
      const decimalsCorrector = new BigNumber(10).exponentiatedBy((this.currentCoin.config as BtcCoinConfig).decimals);

      // Convert the outputs to the format the encoder needs.
      const outputs: BtcOutput[] = [];
      transaction.outputs.forEach(output => {
        const processedOutput = new BtcOutput();

        if (!output.lockingScript) {
          throw new Error('Locking script not found.');
        }

        processedOutput.satsValue = output.coins.multipliedBy(decimalsCorrector);
        processedOutput.script = output.lockingScript;

        outputs.push(processedOutput);
      });

      // Encode the transaction and return it.
      return BtcTxEncoder.encode(inputs, outputs);
    }));
  }

  /**
   * Temporal function, only for testing, for getting the script for unlocking an input. For
   * using it, you must add the script inside the code.
   * @param index Index of the input inside the transaction that is being created.
   */
  private getP2pkhScriptSig(index: number) {
    return '';
  }

  /**
   * Gets the original data inside the node about the outputs in the provided list.
   * @param outputs IDs of the outputs to check. The list will be altered by the function.
   * @param currentElements Already obtained outputs. For internal use.
   * @returns Map with the data, accessible via the provided output IDs.
   */
  private recursivelyGetOriginalOutputsInfo(outputs: string[], currentElements = new Map<string, any>()): Observable<Map<string, any>> {
    if (outputs.length === 0) {
      return of(currentElements);
    }

    // Get the transaction and number the last output.
    const currentOutputId = outputs[outputs.length - 1];
    const outputIdParts = currentOutputId.split('/');
    if (outputIdParts.length !== 2) {
      throw new Error('invalid output.');
    }

    // Get the data of the last output.
    return this.btcApiService.callRpcMethod(this.currentCoin.nodeUrl, 'gettxout', [outputIdParts[0], Number.parseInt(outputIdParts[1], 10)]).pipe(mergeMap(response => {
      // Add the output to the map.
      currentElements.set(currentOutputId, response);

      outputs.pop();

      if (outputs.length === 0) {
        return of(currentElements);
      }

      // Continue to the next step.
      return this.recursivelyGetOriginalOutputsInfo(outputs, currentElements);
    }));
  }

  injectTransaction(encodedTx: string, note: string|null): Observable<boolean> {
    // Send the transaction.
    return this.btcApiService.callRpcMethod(this.currentCoin.nodeUrl, 'sendrawtransaction', [encodedTx, 0]).pipe(
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

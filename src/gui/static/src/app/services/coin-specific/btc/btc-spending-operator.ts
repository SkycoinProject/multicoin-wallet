import { throwError as observableThrowError, of, Observable, Subscription, concat } from 'rxjs';
import { delay, retryWhen, take, mergeMap, catchError, map, filter, first } from 'rxjs/operators';
import { Injector } from '@angular/core';
import { BigNumber } from 'bignumber.js';
import { TranslateService } from '@ngx-translate/core';

import { HwWalletService, HwOutput, HwBtcInput, OperationResult, HwBtcOutput } from '../../hw-wallet.service';
import { StorageService, StorageType } from '../../storage.service';
import { WalletBase, AddressMap } from '../../wallet-operations/wallet-objects';
import { GeneratedTransaction, Output, Input } from '../../wallet-operations/transaction-objects';
import { Coin } from '../../../coins/coin';
import { TransactionDestination, HoursDistributionOptions, RecommendedFees } from '../../wallet-operations/spending.service';
import { SpendingOperator } from '../spending-operator';
import { BalanceAndOutputsOperator } from '../balance-and-outputs-operator';
import { OperatorService } from '../../operators.service';
import { BtcApiService } from '../../api/btc-api.service';
import { BtcCoinConfig } from '../../../coins/coin-type-configs/btc.coin-config';
import { BtcInput, BtcOutput, BtcTxEncoder } from './utils/btc-tx-encoder';
import { WalletsAndAddressesOperator } from '../wallets-and-addresses-operator';

/**
 * Operator for SpendingService to be used with btc-like coins.
 *
 * NOTE: still under heavy development.
 *
 * You can find more information about the functions and properties this class implements by
 * checking SpendingOperator and SpendingService.
 */
export class BtcSpendingOperator implements SpendingOperator {
  private readonly aproxP2pkhInputSize = 150;
  private readonly aproxOutputSize = 34;

  // Coin the current instance will work with.
  private currentCoin: Coin;

  private operatorsSubscription: Subscription;

  // Services and operators used by this operator.
  private btcApiService: BtcApiService;
  private hwWalletService: HwWalletService;
  private translate: TranslateService;
  private storageService: StorageService;
  private balanceAndOutputsOperator: BalanceAndOutputsOperator;
  private walletsAndAddressesOperator: WalletsAndAddressesOperator;

  constructor(injector: Injector, currentCoin: Coin) {
    // Get the services.
    this.btcApiService = injector.get(BtcApiService);
    this.hwWalletService = injector.get(HwWalletService);
    this.translate = injector.get(TranslateService);
    this.storageService = injector.get(StorageService);

    // Get the operators.
    this.operatorsSubscription = injector.get(OperatorService).currentOperators.pipe(filter(operators => !!operators), first()).subscribe(operators => {
      this.balanceAndOutputsOperator = operators.balanceAndOutputsOperator;
      this.walletsAndAddressesOperator = operators.walletsAndAddressesOperator;
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
        senderString = addresses.map(add => this.walletsAndAddressesOperator.formatAddress(add)).join(', ');
      } else if (unspents) {
        senderString = unspents.map(output => output.hash).join(', ');
      }
    }

    let response: Observable<any>;

    // Get the locking scripts for the destination addresses.
    const addressesToCheck = destinations.map(destination => destination.address);
    let destinationLockingScripts: AddressMap<string>;
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
      let AddressesToCheck_: string[] = [];
      if (addresses) {
        AddressesToCheck_ = addresses;
      } else {
        wallet.addresses.forEach(address => AddressesToCheck_.push(address.printableAddress));
      }

      response = response.pipe(mergeMap(() => this.balanceAndOutputsOperator.getOutputs(AddressesToCheck_.join(','))));
    }

    // How many coins will be sent.
    let amountToSend = new BigNumber(0);
    // Transaction fee.
    let calculatedFee = new BigNumber(0);
    // Inputs in the format needed;
    let processedInputs: Input[];
    // Outputs in the format needed;
    const processedOutputs: Output[] = [];

    response = response.pipe(mergeMap((availableOutputs: Output[]) => {
      // Order the available outputs from lowest to highest according to the amount of coins.
      const outputsToChoseFrom: Output[] = availableOutputs.map(output => output).sort((a, b) => a.coins.minus(b.coins).toNumber());
      // Calculate how many coins are going to be sent (without considering the fee).
      destinations.forEach(destination => amountToSend = amountToSend.plus(destination.coins));

      // Select the inputs for the operation.
      const inputs: Output[] = this.recursivelySelectOutputs(outputsToChoseFrom, amountToSend, destinations.length, new BigNumber(fee));
      // Calculate how many coins the inputs have.
      let coinsInInputs = new BigNumber(0);
      inputs.forEach(input => coinsInInputs = coinsInInputs.plus(input.coins));

      // If not specific change address was selected, select the one on the first input, which
      // is the one with most coins.
      if (!changeAddress) {
        changeAddress = inputs[0].address;
      }

      // Add the fee to the amount of coins needed. The calculation ignores the fee needed for
      // the change output, if the selected inputs have more coins than neeed. This is to avoid
      // overcomplicating the available balance calculation in the UI.
      calculatedFee = this.calculateFinalFee(inputs.length, destinations.length, new BigNumber(fee), null);
      const amountNeeded = amountToSend.plus(calculatedFee);

      // Convert the inputs to the correct object type.
      processedInputs = inputs.map(input => {
        return {
          hash: input.hash,
          address: this.walletsAndAddressesOperator.formatAddress(input.address),
          coins: input.coins,
          transactionId: input.transactionId,
          indexInTransaction: input.indexInTransaction,
        };
      });

      calculatedFee = coinsInInputs;

      // Convert the outputs to the format needed. The coins of each output
      // are removed from the fee.
      destinations.forEach(destination => {
        processedOutputs.push({
          hash: '',
          address: this.walletsAndAddressesOperator.formatAddress(destination.address),
          coins: new BigNumber(destination.coins),
          lockingScript: destinationLockingScripts.get(destination.address),
        });

        calculatedFee = calculatedFee.minus(destination.coins);
      });

      // Create an extra output for the remaining coins.
      if (coinsInInputs.minus(amountNeeded).isGreaterThan(0)) {
        processedOutputs.push({
          hash: '',
          address: this.walletsAndAddressesOperator.formatAddress(changeAddress),
          coins: coinsInInputs.minus(amountNeeded),
          lockingScript: '',
          returningCoins: true,
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

      // If an extra output was created for the remaining coins, the script needed for that
      // output is obtained.
      if (coinsInInputs.minus(amountNeeded).isGreaterThan(0)) {
        return this.recursivelyGetAddressesScripts([changeAddress]);
      } else {
        return of(null);
      }
    }), map((changeAddressData: AddressMap<string>) => {
      // Set the script for the output created for the remaining coins, if any.
      if (changeAddressData) {
        processedOutputs[processedOutputs.length - 1].lockingScript = changeAddressData.get(changeAddress);
      }

      // Create the transaction object.
      const tx: GeneratedTransaction = {
        inputs: processedInputs,
        outputs: processedOutputs,
        coinsToSend: amountToSend,
        fee: calculatedFee,
        from: senderString,
        to: destinations.map(destination => this.walletsAndAddressesOperator.formatAddress(destination.address)).join(', '),
        wallet: wallet,
        encoded: '',
        innerHash: '',
      };

      return tx;
    }));

    // If required, append to the response the steps needed for signing the transaction.
    if (wallet && !unsigned) {
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
   * Selects the outputs that should be used as inputs for a transaction. The function will
   * try to use as few outputs as possible, prefering the ones with less coins. However, the
   * function may add an additional input if the solution with the least amount of inputs
   * would require to create a change output with so few coins that it would not be convenient
   * to send it due to the fees.
   * @param outputs List with the outputs available to be used. Must be ordered from lowest
   * to highest according to the amount of coins. The list will be altered by the function.
   * @param amountToSend How many coins are going to be sent in the transaction.
   * @param destinations How many destinations the transaction will have.
   * @param feePerUnit Approximate amount of sats per byte that will be paid as fee. Note: the
   * function ignores the fee needed for the change output, if the selected inputs have more
   * coins than neeed. This is to avoid overcomplicating the available balance calculation in
   * the UI.
   * @param currentlySelectedBalance Coins in the already selected outputs. For internal use.
   * @param currentlySelectedOutputs Already selected outputs. For internal use.
   */
  private recursivelySelectOutputs(
    outputs: Output[],
    amountToSend: BigNumber,
    destinations: number,
    feePerUnit: BigNumber,
    currentlySelectedBalance = new BigNumber(0),
    currentlySelectedOutputs: Output[] = [],
  ): Output[] {

    if (outputs.length < 1) {
      return currentlySelectedOutputs;
    }

    // Check the outputs in ascending order (according to the coins).
    for (let i = 0; i < outputs.length; i++) {
      // How many coins the procedure would have with the inputs selected in the previous steps
      // of the recursive procedure and the one being checked right now.
      const potentinalNewSelectedBalance = currentlySelectedBalance.plus(outputs[i].coins);

      if (potentinalNewSelectedBalance.isGreaterThan(amountToSend)) {
        // Add the fee to the amount of coins needed.
        const calculatedFee = this.calculateFinalFee(currentlySelectedOutputs.length + 1, destinations, feePerUnit, null);
        const totalAmountNeeded = amountToSend.plus(calculatedFee);

        // Check if no more coins are needed.
        if (potentinalNewSelectedBalance.isGreaterThanOrEqualTo(totalAmountNeeded)) {
          // Add the output to the list of the ones that have been selected.
          currentlySelectedOutputs.push(outputs[i]);

          // Needed for converting from sats to coins.
          const decimalsCorrector = new BigNumber(10).exponentiatedBy((this.currentCoin.config as BtcCoinConfig).decimals);

          // Check how many coins will have to be added to a change output and how much would
          // it cost to use that change output in a future transaction if using the current fee.
          const remainingCoins = potentinalNewSelectedBalance.minus(totalAmountNeeded);
          const aproxChangeOutputCost = new BigNumber(this.aproxP2pkhInputSize).multipliedBy(feePerUnit).dividedBy(decimalsCorrector);

          // If the change output is needed but it would cost more than 10% of its value to
          // send it in a future transaction, try to add another input.
          if (!remainingCoins.isEqualTo(0) && remainingCoins.isLessThan(aproxChangeOutputCost.multipliedBy(10))) {
            for (let j = 0; j < outputs.length; j++) {
              if (j !== i) {
                // Check the amounts that would be obtained after adding the new input.
                const balanceWithAdditionalInput = potentinalNewSelectedBalance.plus(outputs[j].coins);
                const calculatedFeeWithAdditionalInput = this.calculateFinalFee(currentlySelectedOutputs.length + 1, destinations, feePerUnit, null);
                const totalAmountNeededWithAdditionalInput = amountToSend.plus(calculatedFeeWithAdditionalInput);
                const remainingCoinsWithAdditionalInput = balanceWithAdditionalInput.minus(totalAmountNeededWithAdditionalInput);

                // If the new input causes the change output to be spendable without having
                // to pay more than 10% of its value in fees, use it.
                if (remainingCoinsWithAdditionalInput.isGreaterThanOrEqualTo(aproxChangeOutputCost.multipliedBy(10))) {
                  currentlySelectedOutputs.push(outputs[j]);

                  break;
                }
              }
            }
          }

          return currentlySelectedOutputs;
        }
      }
    }

    // If no output in this pass of the recursive procedure was able sum the coins needed,
    // add the output with most coins to the selected list and go to the next step.
    currentlySelectedOutputs.push(outputs[outputs.length - 1]);
    currentlySelectedBalance = currentlySelectedBalance.plus(outputs[outputs.length - 1].coins);
    outputs.pop();

    return this.recursivelySelectOutputs(outputs, amountToSend, destinations, feePerUnit, currentlySelectedBalance, currentlySelectedOutputs);
  }

  /**
   * Gets the locking scripts needed to send coins to the provided addresses.
   * @param addresses Addresses to check. The list will be altered by the function.
   * @param currentElements Already obtained data. For internal use.
   * @returns Map with the scripts of each address. If an address is invalid, the script is null.
   */
  private recursivelyGetAddressesScripts(addresses: string[], currentElements = new AddressMap<string>(this.walletsAndAddressesOperator.formatAddress)): Observable<AddressMap<string>> {
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
    const inputsSize = new BigNumber(howManyInputs).multipliedBy(this.aproxP2pkhInputSize);
    const outputsSize = new BigNumber(howManyOutputs).multipliedBy(this.aproxOutputSize);

    const otherDataSize = new BigNumber(10);

    // Needed for returning the value in coins and not satoshis.
    const decimalsCorrector = new BigNumber(10).exponentiatedBy((this.currentCoin.config as BtcCoinConfig).decimals);

    return inputsSize.plus(outputsSize).plus(otherDataSize).multipliedBy(feePerUnit).dividedBy(decimalsCorrector);
  }

  signTransaction(
    wallet: WalletBase,
    password: string|null,
    transaction: GeneratedTransaction,
    rawTransactionString = ''): Observable<string> {

    if (rawTransactionString) {
      throw new Error('Raw transactions not allowed.');
    }

    // Convert the inputs to the format the encoder needs.
    const inputs: BtcInput[] = [];
    transaction.inputs.forEach((input, i) => {
      const processedInput = new BtcInput();
      processedInput.transaction = input.transactionId;
      processedInput.vout = input.indexInTransaction;
      processedInput.script = '';

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

    // Will return the signatures.
    let signaturesGenerationProcedure: Observable<string[]>;

    // Procedure for getting the signatures with a software wallet.
    if (!wallet.isHardware) {
      const signatures: string[] = [];

      // Temporal test method.
      transaction.inputs.forEach((input, i) => {
        signatures.push(this.getP2pkhSignature(i));
      });

      signaturesGenerationProcedure = of(signatures);

    // Procedure for getting the signatures with a hardware wallet.
    } else {
      const hwOutputs: HwBtcOutput[] = [];
      const hwInputs: HwBtcInput[] = [];

      const addressMap = new AddressMap<number>(this.walletsAndAddressesOperator.formatAddress);
      wallet.addresses.forEach((address, i) => addressMap.set(address.printableAddress, i));

      // Convert all inputs and outputs to the format used by the hw wallet.
      transaction.outputs.forEach(output => {
        hwOutputs.push({
          address: output.address,
          coins: output.coins.decimalPlaces(6).toString(10),
        });

        // This makes de device consider the output as the one used for returning the remaining coins.
        if (output.returningCoins && addressMap.has(output.address)) {
          hwOutputs[hwOutputs.length - 1].address_index = addressMap.get(output.address);
        }
      });
      transaction.inputs.forEach(input => {
        hwInputs.push({
          prev_hash: input.transactionId,
          index: addressMap.get(input.address),
        });
      });

      // Make the device sign the transaction.
      signaturesGenerationProcedure = this.hwWalletService.signTransaction(hwInputs, hwOutputs).pipe(map((result: OperationResult) => (result.rawResponse as string[])));
    }

    return signaturesGenerationProcedure.pipe(map(signatures => {
      if (signatures.length !== inputs.length) {
        throw new Error('Invalid number of signatures.');
      }

      transaction.inputs.forEach((input, i) => {
        // TODO: currently the signature is added as the script, but more data may be needed
        // after the changes for making the hw wallet return valid signatures are made.
        inputs[i].script = signatures[i];
      });

      return BtcTxEncoder.encode(inputs, outputs);
    }));
  }

  /**
   * Temporal function, only for testing, for getting the signature for unlocking an input. For
   * using it, you must add the script inside the code.
   * @param index Index of the input inside the transaction that is being created.
   */
  private getP2pkhSignature(index: number) {
    return '';
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
            retryWhen(errors => concat(errors.pipe(delay(1000), take(3)), observableThrowError(-1))),
            catchError(err => err === -1 ? of(-1) : err),
            map(result => result === -1 ? false : true));
        }
      }));
  }

  getCurrentRecommendedFees(): Observable<RecommendedFees> {
    let veryLow: BigNumber;
    let low: BigNumber;
    let normal: BigNumber;
    let thereWereProblems = false;

    // Get the recommended fee from the node.
    return this.btcApiService.callRpcMethod(this.currentCoin.nodeUrl, 'estimatesmartfee', [20]).pipe(mergeMap(result => {
      // The node returns the recommended sats per kb (using 1000 bytes instead of 1024 per kb).
      if (!result.errors) {
        veryLow = this.returnUsableFee(new BigNumber(result).dividedBy(1000));
      } else {
        veryLow = this.returnUsableFee(new BigNumber(1));
        thereWereProblems = true;
      }

      return this.btcApiService.callRpcMethod(this.currentCoin.nodeUrl, 'estimatesmartfee', [10]);
    }), mergeMap(result => {
      if (!result.errors) {
        low = this.returnUsableFee(new BigNumber(result).dividedBy(1000));
      } else {
        low = this.returnUsableFee(new BigNumber(1));
        thereWereProblems = true;
      }

      return this.btcApiService.callRpcMethod(this.currentCoin.nodeUrl, 'estimatesmartfee', [5]);
    }), mergeMap(result => {
      if (!result.errors) {
        normal = this.returnUsableFee(new BigNumber(result).dividedBy(1000));
      } else {
        normal = this.returnUsableFee(new BigNumber(1));
        thereWereProblems = true;
      }

      return this.btcApiService.callRpcMethod(this.currentCoin.nodeUrl, 'estimatesmartfee', [1]);
    }), map(result => {
      let high: BigNumber;
      let veryHigh: BigNumber;
      if (!result.errors) {
        high = this.returnUsableFee(new BigNumber(result).dividedBy(1000));
        veryHigh = high.multipliedBy(1.1);
      } else {
        high = this.returnUsableFee(new BigNumber(1));
        veryHigh = this.returnUsableFee(new BigNumber(1));
        thereWereProblems = true;
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
        thereWereProblems: thereWereProblems,
      };
    }), retryWhen(errors => errors.pipe(delay(5000))));
  }

  /**
   * Checks if the provided fee is lower than the minimum accepted by the node. If the fee is
   * lower, the minimum fee is returned, otherwise the provided fee is returned.
   * @param fee Fee to check.
   */
  private returnUsableFee(fee: BigNumber) {
    if (fee.isLessThan((this.currentCoin.config as BtcCoinConfig).minFee)) {
      return (this.currentCoin.config as BtcCoinConfig).minFee;
    }

    return fee;
  }
}

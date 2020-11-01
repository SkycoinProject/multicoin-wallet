import { throwError as observableThrowError, of, Observable, Subscription, concat } from 'rxjs';
import { delay, retryWhen, take, mergeMap, catchError, map, filter, first } from 'rxjs/operators';
import { Injector } from '@angular/core';
import { BigNumber } from 'bignumber.js';
import { TranslateService } from '@ngx-translate/core';

import { HwWalletService, HwOutput, HwInput } from '../../hw-wallet.service';
import { StorageService, StorageType } from '../../storage.service';
import { FiberTxEncoder } from './utils/fiber-tx-encoder';
import { WalletBase, AddressBase, AddressMap } from '../../wallet-operations/wallet-objects';
import { GeneratedTransaction, Output } from '../../wallet-operations/transaction-objects';
import { Coin } from '../../../coins/coin';
import { TransactionDestination, HoursDistributionOptions, RecommendedFees } from '../../wallet-operations/spending.service';
import { SpendingOperator } from '../spending-operator';
import { FiberApiService } from '../../api/fiber-api.service';
import { BalanceAndOutputsOperator } from '../balance-and-outputs-operator';
import { OperatorService } from '../../operators.service';
import { WalletsAndAddressesOperator } from '../wallets-and-addresses-operator';

/**
 * Operator for SpendingService to be used with Fiber coins.
 *
 * NOTE: The compatibility with coins not being managed by the local node is extremely limited
 * at this time.
 *
 * You can find more information about the functions and properties this class implements by
 * checking SpendingOperator and SpendingService.
 */
export class FiberSpendingOperator implements SpendingOperator {
  // Coin the current instance will work with.
  private currentCoin: Coin;

  private operatorsSubscription: Subscription;

  // Services and operators used by this operator.
  private fiberApiService: FiberApiService;
  private hwWalletService: HwWalletService;
  private translate: TranslateService;
  private storageService: StorageService;
  private balanceAndOutputsOperator: BalanceAndOutputsOperator;
  private walletsAndAddressesOperator: WalletsAndAddressesOperator;

  constructor(injector: Injector, currentCoin: Coin) {
    // Get the services.
    this.fiberApiService = injector.get(FiberApiService);
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

    let unspentOutputHashes: string[];
    if (unspents) {
      unspentOutputHashes = unspents.map(output => output.hash);
    }

    // Create a string indicating where the coins come from.
    let senderString = '';
    if (wallet) {
      senderString = wallet.label;
    } else {
      if (addresses) {
        senderString = addresses.join(', ');
      } else if (unspentOutputHashes) {
        senderString = unspentOutputHashes.join(', ');
      }
    }

    // Ignore the source addresses if specific source outputs were provided.
    if (unspentOutputHashes) {
      addresses = null;
    }

    const useUnsignedTxEndpoint = !wallet || !!wallet.isHardware;

    const params = {
      hours_selection: hoursDistributionOptions,
      wallet_id: !useUnsignedTxEndpoint ? wallet.id : null,
      password: password,
      addresses: addresses,
      unspents: unspentOutputHashes,
      to: destinations,
      change_address: changeAddress,
    };
    if (!useUnsignedTxEndpoint) {
      params['unsigned'] = unsigned;
    }

    // Make the node create the transaction by using the appropiate URL and sending the
    // previously defined params.
    let response: Observable<GeneratedTransaction> = this.fiberApiService.post(
      this.currentCoin.nodeUrl,
      useUnsignedTxEndpoint ? 'transaction' : 'wallet/transaction',
      params,
      {
        sendDataAsJson: true,
        useV2: useUnsignedTxEndpoint,
      },
    ).pipe(map(transaction => {
      const data = useUnsignedTxEndpoint ? transaction.data : transaction;

      // Return an error if using a hw wallet and the transaction has too many inputs or outputs.
      if (wallet && wallet.isHardware) {
        if (data.transaction.inputs.length > 8) {
          throw new Error(this.translate.instant('hardware-wallet.errors.too-many-inputs-outputs'));
        }
        if (data.transaction.outputs.length > 8) {
          throw new Error(this.translate.instant('hardware-wallet.errors.too-many-inputs-outputs'));
        }
      }

      // Calculate how many coins and hours are being sent.
      let amountToSend = new BigNumber(0);
      destinations.map(destination => amountToSend = amountToSend.plus(destination.coins));

      let hoursToSend = new BigNumber(0);
      data.transaction.outputs
        .filter(o => destinations.map(dest => AddressBase.create(this.walletsAndAddressesOperator.formatAddress, dest.address)).find(addr => addr.compareAddress(o.address)))
        .map(o => hoursToSend = hoursToSend.plus(new BigNumber(o.hours)));

      // Process the node response and create a known object.
      const tx: GeneratedTransaction = {
        inputs: (data.transaction.inputs as any[]).map(input => {
          return {
            hash: input.uxid,
            address: this.walletsAndAddressesOperator.formatAddress(input.address),
            coins: new BigNumber(input.coins),
            hours: new BigNumber(input.calculated_hours),
          };
        }),
        outputs: (data.transaction.outputs as any[]).map(output => {
          return {
            hash: output.uxid,
            address: this.walletsAndAddressesOperator.formatAddress(output.address),
            coins: new BigNumber(output.coins),
            hours: new BigNumber(output.hours),
          };
        }),
        coinsToSend: amountToSend,
        hoursToSend: hoursToSend,
        fee: new BigNumber(data.transaction.fee),
        from: senderString,
        to: destinations.map(destination => this.walletsAndAddressesOperator.formatAddress(destination.address)).join(', '),
        wallet: wallet,
        encoded: data.encoded_transaction,
        innerHash: data.transaction.inner_hash,
      };

      if (wallet && wallet.isHardware && tx.outputs.length !== destinations.length) {
        // If the transaction has an output for returning any remaining coins, the node puts it
        // at the end. This helps to avoid asking for confirmation for the returning coins.
        tx.outputs[tx.outputs.length - 1].returningCoins = true;
      }

      return tx;
    }));

    // If required, append to the response the steps needed for signing the transaction with the hw wallet.
    if (wallet && wallet.isHardware && !unsigned) {
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
    return new BigNumber(0);
  }

  signTransaction(
    wallet: WalletBase,
    password: string|null,
    transaction: GeneratedTransaction,
    rawTransactionString = ''): Observable<string> {

    // Code for signing a software wallet. The node is responsible for making the operation.
    if (!wallet.isHardware) {
      return this.fiberApiService.post(
        this.currentCoin.nodeUrl,
        'wallet/transaction/sign',
        {
          wallet_id: wallet.id,
          password: password,
          encoded_transaction: rawTransactionString ? rawTransactionString : transaction.encoded,
        },
        {
          useV2: true,
        },
      ).pipe(map(response => {
        return response.data.encoded_transaction;
      }));

    // Code for signing a hardware wallet.
    } else {
      if (rawTransactionString) {
        throw new Error('Raw transactions not allowed.');
      }

      const hwOutputs: HwOutput[] = [];
      const hwInputs: HwInput[] = [];

      const addressMap = new AddressMap<number>(this.walletsAndAddressesOperator.formatAddress);
      wallet.addresses.forEach((address, i) => addressMap.set(address.printableAddress, i));

      // Convert all inputs and outputs to the format used by the hw wallet.
      transaction.outputs.forEach(output => {
        hwOutputs.push({
          address: output.address,
          coins: new BigNumber(output.coins).toString(),
          hours: new BigNumber(output.hours).toFixed(0),
        });

        // This makes de device consider the output as the one used for returning the remaining coins.
        if (output.returningCoins && addressMap.has(output.address)) {
          hwOutputs[hwOutputs.length - 1].address_index = addressMap.get(output.address);
        }
      });
      transaction.inputs.forEach(input => {
        hwInputs.push({
          hash: input.hash,
          index: addressMap.get(input.address),
        });
      });

      // Make the device sign the transaction.
      return this.hwWalletService.signTransaction(hwInputs, hwOutputs).pipe(map(signatures => {
        const rawTransaction = FiberTxEncoder.encode(
          hwInputs,
          hwOutputs,
          signatures.rawResponse,
          transaction.innerHash,
        );

        return rawTransaction;
      }));
    }
  }

  /**
   * Sends a signed transaction to the network, to efectivelly send the coins.
   * @param encodedTx Transaction to send.
   * @param note Optional local note for the transaction.
   * @returns If the note was saved or not.
   */
  injectTransaction(encodedTx: string, note: string|null): Observable<boolean> {
    // Send the transaction.
    return this.fiberApiService.post(this.currentCoin.nodeUrl, 'injectTransaction', { rawtx: encodedTx }, { sendDataAsJson: true }).pipe(
      mergeMap(txId => {
        // Refresh the balance after a small delay.
        setTimeout(() => this.balanceAndOutputsOperator.refreshBalance(), 32);

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

  // Not needed for Fiber coins.
  getCurrentRecommendedFees(): Observable<RecommendedFees> {
    return null;
  }
}

import { Observable, of, throwError } from 'rxjs';
import { mergeMap, map, catchError } from 'rxjs/operators';
import { BigNumber } from 'bignumber.js';

import { WalletBase } from '../../../wallet-operations/wallet-objects';
import { OldTransaction, OldTransactionTypes } from '../../../wallet-operations/transaction-objects';
import { StorageService, StorageType } from '../../../storage.service';
import { calculateGeneralData } from '../../../../utils/history-utils';
import { Coin } from '../../../../coins/coin';
import { BtcApiService } from '../../../api/btc-api.service';
import { OperationError } from '../../../../utils/operation-error';
import { processServiceError } from '../../../../utils/errors';

/**
 * Gets the transaction history of a wallet list.
 * @param wallets Wallets to consult.
 */
export function getTransactionsHistory(currentCoin: Coin, wallets: WalletBase[], btcApiService: BtcApiService, storageService: StorageService): Observable<OldTransaction[]> {
  let transactions: OldTransaction[];
  /**
   * Allows to easily know which addresses are part of the wallets and also to know
   * which wallet the address belong to.
   */
  const addressesMap: Map<string, WalletBase> = new Map<string, WalletBase>();

  // Get all the addresses of the wallets.
  const addresses: string[] = [];
  wallets.forEach(w => {
    w.addresses.map(add => {
      if (!addressesMap.has(add.address)) {
        addresses.push(add.address);
      }
      // There could be more than one wallet with the address. This would happen if the wallet is repeated
      // (like when using the same seed for a software and a hardware wallet). In that case, the wallet
      // with most addresses is considered "the most complete one" and is used.
      if (!addressesMap.has(add.address) || addressesMap.get(add.address).addresses.length < w.addresses.length) {
        addressesMap.set(add.address, w);
      }
    });
  });

  // Get the transactions of all addresses.
  return recursivelyGetTransactions(currentCoin, btcApiService, addresses).pipe(mergeMap((response: any[]) => {
    // Process the response and convert it into a known object type. Some values are temporal.
    transactions = response.map<OldTransaction>(transaction => {
      const processedTx: OldTransaction = {
        relevantAddresses: [],
        balance: new BigNumber(0),
        fee: new BigNumber(0),
        confirmed: transaction.confirmations ? (transaction.confirmations >= currentCoin.confirmationsNeeded) : false,
        confirmations: transaction.confirmations ? transaction.confirmations : 0,
        timestamp: transaction.time ? transaction.time : -1,
        id: transaction.txid,
        inputs: (transaction.vin as any[]).map(input => {
          return {
            hash: input.coinbase ? input.coinbase : getOutputId(input.txid, input.vout),
            address: input.coinbase ? null : (input.prevOut.addresses as string[]).join(', '),
            coins: input.coinbase ? new BigNumber(0) : new BigNumber(input.prevOut.value),
          };
        }),
        outputs: (transaction.vout as any[]).map(output => {
          return {
            hash: getOutputId(transaction.txid, output.n),
            address: (output.scriptPubKey.addresses as string[]).join(', '),
            coins: new BigNumber(output.value),
          };
        }),
        involvedLocalWallets: '',
        numberOfInvolvedLocalWallets: 0,
        type: OldTransactionTypes.MixedOrUnknown,
      };

      // Calculate the fee.
      let inputsCoins = new BigNumber('0');
      (transaction.vin as any[]).forEach(input => {
        if (input.prevOut && input.prevOut.value) {
          inputsCoins = inputsCoins.plus(input.prevOut.value);
        }
      });
      let outputsCoins = new BigNumber('0');
      (transaction.vout as any[]).forEach(output => {
        if (output.value) {
          outputsCoins = outputsCoins.plus(output.value);
        }
      });
      processedTx.fee = inputsCoins.minus(outputsCoins);
      if (processedTx.fee.isLessThan(0)) {
        processedTx.fee = new BigNumber(0);
      }

      return processedTx;
    });

    // Get the transaction notes.
    return storageService.get(StorageType.NOTES, null);
  }), map(notes => {
    if (!notes) {
      notes = {};
    }

    const notesMap: Map<string, string> = new Map<string, string>();
    Object.keys(notes).forEach(key => {
      notesMap.set(key, notes[key]);
    });

    return transactions
      // Sort the transactions by date.
      .sort((a, b) =>  {
        if (b.timestamp >= 0 && a.timestamp >= 0) {
          return b.timestamp - a.timestamp;
        } else if (a.timestamp >= 0) {
          return 1;
        } else if (b.timestamp >= 0) {
          return -1;
        } else {
          return 0;
        }
      })
      .map(transaction => {
        // Add to the transaction object the type, balance and the involved wallets and addresses.
        calculateGeneralData(transaction, addressesMap, false);

        // Add the note.
        const txNote = notesMap.get(transaction.id);
        if (txNote) {
          transaction.note = txNote;
        }

        return transaction;
      });
  }));
}

/**
 * Gets the transaction history of the addresses in the provided address list.
 * @param addresses Addresses to check. The list will be altered by the function.
 * @param currentElements Already obtained transactions. For internal use.
 * @returns Array with all the transactions related to the provided address list, in the
 * format returned by the node.
 */
export function recursivelyGetTransactions(currentCoin: Coin, btcApiService: BtcApiService, addresses: string[], currentElements = new Map<string, any>()): Observable<any[]> {
  return btcApiService.callRpcMethod(currentCoin.nodeUrl, 'searchrawtransactions', [addresses[addresses.length - 1], 1, 0, 1000000, 1])
    .pipe(catchError((err: OperationError) => {
      err = processServiceError(err);

      // If the node returns -5, it means there are no transactions for the address.
      if (
        (err.originalError && err.originalError.code && err.originalError.code === -5) ||
        (err.originalServerErrorMsg && err.originalServerErrorMsg.toLowerCase().includes('No information available about address'.toLowerCase()))
      ) {
        return of([]);
      }

      return throwError(err);
    }), mergeMap((response) => {
      (response as any[]).forEach(transaction => {
        currentElements.set(transaction.txid, transaction);
      });
      addresses.pop();

      if (addresses.length === 0) {
        const finalResponse: any[] = [];
        currentElements.forEach(tx => {
          finalResponse.push(tx);
        });

        return of(finalResponse);
      }

      // Continue to the next step.
      return recursivelyGetTransactions(currentCoin, btcApiService, addresses, currentElements);
    }));
}

/**
 * Returns the ID of an output. It is just txId + '/' + outputIndex;
 */
export function getOutputId(txId: string, outputIndex: number): string {
  return (txId + '') + '/' + (outputIndex + '');
}

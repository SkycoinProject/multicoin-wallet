import { Observable, of, throwError } from 'rxjs';
import { mergeMap, map, catchError } from 'rxjs/operators';
import { BigNumber } from 'bignumber.js';

import { WalletBase } from '../../../wallet-operations/wallet-objects';
import { OldTransaction, OldTransactionTypes, Output } from '../../../wallet-operations/transaction-objects';
import { StorageService, StorageType } from '../../../storage.service';
import { calculateGeneralData } from '../../../../utils/history-utils';
import { Coin } from '../../../../coins/coin';
import { BlockbookApiService } from '../../../../services/api/blockbook-api.service';
import { BtcCoinConfig } from '../../../../coins/config/btc.coin-config';

/**
 * Gets the transaction history of a wallet list.
 * @param wallets Wallets to consult.
 */
export function getTransactionsHistory(currentCoin: Coin, wallets: WalletBase[], blockbookApiService: BlockbookApiService, storageService: StorageService): Observable<OldTransaction[]> {
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

  // Value which will allow to get the value in coins, instead of sats.
  const decimalsCorrector = new BigNumber(10).exponentiatedBy((currentCoin.config as BtcCoinConfig).decimals);

  // Get the transactions of all addresses.
  return recursivelyGetTransactions(currentCoin, blockbookApiService, addresses).pipe(mergeMap((response: any[]) => {
    // Process the response and convert it into a known object type. Some values are temporal.
    transactions = response.map<OldTransaction>(transaction => {
      // Build the output list, ignoring data outputs.
      const outputs: Output[] = [];
      (transaction.vout as any[]).forEach(output => {
        if (output.value && output.value !== '0') {
          outputs.push({
            hash: getOutputId(transaction.txid, output.n),
            address: (output.addresses as string[]).join(', '),
            coins: new BigNumber(output.value).dividedBy(decimalsCorrector),
            transactionId: transaction.txid,
            indexInTransaction: output.n,
          });
        }
      });

      // Build the transaction object.
      const processedTx: OldTransaction = {
        relevantAddresses: [],
        balance: new BigNumber(0),
        fee: new BigNumber(0),
        confirmed: transaction.confirmations ? (transaction.confirmations >= currentCoin.confirmationsNeeded) : false,
        confirmations: transaction.confirmations ? transaction.confirmations : 0,
        timestamp: transaction.blockTime ? transaction.blockTime : -1,
        id: transaction.txid,
        inputs: (transaction.vin as any[]).map(input => {
          return {
            hash: !input.isAddress ? '' : getOutputId(input.txid, input.vout),
            address: !input.isAddress ? null : (input.addresses as string[]).join(', '),
            coins: !input.isAddress ? new BigNumber(0) : new BigNumber(input.value).dividedBy(decimalsCorrector),
          };
        }),
        outputs: outputs,
        involvedLocalWallets: '',
        numberOfInvolvedLocalWallets: 0,
        type: OldTransactionTypes.MixedOrUnknown,
      };

      // Calculate the fee.
      let inputsCoins = new BigNumber('0');
      (transaction.vin as any[]).forEach(input => {
        if (input.value) {
          inputsCoins = inputsCoins.plus(input.value);
        }
      });
      let outputsCoins = new BigNumber('0');
      (transaction.vout as any[]).forEach(output => {
        if (output.value) {
          outputsCoins = outputsCoins.plus(output.value);
        }
      });
      processedTx.fee = inputsCoins.minus(outputsCoins).dividedBy(decimalsCorrector);
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
 * format returned by the backend.
 */
export function recursivelyGetTransactions(currentCoin: Coin, blockbookApiService: BlockbookApiService, addresses: string[], currentElements = new Map<string, any>()): Observable<any[]> {
  return blockbookApiService.get(currentCoin.indexerUrl, 'address/' + addresses[addresses.length - 1], {details: 'txslight'})
    .pipe(mergeMap((response) => {
      if (response.transactions) {
        (response.transactions as any[]).forEach(transaction => {
          currentElements.set(transaction.txid, transaction);
        });
      }

      addresses.pop();

      if (addresses.length === 0) {
        const finalResponse: any[] = [];
        currentElements.forEach(tx => {
          finalResponse.push(tx);
        });

        return of(finalResponse);
      }

      // Continue to the next step.
      return recursivelyGetTransactions(currentCoin, blockbookApiService, addresses, currentElements);
    }));
}

/**
 * Returns the ID of an output. It is just txId + '/' + outputIndex;
 */
export function getOutputId(txId: string, outputIndex: number): string {
  return (txId + '') + '/' + (outputIndex + '');
}

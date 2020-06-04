import { Observable, of } from 'rxjs';
import { mergeMap, map } from 'rxjs/operators';
import { BigNumber } from 'bignumber.js';

import { WalletBase } from '../../../wallet-operations/wallet-objects';
import { OldTransaction, OldTransactionTypes, Output } from '../../../wallet-operations/transaction-objects';
import { StorageService, StorageType } from '../../../storage.service';
import { calculateGeneralData } from '../../../../utils/history-utils';
import { Coin } from '../../../../coins/coin';
import { BlockbookApiService } from '../../../../services/api/blockbook-api.service';
import { EthCoinConfig } from '../../../../coins/config/eth.coin-config';

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

  // Value which will allow to get amounts in coins, instead of wei.
  const decimalsCorrector = new BigNumber(10).exponentiatedBy((currentCoin.config as EthCoinConfig).decimals);

  // Get the transactions of all addresses.
  return recursivelyGetTransactions(currentCoin, blockbookApiService, addresses).pipe(mergeMap((response: any[]) => {
    // Process the response and convert it into a known object type. Some values are temporal.
    transactions = response.map<OldTransaction>(transaction => {
      // Build the output list.
      const outputs: Output[] = [];
      (transaction.vout as any[]).forEach(output => {
        outputs.push({
          hash: '',
          address: (output.addresses as string[]).join(', '),
          coins: new BigNumber(output.value).dividedBy(decimalsCorrector),
        });
      });

      // Build the transaction object.
      const processedTx: OldTransaction = {
        relevantAddresses: [],
        balance: new BigNumber(0),
        fee: new BigNumber(transaction.ethereumSpecific.gasUsed).multipliedBy(transaction.ethereumSpecific.gasPrice).dividedBy(decimalsCorrector),
        confirmed: transaction.confirmations ? (transaction.confirmations >= currentCoin.confirmationsNeeded) : false,
        confirmations: transaction.confirmations ? transaction.confirmations : 0,
        timestamp: transaction.blockTime ? transaction.blockTime : -1,
        id: transaction.txid,
        inputs: (transaction.vin as any[]).map(input => {
          return {
            hash: '',
            address: (input.addresses as string[]).join(', '),
            coins: new BigNumber(0),
          };
        }),
        outputs: outputs,
        involvedLocalWallets: '',
        numberOfInvolvedLocalWallets: 0,
        type: OldTransactionTypes.MixedOrUnknown,
      };

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
  return blockbookApiService.get(currentCoin.indexerUrl, 'address/' + addresses[addresses.length - 1], {details: 'txs'})
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

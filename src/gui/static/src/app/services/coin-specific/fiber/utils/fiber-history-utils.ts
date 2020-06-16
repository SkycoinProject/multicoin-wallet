import { Observable } from 'rxjs';
import { mergeMap, map } from 'rxjs/operators';
import { BigNumber } from 'bignumber.js';

import { WalletBase, AddressBase } from '../../../wallet-operations/wallet-objects';
import { OldTransaction, OldTransactionTypes } from '../../../wallet-operations/transaction-objects';
import { StorageService, StorageType } from '../../../storage.service';
import { calculateGeneralData } from '../../../../utils/history-utils';
import { FiberApiService } from '../../../api/fiber-api.service';
import { Coin } from '../../../../coins/coin';

/**
 * Checks the addresses of a wallet to know which ones have been used, defined as having
 * received coins.
 * @returns A map with all addresses indicating which ones have been used and which ones
 * have not.
 */
export function getIfAddressesUsed(currentCoin: Coin, wallet: WalletBase, fiberApiService: FiberApiService, storageService: StorageService): Observable<Map<string, boolean>> {
  const response = new Map<string, boolean>();
  wallet.addresses.forEach(address => response.set(address.address, false));

  // Get the transaction history.
  return getTransactionsHistory(currentCoin, [wallet], fiberApiService, storageService).pipe(map(transactions => {
    // Search all the outputs and set to true all the addresses found.
    transactions.forEach(transaction => {
      transaction.outputs.forEach(output => {
        if (response.has(output.address)) {
          response.set(output.address, true);
        }
      });
    });

    return response;
  }));
}

/**
 * Gets the transaction history of a wallet list.
 * @param wallets Wallets to consult.
 */
export function getTransactionsHistory(currentCoin: Coin, wallets: WalletBase[], fiberApiService: FiberApiService, storageService: StorageService): Observable<OldTransaction[]> {
  let transactions: OldTransaction[];
  /**
   * Allows to easily know which addresses are part of the wallets and also to know
   * which wallet the address belong to.
   */
  const addressesMap: Map<string, WalletBase> = new Map<string, WalletBase>();

  // Get all the addresses of the wallets.
  const addresses: AddressBase[] = [];
  wallets.forEach(w => {
    w.addresses.map(add => {
      addresses.push(add);
      // There could be more than one wallet with the address. This would happen if the wallet is repeated
      // (like when using the same seed for a software and a hardware wallet). In that case, the wallet
      // with most addresses is considered "the most complete one" and is used.
      if (!addressesMap.has(add.address) || addressesMap.get(add.address).addresses.length < w.addresses.length) {
        addressesMap.set(add.address, w);
      }
    });
  });
  const formattedAddresses = addresses.map(a => a.address).join(',');

  // Get the transactions for all addresses.
  return fiberApiService.post(currentCoin.nodeUrl, 'transactions', {addrs: formattedAddresses, verbose: true}).pipe(mergeMap((response: any[]) => {
    // Process the response and convert it into a known object type. Some values are temporal.
    transactions = response.map<OldTransaction>(transaction => ({
      relevantAddresses: [],
      balance: new BigNumber(0),
      hoursBalance: new BigNumber(0),
      fee: new BigNumber(0),
      confirmed: transaction.status.confirmed,
      confirmations: transaction.status.confirmed ? 1 : 0,
      timestamp: transaction.txn.timestamp,
      id: transaction.txn.txid,
      inputs: (transaction.txn.inputs as any[]).map(input => {
        return {
          hash: input.uxid,
          address: input.owner,
          coins: new BigNumber(input.coins),
          hours: new BigNumber(input.calculated_hours),
        };
      }),
      outputs: (transaction.txn.outputs as any[]).map(output => {
        return {
          hash: output.uxid,
          address: output.dst,
          coins: new BigNumber(output.coins),
          hours: new BigNumber(output.hours),
        };
      }),
      involvedLocalWallets: '',
      numberOfInvolvedLocalWallets: 0,
      type: OldTransactionTypes.MixedOrUnknown,
      failed: false,
    }));

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
      .sort((a, b) =>  b.timestamp - a.timestamp)
      .map(transaction => {
        // Add to the transaction object the type, the balance and the involved wallets
        // and addresses.
        calculateGeneralData(transaction, addressesMap, true);

        // Calculate how many hours were burned.
        let inputsHours = new BigNumber('0');
        transaction.inputs.map(input => inputsHours = inputsHours.plus(new BigNumber(input.hours)));
        let outputsHours = new BigNumber('0');
        transaction.outputs.map(output => outputsHours = outputsHours.plus(new BigNumber(output.hours)));
        transaction.fee = inputsHours.minus(outputsHours);

        const txNote = notesMap.get(transaction.id);
        if (txNote) {
          transaction.note = txNote;
        }

        return transaction;
      });
  }));
}

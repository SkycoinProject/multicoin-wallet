import { Observable } from 'rxjs';
import { mergeMap, map } from 'rxjs/operators';
import { BigNumber } from 'bignumber.js';

import { WalletBase, AddressBase } from '../../../wallet-operations/wallet-objects';
import { OldTransaction, OldTransactionTypes } from '../../../wallet-operations/transaction-objects';
import { StorageService, StorageType } from '../../../storage.service';
import { setTransactionType } from '../../../../utils/history-utils';
import { FiberApiService } from '../../../api/fiber-api.service';
import { Coin } from '../../../../coins/coin';

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
      hoursBurned: new BigNumber(0),
      block: transaction.status.block_seq,
      confirmed: transaction.status.confirmed,
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
        // Add to the transaction object the type and the names of the involved wallets.
        setTransactionType(transaction, addressesMap);

        // Saves list of relevant local addresses involved on the transaction.
        const involvedLocalAddresses: Map<string, boolean> = new Map<string, boolean>();

        if (transaction.type === OldTransactionTypes.Incoming) {
          transaction.outputs.map(output => {
            // If the transactions is an incoming one, all coins and hours on outputs
            // pointing to local addresses are considered received.
            if (addressesMap.has(output.address)) {
              involvedLocalAddresses.set(output.address, true);
              transaction.balance = transaction.balance.plus(output.coins);
              transaction.hoursBalance = transaction.hoursBalance.plus(output.hours);
            }
          });
        } else if (transaction.type === OldTransactionTypes.Outgoing) {
          // If the transaction is an outgoing one, all addresses of all wallets used for inputs
          // are considered potential return addresses, so all coins sent to those addresses
          // will be excluded when counting how many coins and hours were sent.
          const possibleReturnAddressesMap: Map<string, boolean> = new Map<string, boolean>();
          transaction.inputs.map(input => {
            if (addressesMap.has(input.address)) {
              involvedLocalAddresses.set(input.address, true);
              addressesMap.get(input.address).addresses.map(add => possibleReturnAddressesMap.set(add.address, true));
            }
          });

          // Sum all coins and hours that were sent.
          transaction.outputs.map(output => {
            if (!possibleReturnAddressesMap.has(output.address)) {
              transaction.balance = transaction.balance.minus(output.coins);
              transaction.hoursBalance = transaction.hoursBalance.plus(output.hours);
            }
          });
        } else if (
          transaction.type === OldTransactionTypes.MovedBetweenAddresses ||
          transaction.type === OldTransactionTypes.MovedBetweenWallets
        ) {
          const inputAddressesMap: Map<string, boolean> = new Map<string, boolean>();

          transaction.inputs.map(input => {
            inputAddressesMap.set(input.address, true);
            involvedLocalAddresses.set(input.address, true);
          });

          // Sum how many coins and hours were moved to addresses different to the ones which
          // own the inputs.
          transaction.outputs.map(output => {
            if (!inputAddressesMap.has(output.address)) {
              involvedLocalAddresses.set(output.address, true);
              transaction.balance = transaction.balance.plus(output.coins);
              transaction.hoursBalance = transaction.hoursBalance.plus(output.hours);
            }
          });
        }  else {
          // If the transaction type is unknown, all local addresses are considered relevant
          // and no balance data is calculated.
          transaction.inputs.map(input => {
            if (addressesMap.has(input.address)) {
              involvedLocalAddresses.set(input.address, true);
            }
          });
          transaction.outputs.map(output => {
            if (addressesMap.has(output.address)) {
              involvedLocalAddresses.set(output.address, true);
            }
          });
        }

        // Create the list of relevant local addresses involved on the transaction.
        involvedLocalAddresses.forEach((value, key) => {
          transaction.relevantAddresses.push(key);
        });

        // Calculate how many hours were burned.
        let inputsHours = new BigNumber('0');
        transaction.inputs.map(input => inputsHours = inputsHours.plus(new BigNumber(input.hours)));
        let outputsHours = new BigNumber('0');
        transaction.outputs.map(output => outputsHours = outputsHours.plus(new BigNumber(output.hours)));
        transaction.hoursBurned = inputsHours.minus(outputsHours);

        const txNote = notesMap.get(transaction.id);
        if (txNote) {
          transaction.note = txNote;
        }

        return transaction;
      });
  }));
}

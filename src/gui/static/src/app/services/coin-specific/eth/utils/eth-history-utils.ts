import { Observable, of } from 'rxjs';
import { mergeMap, map } from 'rxjs/operators';
import { BigNumber } from 'bignumber.js';

import { WalletBase, AddressMap } from '../../../wallet-operations/wallet-objects';
import { OldTransaction, OldTransactionTypes, Output } from '../../../wallet-operations/transaction-objects';
import { StorageService, StorageType } from '../../../storage.service';
import { calculateGeneralData } from '../../../../utils/history-utils';
import { Coin } from '../../../../coins/coin';
import { BlockbookApiService } from '../../../../services/api/blockbook-api.service';
import { EthCoinConfig } from '../../../../coins/coin-type-configs/eth.coin-config';
import { TransactionHistory, TransactionLimits } from '../../../../services/wallet-operations/history.service';
import { AppConfig } from '../../../../app.config';
import { WalletsAndAddressesOperator } from '../../wallets-and-addresses-operator';

/**
 * Gets the transaction history of a wallet list.
 * @param wallets Wallets to consult.
 */
export function getTransactionsHistory(
  currentCoin: Coin,
  wallets: WalletBase[],
  transactionLimitperAddress: TransactionLimits,
  blockbookApiService: BlockbookApiService,
  storageService: StorageService,
  walletsAndAddressesOperator: WalletsAndAddressesOperator,
): Observable<TransactionHistory> {

  let transactions: OldTransaction[];
  /**
   * Allows to easily know which addresses are part of the wallets and also to know
   * which wallet the address belong to.
   */
  const addressMap = new AddressMap<WalletBase>(walletsAndAddressesOperator.formatAddress);

  // Get all the addresses of the wallets.
  const addresses: string[] = [];
  wallets.forEach(w => {
    w.addresses.map(add => {
      if (!addressMap.has(add.printableAddress)) {
        addresses.push(add.printableAddress);
      }
      // There could be more than one wallet with the address. This would happen if the wallet is repeated
      // (like when using the same seed for a software and a hardware wallet). In that case, the wallet
      // with most addresses is considered "the most complete one" and is used.
      if (!addressMap.has(add.printableAddress) || addressMap.get(add.printableAddress).addresses.length < w.addresses.length) {
        addressMap.set(add.printableAddress, w);
      }
    });
  });

  // Value which will allow to get amounts in coins, instead of wei.
  const decimalsCorrector = new BigNumber(10).exponentiatedBy((currentCoin.config as EthCoinConfig).decimals);

  // Addresses for which transactions were ignored due to transactionLimitperAddres.
  let addressesWitMoreTransactions: AddressMap<boolean>;
  // Calculate how many transactions to get per address.
  const hasManyAddresses = addresses.length > AppConfig.fewAddressesLimit;
  let transactionsToGet = hasManyAddresses ? AppConfig.maxTxPerAddressIfManyAddresses : AppConfig.maxTxPerAddressIfFewAddresses;
  if (transactionLimitperAddress === TransactionLimits.ExtraLimit) {
    transactionsToGet = transactionsToGet * AppConfig.maxTxPerAddressMultiplier;
  } else if (transactionLimitperAddress === TransactionLimits.MaxAllowed) {
    transactionsToGet = AppConfig.maxTxPerAddressAllowedByBackend;
  }

  // Get the transactions of all addresses.
  return recursivelyGetTransactions(currentCoin, blockbookApiService, walletsAndAddressesOperator, addresses, transactionsToGet).pipe(mergeMap((response: TransactionsResponse) => {
    addressesWitMoreTransactions = response.addressesWitMoreTransactions;

    // Process the response and convert it into a known object type. Some values are temporal.
    transactions = response.transactions.map<OldTransaction>(transaction => {
      // Build the output list.
      const outputs: Output[] = [];
      (transaction.vout as any[]).forEach(output => {
        outputs.push({
          hash: '',
          address: (output.addresses as string[]).map(add => walletsAndAddressesOperator.formatAddress(add)).join(', '),
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
            address: (input.addresses as string[]).map(add => walletsAndAddressesOperator.formatAddress(add)).join(', '),
            coins: new BigNumber(0),
          };
        }),
        outputs: outputs,
        involvedLocalWallets: '',
        numberOfInvolvedLocalWallets: 0,
        type: OldTransactionTypes.MixedOrUnknown,
        failed: transaction.ethereumSpecific.status === 0,
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

    transactions = transactions
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
        calculateGeneralData(transaction, addressMap, false, walletsAndAddressesOperator);

        // Add the note.
        const txNote = notesMap.get(transaction.id);
        if (txNote) {
          transaction.note = txNote;
        }

        return transaction;
      });

    const finalResponse: TransactionHistory = {
      transactions: transactions,
      addressesWitAdditionalTransactions: addressesWitMoreTransactions,
    };

    return finalResponse;
  }));
}

/**
 * Object returned by the recursivelyGetTransactions function.
 */
export interface TransactionsResponse {
  transactions: any[];
  /**
   * List with the addresses for which transactions were ignored due to the value sent in the
   * maxPerAddress param.
   */
  addressesWitMoreTransactions: AddressMap<boolean>;
}

/**
 * Gets the transaction history of the addresses in the provided address list.
 * @param addresses Addresses to check. The list will be altered by the function.
 * @param maxPerAddress Max number of transactions to return per address.
 * @param startingBlock Block from which to start looking for transactions.
 * @param currentElements Already obtained transactions. For internal use.
 * @param addressesWitMoreTransactions Addresses with transactions which were ignored.
 * For internal use.
 * @returns Array with all the transactions related to the provided address list, in the
 * format returned by the backend.
 */
export function recursivelyGetTransactions(
  currentCoin: Coin,
  blockbookApiService: BlockbookApiService,
  walletsAndAddressesOperator: WalletsAndAddressesOperator,
  addresses: string[],
  maxPerAddress: number,
  startingBlock: number = null,
  currentElements = new Map<string, any>(),
  addressesWitMoreTransactions = new AddressMap<boolean>(walletsAndAddressesOperator.formatAddress),
): Observable<TransactionsResponse> {
  const requestParams = {
    pageSize: maxPerAddress,
    details: 'txslight',
  };

  if (startingBlock) {
    requestParams['from'] = startingBlock;
  }

  return blockbookApiService.get(currentCoin.indexerUrl, 'address/' + addresses[addresses.length - 1], requestParams)
    .pipe(mergeMap((response) => {
      // Save the transactions. A map is used to avoid repeating transactions.
      if (response.transactions) {
        (response.transactions as any[]).forEach(transaction => {
          currentElements.set(transaction.txid, transaction);
        });
      }

      // Check if some transactions were ignored.
      if (response.totalPages && response.totalPages > 1) {
        addressesWitMoreTransactions.set(addresses[addresses.length - 1], true);
      }

      addresses.pop();

      // If there are no more addresses, build and return the final response.
      if (addresses.length === 0) {
        const transactionsForResponse: any[] = [];
        currentElements.forEach(tx => {
          transactionsForResponse.push(tx);
        });

        const finalResponse: TransactionsResponse = {
          transactions: transactionsForResponse,
          addressesWitMoreTransactions: addressesWitMoreTransactions,
        };

        return of(finalResponse);
      }

      // Continue to the next step.
      return recursivelyGetTransactions(currentCoin, blockbookApiService, walletsAndAddressesOperator, addresses, maxPerAddress, startingBlock, currentElements, addressesWitMoreTransactions);
    }));
}

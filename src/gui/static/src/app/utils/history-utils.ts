import { WalletBase } from '../services/wallet-operations/wallet-objects';
import { OldTransaction, OldTransactionTypes } from '../services/wallet-operations/transaction-objects';

/**
 * Takes an OldTransaction object and calculates the transaction type and the name of the
 * involved local wallets. The values are added to the provided OldTransaction instance.
 * @param transaction Transaction to work with.
 * @param addressesMap Map with the name of all the local addresses, pointing to their wallets.
 */
export function setTransactionType(transaction: OldTransaction, addressesMap: Map<string, WalletBase>): void {
  const involvedWallets = new Map<string, boolean>();

  // Check the inputs related to local wallets and if there are multiple local wallets involved
  // with the inputs.
  let ownsInputs = false;
  let ownsAllInputs = true;
  let firstLocalInputWallet: string;
  let thereAreOtherLocalInputWallets = false;
  transaction.inputs.map(input => {
    if (addressesMap.has(input.address)) {
      ownsInputs = true;
      involvedWallets.set(addressesMap.get(input.address).label, true);
      if (!firstLocalInputWallet) {
        firstLocalInputWallet = addressesMap.get(input.address).id;
      } else if (addressesMap.get(input.address).id !== firstLocalInputWallet) {
        thereAreOtherLocalInputWallets = true;
      }
    } else {
      ownsAllInputs = false;
    }
  });

  // Check the outputs related to local wallets and if there are multiple local wallets involved
  // with the outputs.
  let ownsOutputs = false;
  let ownsAllOutputs = true;
  let firstLocalOutputWallet: string;
  let thereAreOtherLocalOutputWallets = false;
  transaction.outputs.map(output => {
    if (addressesMap.has(output.address)) {
      ownsOutputs = true;
      involvedWallets.set(addressesMap.get(output.address).label, true);
      if (!firstLocalOutputWallet) {
        firstLocalOutputWallet = addressesMap.get(output.address).id;
      } else if (addressesMap.get(output.address).id !== firstLocalOutputWallet) {
        thereAreOtherLocalOutputWallets = true;
      }
    } else {
      ownsAllOutputs = false;
    }
  });

  // Set the transaction type.
  transaction.type = OldTransactionTypes.MixedOrUnknown;
  if (ownsInputs && !ownsOutputs) {
    transaction.type = OldTransactionTypes.Outgoing;
  } else if (!ownsInputs && ownsOutputs) {
    transaction.type = OldTransactionTypes.Incoming;
  } else if (ownsAllInputs && ownsAllOutputs) {
    if (!thereAreOtherLocalInputWallets && !thereAreOtherLocalOutputWallets && firstLocalInputWallet === firstLocalOutputWallet) {
      transaction.type = OldTransactionTypes.MovedBetweenAddresses;
    } else if (!thereAreOtherLocalInputWallets) {
      transaction.type = OldTransactionTypes.MovedBetweenWallets;
    }
  } else if (ownsInputs && ownsOutputs && !ownsAllOutputs) {
    if (!thereAreOtherLocalInputWallets && !thereAreOtherLocalOutputWallets && firstLocalInputWallet === firstLocalOutputWallet) {
      transaction.type = OldTransactionTypes.Outgoing;
    }
  }

  // Get the names of the involved local wallets.
  transaction.involvedLocalWallets = '';
  involvedWallets.forEach((value, key) => {
    transaction.involvedLocalWallets = transaction.involvedLocalWallets + key + ', ';
  });

  transaction.involvedLocalWallets = transaction.involvedLocalWallets.substr(0, transaction.involvedLocalWallets.length - 2);
  transaction.numberOfInvolvedLocalWallets = involvedWallets.size;
}

/**
 * Gets the name of the bitmap that should be used as the icon for a transaction. The returned
 * string contains only the base name, without the color part or the file extension.
 * @param transaction Transaction to check.
 */
export function getTransactionIconName(transaction: OldTransaction): string {
  if (transaction.type === OldTransactionTypes.Incoming) {
    return 'received';
  } else if (transaction.type === OldTransactionTypes.Outgoing) {
    return 'sent';
  } else if (transaction.type === OldTransactionTypes.MovedBetweenAddresses) {
    return 'internal';
  } else if (transaction.type === OldTransactionTypes.MovedBetweenWallets) {
    return 'internal';
  }

  return 'unknown';
}

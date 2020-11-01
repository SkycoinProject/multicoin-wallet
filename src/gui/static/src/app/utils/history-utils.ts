import { WalletBase, AddressMap } from '../services/wallet-operations/wallet-objects';
import { OldTransaction, OldTransactionTypes } from '../services/wallet-operations/transaction-objects';
import { WalletsAndAddressesOperator } from '../services/coin-specific/wallets-and-addresses-operator';

/**
 * Takes an OldTransaction object and calculates the transaction type, the balance and the
 * involved local wallets and addresses. The values are added to the provided
 * OldTransaction instance.
 * @param transaction Transaction to work with.
 * @param addressMap Map with all the local addresses, pointing to their wallets.
 * @param calculateHours If the hours balance must be calculated.
 */
export function calculateGeneralData(transaction: OldTransaction, addressMap: AddressMap<WalletBase>, calculateHours: boolean, walletsAndAddressesOperator: WalletsAndAddressesOperator): void {
  const involvedWallets = new Map<string, boolean>();

  // Check the inputs related to local wallets and if there are multiple local wallets involved
  // with the inputs.
  let ownsInputs = false;
  let ownsAllInputs = true;
  let firstLocalInputWallet: string;
  let thereAreOtherLocalInputWallets = false;
  transaction.inputs.map(input => {
    if (addressMap.has(input.address)) {
      ownsInputs = true;
      involvedWallets.set(addressMap.get(input.address).label, true);
      if (!firstLocalInputWallet) {
        firstLocalInputWallet = addressMap.get(input.address).id;
      } else if (addressMap.get(input.address).id !== firstLocalInputWallet) {
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
    if (addressMap.has(output.address)) {
      ownsOutputs = true;
      involvedWallets.set(addressMap.get(output.address).label, true);
      if (!firstLocalOutputWallet) {
        firstLocalOutputWallet = addressMap.get(output.address).id;
      } else if (addressMap.get(output.address).id !== firstLocalOutputWallet) {
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

  // Saves the list of relevant local addresses involved in the transaction.
  const involvedLocalAddresses = new Map<string, boolean>();

  // Calculate the balance and involved addresses depending on the transaction type.
  if (transaction.type === OldTransactionTypes.Incoming) {
    transaction.outputs.map(output => {
      // If the transactions is an incoming one, all coins and hours on outputs
      // pointing to local addresses are considered received.
      if (addressMap.has(output.address)) {
        involvedLocalAddresses.set(output.address, true);
        transaction.balance = transaction.balance.plus(output.coins);
        if (calculateHours) {
          transaction.hoursBalance = transaction.hoursBalance.plus(output.hours);
        }
      }
    });
  } else if (transaction.type === OldTransactionTypes.Outgoing) {
    // If the transaction is an outgoing one, all addresses of all wallets used for inputs
    // are considered potential return addresses, so all coins sent to those addresses
    // will be excluded when counting how many coins and hours were sent.
    const possibleReturnAddressesMap = new AddressMap<boolean>(walletsAndAddressesOperator.formatAddress);
    transaction.inputs.map(input => {
      if (addressMap.has(input.address)) {
        involvedLocalAddresses.set(input.address, true);
        addressMap.get(input.address).addresses
          .map(add => possibleReturnAddressesMap.set(add.printableAddress, true));
      }
    });

    // Sum all coins and hours that were sent.
    transaction.outputs.map(output => {
      if (!possibleReturnAddressesMap.has(output.address)) {
        transaction.balance = transaction.balance.minus(output.coins);
        if (calculateHours) {
          transaction.hoursBalance = transaction.hoursBalance.plus(output.hours);
        }
      }
    });
  } else if (
    transaction.type === OldTransactionTypes.MovedBetweenAddresses ||
    transaction.type === OldTransactionTypes.MovedBetweenWallets
  ) {
    const inputAddressesMap = new AddressMap<boolean>(walletsAndAddressesOperator.formatAddress);

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
        if (calculateHours) {
          transaction.hoursBalance = transaction.hoursBalance.plus(output.hours);
        }
      }
    });
  }  else {
    // If the transaction type is unknown, all local addresses are considered relevant
    // and no balance data is calculated.
    transaction.inputs.map(input => {
      if (addressMap.has(input.address)) {
        involvedLocalAddresses.set(input.address, true);
      }
    });
    transaction.outputs.map(output => {
      if (addressMap.has(output.address)) {
        involvedLocalAddresses.set(output.address, true);
      }
    });
  }

  // Create the list of relevant local addresses involved on the transaction.
  involvedLocalAddresses.forEach((value, key) => {
    transaction.relevantAddresses.push(walletsAndAddressesOperator.formatAddress(key));
  });
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

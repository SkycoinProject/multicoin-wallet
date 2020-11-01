import { Observable } from 'rxjs';
import { Injectable } from '@angular/core';

import { WalletBase, AddressWithBalance, AddressMap } from './wallet-objects';
import { OldTransaction } from './transaction-objects';
import { HistoryOperator } from '../coin-specific/history-operator';
import { OperatorService } from '../operators.service';

export interface PendingTransactionsResponse {
  /**
   * Pending transactions affecting one or more of the user addresses.
   */
  user: PendingTransactionData[];
  /**
   * All pending transactions known by the node, including the ones affecting one
   * or more of the user addresses.
   */
  all: PendingTransactionData[];
}

export interface PendingTransactionData {
  /**
   * Transaction ID.
   */
  id: string;
  /**
   * How many coins are on the outputs.
   */
  coins: string;
  /**
   * How many hours are on the outputs.
   */
  hours?: string;
  /**
   * Transaction timestamp, in Unix format.
   */
  timestamp: number;
  /**
   * How many confirmations the transaction currently has.
   */
  confirmations: number;
}

export interface AddressesHistoryResponse {
  /**
   * External address list.
   */
  externalAddresses: AddressesState[];
  /**
   * Change address list.
   */
  changeAddresses: AddressesState[];
  /**
   * If true, the response does not include one or more addresses of the wallet.
   */
  omitedAddresses: boolean;
}

export interface AddressesState {
  /**
   * Address Object.
   */
  address: AddressWithBalance;
  /**
   * Index of the address in its chain (list of external or change addresses).
   */
  indexInWallet: number;
  /**
   * If the address has already received any coins.
   */
  alreadyUsed: boolean;
}

/**
 * Response returned by HistoryService.getTransactionsHistory.
 */
export interface TransactionHistory {
  /**
   * Transaction list.
   */
  transactions: OldTransaction[];
  /**
   * List with the addresses for which transactions were ignored due to the value sent in the
   * transactionLimitperAddress param.
   */
  addressesWitAdditionalTransactions: AddressMap<boolean>;
}

/**
 * Values indicating the limits in how many transactions per address will be retrieved when
 * getting the transaction history.
 */
export enum TransactionLimits {
  NormalLimit = 'NormalLimit',
  ExtraLimit = 'ExtraLimit',
  MaxAllowed = 'MaxAllowed',
}

/**
 * Allows to get the transaction history and pending transactions.
 */
@Injectable()
export class HistoryService {
  /**
   * Instance with the actual code for making most of the operations of this service. It is
   * specific for the currently selected coin.
   */
  private operator: HistoryOperator;

  constructor(operatorService: OperatorService) {
    // Maintain the operator updated.
    operatorService.currentOperators.subscribe(operators => {
      if (operators) {
        this.operator = operators.historyOperator;
      } else {
        this.operator = null;
      }
    });
  }

  /**
   * Gets the transaction history of all the wallets or a specific wallet.
   * @param wallet Specific wallet for which the transaction history will be returned. If null,
   * the transactions of all wallets will be returned.
   * @param transactionLimitperAddress How many transactions per address will be retrieved. Some
   * coins will ignore this walue and return all the transactions.
   */
  getTransactionsHistory(wallet: WalletBase|null, transactionLimitperAddress: TransactionLimits): Observable<TransactionHistory> {
    return this.operator.getTransactionsHistory(wallet, transactionLimitperAddress);
  }

  /**
   * Checks the addresses of a wallet to know which ones have been used, defined as having
   * received coins.
   * @returns A map with all addresses, indicating which ones have been used and which ones
   * have not.
   */
  getIfAddressesUsed(wallet: WalletBase): Observable<AddressMap<boolean>> {
    return this.operator.getIfAddressesUsed(wallet);
  }

  /**
   * Gets the list of pending transactions currently on the node. The data is not
   * automatically updated.
   */
  getPendingTransactions(): Observable<PendingTransactionsResponse> {
    return this.operator.getPendingTransactions();
  }

  /**
   * Gets the address list of a wallet. Not for deterministic wallets.
   */
  getAddressesHistory(wallet: WalletBase): Observable<AddressesHistoryResponse> {
    return this.operator.getAddressesHistory(wallet);
  }
}

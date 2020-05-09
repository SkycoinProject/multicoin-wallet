import { Observable } from 'rxjs';
import { Injectable } from '@angular/core';

import { WalletBase, AddressWithBalance } from './wallet-objects';
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
   */
  getTransactionsHistory(wallet: WalletBase|null): Observable<OldTransaction[]> {
    return this.operator.getTransactionsHistory(wallet);
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

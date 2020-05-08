import { delay, mergeMap } from 'rxjs/operators';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { SubscriptionLike, of } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { FormGroup, FormBuilder } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

import { PriceService } from '../../../services/price.service';
import { TransactionDetailComponent } from './transaction-detail/transaction-detail.component';
import { HistoryService } from '../../../services/wallet-operations/history.service';
import { BalanceAndOutputsService } from '../../../services/wallet-operations/balance-and-outputs.service';
import { OldTransaction, OldTransactionTypes } from '../../../services/wallet-operations/transaction-objects';
import { WalletTypes } from '../../../services/wallet-operations/wallet-objects';
import { getTransactionIconName } from '../../../utils/history-utils';
import { CoinService } from '../../../services/coin.service';
import { CoinTypes } from '../../../coins/coin-types';

/**
 * Represents a wallet, to be used as filter.
 */
class Wallet {
  id: string;
  type: WalletTypes;
  label: string;
  coins: string;
  hours: string;
  addresses: Address[];
  /**
   * If true, the user selected the option for showing all transactions affecting the wallet,
   * which means all addresses must be considered selected.
   */
  allAddressesSelected: boolean;
}

/**
 * Represents an address, to be used as filter.
 */
class Address {
  walletID: string;
  address: string;
  coins: string;
  hours: string;
  /**
   * If true, the user selected the option for showing all transactions affecting the wallet,
   * which means this address must be considered selected, even if the user did not select
   * it directly.
   */
  showingWholeWallet: boolean;
  /**
   * Name of the wallet which contains this address. NOTE: should only have a value if the
   * address is on a wallet which is not suposed to show its addresses on the filter list,
   * but the address was specifically selected as a filter via URL params.
   */
  walletName?: string;
}

/**
 * Shows the transaction history and options for the user to filter it. The "addr" and "wal"
 * params can be added to the url to limit the history to a list of wallet IDs (as a comma
 * separated string) or a list of addresses, respectively.
 */
@Component({
  selector: 'app-transaction-list',
  templateUrl: './transaction-list.component.html',
  styleUrls: ['./transaction-list.component.scss'],
})
export class TransactionListComponent implements OnInit, OnDestroy {
  // If the user has at least one wallet for the currently selected coin.
  userHasWallets = true;
  // Contains all transactions on the user history.
  allTransactions: OldTransaction[];
  // Contains the filtered transaction list.
  transactions: OldTransaction[];
  // All wallets the user has, for filtering.
  wallets: Wallet[];
  // All wallets that must be shown in the filter list with all its addresses.
  walletsShowingAllAddresses: Wallet[];
  // All wallets that must be shown in the filter list without the addresses.
  walletsNotShowingAddresses: Wallet[];
  // Contains the addresses which were specifically selected as filters via URL params, but are
  // part of wallets which are not suposed to show its addresses on the filter list.
  addresses: Address[];
  // If true, the currently selected coin uses coin hours to pay the tx fees.
  feePaidInHours = false;
  // How many confirmations a transaction must have to be considered fully confirmed.
  confirmationsNeeded = 0;
  transactionsLoaded = false;
  form: FormGroup;

  // If the involved addresses of every transaction must be shown.
  showAddresses = false;
  // If the user has more than one wallet.
  userHasMultipleWallets = false;

  oldTransactionTypes = OldTransactionTypes;

  // Vars for showing only some elements at the same time by default.
  readonly maxInitialElements = 40;
  viewAll = false;
  viewingTruncatedList = false;
  totalElements: number;

  price: number;

  private requestedFilters: string[];

  private priceSubscription: SubscriptionLike;
  private filterSubscription: SubscriptionLike;
  private walletsSubscription: SubscriptionLike;
  private transactionsSubscription: SubscriptionLike;
  private routeSubscription: SubscriptionLike;

  constructor(
    private dialog: MatDialog,
    private priceService: PriceService,
    private formBuilder: FormBuilder,
    private historyService: HistoryService,
    balanceAndOutputsService: BalanceAndOutputsService,
    route: ActivatedRoute,
    coinService: CoinService,
  ) {
    this.form = this.formBuilder.group({
      filter: [[]],
    });

    this.feePaidInHours = coinService.currentCoinInmediate.coinType === CoinTypes.Fiber;
    this.confirmationsNeeded = coinService.currentCoinInmediate.confirmationsNeeded;

    // Get the filters requested in the URL.
    this.routeSubscription = route.queryParams.subscribe(params => {
      let Addresses = params['addr'] ? (params['addr'] as string).split(',') : [];
      let Wallets = params['wal'] ? (params['wal'] as string).split(',') : [];
      // Add prefixes to make it easier to identify the requested filters.
      Addresses = Addresses.map(element => 'a-' + element);
      Wallets = Wallets.map(element => 'w-' + element);
      this.viewAll = false;

      // Save the list of requested filters.
      this.requestedFilters = Addresses.concat(Wallets);
      // Apply the requested filters. If the wallet list has not been loaded, this call
      // will do nothing.
      this.showRequestedFilters();
    });

    // Maintain an updated list of the registered wallets and update the transactions every time
    // the wallets or their balances change.
    this.walletsSubscription = balanceAndOutputsService.walletsWithBalance.subscribe(wallets => {
      if (wallets.length === 0) {
        this.userHasWallets = false;

        return;
      }

      this.userHasWallets = true;

      // If the user only has one wallet, the addresses of each transaction will be shown.
      this.userHasMultipleWallets = wallets.length > 1;
      this.showAddresses = !this.userHasMultipleWallets;

      // Save the currently selected filters on 2 maps.
      const selectedAddresses: Map<string, boolean> = new Map<string, boolean>();
      const selectedWallets: Map<string, boolean> = new Map<string, boolean>();
      const selectedfilters: (Wallet|Address)[] = this.form.get('filter').value;
      selectedfilters.forEach(filter => {
        if ((filter as Wallet).addresses) {
          selectedWallets.set((filter as Wallet).id, true);
        } else {
          selectedAddresses.set((filter as Address).walletID + '/' + (filter as Address).address, true);
        }
      });
      // As all wallets and address used as filters will be recreated, this array saves the list
      // of the new objects which must be used as filters for the UI to stay the same.
      const newFilters: (Wallet|Address)[] = [];

      this.wallets = [];

      // A local copy of the data is created, to use it for filtering.
      wallets.forEach(wallet => {
        const newWallet: Wallet = {
          id: wallet.id,
          type: wallet.walletType,
          label: wallet.label,
          coins: wallet.coins.decimalPlaces(6).toString(),
          hours: wallet.hours.decimalPlaces(0).toString(),
          addresses: [],
          allAddressesSelected: selectedWallets.has(wallet.id),
        };
        this.wallets.push(newWallet);

        // Use as filter, if appropiate.
        if (selectedWallets.has(wallet.id)) {
          newFilters.push(newWallet);
        }

        wallet.addresses.forEach(address => {
          const newAddress: Address = {
            walletID: wallet.id,
            address: address.address,
            coins: address.coins.decimalPlaces(6).toString(),
            hours: address.hours.decimalPlaces(0).toString(),
            showingWholeWallet: selectedWallets.has(wallet.id),
          };
          this.wallets[this.wallets.length - 1].addresses.push(newAddress);

          // Use as filter, if appropiate.
          if (selectedAddresses.has(wallet.id + '/' + address.address)) {
            newFilters.push(newAddress);
          }
        });
      });

      this.form.get('filter').setValue(newFilters, { emitEvent: false });

      // Prepare the arrays of elements which will be shown on the filter list.
      this.prepareWalletsForFiltering();

      this.loadTransactions(0);
    });
  }

  ngOnInit() {
    this.priceSubscription = this.priceService.price.subscribe(price => this.price = price);

    this.filterSubscription = this.form.get('filter').valueChanges.subscribe(() => {
      this.viewAll = false;
      this.filterTransactions();
    });
  }

  ngOnDestroy() {
    this.priceSubscription.unsubscribe();
    this.filterSubscription.unsubscribe();
    this.walletsSubscription.unsubscribe();
    this.routeSubscription.unsubscribe();
    this.removeTransactionsSubscription();
  }

  // Shows all transactions.
  showAll() {
    if (!this.viewAll) {
      this.viewAll = true;
      this.filterTransactions();
    }
  }

  showTransaction(transaction: OldTransaction) {
    TransactionDetailComponent.openDialog(this.dialog, transaction);
  }

  // Gets the name of the icon that should be shown for a specific transaction.
  getTransactionIconName(transaction: OldTransaction): string {
    return getTransactionIconName(transaction);
  }

  // Cleans the filter list.
  removeFilters() {
    this.form.get('filter').setValue([]);
  }

  // Switches between showing the addresses of each transaction or not.
  switchAddressesVisibility() {
    this.showAddresses = !this.showAddresses;
  }

  // Prepares the arrays which are used to build the filter list.
  private prepareWalletsForFiltering() {
    this.walletsShowingAllAddresses = [];
    this.walletsNotShowingAddresses = [];

    this.wallets.forEach(wallet => {
      if (wallet.type === WalletTypes.Deterministic) {
        this.walletsShowingAllAddresses.push(wallet);
      } else {
        this.walletsNotShowingAddresses.push(wallet);
      }
    });

    // Save a map with the addresses currently selected as filters.
    const selectedAddresses: Map<string, boolean> = new Map<string, boolean>();
    const selectedfilters: (Wallet|Address)[] = this.form.get('filter').value;
    selectedfilters.forEach(filter => {
      if ((filter as Address).address) {
        selectedAddresses.set((filter as Address).walletID + '/' + (filter as Address).address, true);
      }
    });

    this.addresses = [];
    this.walletsNotShowingAddresses.forEach(wallet => {
      wallet.addresses.forEach(address => {
        if (selectedAddresses.has(address.walletID + '/' + address.address)) {
          address.walletName = wallet.label;
          this.addresses.push(address);
        }
      });
    });
  }

  /**
   * Loads the list of transactions.
   * @param delayMs Delay before starting to get the data.
   */
  private loadTransactions(delayMs: number) {
    this.removeTransactionsSubscription();

    this.transactionsSubscription = of(1).pipe(delay(delayMs), mergeMap(() => this.historyService.getTransactionsHistory(null))).subscribe(
      (transactions: OldTransaction[]) => {
        this.allTransactions = transactions;
        this.transactionsLoaded = true;

        // Filter the transactions.
        this.showRequestedFilters();
        this.filterTransactions();
      },
      // If there is an error, retry after a short delay.
      () => this.loadTransactions(2000),
    );
  }

  /**
   * Updates the list of transaction which will be shown on the UI.
   */
  private filterTransactions() {
    const selectedfilters: (Wallet|Address)[] = this.form.get('filter').value;
    // Removes the selection status of the wallets and addresses. It is updated below, if needed.
    this.wallets.forEach(wallet => {
      wallet.allAddressesSelected = false;
      wallet.addresses.forEach(address => address.showingWholeWallet = false);
    });

    if (selectedfilters.length === 0) {
      // If no filter was selected, show all transactions.
      this.transactions = this.allTransactions;
    } else {
      // Save all the allowed addresses.
      const selectedAddresses: Map<string, boolean> = new Map<string, boolean>();
      selectedfilters.forEach(filter => {
        if ((filter as Wallet).addresses) {
          // Update the selection status when a whole wallet was selected.
          (filter as Wallet).addresses.forEach(address => {
            selectedAddresses.set(address.address, true);
            address.showingWholeWallet = true;
          });
          (filter as Wallet).allAddressesSelected = true;
        } else {
          selectedAddresses.set((filter as Address).address, true);
        }
      });

      // Filter the transactions.
      this.transactions = this.allTransactions.filter(tx =>
        tx.inputs.some(input => selectedAddresses.has(input.address)) || tx.outputs.some(output => selectedAddresses.has(output.address)),
      );
    }

    // Truncate the list, if needed.
    this.totalElements = this.transactions.length;
    if (!this.viewAll && this.totalElements > this.maxInitialElements) {
      this.transactions = this.transactions.slice(0, this.maxInitialElements);
      this.viewingTruncatedList = true;
    } else {
      this.viewingTruncatedList = false;
    }
  }

  /**
   * Makes the page show the filters saved on requestedFilters. Does nothing if the page is
   * still loading important data.
   */
  private showRequestedFilters() {
    if (!this.transactionsLoaded || !this.wallets || this.wallets.length === 0 || this.requestedFilters === null || this.requestedFilters === undefined) {
      return;
    }

    if (this.requestedFilters.length > 0) {
      const filters: (Wallet|Address)[] = [];

      // Get the requested wallets and addesses.
      this.requestedFilters.forEach(filter => {
        // The first 2 characters are for knowing if the filter is a complete wallet or
        // an address.
        const filterContent = filter.substr(2, filter.length - 2);
        this.wallets.forEach(wallet => {
          if (filter.startsWith('w-')) {
            if (filterContent === wallet.id) {
              filters.push(wallet);
            }
          } else if (filter.startsWith('a-')) {
            wallet.addresses.forEach(address => {
              if (filterContent === address.address) {
                filters.push(address);
              }
            });
          }
        });
      });

      this.form.get('filter').setValue(filters);
    } else {
      this.form.get('filter').setValue([]);
    }

    this.requestedFilters = null;

    this.prepareWalletsForFiltering();
  }

  private removeTransactionsSubscription() {
    if (this.transactionsSubscription) {
      this.transactionsSubscription.unsubscribe();
    }
  }
}

import { Component, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { SubscriptionLike, combineLatest } from 'rxjs';
import { first } from 'rxjs/operators';

import { HistoryService, AddressesState } from '../../../services/wallet-operations/history.service';
import { WalletsAndAddressesService } from '../../../services/wallet-operations/wallets-and-addresses.service';
import { WalletBase, WalletTypes } from '../../../services/wallet-operations/wallet-objects';
import { MsgBarService } from '../../../services/msg-bar.service';
import { WalletOptionsComponent } from '../wallets/wallet-options/wallet-options.component';

/**
 * Allows to see the address history of a wallet (not for deterministic wallets). The URL for
 * opening this page must have a param called "id", with the ID of the wallet to consult.
 */
@Component({
  selector: 'app-address-history',
  templateUrl: './address-history.component.html',
  styleUrls: ['./address-history.component.scss'],
})
export class AddressHistoryComponent implements OnDestroy {
  // All addresses on the wallet. The first element is the array of external addresses and the
  // second one is the list of change addresses.
  allAddresses: AddressesState[][];
  // Addresses to show on the UI.
  addresses: AddressesState[][];

  // Vars for showing only some elements at the same time by default.
  readonly maxInitialElements = 5;
  showAllExternalAddresses = false;
  showAllChangeAddresses = false;
  externalAddressesTruncated = false;
  changeAddressesTruncated = false;

  // If the page is loading the data.
  loading = true;
  // If the id on the URL does not correspond to a valid wallet.
  invalidWallet = false;

  private wallet: WalletBase;
  private basicDataSubscription: SubscriptionLike;
  private addressesSubscription: SubscriptionLike;

  constructor(
    private historyService: HistoryService,
    private walletsAndAddressesService: WalletsAndAddressesService,
    private route: ActivatedRoute,
    private msgBarService: MsgBarService,
    private dialog: MatDialog,
  ) {
    // Get the wallets and route params.
    this.basicDataSubscription = combineLatest(this.route.params, this.walletsAndAddressesService.currentWallets.pipe(first()), (params, wallets) => {
      this.loading = true;
      this.invalidWallet = false;
      this.showAllExternalAddresses = false;
      this.showAllChangeAddresses = false;
      this.externalAddressesTruncated = false;
      this.changeAddressesTruncated = false;

      this.removeAddressesSubscription();

      this.wallet = wallets.find(w => w.id === params['id']);
      // Abort if a valid wallet is not found.
      if (!this.wallet || this.wallet.walletType === WalletTypes.Deterministic) {
        this.invalidWallet = true;

        return;
      } else {
        this.invalidWallet = false;
      }

      this.startDataRefreshSubscription();
    }).subscribe();
  }

  ngOnDestroy() {
    this.basicDataSubscription.unsubscribe();
    this.removeAddressesSubscription();
    this.msgBarService.hide();
  }

  // Makes the page show all the external or change addresses, depending on the param.
  showAll(external: boolean) {
    if (external) {
      this.showAllExternalAddresses = true;
      this.externalAddressesTruncated = false;
      this.addresses[0] = this.allAddresses[0];
    } else {
      this.showAllChangeAddresses = true;
      this.changeAddressesTruncated = false;
      this.addresses[1] = this.allAddresses[1];
    }
  }

  // Opens the modal window for adding addresses to the wallet.
  addAddress() {
    WalletOptionsComponent.openDialog(this.dialog, {wallet: this.wallet, automaticallyAddAddresses: true});
  }

  /**
   * Makes the page start updating the data periodically. If this function was called before,
   * the previous updating procedure is cancelled.
   */
  private startDataRefreshSubscription() {
    this.removeAddressesSubscription();

    this.addressesSubscription = this.historyService.getAddressesHistory(this.wallet).subscribe(response => {
      // Order the lists last to first.
      response.externalAddresses.reverse();
      response.changeAddresses.reverse();

      // Save all addresses.
      this.allAddresses = [];
      this.allAddresses.push(response.externalAddresses);
      this.allAddresses.push(response.changeAddresses);

      // If there are too many addresses, calculate which ones will be shown.
      this.addresses = [];
      if (this.showAllExternalAddresses || response.externalAddresses.length <= this.maxInitialElements) {
        this.externalAddressesTruncated = false;
        this.addresses.push(response.externalAddresses);
      } else {
        this.externalAddressesTruncated = true;
        this.addresses.push(response.externalAddresses.slice(0, this.maxInitialElements));
      }

      if (this.showAllChangeAddresses || response.changeAddresses.length <= this.maxInitialElements) {
        this.changeAddressesTruncated = false;
        this.addresses.push(response.changeAddresses);
      } else {
        this.changeAddressesTruncated = true;
        this.addresses.push(response.changeAddresses.slice(0, this.maxInitialElements));
      }

      this.loading = false;

      if (response.omitedAddresses) {
        this.msgBarService.showWarning('address-history.omited-addresses-warning');
      }
    }, err => {
      this.startDataRefreshSubscription();
    });
  }

  private removeAddressesSubscription() {
    if (this.addressesSubscription) {
      this.addressesSubscription.unsubscribe();
    }
  }
}

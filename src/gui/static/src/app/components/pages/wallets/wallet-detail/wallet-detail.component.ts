import { Component, Input, OnDestroy } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { SubscriptionLike } from 'rxjs';

import { HwWalletService } from '../../../../services/hw-wallet.service';
import { copyTextToClipboard } from '../../../../utils/general-utils';
import { HwConfirmAddressDialogComponent, AddressConfirmationParams } from '../../../layout/hardware-wallet/hw-confirm-address-dialog/hw-confirm-address-dialog.component';
import { MsgBarService } from '../../../../services/msg-bar.service';
import { WalletWithBalance, AddressWithBalance } from '../../../../services/wallet-operations/wallet-objects';
import { WalletsComponent } from '../wallets.component';
import { WalletOptionsComponent } from '../wallet-options/wallet-options.component';

/**
 * Shows the option buttons and address list of a wallet on the wallet list.
 */
@Component({
  selector: 'app-wallet-detail',
  templateUrl: './wallet-detail.component.html',
  styleUrls: ['./wallet-detail.component.scss'],
})
export class WalletDetailComponent implements OnDestroy {
  @Input() wallet: WalletWithBalance;

  // Index of the address currently being confirmed. Used for showing the loading animation
  // on the UI.
  confirmingIndex = null;
  // If all addresses without coins must be hidden on the address list.
  hideEmpty = false;
  // Allows to know which addresses are being copied, so the UI can show an indication.
  copying = new Map<string, boolean>();

  private confirmSubscription: SubscriptionLike;

  constructor(
    private dialog: MatDialog,
    private msgBarService: MsgBarService,
    private hwWalletService: HwWalletService,
  ) { }

  ngOnDestroy() {
    this.msgBarService.hide();
    if (this.confirmSubscription) {
      this.confirmSubscription.unsubscribe();
    }
  }

  // Opens wallet options modal window.
  openWalletOptions() {
    if (WalletsComponent.busy) {
      this.msgBarService.showError('wallet.busy-error');

      return;
    }

    WalletOptionsComponent.openDialog(this.dialog, {wallet: this.wallet});
  }

  // Switches between showing and hiding the addresses without balance.
  toggleEmpty() {
    this.hideEmpty = !this.hideEmpty;
  }

  /**
   * Shows a modal window for the user to confirm if the address shown on the UI is equal to
   * the one stored on the device.
   * @param wallet Wallet with the address toc be confirmed.
   * @param addressIndex Index of the address on the wallet.
   * @param showCompleteConfirmation Must be true if the address has not been donfirmed yet, to
   * show a longer success message after the user confirms the address.
   */
  confirmAddress(wallet: WalletWithBalance, addressIndex: number, showCompleteConfirmation: boolean) {
    if (this.confirmingIndex !== null) {
      return;
    }

    if (WalletsComponent.busy) {
      this.msgBarService.showError('wallet.busy-error');

      return;
    }

    WalletsComponent.busy = true;
    this.confirmingIndex = addressIndex;
    this.msgBarService.hide();

    if (this.confirmSubscription) {
      this.confirmSubscription.unsubscribe();
    }

    // Check if the correct device is connected.
    this.confirmSubscription = this.hwWalletService.checkIfCorrectHwConnected(this.wallet.addresses[0].address).subscribe(() => {
      const data = new AddressConfirmationParams();
      data.wallet = wallet;
      data.addressIndex = addressIndex;
      data.showCompleteConfirmation = showCompleteConfirmation;

      HwConfirmAddressDialogComponent.openDialog(this.dialog, data);

      WalletsComponent.busy = false;
      this.confirmingIndex = null;
    }, err => {
      this.msgBarService.showError(err);
      WalletsComponent.busy = false;
      this.confirmingIndex = null;
    });
  }

  // Copies an address to the clipboard and shows it as being copied for the time set on
  // the "duration" param.
  copyAddress(event, address: AddressWithBalance, duration = 500) {
    event.stopPropagation();

    if (this.copying.has(address.address)) {
      return;
    }

    copyTextToClipboard(address.address);
    this.copying.set(address.address, true);

    setTimeout(() => {
      if (this.copying.has(address.address)) {
        this.copying.delete(address.address);
      }
    }, duration);
  }
}

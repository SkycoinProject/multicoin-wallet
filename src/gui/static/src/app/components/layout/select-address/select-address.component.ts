import { Component } from '@angular/core';
import { MatDialogRef, MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { first } from 'rxjs/operators';
import BigNumber from 'bignumber.js';

import { AppConfig } from '../../../app.config';
import { BalanceAndOutputsService } from '../../../services/wallet-operations/balance-and-outputs.service';
import { WalletTypes, WalletBase } from '../../../services/wallet-operations/wallet-objects';
import { CoinService } from '../../../services/coin.service';

/**
 * Represents a wallet shown on the list. The wallet object is not used directly to be able to
 * remove unwanted elements from the address list.
 */
class ListElement {
  label: string;
  originalWallet: WalletBase;
  addresses: ElementAddress[] = [];
}

/**
 * Address of a wallet shown on the list.
 */
class ElementAddress {
  address: string;
  coins: BigNumber;
  hours: BigNumber;
}

/**
 * Modal window used for allowing the user to select an address for any of the registered
 * wallets. If the user selects an address, the modal window is closed and the address string
 * is returned in the "afterClosed" event. If the user selects the option for getting
 * an address from a bip44 wallet, the modal window is closed and the selected wallet is
 * returned in the "afterClosed" event.
 */
@Component({
  selector: 'app-select-address',
  templateUrl: './select-address.component.html',
  styleUrls: ['./select-address.component.scss'],
})
export class SelectAddressComponent {
  // If true, the currently selected coin includes coin hours.
  coinHasHours = false;
  // True if the wallets shown by the component don't have the same value on the walletType param.
  hasVariousWalletTypes = false;
  walletTypes = WalletTypes;
  // Wallets to show on the list.
  listElements: ListElement[] = [];

  /**
   * Opens the modal window. Please use this function instead of opening the window "by hand".
   */
  public static openDialog(dialog: MatDialog): MatDialogRef<SelectAddressComponent, any> {
    const config = new MatDialogConfig();
    config.autoFocus = false;
    config.width = AppConfig.mediumModalWidth;

    return dialog.open(SelectAddressComponent, config);
  }

  constructor(
    public dialogRef: MatDialogRef<SelectAddressComponent>,
    private balanceAndOutputsService: BalanceAndOutputsService,
    private router: Router,
    coinService: CoinService,
  ) {
    this.coinHasHours = coinService.currentCoinInmediate.coinTypeFeatures.coinHours;

    // Get the wallet list.
    this.balanceAndOutputsService.walletsWithBalance.pipe(first()).subscribe(wallets => {
      const typeOfTheFirstWallet = wallets.length > 0 ? wallets[0].walletType : null;
      this.hasVariousWalletTypes = false;

      wallets.forEach(wallet => {
        const element = new ListElement();
        element.label = wallet.label;
        element.originalWallet = wallet;

        if (wallet.walletType !== typeOfTheFirstWallet) {
          this.hasVariousWalletTypes = true;
        }

        // Exclude all unconfirmed addresses from the hw wallets.
        wallet.addresses.forEach(address => {
          if (!wallet.isHardware || address.confirmed) {
            element.addresses.push({
              address: address.address,
              coins: address.coins,
              hours: address.hours,
            });
          }
        });

        this.listElements.push(element);
      });
    });
  }

  // Closes the modal window and returns the selected address.
  select(value: string) {
    this.dialogRef.close(value);
  }

  // Opens the address history page of the selected wallet.
  viewAddresses(wallet: WalletBase) {
    this.router.navigate(['/addresses', { id: wallet.id }]);
    this.dialogRef.close();
  }

  // Closes the modal window and returns a value indicating that the user selected the option
  // for getting an address from a bip44 wallet.
  getAddress(wallet: WalletBase) {
    this.dialogRef.close(wallet);
  }
}

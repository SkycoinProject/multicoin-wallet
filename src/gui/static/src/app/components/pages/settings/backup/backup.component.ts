import { Component, OnDestroy, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Subscription } from 'rxjs';

import { SeedModalComponent } from './seed-modal/seed-modal.component';
import { PasswordDialogComponent } from '../../../layout/password-dialog/password-dialog.component';
import { WalletsAndAddressesService } from '../../../../services/wallet-operations/wallets-and-addresses.service';
import { SoftwareWalletService } from '../../../../services/wallet-operations/software-wallet.service';
import { WalletBase, WalletTypes } from '../../../../services/wallet-operations/wallet-objects';
import { MsgBarService } from '../../../../services/msg-bar.service';
import { WalletUtilsService } from '../../../../services/wallet-operations/wallet-utils.service';

/**
 * Allows to create a backup of the seed of an encrypted software wallet.
 */
@Component({
  selector: 'app-backup',
  templateUrl: './backup.component.html',
  styleUrls: ['./backup.component.scss'],
})
export class BackupComponent implements OnInit, OnDestroy {
  // Path of the folder which contains the software wallet files.
  folder: string;
  // Wallet list.
  wallets: WalletBase[] = [];

  private folderSubscription: Subscription;
  private walletSubscription: Subscription;

  constructor(
    private dialog: MatDialog,
    private walletsAndAddressesService: WalletsAndAddressesService,
    private walletUtilsService: WalletUtilsService,
    private softwareWalletService: SoftwareWalletService,
    private msgBarService: MsgBarService,
  ) {}

  ngOnInit() {
    this.folderSubscription = this.walletUtilsService.folder().subscribe(folder => {
      this.folder = folder;
    }, err => {
      this.folder = '?';
      this.msgBarService.showError(err);
    });

    this.walletSubscription = this.walletsAndAddressesService.currentWallets.subscribe(wallets => {
      this.wallets = wallets;
    });
  }

  ngOnDestroy() {
    this.folderSubscription.unsubscribe();
    this.walletSubscription.unsubscribe();
  }

  // List of wallets to show on the UI.
  get validWallets() {
    return this.wallets.filter(wallet => wallet.encrypted && !wallet.isHardware && wallet.walletType !== WalletTypes.XPub);
  }

  // Retrieves the seed from the node and shows it in a modal window.
  showSeed(wallet: WalletBase) {
    // Ask for the password and get the seed.
    PasswordDialogComponent.openDialog(this.dialog, { wallet: wallet }).componentInstance.passwordSubmit.subscribe(passwordDialog => {
      this.softwareWalletService.getWalletSeed(wallet, passwordDialog.password).subscribe(response => {
        passwordDialog.close();
        SeedModalComponent.openDialog(this.dialog, response);
      }, err => passwordDialog.error(err));
    });
  }
}

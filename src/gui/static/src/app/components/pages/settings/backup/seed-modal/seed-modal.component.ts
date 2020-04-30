import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog, MatDialogConfig } from '@angular/material/dialog';

import { AppConfig } from '../../../../../app.config';
import { SeedResponse } from '../../../../../services/wallet-operations/software-wallet.service';
import { WalletTypes } from '../../../../../services/wallet-operations/wallet-objects';

/**
 * Modal window for displaying the seed of a wallet, for making a backup.
 */
@Component({
  selector: 'app-seed-modal',
  templateUrl: './seed-modal.component.html',
  styleUrls: ['./seed-modal.component.scss'],
})
export class SeedModalComponent {
  /**
   * Opens the modal window. Please use this function instead of opening the window "by hand".
   */
  public static openDialog(dialog: MatDialog, seedData: SeedResponse): MatDialogRef<SeedModalComponent, any> {
    const config = new MatDialogConfig();
    config.data = seedData;
    config.autoFocus = true;
    config.width = AppConfig.mediumModalWidth;

    return dialog.open(SeedModalComponent, config);
  }

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: SeedResponse,
    public dialogRef: MatDialogRef<SeedModalComponent>,
  ) {}

  // Returns the text to show on the wallet type field.
  get walletTypeText(): string {
    if (this.data.walletType) {
      if (this.data.walletType === WalletTypes.XPub) {
        return 'backup.seed-modal-window.type-xpub';
      } else if (this.data.walletType === WalletTypes.Deterministic) {
        return 'backup.seed-modal-window.type-deterministic';
      } else if (this.data.walletType === WalletTypes.Bip44) {
        return 'backup.seed-modal-window.type-bip44';
      }
    }

    return null;
  }
}

import { Component, Inject, OnDestroy } from '@angular/core';
import { MatDialogRef, MatDialog, MatDialogConfig, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { SubscriptionLike, Observable } from 'rxjs';

import { AppConfig } from '../../../app.config';
import { WalletBase, WalletTypes } from '../../../services/wallet-operations/wallet-objects';
import { WalletsAndAddressesService } from '../../../services/wallet-operations/wallets-and-addresses.service';
import { PasswordSubmitEvent, PasswordDialogParams, PasswordDialogComponent } from '../password-dialog/password-dialog.component';
import { processServiceError } from '../../../utils/errors';
import { MsgBarService } from '../../../services/msg-bar.service';
import { OperationError } from '../../../utils/operation-error';
import { LastAddress } from '../../../services/coin-specific/wallets-and-addresses-operator';

/**
 * Modal window used for getting the next external address of a wallet.
 * After getting the address, the modal window is closed and the address string
 * is returned in the "afterClosed" event. Does not work for deterministic addresses.
 */
@Component({
  selector: 'app-get-next-address',
  templateUrl: './get-next-address.component.html',
  styleUrls: ['./get-next-address.component.scss'],
})
export class GetNextAddressComponent implements OnDestroy {
  private passwordDialogRef: MatDialogRef<PasswordDialogComponent, any>;
  private operationCompleted = false;
  private operationSubscription: SubscriptionLike;

  /**
   * Opens the modal window. Please use this function instead of opening the window "by hand".
   */
  public static openDialog(dialog: MatDialog, wallet: WalletBase): MatDialogRef<GetNextAddressComponent, any> {
    const config = new MatDialogConfig();
    config.data = wallet;
    config.autoFocus = false;
    config.width = AppConfig.mediumModalWidth;

    return dialog.open(GetNextAddressComponent, config);
  }

  constructor(
    public dialogRef: MatDialogRef<GetNextAddressComponent>,
    @Inject(MAT_DIALOG_DATA) public data: WalletBase,
    private walletsAndAddressesService: WalletsAndAddressesService,
    private dialog: MatDialog,
    private msgBarService: MsgBarService,
  ) {
    if (data.walletType === WalletTypes.Deterministic) {
      this.dialogRef.close();
    } else {
      this.loadWalletAddress();
    }
  }

  ngOnDestroy() {
    this.removeOperationSubscription();
  }

  /**
   * Loads the next address of the wallet. If the last address of the wallet has already
   * been used, it automatically asks for the password and creates a new address.
   * @param passwordSubmitEvent Event of the modal window used for asking the user for
   * the password. Should not be provided, it is used internally.
   * @param avoidCreating If true, the function will not try to create a new address if the
   * last one has already been used. Should not be provided, it is used internally.
   */
  private loadWalletAddress(passwordSubmitEvent?: PasswordSubmitEvent, avoidCreating?: boolean) {
    this.removeOperationSubscription();

    const password = passwordSubmitEvent ? passwordSubmitEvent.password : null;

    let operation: Observable<LastAddress>;
    if (!avoidCreating) {
      operation = this.walletsAndAddressesService.getNextAddressAndUpdateWallet(this.data, password);
    } else {
      operation = this.walletsAndAddressesService.getLastAddressAndUpdateWallet(this.data, true);
    }

    // Get the address.
    this.operationSubscription = operation.subscribe(response => {
      // The service returns null if the wallet is encrypted, a new address must be created and
      // no password was provided, so the password must be requested.
      if (!response && this.data.encrypted && !passwordSubmitEvent) {
        const params: PasswordDialogParams = {
          wallet: this.data,
          description: 'get-address.password-info',
        };
        this.passwordDialogRef = PasswordDialogComponent.openDialog(this.dialog, params);

        this.passwordDialogRef.afterClosed().subscribe(() => {
          // If the user closes the window without providing the password, skip the new
          // address creation part.
          if (!this.operationCompleted) {
            this.loadWalletAddress(null, true);
          }
        });

        this.passwordDialogRef.componentInstance.passwordSubmit.subscribe(eventData => {
          // Repeat the operation, this time with the password.
          this.loadWalletAddress(eventData);
        });

        return;
      }

      // Close the password modal window, if any.
      if (passwordSubmitEvent) {
        passwordSubmitEvent.close();
      }

      // Return the address.
      this.dialogRef.close(response.lastAddress);

      if (response.alreadyUsed) {
        this.msgBarService.showWarning('get-address.used-address-warning');
      }
    }, (err: OperationError) => {
      if (passwordSubmitEvent) {
        passwordSubmitEvent.error(err);
      } else {
        err = processServiceError(err);
        this.msgBarService.showError(err);
        this.dialogRef.close();
      }
    });
  }

  private removeOperationSubscription() {
    if (this.operationSubscription) {
      this.operationSubscription.unsubscribe();
    }
  }
}

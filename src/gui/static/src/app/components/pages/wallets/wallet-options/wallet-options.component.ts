import { Component, Inject, OnDestroy } from '@angular/core';
import { MatDialogRef, MatDialog, MatDialogConfig, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { Router } from '@angular/router';
import { Subscription, Observable } from 'rxjs';
import { mergeMap, first } from 'rxjs/operators';

import { AppConfig } from '../../../../app.config';
import { WalletTypes, WalletBase, AddressBase } from '../../../../services/wallet-operations/wallet-objects';
import { ChangeNameData, ChangeNameComponent } from '../change-name/change-name.component';
import { MsgBarService } from '../../../../services/msg-bar.service';
import { HwWalletService } from '../../../../services/hw-wallet.service';
import { SoftwareWalletService } from '../../../../services/wallet-operations/software-wallet.service';
import { HardwareWalletService } from '../../../../services/wallet-operations/hardware-wallet.service';
import { ConfirmationParams, DefaultConfirmationButtons, ConfirmationComponent } from '../../../../components/layout/confirmation/confirmation.component';
import { NumberOfAddressesComponent } from '../number-of-addresses/number-of-addresses';
import { HistoryService } from '../../../../services/wallet-operations/history.service';
import { PasswordDialogComponent, PasswordDialogParams, PasswordSubmitEvent } from '../../../../components/layout/password-dialog/password-dialog.component';
import { WalletsAndAddressesService } from '../../../../services/wallet-operations/wallets-and-addresses.service';
import { BlockchainService } from '../../../../services/blockchain.service';

/**
 * Settings for WalletOptionsComponent.
 */
export interface WalletOptionsParams {
  /**
   * Wallet for which the options will be shown.
   */
  wallet: WalletBase;
  /**
   * If true, the options list will not be shown and the modal window will just start the
   * process for adding addresses to the wallet.
   */
  automaticallyAddAddresses?: boolean;
}

/**
 * Modal window for the wallet options. If the user selects an option, the modal window makes
 * the operation.
 */
@Component({
  selector: 'app-wallet-options',
  templateUrl: './wallet-options.component.html',
  styleUrls: ['./wallet-options.component.scss'],
})
export class WalletOptionsComponent implements OnDestroy {
  walletTypes = WalletTypes;

  loading = false;
  wallet: WalletBase;

  // If the blockchain is synchronized.
  private synchronized = true;
  private operationSubscription: Subscription;
  private blockchainSubscription: Subscription;

  /**
   * Opens the modal window. Please use this function instead of opening the window "by hand".
   */
  public static openDialog(dialog: MatDialog, wallet: WalletOptionsParams): MatDialogRef<WalletOptionsComponent, any> {
    const config = new MatDialogConfig();
    config.autoFocus = false;
    config.data = wallet;
    config.width = AppConfig.mediumModalWidth;

    return dialog.open(WalletOptionsComponent, config);
  }

  constructor(
    public dialogRef: MatDialogRef<WalletOptionsComponent>,
    @Inject(MAT_DIALOG_DATA) public data: WalletOptionsParams,
    private dialog: MatDialog,
    private translateService: TranslateService,
    private router: Router,
    private msgBarService: MsgBarService,
    private hwWalletService: HwWalletService,
    private softwareWalletService: SoftwareWalletService,
    private hardwareWalletService: HardwareWalletService,
    private historyService: HistoryService,
    private walletsAndAddressesService: WalletsAndAddressesService,
    blockchainService: BlockchainService,
  ) {
    this.wallet = data.wallet;
    this.blockchainSubscription = blockchainService.progress.subscribe(response => this.synchronized = response.synchronized);

    if (data.automaticallyAddAddresses) {
      this.loading = true;
      // Small delay for better UX.
      setTimeout(() => this.addAddresses(), 300);
    }
  }

  ngOnDestroy() {
    this.removeOperationSubscription();
    this.blockchainSubscription.unsubscribe();
  }

  closePopup() {
    this.dialogRef.close();
  }

  // Opens the address history page.
  showAddressHistory() {
    this.router.navigate(['/addresses', { id: this.wallet.id }]);
    this.closePopup();
  }

  // Checks the wallet before opening the modal window for changing its label.
  renameWallet() {
    this.msgBarService.hide();

    if (this.wallet.isHardware) {
      this.loading = true;

      this.removeOperationSubscription();
      // Check if the correct device is connected.
      this.operationSubscription = this.hwWalletService.checkIfCorrectHwConnected(this.wallet)
        // Check if the device still has the label this app knows.
        .pipe(mergeMap(() => this.hardwareWalletService.getFeaturesAndUpdateData(this.wallet))).subscribe(
          response => {
            this.loading = false;

            this.continueRenameWallet();

            // Inform if a different label was detected while checking the device.
            if (response.walletNameUpdated) {
              setTimeout(() => this.msgBarService.showWarning('hardware-wallet.general.name-updated'));
            }
          },
          err => {
            this.loading = false;
            this.msgBarService.showError(err);
          },
        );
    } else {
      // No checks needed for software wallets.
      this.continueRenameWallet();
    }
  }

  // Adds addresses to the wallet. If the wallet is a software wallet, the user can select
  // how many addresses to add.
  addAddresses() {
    // Don't allow more than the max number of addresses on a hw wallet.
    if (this.wallet.isHardware && this.wallet.addresses.length >= AppConfig.maxHardwareWalletAddresses) {
      const confirmationParams: ConfirmationParams = {
        text: 'wallet.max-hardware-wallets-error',
        headerText: 'common.error',
        defaultButtons: DefaultConfirmationButtons.Close,
      };
      ConfirmationComponent.openDialog(this.dialog, confirmationParams);

      return;
    }

    this.msgBarService.hide();

    if (!this.wallet.isHardware) {
      // Open the modal window for knowing how many addresses to add.
      const numberOfAddressesDialog = NumberOfAddressesComponent.openDialog(this.dialog);

      const maxAddressesGap = AppConfig.maxAddressesGap;
      // When the user requests the creation of the addresses, check if there will be a big
      // gap of unused addresses, before completing the operation.
      numberOfAddressesDialog.afterClosed().subscribe(howManyAddresses => {
        if (!howManyAddresses) {
          if (!this.data.automaticallyAddAddresses) {
            this.loading = false;
            this.msgBarService.showError('wallet.wallet-options.cancelled-error');
          } else {
            this.closePopup();
          }

          return;
        }

        this.loading = true;

        // Create an array excluding change addresses.
        const relevantAddresses: AddressBase[] = [];
        this.wallet.addresses.forEach(address => {
          if (!address.isChangeAddress) {
            relevantAddresses.push(address);
          }
        });

        let lastWithBalance = 0;
        relevantAddresses.forEach((address, i) => {
          if (address['coins'] && address['coins'].isGreaterThan(0)) {
            lastWithBalance = i;
          }
        });

        // Try to use the current known balance (if the provided wallet object has that info) to
        // check if the new addresses will create a gap of unused addresses bigger than the
        // aceptable one. This is just a quick check which is fast but could fail, as the code
        // must detect a gap of unused addresses, not one of addresses without balance.
        if ((relevantAddresses.length - (lastWithBalance + 1)) + howManyAddresses < maxAddressesGap) {
          this.continueNewAddress(howManyAddresses);

          // If the previous check failed, use the real transaction history to be sure.
        } else {
          this.removeOperationSubscription();
          // Check which addresses have been used.
          this.operationSubscription = this.historyService.getIfAddressesUsed(this.wallet).subscribe(AddressesWithTxs => {
            // Get the index of the last address with transaction history.
            let lastWithTxs = 0;
            relevantAddresses.forEach((address, i) => {
              if (AddressesWithTxs.has(address.address) && AddressesWithTxs.get(address.address)) {
                lastWithTxs = i;
              }
            });

            if ((relevantAddresses.length - (lastWithTxs + 1)) + howManyAddresses < maxAddressesGap) {
              // Continue normally.
              this.continueNewAddress(howManyAddresses);
            } else {
              // Tell the user that the gap could cause problems and ask for confirmation.
              const confirmationParams: ConfirmationParams = {
                text: 'wallet.add-many-confirmation',
                defaultButtons: DefaultConfirmationButtons.YesNo,
              };

              ConfirmationComponent.openDialog(this.dialog, confirmationParams).afterClosed().subscribe(confirmationResult => {
                if (confirmationResult) {
                  this.continueNewAddress(howManyAddresses);
                } else {
                  if (!this.data.automaticallyAddAddresses) {
                    this.loading = false;
                    this.msgBarService.showError('wallet.wallet-options.cancelled-error');
                  } else {
                    this.closePopup();
                  }
                }
              });
            }
          }, err => {
            if (!this.data.automaticallyAddAddresses) {
              this.loading = false;
            } else {
              this.closePopup();
            }

            setTimeout(() => this.msgBarService.showError(err));
          });
        }
      });
    } else {
      // Hw wallets are limited to add one address at a time, for performance reasons.
      this.loading = true;
      this.continueNewAddress(1);
    }
  }

  // If the wallet is not encrypted, encrypts it. If the wallet is encrypted, removes
  // the encryption.
  toggleEncryption() {
    this.msgBarService.hide();

    const params: PasswordDialogParams = {
      confirm: !this.wallet.encrypted,
      title: this.wallet.encrypted ? 'wallet.wallet-options.decrypt' : 'wallet.wallet-options.encrypt',
      warning: this.wallet.encrypted,
      wallet: this.wallet.encrypted ? this.wallet : null,
    };

    if (this.wallet.encrypted) {
      params.description = 'wallet.wallet-options.decrypt-warning';
    } else {
      params.description = 'wallet.new.encrypt-warning' + (this.wallet.walletType !== WalletTypes.XPub ? '-non' : '') + '-xpub';
    }

    // Ask for the current password or the new one.
    const dialogRef = PasswordDialogComponent.openDialog(this.dialog, params, false);
    dialogRef.componentInstance.passwordSubmit.subscribe(passwordDialog => {
      // Make the operation.
      this.removeOperationSubscription();
      this.operationSubscription = this.softwareWalletService.toggleEncryption(this.wallet, passwordDialog.password).subscribe(() => {
        passwordDialog.close();
        setTimeout(() => this.msgBarService.showDone('common.changes-made'));
      }, e => passwordDialog.error(e));
    });
  }

  // Makes the preparations for asking the node to scan the addresses of the wallet again,
  // to add to it the addresses with transactions which have not been added to the addresses
  // list. Only for software wallets.
  scanAddresses() {
    this.msgBarService.hide();

    // Check if the blockchain is synchronized.
    if (this.synchronized) {
      // Ask for the password if the wallet is encrypted and continue the process.
      if (!this.wallet.isHardware && this.wallet.encrypted) {
        const dialogRef = PasswordDialogComponent.openDialog(this.dialog, { wallet: this.wallet });
        dialogRef.componentInstance.passwordSubmit.subscribe(passwordDialog => this.continueScanningAddresses(passwordDialog));
      } else {
        this.continueScanningAddresses();
      }
    } else {
      const confirmationParams: ConfirmationParams = {
        headerText: 'common.warning-title',
        text: 'wallet.scan-addresses.synchronizing-warning-text',
        defaultButtons: DefaultConfirmationButtons.YesNo,
        redTitle: true,
      };

      ConfirmationComponent.openDialog(this.dialog, confirmationParams).afterClosed().subscribe(confirmationResult => {
        if (confirmationResult) {
          // Ask for the password if the wallet is encrypted and continue the process.
          if (!this.wallet.isHardware && this.wallet.encrypted) {
            const dialogRef = PasswordDialogComponent.openDialog(this.dialog, { wallet: this.wallet });
            dialogRef.componentInstance.passwordSubmit.subscribe(passwordDialog => this.continueScanningAddresses(passwordDialog));
          } else {
            this.continueScanningAddresses();
          }
        }
      });
    }
  }

  // Deletes a hw wallet.
  deleteHwWallet() {
    this.msgBarService.hide();

    const confirmationParams: ConfirmationParams = {
      text: this.translateService.instant('wallet.delete-confirmation', {name: this.wallet.label}),
      checkboxText: 'wallet.delete-confirmation-check',
      defaultButtons: DefaultConfirmationButtons.YesNo,
    };

    // Ask for confirmation.
    ConfirmationComponent.openDialog(this.dialog, confirmationParams).afterClosed().subscribe(confirmationResult => {
      if (confirmationResult) {
        this.closePopup();
        this.walletsAndAddressesService.deleteWallet(this.wallet.id);
        setTimeout(() => this.msgBarService.showDone('common.changes-made'));

        // If there are no more wallets left, go to the wizard.
        this.walletsAndAddressesService.allWallets.pipe(first()).subscribe(wallets => {
          if (wallets.length === 0) {
            setTimeout(() => this.router.navigate(['/wizard']), 500);
          }
        });
      }
    });
  }

  // Asks the node to scan the addresses of the wallet again.
  private continueScanningAddresses(passwordSubmitEvent?: PasswordSubmitEvent) {
    const password = passwordSubmitEvent ? passwordSubmitEvent.password : null;

    // If the password modal window is being shown. the loading animation is not needed on this
    // modal window.
    if (!passwordSubmitEvent) {
      this.loading = true;
    }

    this.removeOperationSubscription();
    this.operationSubscription = this.walletsAndAddressesService.scanAddresses(this.wallet, password).subscribe(result => {
      if (passwordSubmitEvent) {
        passwordSubmitEvent.close();
      }

      setTimeout(() => {
        if (result) {
          this.msgBarService.showDone('wallet.scan-addresses.done-with-new-addresses');
        } else {
          this.msgBarService.showWarning('wallet.scan-addresses.done-without-new-addresses');
        }
      });

      this.loading = false;
    }, err => {
      if (passwordSubmitEvent) {
        passwordSubmitEvent.error(err);
      } else {
        this.msgBarService.showError(err);
        this.loading = false;
      }
    });
  }

  // Opens the modal window for renaming the wallet.
  private continueRenameWallet() {
    const data = new ChangeNameData();
    data.wallet = this.wallet;
    ChangeNameComponent.openDialog(this.dialog, data, false);
  }

  // Finish adding addresses to the wallet.
  private continueNewAddress(howManyAddresses: number) {
    if (!this.wallet.isHardware && this.wallet.encrypted) {
      // Small delay to avoid a negative impact on the UX.
      setTimeout(() => {
        // Ask for the password and continue.
        const dialogRef = PasswordDialogComponent.openDialog(this.dialog, { wallet: this.wallet });
        dialogRef.afterClosed().subscribe(() => {
          // If loading is still true, it means the user closed the password window.
          if (this.loading) {
            if (!this.data.automaticallyAddAddresses) {
              this.loading = false;
              this.msgBarService.showError('wallet.wallet-options.cancelled-error');
            } else {
              this.closePopup();
            }
          }
        });
        dialogRef.componentInstance.passwordSubmit.subscribe(passwordDialog => {
          this.removeOperationSubscription();
          this.operationSubscription = this.walletsAndAddressesService.addAddressesToWallet(this.wallet, howManyAddresses, passwordDialog.password).subscribe(() => {
            this.loading = false;
            passwordDialog.close();
            this.closePopup();
            setTimeout(() => this.msgBarService.showDone('common.changes-made'));
          }, error => passwordDialog.error(error));
        });
      }, 300);
    } else {
      let procedure: Observable<any>;

      if (this.wallet.isHardware) {
        // Continue after checking the device.
        procedure = this.hwWalletService.checkIfCorrectHwConnected(this.wallet).pipe(mergeMap(
          () => this.walletsAndAddressesService.addAddressesToWallet(this.wallet, howManyAddresses),
        ));
      } else {
        procedure = this.walletsAndAddressesService.addAddressesToWallet(this.wallet, howManyAddresses);
      }

      this.removeOperationSubscription();
      this.operationSubscription = procedure.subscribe(() => {
        this.closePopup();
        setTimeout(() => this.msgBarService.showDone('common.changes-made'));
      }, err => {
        if (!this.data.automaticallyAddAddresses) {
          this.loading = false;
        } else {
          this.closePopup();
        }

        setTimeout(() => this.msgBarService.showError(err));
      });
    }
  }

  private removeOperationSubscription() {
    if (this.operationSubscription) {
      this.operationSubscription.unsubscribe();
    }
  }
}

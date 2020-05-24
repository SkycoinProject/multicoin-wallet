import { Component, Inject, ViewChild, OnDestroy, ElementRef, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatDialogRef } from '@angular/material/dialog';
import { FormGroup, FormBuilder } from '@angular/forms';
import { Router } from '@angular/router';
import { SubscriptionLike, Subject, Observable } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { BigNumber } from 'bignumber.js';

import { copyTextToClipboard } from '../../../utils/general-utils';
import { MsgBarService } from '../../../services/msg-bar.service';
import { WalletBase, WalletTypes } from '../../../services/wallet-operations/wallet-objects';
import { WalletsAndAddressesService } from '../../../services/wallet-operations/wallets-and-addresses.service';
import { PasswordDialogComponent, PasswordSubmitEvent, PasswordDialogParams } from '../password-dialog/password-dialog.component';
import { OperationError } from '../../../utils/operation-error';
import { processServiceError } from '../../../utils/errors';
import { NodeService } from '../../../services/node.service';
import { CoinService } from '../../../services/coin.service';
import { LastAddress } from '../../../services/coin-specific/wallets-and-addresses-operator';

// Gives access to qrcode.js, imported from the resources folder.
declare const QRCode: any;

/**
 * Default QR code graphical config.
 */
class DefaultQrConfig {
  static readonly size = 180;
  static readonly level = 'M';
  static readonly colordark = '#000000';
  static readonly colorlight = '#ffffff';
  static readonly usesvg = false;
}

/**
 * Settings for QrCodeComponent.
 */
export interface QrDialogConfig {
  /**
   * If true, the modal window will show the specific address passed on the "address"
   * param. If false, it will show the last unused address of the wallet provided
   * in the wallet param.
   */
  showSpecificAddress: boolean;
  /**
   * Wallet from which the last address for receiving coins will be shown, if
   * showSpecificAddress is false. Not for deterministic wallets.
   */
  wallet?: WalletBase;
  /**
   * Address the QR code will have, if showSpecificAddress is true.
   */
  address?: string;
  /**
   * If true, the modal window will not show the coin request form and the addreess will not
   * have the BIP21 prefix.
   */
  showAddressOnly?: boolean;
}

/**
 * Modal window used for showing QR codes. It allows to show the QR code of an specific address,
 * but it can also get what the next address of a wallet is and show it (not for
 * deterministic wallets).
 */
@Component({
  selector: 'app-qr-code',
  templateUrl: './qr-code.component.html',
  styleUrls: ['./qr-code.component.scss'],
})
export class QrCodeComponent implements OnInit, OnDestroy {
  @ViewChild('qrArea', { static: false }) qrArea: ElementRef;

  form: FormGroup;
  currentQrContent: string;
  formVisible = false;
  // For knowing if the form fields have errors.
  invalidCoins = false;
  invalidHours = false;

  loading = true;
  // Error to show if the loading procedure failed.
  loadingErrorMsg = null;
  // Address to show to the user.
  currentAddress = '';
  // If the window is displaying the last unused address of a wallet.
  showingLastOfWallet = false;
  // If showing the last address of a wallet, this var contains how many unused addresses
  // are before it.
  previouslyUsedAddresses = 0;
  // If showing the last address of a wallet, this var allow to know if that address has
  // been already used (meaning if it has already received any coins).
  lastAdderessIsUnused = true;
  // If true, the currently selected coin includes coin hours.
  coinHasHours = false;

  private loadAddressSubscription: SubscriptionLike;
  private subscriptionsGroup: SubscriptionLike[] = [];
  // Emits every time the content of the QR code must be updated.
  private updateQrEvent: Subject<boolean> = new Subject<boolean>();

  // Modal window for asking the user for the password.
  private passwordDialogRef: MatDialogRef<PasswordDialogComponent, any>;

  /**
   * Opens the modal window. Please use this function instead of opening the window "by hand".
   */
  static openDialog(dialog: MatDialog, config: QrDialogConfig) {
    const dialogConfig = new MatDialogConfig();
    dialogConfig.data = config;
    dialogConfig.width = '390px';
    dialog.open(QrCodeComponent, dialogConfig);
  }

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: QrDialogConfig,
    public dialogRef: MatDialogRef<QrCodeComponent>,
    public formBuilder: FormBuilder,
    private msgBarService: MsgBarService,
    private nodeService: NodeService,
    private walletsAndAddressesService: WalletsAndAddressesService,
    private dialog: MatDialog,
    private router: Router,
    private coinService: CoinService,
  ) {
    this.coinHasHours = coinService.currentCoinInmediate.coinTypeFeatures.coinHours;
  }

  ngOnInit() {
    if (this.data.showSpecificAddress) {
      this.currentAddress = this.data.address;
      this.initForm();
    } else {
      if (!this.data.wallet || this.data.wallet.walletType === WalletTypes.Deterministic) {
        this.dialogRef.close();

        return;
      }
      this.showingLastOfWallet = true;
      this.loadWalletAddress();
    }
  }

  ngOnDestroy() {
    this.subscriptionsGroup.forEach(sub => sub.unsubscribe());
    this.removeLoadAddressSubscription();
    this.msgBarService.hide();
  }

  goToAddressHistory() {
    this.router.navigate(['/addresses', { id: this.data.wallet.id }]);
    this.dialogRef.close();
  }

  showForm() {
    this.formVisible = true;
  }

  copyText(text) {
    copyTextToClipboard(text);
    this.msgBarService.showDone('common.copied', 4000);
  }

  /**
   * Loads the next address of a wallet. If the last address of the wallet has already
   * been used, it automatically asks for the password and creates a new address.
   * @param passwordSubmitEvent Event of the modal window used for asking the user for
   * the password. Should not be provided, it is used internally.
   * @param avoidCreating If true, the function will not try to create a new address if the
   * last one has already been used. Should not be provided, it is used internally.
   */
  private loadWalletAddress(passwordSubmitEvent?: PasswordSubmitEvent, avoidCreating?: boolean) {
    this.removeLoadAddressSubscription();

    const password = passwordSubmitEvent ? passwordSubmitEvent.password : null;

    let operation: Observable<LastAddress>;
    if (!avoidCreating) {
      operation = this.walletsAndAddressesService.getNextAddressAndUpdateWallet(this.data.wallet, password);
    } else {
      operation = this.walletsAndAddressesService.getLastAddressAndUpdateWallet(this.data.wallet, true);
    }

    // Get the address.
    this.loadAddressSubscription = operation.subscribe(response => {
      // The service returns null if the wallet is encrypted, a new address must be created and
      // no password was provided, so the password must be requested.
      if (!response && this.data.wallet.encrypted && !passwordSubmitEvent) {
        const params: PasswordDialogParams = {
          wallet: this.data.wallet,
          description: 'qr.password-info',
        };
        this.passwordDialogRef = PasswordDialogComponent.openDialog(this.dialog, params);

        this.passwordDialogRef.afterClosed().subscribe(() => {
          // If the user closes the window without providing the password, skip the new
          // address creation part.
          if (this.loading) {
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

      // Save the address and initialice the window.
      this.currentAddress = response.lastAddress;
      this.previouslyUsedAddresses = response.previousUnusedAddresses;
      this.lastAdderessIsUnused = !response.alreadyUsed;
      this.initForm();

      // Show a warning if the address has already been used.
      if (response.alreadyUsed) {
        setTimeout(() => {
          this.msgBarService.showWarning('qr.used-address-warning');
        });
      }
    }, (err: OperationError) => {
      if (passwordSubmitEvent) {
        passwordSubmitEvent.error(err);
      } else {
        err = processServiceError(err);
        this.loadingErrorMsg = err.translatableErrorMsg;
        this.loading = false;
      }
    });
  }

  private initForm() {
    this.loading = false;

    this.form = this.formBuilder.group({
      coins: [''],
      hours: [''],
      note: [''],
    });

    // Each time a field is updated, update the content of the QR, but wait a prudential time.
    this.subscriptionsGroup.push(this.form.get('coins').valueChanges.subscribe(this.reportValueChanged.bind(this)));
    this.subscriptionsGroup.push(this.form.get('hours').valueChanges.subscribe(this.reportValueChanged.bind(this)));
    this.subscriptionsGroup.push(this.form.get('note').valueChanges.subscribe(this.reportValueChanged.bind(this)));
    this.subscriptionsGroup.push(this.updateQrEvent.pipe(debounceTime(500)).subscribe(() => {
      this.updateQrContent();
    }));

    // Wait a moment for the new value of the loading property to be used for updating the ui, to
    // avoid problems.
    setTimeout(() => {
      this.updateQrContent();
    });
  }

  private reportValueChanged() {
    this.updateQrEvent.next(true);
  }

  /**
   * Updates the content of the QR code.
   */
  private updateQrContent() {
    this.currentQrContent = this.currentAddress;

    // If true, the QR only contains the address.
    if (this.data.showAddressOnly) {
      this.updateQrCode();

      return;
    }

    // Add the BIP21 prefix.
    if (this.coinService.currentCoinInmediate.uriSpecificatioPrefix) {
      this.currentQrContent = this.coinService.currentCoinInmediate.uriSpecificatioPrefix.toLowerCase() + ':' + this.currentQrContent;
    }

    this.invalidCoins = false;
    this.invalidHours = false;

    let nextSeparator = '?';

    // Add the coins or alert if the value is not valid.
    if (this.form.get('coins').value) {
      const coins = new BigNumber(this.form.get('coins').value);
      if (!coins.isNaN() && coins.isGreaterThan(0) && coins.decimalPlaces() <= this.nodeService.currentMaxDecimals) {
        this.currentQrContent += nextSeparator + 'amount=' + coins.toString();
        nextSeparator = '&';
      } else {
        this.invalidCoins = true;
      }
    }

    // Add the hours or alert if the value is not valid.
    if (this.form.get('hours').value) {
      const hours = new BigNumber(this.form.get('hours').value);
      if (!hours.isNaN() && hours.isGreaterThan(0) && hours.decimalPlaces() === 0) {
        this.currentQrContent += nextSeparator + 'hours=' + hours.toString();
        nextSeparator = '&';
      } else {
        this.invalidHours = true;
      }
    }

    // Add the note.
    const note = this.form.get('note').value;
    if (note) {
      this.currentQrContent += nextSeparator + 'message=' + encodeURIComponent(note);
    }

    // Update the QR code image.
    this.updateQrCode();
  }

  private updateQrCode() {
    // Clean the area of the QR code.
    (this.qrArea.nativeElement as HTMLDivElement).innerHTML = '';

    // Creates a new QR code and adds it to the designated area.
    const qrCode = new QRCode(this.qrArea.nativeElement, {
      text: this.currentQrContent,
      width: DefaultQrConfig.size,
      height: DefaultQrConfig.size,
      colorDark: DefaultQrConfig.colordark,
      colorLight: DefaultQrConfig.colorlight,
      useSVG: DefaultQrConfig.usesvg,
      correctLevel: QRCode.CorrectLevel[DefaultQrConfig.level],
    });
  }

  private removeLoadAddressSubscription() {
    if (this.loadAddressSubscription) {
      this.loadAddressSubscription.unsubscribe();
    }
  }
}

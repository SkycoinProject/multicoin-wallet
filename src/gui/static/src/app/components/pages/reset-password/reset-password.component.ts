import { Component, OnDestroy, ViewChild, ChangeDetectorRef, OnInit } from '@angular/core';
import { SubscriptionLike,  combineLatest } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { FormGroup, FormBuilder, FormControl } from '@angular/forms';
import { map } from 'rxjs/operators';

import { ButtonComponent } from '../../layout/button/button.component';
import { MsgBarService } from '../../../services/msg-bar.service';
import { SoftwareWalletService } from '../../../services/wallet-operations/software-wallet.service';
import { WalletsAndAddressesService } from '../../../services/wallet-operations/wallets-and-addresses.service';
import { WalletBase, WalletTypes } from '../../../services/wallet-operations/wallet-objects';
import { AssistedSeedFieldComponent } from '../wallets/create-wallet/create-wallet-form/assisted-seed-field/assisted-seed-field.component';
import { WordAskedReasons } from '../../layout/seed-word-dialog/seed-word-dialog.component';

/**
 * Allows to use the seed to remove or change the password of an encrypted software wallet.
 * The URL for opening this page must have a param called "id", with the ID of the wallet
 * to which the password will be changed.
 */
@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.scss'],
})
export class ResetPasswordComponent implements OnInit, OnDestroy {
  @ViewChild('resetButton') resetButton: ButtonComponent;
  // Component for entering the seed using the assisted mode.
  @ViewChild('assistedSeed') assistedSeed: AssistedSeedFieldComponent;

  form: FormGroup;
  wallet: WalletBase;
  // Allows to deactivate the form while the component is busy.
  busy = true;
  // If the id on the URL does not correspond to a valid wallet.
  invalidWallet = false;
  // If true, the user must enter the ssed using the asisted mode.
  enterSeedWithAssistance = true;

  walletTypes = WalletTypes;
  wordAskedReasons = WordAskedReasons;

  private subscription: SubscriptionLike;
  private done = false;
  private hideBarWhenClosing = true;

  constructor(
    public formBuilder: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private msgBarService: MsgBarService,
    private softwareWalletService: SoftwareWalletService,
    private walletsAndAddressesService: WalletsAndAddressesService,
    private changeDetector: ChangeDetectorRef,
  ) { }

  ngOnInit() {
    this.initForm();
    // Get the wallets and route params.
    this.subscription = combineLatest([this.route.params, this.walletsAndAddressesService.currentWallets]).pipe(map(result => {
      const params = result[0];
      const wallets = result[1];

      const wallet = wallets.find(w => w.id === params['id']);
      this.invalidWallet = false;

      // Abort if the requested wallet does not exists.
      if (!wallet) {
        this.invalidWallet = true;

        return;
      }

      this.wallet = wallet;
      this.form.get('wallet').setValue(wallet.label);
      // Activate the form.
      this.busy = false;
    })).subscribe();
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
    if (this.hideBarWhenClosing) {
      this.msgBarService.hide();
    }
  }

  // Allows to know if the form is valid.
  get isValid(): boolean {
    return this.form && this.form.valid &&
      ((this.enterSeedWithAssistance && this.assistedSeed && this.assistedSeed.lastAssistedSeed) ||
      (!this.enterSeedWithAssistance && this.form.value.seed));
  }

  // Returns the value of the number_of_words form field.
  get selectedNumberOfWords(): number {
    return this.form ? this.form.value.number_of_words : 0;
  }

  initForm() {
    const validators = [];
    validators.push(this.passwordMatchValidator.bind(this));

    this.form = new FormGroup({}, validators);
    this.form.addControl('wallet', new FormControl());
    this.form.addControl('number_of_words', new FormControl(12));
    this.form.addControl('seed', new FormControl(''));
    this.form.addControl('passphrase', new FormControl(''));
    this.form.addControl('password', new FormControl(''));
    this.form.addControl('confirm', new FormControl(''));

    // If assistedSeed already exists, reset it.
    if (this.assistedSeed) {
      this.assistedSeed.lastAssistedSeed = '';
    }
  }

  // Switches between the assisted mode and the manual mode for entering the seed.
  changeSeedType() {
    this.enterSeedWithAssistance = !this.enterSeedWithAssistance;
  }

  // Resets the wallet password.
  reset() {
    if (!this.form.valid || this.busy || this.done) {
      return;
    }

    this.busy = true;
    this.msgBarService.hide();
    this.resetButton.setLoading();

    const seed = this.enterSeedWithAssistance ? this.assistedSeed.lastAssistedSeed : this.form.value.seed;

    this.softwareWalletService.resetPassword(this.wallet, seed, this.form.value.password, this.form.value.passphrase)
      .subscribe(() => {
        this.resetButton.setSuccess();
        this.resetButton.setDisabled();
        this.done = true;

        // Show a success msg and avoid closing it after closing this page.
        this.msgBarService.showDone('reset.done');
        this.hideBarWhenClosing = false;

        // Navigate from the page after a small delay.
        setTimeout(() => {
          this.router.navigate(['']);
        }, 2000);
      }, error => {
        // Reactivate the UI and show the error msg.
        this.busy = false;
        this.resetButton.resetState();
        this.msgBarService.showError(error);
      });

    // Avoids a problem with the change detection system.
    this.changeDetector.detectChanges();
  }

  // Checks if the 2 passwords entered by the user are equal.
  private passwordMatchValidator() {
    if (this.form && this.form.get('password') && this.form.get('confirm')) {
      return this.form.get('password').value === this.form.get('confirm').value ? null : { NotEqual: true };
    } else {
      return { NotEqual: true };
    }
  }
}

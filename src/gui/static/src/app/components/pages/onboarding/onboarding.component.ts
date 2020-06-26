import { Component, OnInit, OnDestroy, ViewChild, Renderer2, AfterViewInit, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { SubscriptionLike } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';

import { LanguageData, LanguageService } from '../../../services/language.service';
import { WalletFormData } from '../wallets/create-wallet/create-wallet-form/create-wallet-form.component';
import { MsgBarService } from '../../../services/msg-bar.service';
import { OnboardingEncryptWalletComponent } from './onboarding-encrypt-wallet/onboarding-encrypt-wallet.component';
import { SelectLanguageComponent } from '../../layout/select-language/select-language.component';
import { WalletsAndAddressesService } from '../../../services/wallet-operations/wallets-and-addresses.service';
import { CreateWalletArgs } from '../../../services/coin-specific/wallets-and-addresses-operator';
import { CoinService } from '../../../services/coin.service';

/**
 * Wizard for creating the first wallet.
 */
@Component({
  selector: 'app-onboarding',
  templateUrl: './onboarding.component.html',
  styleUrls: ['./onboarding.component.scss'],
})
export class OnboardingComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('encryptForm') encryptForm: OnboardingEncryptWalletComponent;
  @ViewChild('container') container: ElementRef;

  // Current stept to show.
  step = 1;
  // Data entered on the form of the first step.
  formData: WalletFormData;
  // Currently selected language.
  language: LanguageData;

  private coinSubscription: SubscriptionLike;
  private subscription: SubscriptionLike;

  constructor(
    private router: Router,
    private languageService: LanguageService,
    private dialog: MatDialog,
    private msgBarService: MsgBarService,
    private walletsAndAddressesService: WalletsAndAddressesService,
    private coinService: CoinService,
    private renderer: Renderer2,
  ) { }

  ngOnInit() {
    this.subscription = this.languageService.currentLanguage.subscribe(lang => this.language = lang);
  }

  ngAfterViewInit() {
    // Update the background.
    this.coinSubscription = this.coinService.currentCoin.subscribe(coin => {
      const background = 'linear-gradient(to bottom right, ' + coin.styleConfig.onboardingGradientDark + ', ' + coin.styleConfig.onboardingGradientLight + ')';
      this.renderer.setStyle(this.container.nativeElement, 'background', background);
    });
  }

  ngOnDestroy() {
    this.coinSubscription.unsubscribe();
    this.subscription.unsubscribe();
  }

  // Called when the user finishes the first step.
  onLabelAndSeedCreated(data: WalletFormData) {
    this.formData = data,
    this.step = 2;
  }

  // Called when the user finishes the second step.
  onPasswordCreated(password: string|null) {
    const args: CreateWalletArgs = {
      isHardwareWallet: false,
      softwareWalletArgs: {
        label: this.formData.label,
        type: this.formData.type,
        seed: this.formData.seed,
        password: password,
        passphrase: this.formData.passphrase,
        xPub: this.formData.xPub,
      },
    };

    // Create the wallet.
    this.walletsAndAddressesService.createWallet(args).subscribe(() => {
      this.router.navigate(['/wallets']);
    }, e => {
      this.msgBarService.showError(e);
      // Make the form usable again.
      this.encryptForm.resetButton();
    });
  }

  // Return to step 1.
  onBack() {
    this.step = 1;
  }

  changelanguage() {
    SelectLanguageComponent.openDialog(this.dialog);
  }
}

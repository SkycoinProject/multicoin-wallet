import { SubscriptionLike, of } from 'rxjs';
import { first, mergeMap } from 'rxjs/operators';
import { Component, EventEmitter, Input, OnDestroy, OnInit, ViewChild, ChangeDetectorRef, Output as AgularOutput } from '@angular/core';
import { FormGroup, FormControl } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { BigNumber } from 'bignumber.js';
import { TranslateService } from '@ngx-translate/core';

import { PasswordDialogComponent } from '../../../layout/password-dialog/password-dialog.component';
import { ButtonComponent } from '../../../layout/button/button.component';
import { NavBarSwitchService } from '../../../../services/nav-bar-switch.service';
import { SelectAddressComponent } from '../../../layout/select-address/select-address.component';
import { BlockchainService } from '../../../../services/blockchain.service';
import { HwWalletService } from '../../../../services/hw-wallet.service';
import { ChangeNoteComponent } from '../send-preview/transaction-info/change-note/change-note.component';
import { MsgBarService } from '../../../../services/msg-bar.service';
import { MultipleDestinationsDialogComponent } from '../../../layout/multiple-destinations-dialog/multiple-destinations-dialog.component';
import { FormSourceSelectionComponent, AvailableBalanceData, SelectedSources, SourceSelectionModes } from '../form-parts/form-source-selection/form-source-selection.component';
import { FormDestinationComponent, Destination } from '../form-parts/form-destination/form-destination.component';
import { CopyRawTxComponent, CopyRawTxData } from '../offline-dialogs/implementations/copy-raw-tx.component';
import { DoubleButtonActive } from '../../../../components/layout/double-button/double-button.component';
import { ConfirmationParams, DefaultConfirmationButtons, ConfirmationComponent } from '../../../../components/layout/confirmation/confirmation.component';
import { SpendingService, HoursDistributionOptions, HoursDistributionTypes, RecommendedFees } from '../../../../services/wallet-operations/spending.service';
import { GeneratedTransaction, Output } from '../../../../services/wallet-operations/transaction-objects';
import { WalletWithBalance, AddressWithBalance, WalletTypes, WalletBase } from '../../../../services/wallet-operations/wallet-objects';
import { WalletsAndAddressesService } from '../../../../services/wallet-operations/wallets-and-addresses.service';
import { GetNextAddressComponent } from '../../../layout/get-next-address/get-next-address.component';
import { CoinService } from '../../../../services/coin.service';
import { CoinTypes } from '../../../../coins/settings/coin-types';
import { BtcCoinConfig } from '../../../../coins/coin-type-configs/btc.coin-config';
import { EthCoinConfig } from '../../../../coins/coin-type-configs/eth.coin-config';

/**
 * Data returned when SendCoinsFormComponent asks to show the preview of a transaction. Useful
 * for showing a preview and for restoring the state of the form.
 */
export interface SendCoinsData {
  /**
   * Data entered on the form.
   */
  form: FormData;
  /**
   * How many coins is the user trying to send.
   */
  amount: BigNumber;
  /**
   * List of all the destination addresses.
   */
  to: string[];
  /**
   * Unsigned transaction which was created and the user wants to preview.
   */
  transaction: GeneratedTransaction;
  /**
   * If true, the transaction is a manually created unsigned transaction which is not mean to be
   * sent to the network. The raw transaction text must be shown to the user, so it can be
   * signed and sent later.
   */
  showForManualUnsigned: boolean;
}

/**
 * Contents of a send coins form.
 */
export interface FormData {
  wallet: WalletWithBalance;
  addresses: AddressWithBalance[];
  /**
   * Addresses the user entered manually. Used when manually creating an unsigned transaction,
   * so there are no fields for selecting a wallet or addresses.
   */
  manualAddresses: string[];
  changeAddress: string;
  destinations: Destination[];
  hoursSelection: HoursDistributionOptions;
  /**
   * If true, the options for selecting the auto hours distribution factor are shown.
   */
  showAutoHourDistributionOptions: boolean;
  /**
   * All unspent outputs obtained from the node, not the selected ones.
   */
  allUnspentOutputs: Output[];
  outputs: Output[];
  /**
   * Button selected for choosing which currency to use for the amounts.
   */
  currency: DoubleButtonActive;
  note: string;
  /**
   * Recommended fees obtained from the node.
   */
  recommendedFees: RecommendedFees;
  /**
   * If the fee options are visible or not.
   */
  showFeeOptions: boolean;
  /**
   * Fee type selected from the list, for btc-like coins.
   */
  feeType: number;
  /**
   * Fee entered by the user, for btc-like coins.
   */
  fee: string;
  /**
   * Fee type selected from the list, for eth-like coins.
   */
  ethFeeType: number;
  gasPrice: string;
  gasLimit: string;

}

/**
 * Enums the modes for paying fess with coins (not hours).
 */
enum FeeTypes {
  /**
   * No fees must be paid with the currently selected coin.
   */
  None = 'None',
  /**
   * BTC fee mode (sats per byte).
   */
  Btc = 'Btc',
  /**
   * Eth fee mode (gas price and gas limit).
   */
  Eth = 'Eth',
}

/**
 * Form for sending coins.
 */
@Component({
  selector: 'app-send-coins-form',
  templateUrl: './send-coins-form.component.html',
  styleUrls: ['./send-coins-form.component.scss'],
})
export class SendCoinsFormComponent implements OnInit, OnDestroy {
  // Default factor used for automatically distributing the coins.
  private readonly defaultAutoShareValue = '0.5';
  // Max number of decimals that can be entered for the fee.
  private readonly maxFeeDecimals = 5;

  // Subform for selecting the sources.
  @ViewChild('formSourceSelection') formSourceSelection: FormSourceSelectionComponent;
  // Subform for entering the destinations.
  @ViewChild('formMultipleDestinations') formMultipleDestinations: FormDestinationComponent;
  @ViewChild('previewButton') previewButton: ButtonComponent;
  @ViewChild('sendButton') sendButton: ButtonComponent;
  // Data the form must have just after being created.
  @Input() formData: SendCoinsData;
  // If true, the simple form will be used.
  @Input() showSimpleForm: boolean;
  // Event emited when the transaction has been created and the user wants to see a preview.
  @AgularOutput() onFormSubmitted = new EventEmitter<SendCoinsData>();

  sourceSelectionModes = SourceSelectionModes;
  doubleButtonActive = DoubleButtonActive;

  // Max chars the note field can have.
  maxNoteChars = ChangeNoteComponent.MAX_NOTE_CHARS;
  form: FormGroup;
  // How many coins the user can send with the selected sources.
  availableBalance = new AvailableBalanceData();
  // If true, the balance available to be sent will also be shown in the simple form.
  alwaysShowAvailableBalance = false;
  // If the available balance is still being loaded.
  loadingAvailableBalance = true;
  // The fee that must be paid for sending all the available balance, in coins, if applicable
  // for the current coin.
  feeForSendingAll: BigNumber;
  // If the user must enter a valid fee before being able to calculate the available balance.
  validFeeNeeded = false;
  // Recommended fees obtained from the node, if the current coin needs fees to be paid.
  recommendedFees: RecommendedFees;
  // Map for getting the recommended fee for each option of the fee types control.
  recommendedFeesMap: Map<number, string>;
  // Minimum fee the node accepts.
  minimumfee: BigNumber;
  // If true, the hours are distributed automatically. If false, the user can manually
  // enter how many hours to send to each destination. Must be true if the coin does not have
  // hours.
  autoHours = true;
  // If true, the options for selecting the auto hours distribution factor are shown.
  showAutoHourDistributionOptions = false;
  // If the UI must show the options for setting the fee.
  showFeeOptions = false;
  // Factor used for automatically distributing the coins.
  autoShareValue = this.defaultAutoShareValue;
  // If true, the form is shown deactivated.
  busy = false;
  // If true, the form is used for manually creating unsigned transactions.
  showForManualUnsigned = false;
  // If true, the currently selected coin includes coin hours.
  coinHasHours = false;
  // Name of the coin unit in which the fee is measured.
  feePaymentCoinUnit = '';
  // Type of the fees, in coins, that must be paid for sending transactions.
  coinFeeType: FeeTypes;
  // If the coin only allows to send transactions to a single destination and does not allow
  // to select the change address.
  limitedSendingOptions = false;
  // If true, the form will show the option for creating unsigned transactions.
  showUsignedOptions = false;

  feeTypes = FeeTypes;

  // Sources the user has selected.
  private selectedSources: SelectedSources;

  private syncCheckSubscription: SubscriptionLike;
  private processingSubscription: SubscriptionLike;
  private getRecommendedFeesSubscription: SubscriptionLike;
  private fieldsSubscriptions: SubscriptionLike[] = [];

  constructor(
    private blockchainService: BlockchainService,
    private dialog: MatDialog,
    private msgBarService: MsgBarService,
    private navBarSwitchService: NavBarSwitchService,
    private hwWalletService: HwWalletService,
    private translate: TranslateService,
    private changeDetector: ChangeDetectorRef,
    private spendingService: SpendingService,
    private walletsAndAddressesService: WalletsAndAddressesService,
    coinService: CoinService,
  ) {
    this.coinHasHours = coinService.currentCoinInmediate.coinTypeFeatures.coinHours;
    this.feePaymentCoinUnit = coinService.currentCoinInmediate.feePaymentCoinUnit;
    this.limitedSendingOptions = coinService.currentCoinInmediate.coinTypeFeatures.limitedSendingOptions;
    this.showUsignedOptions = coinService.currentCoinInmediate.coinTypeFeatures.softwareWallets;

    if (!this.coinHasHours) {
      if (coinService.currentCoinInmediate.coinType === CoinTypes.BTC) {
        this.coinFeeType = FeeTypes.Btc;
        this.minimumfee = (coinService.currentCoinInmediate.config as BtcCoinConfig).minFee;
      } else if (coinService.currentCoinInmediate.coinType === CoinTypes.ETH) {
        this.coinFeeType = FeeTypes.Eth;
        this.minimumfee = (coinService.currentCoinInmediate.config as EthCoinConfig).minFee;
      } else {
        this.coinFeeType = FeeTypes.None;
      }
    } else {
      this.coinFeeType = FeeTypes.None;
    }

    // Always show the available balance if the fee must be paid in coins.
    this.alwaysShowAvailableBalance = this.coinFeeType !== FeeTypes.None;
  }

  ngOnInit() {
    this.form = new FormGroup({}, this.validateForm.bind(this));
    this.form.addControl('changeAddress', new FormControl(''));
    this.form.addControl('note', new FormControl(''));
    this.form.addControl('fee', new FormControl(''));
    // Custom fee is selected by default.
    this.form.addControl('feeType', new FormControl(5));
    // Custom gas price is selected by default.
    this.form.addControl('ethFeeType', new FormControl(1));
    this.form.addControl('gasPrice', new FormControl(''));
    this.form.addControl('gasLimit', new FormControl(''));

    // If the user changes the fee, select the custom fee type and update the available balance.
    this.fieldsSubscriptions.push(this.form.get('fee').valueChanges.subscribe(() => {
      this.form.get('feeType').setValue(5);
      this.updateAvailableBalance();
    }));
    this.fieldsSubscriptions.push(this.form.get('gasPrice').valueChanges.subscribe(() => {
      this.form.get('ethFeeType').setValue(1);
      this.updateAvailableBalance();
    }));

    // If the user changes the fee type, change the value of the fee field and update the
    // available balance.
    this.fieldsSubscriptions.push(this.form.get('feeType').valueChanges.subscribe(() => {
      this.useSelectedFee();
      this.updateAvailableBalance();
    }));
    this.fieldsSubscriptions.push(this.form.get('ethFeeType').valueChanges.subscribe(() => {
      this.useSelectedFee();
      this.updateAvailableBalance();
    }));

    // Update the available balance if the gas limit is changed.
    this.fieldsSubscriptions.push(this.form.get('gasLimit').valueChanges.subscribe(() => {
      this.updateAvailableBalance();
    }));

    if (this.formData) {
      setTimeout(() => this.fillForm());
    } else {
      // Get the recommended fees, as fillForm will not call it.
      setTimeout(() => this.getRecommendedFees());
    }
  }

  ngOnDestroy() {
    if (this.processingSubscription && !this.processingSubscription.closed) {
      this.processingSubscription.unsubscribe();
    }
    this.closeGetRecommendedFeesSubscription();
    this.closeSyncCheckSubscription();
    this.fieldsSubscriptions.forEach(sub => sub.unsubscribe());
    this.msgBarService.hide();
  }

  // If true, the animation indicating that the recommended fees are being loaded must be shown.
  get showFeesLoading(): boolean {
    if (!this.recommendedFees) {
      return true;
    }

    return false;
  }

  // Called when there are changes in the source selection form.
  sourceSelectionChanged() {
    this.selectedSources = this.formSourceSelection.selectedSources;
    this.formMultipleDestinations.updateValuesAndValidity();
    this.updateAvailableBalance();
    setTimeout(() => {
      this.form.updateValueAndValidity();
    });
  }

  // Called when there are changes in the destinations form.
  destinationsChanged() {
    this.updateAvailableBalance();
    setTimeout(() => {
      this.form.updateValueAndValidity();
    });
  }

  // Updates the available balance. It uses the balance in the sources and the fee that must be
  // paid for sending all the coins.
  private updateAvailableBalance() {
    if (this.formSourceSelection) {
      // Get the balance available in the sources.
      const reportedAvailable = this.formSourceSelection.availableBalance;
      this.loadingAvailableBalance = reportedAvailable.loading;

      this.validFeeNeeded = !!this.validateFee();

      if (!reportedAvailable.loading && !this.validFeeNeeded) {
        const reportedDestinations = this.formMultipleDestinations.getDestinations(false);

        // Get the appropiate fee per unit.
        let selectedFee: BigNumber;
        if (this.coinFeeType === FeeTypes.Btc) {
          selectedFee = new BigNumber(this.form.get('fee').value);
        } else if (this.coinFeeType === FeeTypes.Eth) {
          selectedFee = new BigNumber(this.form.get('gasPrice').value);
        } else {
          selectedFee = new BigNumber(0);
        }

        // Calculate the aproximate fee for sending the transaction and subtract it from
        // the balance.
        this.feeForSendingAll = this.spendingService.calculateFinalFee(
          reportedAvailable.outputs,
          reportedDestinations.length,
          selectedFee,
          new BigNumber(this.form.get('gasLimit').value),
        );
        reportedAvailable.availableCoins = reportedAvailable.availableCoins.minus(this.feeForSendingAll);
        if (reportedAvailable.availableCoins.isLessThanOrEqualTo(0)) {
          reportedAvailable.availableCoins = new BigNumber(0);
          this.feeForSendingAll = new BigNumber(0);
        }
      }

      this.availableBalance = reportedAvailable;
    }
  }

  // Starts the process for creating a transaction for previewing it.
  preview() {
    this.checkFeeBeforeCreatingTx(true);
    this.changeDetector.detectChanges();
  }

  // Starts the process for creating a transaction for sending it without preview.
  send() {
    this.checkFeeBeforeCreatingTx(false);
  }

  // Chages the mode of the advanced form. The form can be in normal mode and a special
  // mode for manually creating unsigned transactions.
  changeFormType(value: DoubleButtonActive) {
    if ((value === DoubleButtonActive.LeftButton && !this.showForManualUnsigned) || (value === DoubleButtonActive.RightButton && this.showForManualUnsigned)) {
      return;
    }

    if (value === DoubleButtonActive.RightButton) {
      // Ask for confirmation before activating the manual unsigned tx mode.
      const confirmationParams: ConfirmationParams = {
        text: 'send.unsigned-confirmation',
        defaultButtons: DefaultConfirmationButtons.YesNo,
      };

      ConfirmationComponent.openDialog(this.dialog, confirmationParams).afterClosed().subscribe(confirmationResult => {
        if (confirmationResult) {
          this.showForManualUnsigned = true;
        }
      });
    } else {
      this.showForManualUnsigned = false;
    }
  }

  // Sets the factor that will be used for distributing the hours.
  setShareValue(event) {
    this.autoShareValue = parseFloat(event.value).toFixed(2);
  }

  // Opens a modal window for selecting the change address.
  selectChangeAddress() {
    SelectAddressComponent.openDialog(this.dialog).afterClosed().subscribe(response => {
      if (response) {
        if ((response as WalletBase).id) {
          GetNextAddressComponent.openDialog(this.dialog, response).afterClosed().subscribe(resp => {
            if (resp) {
              this.form.get('changeAddress').setValue(resp);
            }
          });
        } else if (typeof response === 'string') {
          this.form.get('changeAddress').setValue(response);
        }
      }
    });
  }

  // Opens the bulk sending modal window with the data the user already added to the form.
  openMultipleDestinationsPopup() {
    let currentString = '';

    // Create a string with the data the user has already entered, using the format of the
    // bulk sending modal window.
    const currentDestinations = this.formMultipleDestinations.getDestinations(false);
    currentDestinations.map(destControl => {
      // Ignore the destinations with no data.
      if (destControl.address.trim().length > 0 ||
        destControl.originalAmount.trim().length > 0 ||
        (!this.autoHours && destControl.hours.trim().length > 0)) {
          // Add the data without potentially problematic characters.
          currentString += destControl.address.replace(',', '');
          currentString += ', ' + destControl.originalAmount.replace(',', '');
          if (!this.autoHours) {
            currentString += ', ' + destControl.hours.replace(',', '');
          }
          currentString += '\r\n';
      }
    });

    MultipleDestinationsDialogComponent.openDialog(this.dialog, currentString).afterClosed().subscribe((response: Destination[]) => {
      if (response) {
        if (response.length > 0) {
          // If the first destination does not have hours, no destination has hours.
          if (this.coinHasHours) {
            this.autoHours = response[0].hours === undefined;
          }
          setTimeout(() => this.formMultipleDestinations.setDestinations(response));
        } else {
          this.formMultipleDestinations.resetForm();
        }
      }
    });
  }

  toggleFeeOptions() {
    this.showFeeOptions = !this.showFeeOptions;
  }

  // Shows or hides the hours distribution options.
  toggleAutoHourDistributionOptions(event) {
    event.stopPropagation();
    event.preventDefault();

    // Resets the hours distribution options.
    this.autoShareValue = this.defaultAutoShareValue;

    this.showAutoHourDistributionOptions = !this.showAutoHourDistributionOptions;
  }

  // Activates/deactivates the option for automatic hours distribution.
  setAutoHours(event) {
    this.autoHours = event.checked;
    this.formMultipleDestinations.updateValuesAndValidity();

    if (!this.autoHours) {
      this.showAutoHourDistributionOptions = false;
    }
  }

  // Populates the fee or gas price field with the value corresponding to the current value of
  // the feeType or ethFeeType field.
  private useSelectedFee() {
    if (this.coinFeeType === FeeTypes.Btc) {
      const value = this.form.get('feeType').value;
      if (this.recommendedFeesMap && this.recommendedFeesMap.has(value)) {
        this.form.get('fee').setValue(this.recommendedFeesMap.get(value), { emitEvent: false });
      }
    } else if (this.coinFeeType === FeeTypes.Eth) {
      const value = this.form.get('ethFeeType').value;
      if (value === 0) {
        this.form.get('gasPrice').setValue(this.recommendedFees.recommendedEthFees.gasPrice.decimalPlaces(this.maxFeeDecimals).toString(10), { emitEvent: false });
      }
    }

    this.updateAvailableBalance();
  }

  // Connects to the node to get the recommended fees. If the current coin uses coin hours,
  // it does nothing.
  private getRecommendedFees() {
    if (this.coinFeeType !== FeeTypes.None) {
      this.closeGetRecommendedFeesSubscription();
      // Get the data.
      this.getRecommendedFeesSubscription = this.spendingService.getCurrentRecommendedFees().subscribe(fees => {
        // Update the vars and select the recommended fee.
        this.populateRecommendedFees(fees);
        this.selecRecommendedFee(true);

        // If there was a problem getting the recommended fee, show a warning.
        if (fees.thereWereProblems) {
          this.msgBarService.showWarning(this.translate.instant('send.fee-problem-warning'));
        }
      });
    }
  }

  /**
   * Checks this.recommendedFees and set the best value as the selected one.
   * @param changeOnlyIfNotEdited If true, no changes will be made to fields the user
   * already modified.
   */
  private selecRecommendedFee(changeOnlyIfNotEdited: boolean) {
    // Check if there were errors trying to get the recommended fee.
    if (!this.recommendedFees || this.recommendedFees.thereWereProblems) {
      if (this.coinFeeType === FeeTypes.Eth && (!changeOnlyIfNotEdited || this.form.get('gasLimit').value === '')) {
        // Having errors getting the recommended fee does not always means having errors
        // getting the recommended gas limit.
        if (this.recommendedFees.recommendedEthFees.gasLimit) {
          this.form.get('gasLimit').setValue(this.recommendedFees.recommendedEthFees.gasLimit, { emitEvent: false });
        } else {
          this.form.get('gasLimit').setValue('0', { emitEvent: false });
        }
      }

      // Set the fee per unit to 0. That will also make the fee type field to be set to "custom".
      if (!changeOnlyIfNotEdited || this.form.get('fee').value === '') {
        this.form.get('fee').setValue('0');
      }
      if (!changeOnlyIfNotEdited || this.form.get('gasPrice').value === '') {
        this.form.get('gasPrice').setValue('0');
      }

      // Open the fee options.
      this.showFeeOptions = true;

      this.updateAvailableBalance();

      return;
    }

    if (this.coinFeeType === FeeTypes.Btc) {
      // If the user has not entered a fee, the normal fee type is selected and the fee
      // field is populated with the corresponding value. However, if a faster type has an
      // a lower or equal cost, the faster method is used.
      if (!changeOnlyIfNotEdited || this.form.get('fee').value === '') {
        const recommendedBtcFees = this.recommendedFees.recommendedBtcFees;
        if (recommendedBtcFees.high.decimalPlaces(this.maxFeeDecimals).isLessThanOrEqualTo(recommendedBtcFees.normal.decimalPlaces(this.maxFeeDecimals))) {
          if (recommendedBtcFees.veryHigh.decimalPlaces(this.maxFeeDecimals).isLessThanOrEqualTo(recommendedBtcFees.high.decimalPlaces(this.maxFeeDecimals))) {
            this.form.get('feeType').setValue(0, { emitEvent: false });
          } else {
            this.form.get('feeType').setValue(1, { emitEvent: false });
          }
        } else {
          this.form.get('feeType').setValue(2, { emitEvent: false });
        }
      }

      // Update the fee field.
      this.useSelectedFee();
    } else if (this.coinFeeType === FeeTypes.Eth) {
      // If the user has not entered a gas price, the one returned by the service is used.
      if (!changeOnlyIfNotEdited || this.form.get('gasPrice').value === '') {
        this.form.get('ethFeeType').setValue(0, { emitEvent: false });
      }

      // If the user has not entered a gas limit, the one returned by the service is used.
      if (!changeOnlyIfNotEdited || this.form.get('gasLimit').value === '') {
        this.form.get('gasLimit').setValue(this.recommendedFees.recommendedEthFees.gasLimit, { emitEvent: false });
      }

      // Update the fee field.
      this.useSelectedFee();
    }
  }

  // Populates the vars with the recommended fees and zeroFeeAllowed.
  private populateRecommendedFees(recommendedFees: RecommendedFees) {
    this.recommendedFees = recommendedFees;

    if (this.coinFeeType === FeeTypes.Btc) {
      this.recommendedFeesMap = new Map<number, string>();
      this.recommendedFeesMap.set(0, recommendedFees.recommendedBtcFees.veryHigh.decimalPlaces(this.maxFeeDecimals).toString(10));
      this.recommendedFeesMap.set(1, recommendedFees.recommendedBtcFees.high.decimalPlaces(this.maxFeeDecimals).toString(10));
      this.recommendedFeesMap.set(2, recommendedFees.recommendedBtcFees.normal.decimalPlaces(this.maxFeeDecimals).toString(10));
      this.recommendedFeesMap.set(3, recommendedFees.recommendedBtcFees.low.decimalPlaces(this.maxFeeDecimals).toString(10));
      this.recommendedFeesMap.set(4, recommendedFees.recommendedBtcFees.veryLow.decimalPlaces(this.maxFeeDecimals).toString(10));
    }
  }

  // Fills the form with the provided values.
  private fillForm() {
    this.showForManualUnsigned = this.formData.showForManualUnsigned,

    this.formSourceSelection.fill(this.formData);
    this.formMultipleDestinations.fill(this.formData);

    ['changeAddress', 'note'].forEach(name => {
      this.form.get(name).setValue(this.formData.form[name]);
    });

    if (!this.coinHasHours || this.formData.form.hoursSelection.type === HoursDistributionTypes.Auto) {
      this.autoHours = true;

      if (this.formData.form.hoursSelection.share_factor) {
        this.autoShareValue = this.formData.form.hoursSelection.share_factor;
      } else {
        this.autoShareValue = '0';
      }
    } else {
      this.autoHours = false;
    }

    this.showAutoHourDistributionOptions = this.formData.form.showAutoHourDistributionOptions;
    this.showFeeOptions = this.formData.form.showFeeOptions;

    if (this.formData.form.recommendedFees) {
      // If the data already includes recommended fees, use them and update the fee type.
      this.populateRecommendedFees(this.formData.form.recommendedFees);
      this.form.get('feeType').setValue(this.formData.form.feeType);
      this.form.get('ethFeeType').setValue(this.formData.form.ethFeeType);
    } else {
      // If not, get them from the node.
      this.getRecommendedFees();
    }

    this.form.get('fee').setValue(this.formData.form.fee, { emitEvent: false });
    this.form.get('gasPrice').setValue(this.formData.form.gasPrice, { emitEvent: false });
    this.form.get('gasLimit').setValue(this.formData.form.gasLimit);
  }

  // Validates the form.
  private validateForm() {
    if (!this.form || !this.formSourceSelection) {
      return { Required: true };
    }

    const feeValidationResult = this.validateFee();
    if (feeValidationResult) {
      return feeValidationResult;
    }

    // Check the validity of the subforms.
    if (!this.formSourceSelection || !this.formSourceSelection.valid || !this.formMultipleDestinations || !this.formMultipleDestinations.valid) {
      return { Invalid: true };
    }

    return null;
  }

  // Validates the fee entered in the form.
  private validateFee() {
    if (!this.form || !this.form.get('fee')) {
      return { Required: true };
    }

    // Validate the fee, if appropiate.
    if (this.coinFeeType === FeeTypes.Btc) {
      // The fee must be a valid number with a limit in its decimals.
      const fee = new BigNumber(this.form.get('fee').value);
      if (fee.isNaN() || fee.isLessThan(0) || !fee.isEqualTo(fee.decimalPlaces(this.maxFeeDecimals))) {
        return { Invalid: true };
      }

      // Check if it is more than the minimum.
      if (fee.isLessThan(this.minimumfee)) {
        return { Invalid: true };
      }
    } else if (this.coinFeeType === FeeTypes.Eth) {
      // The gas price must be a valid number with a limit in its decimals.
      const gasPrice = new BigNumber(this.form.get('gasPrice').value);
      if (gasPrice.isNaN() || gasPrice.isLessThan(0) || !gasPrice.isEqualTo(gasPrice.decimalPlaces(this.maxFeeDecimals))) {
        return { Invalid: true };
      }

      // Check if it is more than the minimum.
      if (gasPrice.isLessThan(this.minimumfee)) {
        return { Invalid: true };
      }

      // The gas limit must be a valid integer number.
      const gasLimit = new BigNumber(this.form.get('gasLimit').value);
      if (gasLimit.isNaN() || gasLimit.isLessThanOrEqualTo(0) || !gasLimit.isEqualTo(gasLimit.decimalPlaces(0))) {
        return { Invalid: true };
      }
    }

    return null;
  }

  // Checks if the fee the user entered is not potentially incorrect and shows a warning
  // before continuing creating the transaction, if appropiate. It does nothing if the
  // form is not valid or busy.
  private checkFeeBeforeCreatingTx(creatingPreviewTx: boolean) {
    if (!this.form.valid || this.busy) {
      return;
    }

    if (this.coinFeeType === FeeTypes.None) {
      // Ignore this step if it is not needed.
      this.checkBeforeCreatingTx(creatingPreviewTx);
    } else {
      let warningMsg: string;

      // Check if the fee is too high, too low or unknown.
      if (this.coinFeeType === FeeTypes.Btc) {
        if (!this.recommendedFeesMap) {
          warningMsg = 'send.fee-unknown-warning';
        } else if (this.recommendedFees.thereWereProblems) {
          warningMsg = 'send.fee-problem-warning2';
        } else if (new BigNumber(this.form.get('fee').value).isLessThan(this.recommendedFeesMap.get(4))) {
          warningMsg = 'send.fee-low-warning';
        } else if (new BigNumber(this.form.get('fee').value).isGreaterThan(this.recommendedFeesMap.get(0))) {
          warningMsg = 'send.fee-high-warning';
        }
      } else if (this.coinFeeType === FeeTypes.Eth) {
        if (!this.recommendedFees) {
          warningMsg = 'send.fee-unknown-warning';
        } else if (this.recommendedFees.thereWereProblems) {
          warningMsg = 'send.fee-problem-warning2';
        } else if (new BigNumber(this.form.get('gasPrice').value).isLessThan(this.recommendedFees.recommendedEthFees.gasPrice.dividedBy(2))) {
          warningMsg = 'send.fee-low-warning';
        } else if (new BigNumber(this.form.get('gasPrice').value).isGreaterThan(this.recommendedFees.recommendedEthFees.gasPrice.multipliedBy(2))) {
          warningMsg = 'send.fee-high-warning';
        }
      }

      if (!warningMsg) {
        // If no problem was found, continue.
        this.checkBeforeCreatingTx(creatingPreviewTx);
      } else {
        // Ask for confirmation before continuing.
        const confirmationParams: ConfirmationParams = {
          redTitle: true,
          headerText: 'common.warning-title',
          text: warningMsg,
          checkboxText: 'common.generic-confirmation-check',
          defaultButtons: DefaultConfirmationButtons.ContinueCancel,
        };

        ConfirmationComponent.openDialog(this.dialog, confirmationParams).afterClosed().subscribe(confirmationResult => {
          if (confirmationResult) {
            this.checkBeforeCreatingTx(creatingPreviewTx);
          }
        });
      }
    }
  }

  // Checks if the blockchain is synchronized. It continues normally creating the tx if the
  // blockchain is synchronized and asks for confirmation if it is not. It does nothing if
  // the form is not valid or busy.
  private checkBeforeCreatingTx(creatingPreviewTx: boolean) {
    if (!this.form.valid || this.busy) {
      return;
    }

    this.closeSyncCheckSubscription();
    this.syncCheckSubscription = this.blockchainService.progress.pipe(first()).subscribe(response => {
      if (response.synchronized) {
        this.prepareTransaction(creatingPreviewTx);
      } else {
        const confirmationParams: ConfirmationParams = {
          text: 'send.synchronizing-warning',
          defaultButtons: DefaultConfirmationButtons.YesNo,
        };

        ConfirmationComponent.openDialog(this.dialog, confirmationParams).afterClosed().subscribe(confirmationResult => {
          if (confirmationResult) {
            this.prepareTransaction(creatingPreviewTx);
          }
        });
      }
    });
  }

  // Makes the preparation steps, like asking for the password, and then calls the function
  // for creating the transaction.
  private prepareTransaction(creatingPreviewTx: boolean) {
    this.msgBarService.hide();
    this.previewButton.resetState();
    if (this.sendButton) {
      this.sendButton.resetState();
    }

    // Request the password only if the wallet is encrypted and the transaction is going
    // to be sent without preview. If the wallet is bipp44 and encrypted, the password is
    // always requested.
    if (
      !this.showForManualUnsigned &&
      !this.selectedSources.wallet.isHardware &&
      this.selectedSources.wallet.encrypted &&
      (!creatingPreviewTx || this.selectedSources.wallet.walletType === WalletTypes.Bip44)
    ) {
      PasswordDialogComponent.openDialog(this.dialog, { wallet: this.selectedSources.wallet }).componentInstance.passwordSubmit
        .subscribe(passwordDialog => {
          this.createTransaction(creatingPreviewTx, passwordDialog);
        });
    } else {
      if (creatingPreviewTx || this.showForManualUnsigned || !this.selectedSources.wallet.isHardware) {
        this.createTransaction(creatingPreviewTx);
      } else {
        // If using a hw wallet, check the device first.
        this.showBusy(creatingPreviewTx);
        this.processingSubscription = this.hwWalletService.checkIfCorrectHwConnected(this.selectedSources.wallet).subscribe(
          () => this.createTransaction(creatingPreviewTx),
          err => this.showError(err),
        );
      }
    }
  }

  // Creates a transaction with the data entered on the form.
  private createTransaction(creatingPreviewTx: boolean, passwordDialog?: any) {
    this.showBusy(creatingPreviewTx);

    // Process the source addresses.
    let selectedAddresses: string[];
    if (!this.showForManualUnsigned) {
      selectedAddresses = this.selectedSources.addresses && this.selectedSources.addresses.length > 0 ?
        this.selectedSources.addresses.map(addr => addr.address) : null;
    } else {
      selectedAddresses = this.selectedSources.manualAddresses;
    }

    // Process the source outputs.
    const selectedOutputs = this.selectedSources.unspentOutputs && this.selectedSources.unspentOutputs.length > 0 ?
      this.selectedSources.unspentOutputs : null;

    const destinations = this.formMultipleDestinations.getDestinations(true);
    let transaction: GeneratedTransaction;

    let fee = '';
    if (this.coinFeeType === FeeTypes.Btc) {
      fee = this.form.get('fee').value;
    } else if (this.coinFeeType === FeeTypes.Eth) {
      fee = this.form.get('gasPrice').value + '/' + this.form.get('gasLimit').value;
    }

    // Create the transaction. The transaction is signed if the wallet is bip44 or the
    // user wants to send the transaction immediately, without preview.
    this.processingSubscription = this.spendingService.createTransaction(
      this.selectedSources.wallet,
      selectedAddresses ? selectedAddresses : this.selectedSources.wallet.addresses.map(address => address.address),
      selectedOutputs,
      destinations,
      this.hoursSelection,
      this.form.get('changeAddress').value ? this.form.get('changeAddress').value : null,
      passwordDialog ? passwordDialog.password : null,
      this.showForManualUnsigned || (this.selectedSources.wallet.walletType !== WalletTypes.Bip44 && creatingPreviewTx),
      fee,
    ).pipe(mergeMap(response => {
      transaction = response;

      // If using a bip44 wallet, update its address list, to let the preview know about any
      // newly created return address.
      if (creatingPreviewTx && this.selectedSources.wallet && this.selectedSources.wallet.walletType === WalletTypes.Bip44) {
        return this.walletsAndAddressesService.updateWallet(this.selectedSources.wallet);
      }

      return of(null);
    })).subscribe(() => {
      // Close the password dialog, if it exists.
      if (passwordDialog) {
        passwordDialog.close();
      }

      const note = this.form.value.note.trim();
      transaction.note = note;

      if (!creatingPreviewTx) {
        if (!this.showForManualUnsigned) {
          // Send the transaction to the network.
          this.processingSubscription = this.spendingService.injectTransaction(transaction.encoded, note)
            .subscribe(noteSaved => {
              let showDone = true;
              // Show a warning if the transaction was sent but the note was not saved.
              if (note && !noteSaved) {
                this.msgBarService.showWarning(this.translate.instant('send.saving-note-error'));
                showDone = false;
              }

              this.showSuccess(showDone);
            }, error => this.showError(error));
        } else {
          const data: CopyRawTxData = {
            rawTx: transaction.encoded,
            isUnsigned: true,
          };

          // Show the raw transaction.
          CopyRawTxComponent.openDialog(this.dialog, data).afterClosed().subscribe(() => {
            this.resetState();

            const confirmationParams: ConfirmationParams = {
              text: 'offline-transactions.copy-tx.reset-confirmation',
              defaultButtons: DefaultConfirmationButtons.YesNo,
            };

            // Ask the user if the form should be cleaned, to be able to create a new transaction.
            ConfirmationComponent.openDialog(this.dialog, confirmationParams).afterClosed().subscribe(confirmationResult => {
              if (confirmationResult) {
                this.resetForm();
                this.msgBarService.showDone('offline-transactions.copy-tx.reset-done', 4000);
              }
            });
          });
        }
      } else {
        // Create an object with the form data and emit an event for opening the preview.
        let amount = new BigNumber('0');
        destinations.map(destination => amount = amount.plus(destination.coins));
        this.onFormSubmitted.emit({
          form: {
            wallet: this.selectedSources.wallet,
            addresses: this.selectedSources.addresses,
            manualAddresses: this.selectedSources.manualAddresses,
            changeAddress: this.form.get('changeAddress').value,
            destinations: destinations,
            hoursSelection: this.hoursSelection,
            showAutoHourDistributionOptions: this.showAutoHourDistributionOptions,
            allUnspentOutputs: this.formSourceSelection.unspentOutputsList,
            outputs: this.selectedSources.unspentOutputs,
            currency: this.formMultipleDestinations.currentlySelectedCurrency,
            note: note,
            recommendedFees: this.recommendedFees,
            showFeeOptions: this.showFeeOptions,
            feeType: this.form.get('feeType').value,
            fee: this.form.get('fee').value,
            ethFeeType: this.form.get('ethFeeType').value,
            gasPrice: this.form.get('gasPrice').value,
            gasLimit: this.form.get('gasLimit').value,
          },
          amount: amount,
          to: destinations.map(d => d.address),
          transaction,
          showForManualUnsigned: this.showForManualUnsigned,
        });
        this.busy = false;
        this.navBarSwitchService.enableSwitch();
      }
    }, error => {
      if (passwordDialog) {
        passwordDialog.error(error);
      }

      this.showError(error);
    });
  }

  private resetForm() {
    this.formSourceSelection.resetForm();
    this.formMultipleDestinations.resetForm();
    this.form.get('changeAddress').setValue('');
    this.form.get('note').setValue('');
    this.autoHours = true;
    this.showAutoHourDistributionOptions = false;
    this.autoShareValue = this.defaultAutoShareValue;
    this.showFeeOptions = false;
    if (this.coinFeeType !== FeeTypes.None) {
      this.selecRecommendedFee(false);
    }
  }

  // Returns the hours distribution options selected on the form, but with the format needed
  // for creating the transaction using the node.
  private get hoursSelection(): HoursDistributionOptions {
    let hoursSelection: HoursDistributionOptions = {
      type: HoursDistributionTypes.Manual,
    };

    if (this.autoHours) {
      hoursSelection = <HoursDistributionOptions> {
        type: HoursDistributionTypes.Auto,
        mode: 'share',
        share_factor: this.autoShareValue,
      };
    }

    return hoursSelection;
  }

  private closeSyncCheckSubscription() {
    if (this.syncCheckSubscription) {
      this.syncCheckSubscription.unsubscribe();
    }
  }

  // Makes the UI to be shown busy and disables the navbar switch.
  private showBusy(creatingPreviewTx: boolean) {
    if (creatingPreviewTx) {
      this.previewButton.setLoading();
      if (this.sendButton) {
        this.sendButton.setDisabled();
      }
    } else {
      if (this.sendButton) {
        this.sendButton.setLoading();
      }
      this.previewButton.setDisabled();
    }
    this.busy = true;
    this.navBarSwitchService.disableSwitch();
  }

  // Cleans the form, stops showing the UI busy, reactivates the navbar switch and, if showDone
  // is true, shows a msg confirming that the transaction has been sent.
  private showSuccess(showDone: boolean) {
    this.busy = false;
    this.navBarSwitchService.enableSwitch();
    this.resetForm();

    if (showDone) {
      this.msgBarService.showDone('send.sent');
      if (this.sendButton) {
        this.sendButton.resetState();
      }
    } else {
      if (this.sendButton) {
        this.sendButton.setSuccess();
        setTimeout(() => {
          this.sendButton.resetState();
        }, 3000);
      }
    }
  }

  // Stops showing the UI busy, reactivates the navbar switch and shows the error msg.
  private showError(error) {
    this.busy = false;
    this.msgBarService.showError(error);
    this.navBarSwitchService.enableSwitch();
    this.previewButton.resetState().setEnabled();
    if (this.sendButton) {
      this.sendButton.resetState().setEnabled();
    }
  }

  // Stops showing the UI busy and reactivates the navbar switch.
  private resetState() {
    this.busy = false;
    this.navBarSwitchService.enableSwitch();
    this.previewButton.resetState().setEnabled();
    if (this.sendButton) {
      this.sendButton.resetState().setEnabled();
    }
  }

  private closeGetRecommendedFeesSubscription() {
    if (this.getRecommendedFeesSubscription) {
      this.getRecommendedFeesSubscription.unsubscribe();
    }
  }
}

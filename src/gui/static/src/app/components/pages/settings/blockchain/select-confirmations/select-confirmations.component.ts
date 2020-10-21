import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { MatDialogRef, MatDialog, MatDialogConfig } from '@angular/material/dialog';
import BigNumber from 'bignumber.js';

import { MsgBarService } from '../../../../../services/msg-bar.service';
import { CoinService } from '../../../../../services/coin.service';
import { TranslateService } from '@ngx-translate/core';

/**
 * Modal window for changing how many confirmation the transactions of the currently selected
 * coin must have to be considered final.
 */
@Component({
  selector: 'app-select-confirmations',
  templateUrl: './select-confirmations.component.html',
  styleUrls: ['./select-confirmations.component.scss'],
})
export class SelectConfirmationsComponent implements OnInit {
  // Max value allowed in the form.
  readonly maxAllowedValue = 100;

  form: FormGroup;

  // Vars with the validation error messages.
  confirmationsErrorMsg = '';

  /**
   * Opens the modal window. Please use this function instead of opening the window "by hand".
   */
  public static openDialog(dialog: MatDialog): MatDialogRef<SelectConfirmationsComponent, any> {
    const config = new MatDialogConfig();
    config.autoFocus = true;
    config.width = '450px';

    return dialog.open(SelectConfirmationsComponent, config);
  }

  constructor(
    public dialogRef: MatDialogRef<SelectConfirmationsComponent>,
    private formBuilder: FormBuilder,
    private msgBarService: MsgBarService,
    private changeDetector: ChangeDetectorRef,
    private coinService: CoinService,
    private translateService: TranslateService,
  ) {}

  ngOnInit() {
    this.form = this.formBuilder.group({
      confirmations: [this.coinService.currentCoinInmediate.confirmationsNeeded],
    });

    this.form.setValidators(this.validateForm.bind(this));
  }

  /**
   * Validates the form and updates the vars with the validation errors.
   */
  validateForm() {
    this.confirmationsErrorMsg = '';

    let valid = true;

    const confirmations = this.form.get('confirmations').value;
    const confirmationsBn = new BigNumber(confirmations);

    if (
      confirmationsBn.isNaN() ||
      confirmationsBn.isLessThan(0) ||
      confirmationsBn.isGreaterThan(this.maxAllowedValue) ||
      !confirmationsBn.isEqualTo(confirmationsBn.decimalPlaces(0))
    ) {
      valid = false;
      if (this.form.get('confirmations').touched) {
        this.confirmationsErrorMsg = this.translateService.instant('blockchain.select-confirmation.confirmations-error-info', { max: this.maxAllowedValue });
      }
    }

    return valid ? null : { Invalid: true };
  }

  closePopup() {
    this.dialogRef.close();
  }

  // Changes the confirmations needed for the currently selected coin.
  changeConfirmations() {
    this.changeDetector.detectChanges();

    this.coinService.updateConfirmationsNeeded(this.form.get('confirmations').value);
    setTimeout(() => this.msgBarService.showDone('common.changes-made'));

    this.closePopup();
  }
}

import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { MatDialogRef, MatDialog, MatDialogConfig } from '@angular/material/dialog';

import { MsgBarService } from '../../../../../services/msg-bar.service';
import { CoinService } from '../../../../../services/coin.service';

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
  ) {}

  ngOnInit() {
    this.form = this.formBuilder.group({
      confirmations: [this.coinService.currentCoinInmediate.confirmationsNeeded],
    });
  }

  // Allows to know if the form is valid.
  get isValid(): boolean {
    if (
      this.form &&
      this.form.get('confirmations').value &&
      this.form.get('confirmations').value > 0 &&
      this.form.get('confirmations').value <= this.maxAllowedValue
    ) {
      return true;
    }

    return false;
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

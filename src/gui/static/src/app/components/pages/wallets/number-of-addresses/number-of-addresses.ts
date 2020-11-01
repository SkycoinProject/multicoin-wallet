import { Component, OnInit } from '@angular/core';
import { FormGroup, FormControl } from '@angular/forms';
import { MatDialogRef, MatDialog, MatDialogConfig } from '@angular/material/dialog';

/**
 * Modal window for entering how many addresses to add to a wallet. It does not add the
 * addresses. If the user does not cancel the operation, the modal window is closed and
 * number of addresses is returned in the "afterClosed" event.
 */
@Component({
  selector: 'app-number-of-addresses',
  templateUrl: './number-of-addresses.html',
  styleUrls: ['./number-of-addresses.scss'],
})
export class NumberOfAddressesComponent implements OnInit {
  form: FormGroup;

  // Vars with the validation error messages.
  inputErrorMsg = '';

  /**
   * Opens the modal window. Please use this function instead of opening the window "by hand".
   */
  public static openDialog(dialog: MatDialog): MatDialogRef<NumberOfAddressesComponent, any> {
    const config = new MatDialogConfig();
    config.autoFocus = true;
    config.width = '450px';

    return dialog.open(NumberOfAddressesComponent, config);
  }

  constructor(
    public dialogRef: MatDialogRef<NumberOfAddressesComponent>,
  ) {}

  ngOnInit() {
    this.form = new FormGroup({});
    this.form.addControl('quantity', new FormControl(1));

    this.form.setValidators(this.validateForm.bind(this));
  }

  closePopup() {
    this.dialogRef.close();
  }

  continue() {
    this.dialogRef.close(this.form.value.quantity);
  }

  /**
   * Validates the form and updates the vars with the validation errors.
   */
  validateForm() {
    this.inputErrorMsg = '';

    let valid = true;

    // The number must be an integer from 1 to 100.
    const value = this.form.get('quantity').value as number;
    if (!value || value < 1 || value > 100 || value !== Math.round(value)) {
      valid = false;
      if (this.form.get('quantity').touched) {
        this.inputErrorMsg = 'wallet.add-addresses.quantity-error-info';
      }
    }

    return valid ? null : { Invalid: true };
  }
}

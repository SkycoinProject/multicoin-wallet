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
    this.form.addControl('quantity', new FormControl(1, [this.validateQuantity]));
  }

  closePopup() {
    this.dialogRef.close();
  }

  continue() {
    this.dialogRef.close(this.form.value.quantity);
  }

  // Validates the quantity entered by the user.
  private validateQuantity(control: FormControl) {
    if (control.value < 1 || control.value > 100 || Number(control.value) !== Math.round(Number(control.value))) {
      return { invalid: true };
    }

    return null;
  }
}

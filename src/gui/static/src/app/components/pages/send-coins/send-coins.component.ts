import { Component, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { SubscriptionLike } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';

import { NavBarSwitchService } from '../../../services/nav-bar-switch.service';
import { DoubleButtonActive } from '../../layout/double-button/double-button.component';
import { SignRawTxComponent } from './offline-dialogs/implementations/sign-raw-tx.component';
import { BroadcastRawTxComponent } from './offline-dialogs/implementations/broadcast-raw-tx.component';
import { SendCoinsData } from './send-coins-form/send-coins-form.component';
import { NodeService } from '../../../services/node.service';

/**
 * Shows the form which allows the user to send coins.
 */
@Component({
  selector: 'app-send-coins',
  templateUrl: './send-coins.component.html',
  styleUrls: ['./send-coins.component.scss'],
})
export class SendCoinsComponent implements OnDestroy {
  // If the node service already has updated info about the remote node.
  nodeDataUpdated = false;
  // If true, the form for sending coins is shown. If false, the tx preview is shown.
  showForm = true;
  // Saves the last data entered on the form.
  formData: SendCoinsData;
  // If the page must show the simple form (left) or the advanced one (right).
  activeForm: DoubleButtonActive;
  activeForms = DoubleButtonActive;

  private subscriptionsGroup: SubscriptionLike[] = [];

  constructor(
    private navBarSwitchService: NavBarSwitchService,
    private changeDetector: ChangeDetectorRef,
    private dialog: MatDialog,
    private nodeService: NodeService,
  ) {
    // Check if the node service has updated data.
    this.subscriptionsGroup.push(this.nodeService.remoteNodeDataUpdated.subscribe(response => {
      this.nodeDataUpdated = response;
    }));

    // Show the switch for changing the form and react to its event.
    this.navBarSwitchService.showSwitch('send.simple-form-button', 'send.advanced-form-button', DoubleButtonActive.LeftButton);
    this.subscriptionsGroup.push(navBarSwitchService.activeComponent.subscribe(value => {
      if (this.activeForm !== value) {
        this.activeForm = value;
        this.formData = null;
      }
    }));
  }

  ngOnDestroy() {
    this.subscriptionsGroup.forEach(sub => sub.unsubscribe());
    this.navBarSwitchService.hideSwitch();
  }

  // Called when the form requests to show the preview. The param includes the data entered
  // on the form.
  onFormSubmitted(data: SendCoinsData) {
    this.formData = data;
    this.showForm = false;
  }

  // Returns from the tx preview to the form.
  onBack(deleteFormData) {
    // Erase the form data if requested.
    if (deleteFormData) {
      this.formData = null;
    }

    this.showForm = true;
    this.changeDetector.detectChanges();
  }

  // Opens the modal window for signing raw unsigned transactions.
  signTransaction() {
    SignRawTxComponent.openDialog(this.dialog);
  }

  // Opens the modal window for sending raw signed transactions.
  broadcastTransaction() {
    BroadcastRawTxComponent.openDialog(this.dialog);
  }
}

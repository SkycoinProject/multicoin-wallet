import { throwError as observableThrowError, SubscriptionLike, of, concat } from 'rxjs';
import { Component, EventEmitter, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import * as moment from 'moment';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { retryWhen, delay, take, mergeMap } from 'rxjs/operators';

import { ButtonComponent } from '../../../layout/button/button.component';
import { ExchangeService, StoredExchangeOrder, TradingPair, ExchangeOrder } from '../../../../services/exchange.service';
import { SelectAddressComponent } from '../../../layout/select-address/select-address.component';
import { MsgBarService } from '../../../../services/msg-bar.service';
import { WalletBase } from '../../../../services/wallet-operations/wallet-objects';
import { GetNextAddressComponent } from '../../../layout/get-next-address/get-next-address.component';
import { NodeService } from '../../../../services/node.service';
import { WalletUtilsService } from '../../../../services/wallet-operations/wallet-utils.service';

/**
 * Shows the form for creating an exchange order.
 */
@Component({
  selector: 'app-exchange-create',
  templateUrl: './exchange-create.component.html',
  styleUrls: ['./exchange-create.component.scss'],
})
export class ExchangeCreateComponent implements OnInit, OnDestroy {
  // Default coin the user will have to deposit.
  readonly defaultFromCoin = 'BTC';
  // Default amount of coins the user will have to deposit.
  readonly defaultFromAmount = '0.1';
  // Coin the user will receive.
  readonly toCoin = 'SKY';

  @ViewChild('exchangeButton') exchangeButton: ButtonComponent;
  // Event emited when the order has been created.
  @Output() submitted = new EventEmitter<StoredExchangeOrder>();

  form: FormGroup;
  tradingPairs: TradingPair[];
  // Currently selected trading pair
  activeTradingPair: TradingPair;
  problemGettingPairs = false;
  // If true, the form is shown deactivated.
  busy = false;
  // If the node service already has updated info about the remote node.
  nodeDataUpdated = false;

  // If the user has acepted the agreement.
  private agreement = false;

  private subscriptionsGroup: SubscriptionLike[] = [];
  private exchangeSubscription: SubscriptionLike;
  private priceUpdateSubscription: SubscriptionLike;

  // Approximately how many coin will be received for the amount of coins the user will send,
  // as per the value entered on the form and the current price.
  get toAmount(): string {
    if (!this.activeTradingPair) {
      return '0';
    }

    const fromAmount = this.form.get('fromAmount').value;
    if (isNaN(fromAmount)) {
      return '0';
    } else {
      return (this.form.get('fromAmount').value * this.activeTradingPair.price).toFixed(this.nodeService.currentMaxDecimals);
    }
  }

  // How many coin the user will send, converted to a valid number.
  get sendAmount(): number {
    const val = this.form.get('fromAmount').value;

    return isNaN(parseFloat(val)) ? 0 : val;
  }

  constructor(
    private exchangeService: ExchangeService,
    private formBuilder: FormBuilder,
    private msgBarService: MsgBarService,
    private dialog: MatDialog,
    private nodeService: NodeService,
    private translateService: TranslateService,
    private walletUtilsService: WalletUtilsService,
  ) { }

  ngOnInit() {
    // Check if the node service has updated data.
    this.subscriptionsGroup.push(this.nodeService.remoteNodeDataUpdated.subscribe(response => {
      this.nodeDataUpdated = response;
    }));

    this.createForm();
    this.loadData();
  }

  ngOnDestroy() {
    this.subscriptionsGroup.forEach(sub => sub.unsubscribe());
    this.removeExchangeSubscription();
    this.removePriceUpdateSubscription();
    this.msgBarService.hide();
    this.submitted.complete();
  }

  // Called when the user presses the checkbox for acepting the agreement.
  setAgreement(event) {
    this.agreement = event.checked;
    this.form.updateValueAndValidity();
  }

  // Opens the modal window for selecting one of the addresses the user has.
  selectAddress(event) {
    event.stopPropagation();
    event.preventDefault();

    SelectAddressComponent.openDialog(this.dialog).afterClosed().subscribe(response => {
      if (response) {
        if ((response as WalletBase).id) {
          GetNextAddressComponent.openDialog(this.dialog, response).afterClosed().subscribe(resp => {
            if (resp) {
              this.form.get('toAddress').setValue(resp);
            }
          });
        } else if (typeof response === 'string') {
          this.form.get('toAddress').setValue(response);
        }
      }
    });
  }

  // Creates the order.
  exchange() {
    if (!this.form.valid || this.busy) {
      return;
    }

    // Prepare the UI.
    this.busy = true;
    this.msgBarService.hide();
    this.exchangeButton.resetState();
    this.exchangeButton.setLoading();
    this.exchangeButton.setDisabled();

    const amount = parseFloat(this.form.get('fromAmount').value);

    const toAddress = (this.form.get('toAddress').value as string).trim();

    // Check if the address is valid.
    this.removeExchangeSubscription();
    this.exchangeSubscription = this.walletUtilsService.verifyAddress(toAddress).subscribe(addressIsValid => {
      if (addressIsValid) {
        // Create the order.
        this.exchangeSubscription = this.exchangeService.exchange(
          this.activeTradingPair.pair,
          amount,
          toAddress,
          this.activeTradingPair.price,
        ).subscribe((order: ExchangeOrder) => {
          this.busy = false;
          // Emit the event.
          this.submitted.emit({
            id: order.id,
            pair: order.pair,
            fromAmount: order.fromAmount,
            toAmount: order.toAmount,
            address: order.toAddress,
            timestamp: moment().unix(),
            price: this.activeTradingPair.price,
          });
        }, err => {
          this.busy = false;
          this.exchangeButton.resetState().setEnabled();
          this.msgBarService.showError(err);
        });
      } else {
        this.showInvalidAddress();
      }
    }, () => {
      this.showInvalidAddress();
    });
  }

  // Reactivates the form and shows a msg indicating that the address is invalid.
  private showInvalidAddress() {
    this.busy = false;

    this.exchangeButton.resetState().setEnabled();

    const errMsg = this.translateService.instant('exchange.invalid-address-error');
    this.msgBarService.showError(errMsg);
  }

  // Inits the form.
  private createForm() {
    this.form = this.formBuilder.group({
      fromCoin: [this.defaultFromCoin, Validators.required],
      fromAmount: [this.defaultFromAmount, Validators.required],
      toAddress: ['', Validators.required],
    }, {
      validator: this.validate.bind(this),
    });

    this.subscriptionsGroup.push(this.form.get('fromCoin').valueChanges.subscribe(() => {
      this.updateActiveTradingPair();
    }));
  }

  // Loads the available trading pairs from the backend.
  private loadData() {
    this.subscriptionsGroup.push(this.exchangeService.tradingPairs()
      .pipe(retryWhen(errors => concat(errors.pipe(delay(2000), take(10)), observableThrowError(''))))
      .subscribe(pairs => {
        this.tradingPairs = [];

        // Use only the trading pairs which include the wallet coin.
        pairs.forEach(pair => {
          if (pair.to === this.toCoin) {
            this.tradingPairs.push(pair);
          }
        });

        this.updateActiveTradingPair();
        this.updatePrices();
      }, () => {
        this.problemGettingPairs = true;
      }),
    );
  }

  // Periodically updates the value of each trading pair indicating how many coins will be
  // received per coin sent.
  private updatePrices() {
    this.removePriceUpdateSubscription();

    this.priceUpdateSubscription = of(1).pipe(delay(60000), mergeMap(() => this.exchangeService.tradingPairs()),
      retryWhen(errors => errors.pipe(delay(60000))))
      .subscribe(pairs => {
        pairs.forEach(pair => {
          if (pair.to === this.toCoin) {
            const alreadySavedPair = this.tradingPairs.find(oldPair => oldPair.from === pair.from);
            if (alreadySavedPair) {
              alreadySavedPair.price = pair.price;
            }
          }
        });
        this.updatePrices();
      });
  }

  // Updates the var with the currently selected trading pair.
  private updateActiveTradingPair() {
    this.activeTradingPair = this.tradingPairs.find(p => {
      return p.from === this.form.get('fromCoin').value;
    });

    if (!this.activeTradingPair && this.tradingPairs.length > 0) {
      this.activeTradingPair = this.tradingPairs[0];
      this.form.get('fromCoin').setValue(this.activeTradingPair.from);
    }
  }

  // Validates the form.
  private validate(group: FormGroup) {
    if (!group || !this.activeTradingPair) {
      return { invalid: true };
    }

    const fromAmount = group.get('fromAmount').value;

    if (isNaN(fromAmount)) {
      return { invalid: true };
    }

    // The value is included in the error to show it on the UI.
    if (fromAmount < this.activeTradingPair.min || fromAmount === '') {
      return { min: this.activeTradingPair.min };
    }

    if (fromAmount > this.activeTradingPair.max) {
      return { max: this.activeTradingPair.max };
    }

    const parts = (fromAmount as string).split('.');

    if (parts.length > 1 && parts[1].length > 6) {
      return { decimals: true };
    }

    if (!this.agreement) {
      return { agreement: true };
    }

    return null;
  }

  private removeExchangeSubscription() {
    if (this.exchangeSubscription) {
      this.exchangeSubscription.unsubscribe();
    }
  }

  private removePriceUpdateSubscription() {
    if (this.priceUpdateSubscription) {
      this.priceUpdateSubscription.unsubscribe();
    }
  }
}

import { Component, Input, OnDestroy } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { SubscriptionLike } from 'rxjs';
import { first } from 'rxjs/operators';
import { BigNumber } from 'bignumber.js';

import { ChangeNoteComponent } from './change-note/change-note.component';
import { GeneratedTransaction, OldTransaction, OldTransactionTypes } from '../../../../../services/wallet-operations/transaction-objects';
import { PriceService } from '../../../../../services/price.service';
import { WalletsAndAddressesService } from '../../../../../services/wallet-operations/wallets-and-addresses.service';
import { getTransactionIconName } from '../../../../../utils/history-utils';
import { WalletBase } from '../../../../../services/wallet-operations/wallet-objects';
import { CoinTypes } from '../../../../../coins/coin-types';
import { CoinService } from '../../../../../services/coin.service';

/**
 * Allows to view the details of a transaction which is about to be sent or a transaction
 * from the history.
 */
@Component({
  selector: 'app-transaction-info',
  templateUrl: './transaction-info.component.html',
  styleUrls: ['./transaction-info.component.scss'],
})
export class TransactionInfoComponent implements OnDestroy {
  // Transaction which is going to be shown.
  @Input() transaction: GeneratedTransaction|OldTransaction;
  // True if the provided transaction was created to be sent, false if it is from the history.
  @Input() isPreview: boolean;
  // Current price per coin, in usd.
  price: number;
  showInputsOutputs = false;

  // If the user has more than one wallet.
  userHasMultipleWallets = false;
  // List with all the addresses the user has and their corresponding wallets.
  internalAddressesMap = new Map<string, WalletBase>();
  // If true, the currently selected coin includes coin hours.
  coinHasHours = false;
  // How many confirmations a transaction must have to be considered fully confirmed.
  confirmationsNeeded = 0;

  oldTransactionTypes = OldTransactionTypes;

  private subscription: SubscriptionLike;

  constructor(
    private priceService: PriceService,
    private dialog: MatDialog,
    walletsAndAddressesService: WalletsAndAddressesService,
    coinService: CoinService,
  ) {
    this.subscription = this.priceService.price.subscribe(price => this.price = price);

    this.coinHasHours = coinService.currentCoinInmediate.coinType === CoinTypes.Fiber;
    this.confirmationsNeeded = coinService.currentCoinInmediate.confirmationsNeeded;

    // Get the list of internal addresses, to be able to identify them on the UI.
    walletsAndAddressesService.currentWallets.pipe(first()).subscribe(wallets => {
      this.userHasMultipleWallets = wallets.length > 1;
      wallets.forEach(wallet => {
        wallet.addresses.forEach(address => {
          this.internalAddressesMap.set(address.address, wallet);
        });
      });
    });
  }

  // Returns the transaction as an OldTransaction instance, to avoid problems with the compiler.
  get oldTransaction(): OldTransaction {
    if (!this.isPreview) {
      return this.transaction as OldTransaction;
    } else {
      return null;
    }
  }

  // Gets the text which says what was done with the moved coins (if were received, sent or moved).
  get hoursText(): string {
    if (!this.isPreview) {
      if ((this.transaction as OldTransaction).type === OldTransactionTypes.Incoming) {
        return 'tx.hours-received';
      } else if ((this.transaction as OldTransaction).type === OldTransactionTypes.Outgoing) {
        return 'tx.hours-sent';
      }

      return 'tx.hours-moved';
    } else {
      return 'tx.hours-sent';
    }
  }

  // Gets the amount of moved hours.
  get sentOrReceivedHours(): BigNumber {
    return this.isPreview ?
      (this.transaction as GeneratedTransaction).hoursToSend :
      (this.transaction as OldTransaction).hoursBalance;
  }

  // If the UI must show the coins received icon (true) or the coins sent icon (false).
  get shouldShowIncomingIcon(): boolean {
    return !this.isPreview && (this.transaction as OldTransaction).type !== OldTransactionTypes.Outgoing;
  }

  // Returns how many coins were moved.
  get balanceToShow(): BigNumber {
    return this.isPreview ?
      (this.transaction as GeneratedTransaction).coinsToSend :
      (this.transaction as OldTransaction).balance;
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  // Makes visible the list of the inputs and outputs.
  toggleInputsOutputs(event) {
    event.preventDefault();

    this.showInputsOutputs = !this.showInputsOutputs;
  }

  // Opens the modal window for editing the note of the transaction.
  editNote() {
    ChangeNoteComponent.openDialog(this.dialog, this.transaction as OldTransaction).afterClosed().subscribe(newNote => {
      if (newNote || newNote === '') {
        this.transaction.note = newNote;
      }
    });
  }

  // Gets the name of the icon that should be shown.
  getTransactionIconName(transaction: OldTransaction): string {
    if (!this.isPreview) {
      return getTransactionIconName(transaction);
    } else {
      return 'sent';
    }
  }
}

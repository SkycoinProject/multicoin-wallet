import { Component, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import { HwWalletService } from './services/hw-wallet.service';
import { HwPinDialogComponent } from './components/layout/hardware-wallet/hw-pin-dialog/hw-pin-dialog.component';
import { Bip39WordListService } from './services/bip39-word-list.service';
import { HwConfirmTxDialogComponent } from './components/layout/hardware-wallet/hw-confirm-tx-dialog/hw-confirm-tx-dialog.component';
import { HwWalletPinService } from './services/hw-wallet-pin.service';
import { HwWalletSeedWordService } from './services/hw-wallet-seed-word.service';
import { LanguageService } from './services/language.service';
import { MsgBarComponent } from './components/layout/msg-bar/msg-bar.component';
import { MsgBarService } from './services/msg-bar.service';
import { SeedWordDialogComponent } from './components/layout/seed-word-dialog/seed-word-dialog.component';
import { SelectLanguageComponent } from './components/layout/select-language/select-language.component';
import { CoinService } from './services/coin.service';
import { AppUpdateService } from './services/app-update.service';
import { NodeService } from './services/node.service';
import { BlockchainService } from './services/blockchain.service';
import { NetworkService } from './services/network.service';
import { OperatorService } from './services/operators.service';
import { FiberOperatorsGenerator } from './services/coin-specific/fiber/fiber-operators-generator';
import { BtcOperatorsGenerator } from './services/coin-specific/btc/btc-operators-generator';
import { EthOperatorsGenerator } from './services/coin-specific/eth/eth-operators-generator';

/**
 * Main component for the app.
 */
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit {
  // Single MsgBarComponent instance used on the app.
  @ViewChild('msgBar') msgBar: MsgBarComponent;

  // If the app content must be shown. Used when the coin is changed, to remove the content
  // for a short moment to force the pages to be deleted and created again.
  showContent = false;

  constructor(
    private languageService: LanguageService,
    private dialog: MatDialog,
    private msgBarService: MsgBarService,
    nodeService: NodeService,
    hwWalletService: HwWalletService,
    hwWalletPinService: HwWalletPinService,
    hwWalletSeedWordService: HwWalletSeedWordService,
    bip38WordList: Bip39WordListService,
    coinService: CoinService,
    appUpdateService: AppUpdateService,
    blockchainService: BlockchainService,
    networkService: NetworkService,
    operatorService: OperatorService,
  ) {
    coinService.initialize();
    operatorService.initialize(new FiberOperatorsGenerator(), new BtcOperatorsGenerator(), new EthOperatorsGenerator());

    // When the coin is changed, remove the content for 3 frames, which forces the pages to be
    // recreated and gives time for the system vars to be resetted.
    coinService.currentCoin.subscribe(() => {
      this.showContent = false;
      setTimeout(() => {
        setTimeout(() => {
          setTimeout(() => {
            this.showContent = true;
          });
        });
      });
    });

    // Asign modal window classes to some services, to avoid circular references.
    hwWalletPinService.requestPinComponent = HwPinDialogComponent;
    hwWalletSeedWordService.requestWordComponent = SeedWordDialogComponent;
    hwWalletService.signTransactionConfirmationComponent = HwConfirmTxDialogComponent;

    bip38WordList.initialize();
    appUpdateService.initialize();
    nodeService.initialize();
    blockchainService.initialize();
    networkService.initialize();
  }

  ngOnInit() {
    this.languageService.initialize();

    // If the user has not selected the language for the first time, show the
    // language selection modal window.
    const subscription = this.languageService.savedSelectedLanguageLoaded.subscribe(savedSelectedLanguageLoaded => {
      if (!savedSelectedLanguageLoaded) {
        SelectLanguageComponent.openDialog(this.dialog, true);
      }

      subscription.unsubscribe();
    });

    setTimeout(() => {
      this.msgBarService.msgBarComponent = this.msgBar;
    });
  }
}

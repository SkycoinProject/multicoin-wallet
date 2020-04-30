import { Component, HostListener, ViewChild, ElementRef, OnInit, OnDestroy, Renderer2 } from '@angular/core';
import { MatDialogRef, MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { Subscription, fromEvent } from 'rxjs';
import { Overlay } from '@angular/cdk/overlay';
import { debounceTime, first } from 'rxjs/operators';

import { CoinService } from '../../../services/coin.service';
import { Coin } from '../../../coins/coin';
import { WalletsAndAddressesService } from '../../../services/wallet-operations/wallets-and-addresses.service';

/**
 * Data for the sections this component can show.
 */
class Section {
  /**
   * String to be used as the title of the section.
   */
  name: string;
  /**
   * Coins to show on the section.
   */
  coins: Coin[];
}

/**
 * Allows to change the currently selected coin. The process for changing the coin is
 * made internally.
 */
@Component({
  selector: 'app-select-coin-overlay',
  templateUrl: './select-coin-overlay.component.html',
  styleUrls: ['./select-coin-overlay.component.scss'],
})
export class SelectCoinOverlayComponent implements OnInit, OnDestroy {
  // Search field.
  @ViewChild('searchInput', { static: false }) private searchInput: ElementRef;
  private searchSuscription: Subscription;
  // Allows to know which coins have registered wallets.
  private coinsWithWallets = new Map<string, boolean>();

  // List with the sections this component must show.
  sections: Section[] = [];

  /**
   * Shows the overlay. Please use this function instead of opening the component "by hand".
   */
  public static openOverlay(dialog: MatDialog, renderer: Renderer2, overlay: Overlay): MatDialogRef<SelectCoinOverlayComponent, any> {
    // Remove the scroll bars of the main area of the app.
    renderer.addClass(document.body, 'no-overflow');

    const config = new MatDialogConfig();
    config.maxWidth = '100%';
    config.width = '100%';
    config.height = '100%';
    config.scrollStrategy = overlay.scrollStrategies.noop();
    config.disableClose = true;
    config.panelClass = 'transparent-background-dialog';
    config.backdropClass = 'clear-dialog-background';
    config.autoFocus = false;

    const componentRef = dialog.open(SelectCoinOverlayComponent, config);

    componentRef.afterClosed().subscribe(() => {
      // Restore the scroll bars of the main area of the app.
      renderer.removeClass(document.body, 'no-overflow');
    });

    return componentRef;
  }

  constructor(
    private dialogRef: MatDialogRef<SelectCoinOverlayComponent>,
    private coinService: CoinService,
    private walletsAndAddressesService: WalletsAndAddressesService,
  ) { }

  ngOnInit() {

    this.walletsAndAddressesService.allWallets.pipe(first()).subscribe(wallets => {
      // Check which coins have wallets.
      wallets.forEach(value => {
        this.coinsWithWallets.set(value.coin, true);
      });

      // Show all the coins.
      this.createSections(this.coinService.coins);
    });

    // Search as the user types.
    setTimeout(() => {
      this.searchSuscription = fromEvent(this.searchInput.nativeElement, 'keyup').pipe(debounceTime(500)).subscribe(() => this.search());
    });
  }

  // Filters the coins this component shows, using the search term entered by the user.
  search() {
    let coins: Coin[];
    const term: string = this.searchInput.nativeElement.value.trim().toLocaleUpperCase();

    if (term.length === 0) {
      coins = this.coinService.coins;
    } else {
      // Seach by name and symbol.
      coins = this.coinService.coins.filter((element) => element.coinName.toLocaleUpperCase().includes(term) || element.coinSymbol.toLocaleUpperCase().includes(term));
    }

    this.createSections(coins);
  }

  // Checks a list of coins, put them on the corresponding section and updates the array used for
  // showing the coins on the UI.
  createSections(coins: Coin[]) {
    // Create sections for coins with and without wallets.
    const withWallets: Section = {
      name: 'change-coin.with-wallet',
      coins: [],
    };
    const withoutWallets: Section = {
      name: 'change-coin.without-wallet',
      coins: [],
    };

    // Put the coins in the corresponding section.
    coins.forEach((coin: Coin) => {
      if (this.coinsWithWallets.has(coin.coinName)) {
        withWallets.coins.push(coin);
      } else {
        withoutWallets.coins.push(coin);
      }
    });

    // Add the sections to the UI, if there are coins in them.
    this.sections = [];
    if (withWallets.coins.length > 0) {
      this.sections.push(withWallets);
    }
    if (withoutWallets.coins.length > 0) {
      this.sections.push(withoutWallets);
    }
  }

  ngOnDestroy() {
    if (this.searchSuscription) {
      this.searchSuscription.unsubscribe();
    }
  }

  // Close if the esc key is pressed.
  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.keyCode === 27) {
      this.close(null);
    }
  }

  /**
   * Closes the component.
   * @param result If provided, the coin on this param is set as the currently selected coin.
   */
  close(result: Coin | null) {
    if (result) {
      this.coinService.changeCoin(result);
    }

    this.dialogRef.close(result);
  }
}

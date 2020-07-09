import { Observable, BehaviorSubject, of, Subscription } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { Injectable, Injector } from '@angular/core';

import { WalletBase, AddressBase } from './wallet-objects';
import { CoinService } from '../coin.service';
import { FiberWalletsAndAddressesOperator } from '../coin-specific/fiber/fiber-wallets-and-addresses-operator';
import { WalletsAndAddressesOperator, LastAddress, CreateWalletArgs } from '../coin-specific/wallets-and-addresses-operator';
import { redirectToErrorPage } from '../../utils/errors';
import { OperatorService } from '../operators.service';
import { CoinTypes } from '../../coins/settings/coin-types';
import { BtcWalletsAndAddressesOperator } from '../coin-specific/btc/btc-wallets-and-addresses-operator';
import { EthWalletsAndAddressesOperator } from '../coin-specific/eth/eth-wallets-and-addresses-operator';

/**
 * Manages the list with the wallets and its addresses. It works like a CRUD for the wallet list,
 * so it does not contain functions for specific things, like changing the label of a wallet.
 */
@Injectable()
export class WalletsAndAddressesService {
  /**
   * Instance with the actual code for making most of the operations of this service. It is
   * specific for the currently selected coin.
   */
  private operator: WalletsAndAddressesOperator;
  /**
   * Temporal operators used only for loading all the wallets.
   */
  private tempOperators: WalletsAndAddressesOperator[];

  // List with all the wallets of all coins registered in the app. It is used for initializing
  // The operators.
  private walletsList: WalletBase[];
  // Indicates if the wallets have been loaded.
  private walletsAlreadyLoadedSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  // If the wallets have already been loaded.
  private walletsLoaded = false;

  private loadWalletsSubscription: Subscription;

  constructor(
    private coinService: CoinService,
    private injector: Injector,
    operatorService: OperatorService,
  ) {
    // Maintain the operator updated.
    operatorService.currentOperators.subscribe(operators => {
      if (operators) {
        this.operator = operators.walletsAndAddressesOperator;

        if (!this.walletsLoaded) {
          // Load the wallet list, which is needed for initializing the operator.
          this.loadWallets();
        } else {
          // Initialize the operator.
          this.operator.initialize(this.walletsList);
        }
      } else {
        this.operator = null;
      }
    });
  }

  /**
   * Allows to know if the wallets have been loaded.
   */
  get walletsAlreadyLoaded(): Observable<boolean> {
    return this.walletsAlreadyLoadedSubject.asObservable();
  }

  /**
   * Gets the complete wallet list. It emits every time the wallet list is updated. Please note
   * that if any value of the returned wallets is modified, the changes must be notified by
   * calling the informValuesUpdated function or the behavior will be indeterminate.
   */
  get allWallets(): Observable<WalletBase[]> {
    return this.operator.allWallets;
  }

  /**
   * Gets the list of the wallets for the currently selected coin. It emits every time the
   * wallet list is updated. Please note that if any value of the returned wallets is modified,
   * the changes must be notified by calling the informValuesUpdated function or the behavior
   * will be indeterminate.
   */
  get currentWallets(): Observable<WalletBase[]> {
    return this.operator.currentWallets;
  }

  /**
   * Adds one or more addresses to a wallet.
   * @param wallet Wallet to which the addresses will be added.
   * @param num Number of addresses to create.
   * @param password Wallet password, if the wallet is encrypted.
   * @returns An array with the newly created addresses.
   */
  addAddressesToWallet(wallet: WalletBase, num: number, password?: string): Observable<AddressBase[]> {
    return this.operator.addAddressesToWallet(wallet, num, password);
  }

  /**
   * Scans the addreses of a wallet, to find if there is an addreeses with transactions which is
   * not on the addresses list. If that happens, the last address with at least one transaction
   * and all the addresses that precede it in the deterministic generation order are added to
   * the wallet.
   * @param wallet Wallet to scan.
   * @param password Wallet password, if the wallet is encrypted.
   * @returns true if new addresses were added to the wallet, false otherwise.
   */
  scanAddresses(wallet: WalletBase, password?: string): Observable<boolean> {
    return this.operator.scanAddresses(wallet, password);
  }

  /**
   * Gets the next external address (change addresses are ignored) of a wallet.
   * If the last address of the wallet has already been used, a new address is automatically
   * created. It also updates the wallet on the wallet list with all the unknown new addresses it
   * may have on the node (if apply) and requests a balance update. It does not work with
   * deterministic wallets.
   * @param wallet Wallet to check.
   * @param password Passowrd of the wallet.
   * @returns The next address of the wallet. If the wallet is encrypted, a new address must be
   * created and the password was not provided, null is returned.
   */
  getNextAddressAndUpdateWallet(wallet: WalletBase, password?: string): Observable<LastAddress> {
    return this.operator.getNextAddressAndUpdateWallet(wallet, password);
  }

  /**
   * Gets the last external address (change addresses are ignored) of a wallet.
   * It also updates the wallet on the wallet list with all the unknown new addresses it may have
   * on the node (if apply) and requests a balance update.
   * @param wallet Wallet to check.
   * @param checkUnused if false, the response will only include the address string, the usage
   * info will not be included.
   */
  getLastAddressAndUpdateWallet(wallet: WalletBase, checkUnused: boolean): Observable<LastAddress> {
    return this.operator.getLastAddressAndUpdateWallet(wallet, checkUnused);
  }

  /**
   * Updates a wallet on the wallet list with all the unknown new addresses it may have
   * on the node (if apply) and requests a balance update. A wallet may have additional
   * addresses on the node for multiple reasons, like the node adding them automatically as
   * expected with bip44 wallets and if the wallet was changed externally.
   * @param wallet Wallet to update.
   */
  updateWallet(wallet: WalletBase): Observable<void> {
    return this.operator.updateWallet(wallet);
  }

  /**
   * This function must be called when any value of a wallet is changed, to ensure the wallet
   * list is updated and to inform all the subscribers of the wallet list that there was a change.
   * @param wallet Object with all the properties of the wallet. Its ID must coincide with the
   * ID of one of the wallets of the wallet list or nothing will happen. Note that this object
   * is not directly saved on the wallet list, so you must always call this function after
   * making changes to a wallet.
   */
  informValuesUpdated(wallet: WalletBase) {
    this.operator.informValuesUpdated(wallet);
  }

  /**
   * Creates a new wallet. If creating a software wallet, the requiered params must be provided.
   * If creating a hardware wallet, it will be created with the data of the currently
   * connected device.
   * @param args Data for creating the wallet.
   * @returns The newly creatd wallet.
   */
  createWallet(args: CreateWalletArgs): Observable<WalletBase> {
    return this.operator.createWallet(args);
  }

  /**
   * Removes a wallet from the wallet list, if possible.
   * @param walletId Id of the wallet to be removed. If the ID is not on the wallet list or
   * is not for a hw wallet, nothing happens.
   */
  deleteWallet(walletId: string) {
    return this.operator.deleteWallet(walletId);
  }

  /**
   * Gets the saved wallets data and populates de wallet list with it.
   */
  private loadWallets(): void {
    // Cancel any previous operation. It is a precaution only for potential errors in case
    // the coin is changed before the list is obtained.
    if (this.loadWalletsSubscription) {
      this.loadWalletsSubscription.unsubscribe();

      this.tempOperators.forEach(val => {
        val.dispose();
      });
    }

    // Create one temporal operator for each coin.
    this.tempOperators = [];
    this.coinService.coins.forEach(coin => {
      if (coin.coinType === CoinTypes.Fiber) {
        this.tempOperators.push(new FiberWalletsAndAddressesOperator(this.injector, coin));
      } else if (coin.coinType === CoinTypes.BTC) {
        this.tempOperators.push(new BtcWalletsAndAddressesOperator(this.injector, coin));
      } else if (coin.coinType === CoinTypes.ETH) {
        this.tempOperators.push(new EthWalletsAndAddressesOperator(this.injector, coin));
      }
    });

    // Load the wallets of every coin.
    this.loadWalletsSubscription = this.loadWalletsRecursively([], this.tempOperators).subscribe((wallets: WalletBase[]) => {
      this.walletsList = wallets;

      this.tempOperators.forEach(val => {
        val.dispose();
      });

      // Initialize the current operator.
      this.operator.initialize(this.walletsList);

      this.walletsLoaded = true;

      this.walletsAlreadyLoadedSubject.next(true);
    }, () => {
      // The error page will show error number 2.
      redirectToErrorPage(2);
    });
  }

  /**
   * Recursively loads the wallets of different coins.
   * @param currentWallets Array with the wallets that have already been loaded. Should be empty
   * when calling this function externally.
   * @param operators Array with operators for every coin. The operators will be used for loading
   * the wallets. After finishing using one, it will be cleaned and removed from the array.
   * @returns An array with all the loaded wallets.
   */
  private loadWalletsRecursively(currentWallets: WalletBase[], operators: WalletsAndAddressesOperator[]): Observable<WalletBase[]> {
    return operators[operators.length - 1].loadWallets().pipe(mergeMap((wallets: WalletBase[]) => {
      currentWallets = wallets.concat(currentWallets);

      // Clean and remove the operator.
      operators.pop().dispose();

      if (operators.length > 0) {
        return this.loadWalletsRecursively(currentWallets, operators);
      } else {
        return of(currentWallets);
      }
    }));
  }

  /**
   * Takes an address string and applies to it the correct format for the currently
   * selected coin. Some addresses can only be represented in one way, but others,
   * like ETH addresses and Bech32 addreeses, can be represented in different
   * ways, so this function makes all those addresses have a consistent format, so it
   * is posible to show then in an optimal way or compare them in a safe way. However,
   * if possible, try not to use this function for comparing addresses, but instead use the
   * comparison function of AddressBase or the AddressMap object.
   */
  get formatAddress(): (address: string) => string {
    return this.operator.formatAddress;
  }
}

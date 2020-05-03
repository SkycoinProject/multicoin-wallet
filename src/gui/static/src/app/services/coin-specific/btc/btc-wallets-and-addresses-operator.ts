import { of, Observable, Subscription, ReplaySubject } from 'rxjs';
import { mergeMap, map } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { Injector } from '@angular/core';

import { HwWalletService } from '../../hw-wallet.service';
import { WalletBase, AddressBase, duplicateWalletBase, WalletTypes } from '../../wallet-operations/wallet-objects';
import { redirectToErrorPage } from '../../../utils/errors';
import { StorageService, StorageType } from '../../storage.service';
import { Coin } from '../../../coins/coin';
import { WalletsAndAddressesOperator, LastAddress, CreateWalletArgs } from '../wallets-and-addresses-operator';
import { BtcApiService } from '../../api/btc-api.service';

/**
 * Operator for WalletsAndAddressesService to be used with btc-like coins.
 *
 * NOTE: still under heavy development.
 *
 * You can find more information about the functions and properties this class implements by
 * checking WalletsAndAddressesOperator and WalletsAndAddressesService.
 */
export class BtcWalletsAndAddressesOperator implements WalletsAndAddressesOperator {
  /**
   * Key used for saving the hw wallet list in persistent storage. NOTE: the value is changed
   * in the code to make it unique for the current coin.
   */
  private hwWalletsDataStorageKey = 'hw-wallets';

  // List with all the wallets of all coins and the subject used for informing when the list
  // has been modified.
  private walletsList: WalletBase[];
  private walletsSubject: ReplaySubject<WalletBase[]> = new ReplaySubject<WalletBase[]>(1);
  // List with the wallets of the currently selected coin.
  private currentWalletsList: WalletBase[];
  private currentWalletsSubject: ReplaySubject<WalletBase[]> = new ReplaySubject<WalletBase[]>(1);

  private walletsSubscription: Subscription;
  private savingHwWalletDataSubscription: Subscription;

  // Coin the current instance will work with.
  private currentCoin: Coin;

  // Services used by this operator.
  private hwWalletService: HwWalletService;
  private storageService: StorageService;

  constructor(injector: Injector, currentCoin: Coin) {
    // Get the services.
    this.hwWalletService = injector.get(HwWalletService);
    this.storageService = injector.get(StorageService);

    // Save the coin which will be used by this operator and change the persistent storage vars
    // to correspond to the selected coin.
    this.currentCoin = currentCoin;
    this.hwWalletsDataStorageKey = this.hwWalletsDataStorageKey + '-' + currentCoin.coinName;
  }

  initialize(wallets: WalletBase[]) {
    this.walletsList = wallets;

    // When the list with all the wallets is updated, the list with the wallets for the current
    // coin is updated too.
    this.walletsSubscription = this.walletsSubject.subscribe(() => {
      this.currentWalletsList = this.walletsList.filter(wallet => wallet.coin === this.currentCoin.coinName);
      this.currentWalletsSubject.next(this.currentWalletsList);
    });

    this.informDataUpdated();
  }

  dispose() {
    if (this.savingHwWalletDataSubscription) {
      this.savingHwWalletDataSubscription.unsubscribe();
    }
    if (this.walletsSubscription) {
      this.walletsSubscription.unsubscribe();
    }

    this.walletsSubject.complete();
    this.currentWalletsSubject.complete();
  }

  get allWallets(): Observable<WalletBase[]> {
    return this.walletsSubject.asObservable();
  }

  get currentWallets(): Observable<WalletBase[]> {
    return this.currentWalletsSubject.asObservable();
  }

  addAddressesToWallet(wallet: WalletBase, num: number, password?: string): Observable<AddressBase[]> {
    return of(null);
  }

  scanAddresses(wallet: WalletBase, password?: string): Observable<boolean> {
    return of(null);
  }

  getNextAddressAndUpdateWallet(wallet: WalletBase, password?: string): Observable<LastAddress> {
    return of(null);
  }

  getLastAddressAndUpdateWallet(wallet: WalletBase, checkUnused: boolean): Observable<LastAddress> {
    return of(null);
  }

  updateWallet(wallet: WalletBase): Observable<void> {
    return of(null);
  }

  informValuesUpdated(wallet: WalletBase) {
    const affectedWalletIndex = this.walletsList.findIndex(w => w.id === wallet.id);
    if (affectedWalletIndex === -1) {
      return;
    }
    if (this.walletsList[affectedWalletIndex].coin !== this.currentCoin.coinName) {
      return;
    }

    // Create a duplicate of the provided wallet and save it on the wallet list.
    const newWallet = duplicateWalletBase(wallet, true);
    this.walletsList[affectedWalletIndex] = newWallet;

    // Save if needed and inform the changes.
    if (wallet.isHardware) {
      this.saveHardwareWalletsAndInformUpdate();
    } else {
      this.informDataUpdated();
    }
  }

  createWallet(args: CreateWalletArgs): Observable<WalletBase> {
    return of(null);
  }

  deleteWallet(walletId: string) {
    const index = this.walletsList.findIndex(w => w.id === walletId);
    if (index === -1 || !this.walletsList[index].isHardware) {
      return;
    }

    this.walletsList.splice(index, 1);
    this.saveHardwareWalletsAndInformUpdate();
  }

  /**
   * Saves on persistent storage the data of the hw wallets on the wallet list for the current
   * coin. It overwrites the previously saved data. It also calls informDataUpdated().
   */
  private saveHardwareWalletsAndInformUpdate() {
    const hardwareWallets: WalletBase[] = [];

    this.currentWalletsList.map(wallet => {
      if (wallet.isHardware) {
        hardwareWallets.push(this.createHardwareWalletData(
          wallet.label,
          wallet.addresses.map(address => {
            return { address: address.address, confirmed: address.confirmed };
          }),
          wallet.hasHwSecurityWarnings,
          wallet.stopShowingHwSecurityPopup,
        ));
      }
    });

    // Cancel any previous saving operation.
    if (this.savingHwWalletDataSubscription) {
      this.savingHwWalletDataSubscription.unsubscribe();
    }

    // The data is saved as a JSON string.
    this.savingHwWalletDataSubscription =
      this.storageService.store(StorageType.CLIENT, this.hwWalletsDataStorageKey, JSON.stringify(hardwareWallets))
        .subscribe(null, () => redirectToErrorPage(3));

    this.informDataUpdated();
  }

  /**
   * Helper function for creating a WalletBase object for a hw wallet.
   */
  private createHardwareWalletData(label: string, addresses: AddressBase[], hasHwSecurityWarnings: boolean, stopShowingHwSecurityPopup: boolean): WalletBase {
    return {
      label: label,
      id: '',
      hasHwSecurityWarnings: hasHwSecurityWarnings,
      stopShowingHwSecurityPopup: stopShowingHwSecurityPopup,
      addresses: addresses,
      encrypted: false,
      isHardware: true,
      walletType: WalletTypes.Deterministic,
      coin: this.currentCoin.coinName,
    };
  }

  loadWallets(): Observable<WalletBase[]> {
    let wallets: WalletBase[] = [];

    // Do not get software wallets for now.
    let softwareWalletsStep: Observable<WalletBase[]> = of([]);

    // Get the software wallets.
    return softwareWalletsStep.pipe(mergeMap((response: any[]) => {
      wallets = response;

      // Get the hardware wallets.
      if (this.hwWalletService.hwWalletCompatibilityActivated) {
        return this.loadHardwareWallets();
      }

      return of([]);
    }), map((hardwareWallets: WalletBase[]) => {
      // Hw wallets are first on the list.
      return hardwareWallets.concat(wallets);
    }));
  }

  /**
   * Loads all the hw wallets saved on persistent storage.
   * @returns The list of hw wallets.
   */
  private loadHardwareWallets(): Observable<WalletBase[]> {
    return this.storageService.get(StorageType.CLIENT, this.hwWalletsDataStorageKey).pipe(
      map(storedWallets => {
        if (storedWallets) {
          const loadedWallets: WalletBase[] = JSON.parse(storedWallets);

          // Prepare to remove all unexpected properties, which could have been saved in a
          // previous version of the app.
          const knownPropertiesMap = new Map<string, boolean>();
          const referenceObject = new WalletBase();
          Object.keys(referenceObject).forEach(property => {
            knownPropertiesMap.set(property, true);
          });

          loadedWallets.forEach(wallet => {
            // Remove all unexpected properties.
            const propertiesToRemove: string[] = [];
            Object.keys(wallet).forEach(property => {
              if (!knownPropertiesMap.has(property)) {
                propertiesToRemove.push(property);
              }
            });
            propertiesToRemove.forEach(property => {
              delete wallet[property];
            });

            // The wallet must be identified as a hw wallet and have at least one address.
            // This is just a precaution.
            wallet.isHardware = true;
            if (!wallet.addresses) {
              wallet.addresses = [{ address: 'invalid', confirmed: false, }];
            }

            // If the value was not retrieved, it means that the wallet was saved with a previous
            // version of the app, which only used the Deterministic type for hw wallets.
            if (!wallet.walletType) {
              wallet.walletType = WalletTypes.Deterministic;
            }

            wallet.coin = this.currentCoin.coinName;

            wallet.id = this.getHwWalletID(wallet.addresses[0].address);
          });

          return loadedWallets;
        }

        return [];
      }),
    );
  }

  /**
   * Returns the ID a hw wallet must use.
   * @param firstAddress First address of the wallet.
   */
  private getHwWalletID(firstAddress: string): string {
    return this.currentCoin.coinName + '-' + firstAddress;
  }

  /**
   * Makes walletsSubject emit, to inform that the wallet list has been updated.
   */
  private informDataUpdated() {
    this.walletsSubject.next(this.walletsList);
  }
}

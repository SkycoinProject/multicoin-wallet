import { of, Observable, Subscription, ReplaySubject, throwError } from 'rxjs';
import { mergeMap, map } from 'rxjs/operators';
import { Injector } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import BigNumber from 'bignumber.js';

import { HwWalletService } from '../../hw-wallet.service';
import { WalletBase, AddressBase, duplicateWalletBase, WalletTypes, AddressMap } from '../../wallet-operations/wallet-objects';
import { redirectToErrorPage, processServiceError } from '../../../utils/errors';
import { StorageService, StorageType } from '../../storage.service';
import { Coin } from '../../../coins/coin';
import { WalletsAndAddressesOperator, LastAddress, CreateWalletArgs } from '../wallets-and-addresses-operator';
import { AppConfig } from '../../../app.config';
import { BlockbookApiService } from '../../api/blockbook-api.service';

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
  /**
   * Key used for saving the software wallet list in persistent storage. At this state it is only
   * for testing. NOTE: the value is changed in the code to make it unique for the current coin.
   */
  private swWalletsDataStorageKey = 'sw-wallets';

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
  private blockbookApiService: BlockbookApiService;
  private translate: TranslateService;

  constructor(injector: Injector, currentCoin: Coin) {
    // Get the services.
    this.hwWalletService = injector.get(HwWalletService);
    this.storageService = injector.get(StorageService);
    this.blockbookApiService = injector.get(BlockbookApiService);
    this.translate = injector.get(TranslateService);

    // Save the coin which will be used by this operator and change the persistent storage vars
    // to correspond to the selected coin.
    this.currentCoin = currentCoin;
    this.hwWalletsDataStorageKey = this.hwWalletsDataStorageKey + '-' + currentCoin.coinName;
    this.swWalletsDataStorageKey = this.swWalletsDataStorageKey + '-' + currentCoin.coinName;
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
    if (!args.isHardwareWallet) {
      // Not implemented.
      return of(null);
    } else {
      return this.createHardwareWallet();
    }
  }

  /**
   * Adds a new hardware wallet to the wallets list, with the data of the currently connected device.
   * @returns The newly created wallet.
   */
  private createHardwareWallet(): Observable<WalletBase> {
    let addresses: string[];
    let id: string;

    // Ask the device to return as many addresses as set on AppConfig.maxHardwareWalletAddresses.
    return this.hwWalletService.getAddresses(AppConfig.maxHardwareWalletAddresses, 0, this.currentCoin.skywalletCoinType).pipe(mergeMap(response => {
      addresses = response.rawResponse;
      id = this.getHwWalletID(addresses[0]);

      // Throw an error if any wallet has the same ID.
      let walletAlreadyExists = false;
      this.walletsList.forEach(wallet => {
        if (wallet.id === id) {
          walletAlreadyExists = true;
        }
      });
      if (walletAlreadyExists) {
        return throwError(processServiceError('The wallet already exists'));
      }

      // Create a copy of the address list and check if any of them already has transactions.
      const addressesToCheck = addresses.map(a => a);

      return this.recursivelyGetIfUsed(addressesToCheck);
    }), map(response => {
      // Get the index of the last address of the list with transaction.
      let lastAddressWithTx = 0;
      addresses.forEach((address, i) => {
        if (response.get(address)) {
          lastAddressWithTx = i;
        }
      });

      const newWallet = this.createHardwareWalletData(
        this.translate.instant('hardware-wallet.general.default-wallet-name'),
        addresses.slice(0, lastAddressWithTx + 1).map(add => {
          const newAddress = AddressBase.create(this.formatAddress, add);
          newAddress.confirmed = false;

          return newAddress;
        }), true, false,
      );

      newWallet.id = id;

      // Add the wallet just after the last hw wallet of the wallet list.
      let lastHardwareWalletIndex = this.walletsList.length - 1;
      for (let i = 0; i < this.walletsList.length; i++) {
        if (!this.walletsList[i].isHardware) {
          lastHardwareWalletIndex = i - 1;
          break;
        }
      }
      this.walletsList.splice(lastHardwareWalletIndex + 1, 0, newWallet);
      this.saveHardwareWalletsAndInformUpdate();

      return newWallet;
    }));
  }

  /**
   * Checks if the provided addresses have been used (received coins).
   * @param addresses Addresses to check. The list will be altered by the function.
   * @param currentElements Already obtained data. For internal use.
   * @returns A map with the addresses as key and a value indicating if the address has
   * already been used.
   */
  private recursivelyGetIfUsed(addresses: string[], currentElements = new AddressMap<boolean>(this.formatAddress)): Observable<AddressMap<boolean>> {
    if (addresses.length === 0) {
      return of(currentElements);
    }

    // Get the basic state of the address.
    return this.blockbookApiService.get(this.currentCoin.indexerUrl, 'address/' + addresses[addresses.length - 1], {details: 'basic'})
      .pipe(mergeMap((response) => {
        // Check if the addresses has received coins.
        const received = response.totalReceived ? new BigNumber(response.totalReceived) : new BigNumber(0);
        currentElements.set(addresses[addresses.length - 1], received.isGreaterThan(0));

        addresses.pop();

        if (addresses.length === 0) {
          return of(currentElements);
        }

        // Continue to the next step.
        return this.recursivelyGetIfUsed(addresses, currentElements);
      }));
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

    this.walletsList.map(wallet => {
      if (wallet.coin === this.currentCoin.coinName && wallet.isHardware) {
        hardwareWallets.push(this.createHardwareWalletData(
          wallet.label,
          wallet.addresses.map(address => {
            const newAddress = AddressBase.create(this.formatAddress, address.printableAddress);
            newAddress.confirmed = address.confirmed;

            return newAddress;
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

    // Get the software wallets.
    return this.loadSoftwareWallets().pipe(mergeMap((response: any[]) => {
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
              const newAddress = AddressBase.create(this.formatAddress, 'invalid');
              newAddress.confirmed = false;
              wallet.addresses = [newAddress];
            }

            // If an address was saved with the old format, convert it to the new one.
            for (let i = 0; i < wallet.addresses.length; i++) {
              if (wallet.addresses[i]['address']) {
                const confirmed = wallet.addresses[i].confirmed;
                const isChangeAddress = wallet.addresses[i].isChangeAddress;

                wallet.addresses[i] = AddressBase.create(this.formatAddress, wallet.addresses[i]['address']);
                wallet.addresses[i].confirmed = confirmed;
                wallet.addresses[i].isChangeAddress = isChangeAddress;
              }
            }

            // If the value was not retrieved, it means that the wallet was saved with a previous
            // version of the app, which only used the Deterministic type for hw wallets.
            if (!wallet.walletType) {
              wallet.walletType = WalletTypes.Deterministic;
            }

            wallet.coin = this.currentCoin.coinName;

            wallet.id = this.getHwWalletID(wallet.addresses[0].printableAddress);
          });

          return loadedWallets;
        }

        return [];
      }),
    );
  }

  /**
   * Loads all the software wallets saved on the persistent storage. At this state is only
   * for testing.
   */
  private loadSoftwareWallets(): Observable<WalletBase[]> {
    return this.storageService.get(StorageType.CLIENT, this.swWalletsDataStorageKey).pipe(
      map(storedWallets => {
        if (storedWallets) {
          let loadedWallets: WalletBase[] = JSON.parse(storedWallets);

          loadedWallets = loadedWallets.filter(wallet => wallet.coin === this.currentCoin.coinName);
          loadedWallets.forEach(wallet => {
            // The wallet must be identified as a software wallet and have at least one address.
            // This is just a precaution.
            wallet.isHardware = false;
            if (!wallet.addresses) {
              const newAddress = AddressBase.create(this.formatAddress, 'invalid');
              newAddress.confirmed = true;
              wallet.addresses = [newAddress];
            }

            // If an address was saved with the old format, convert it to the new one.
            for (let i = 0; i < wallet.addresses.length; i++) {
              if (wallet.addresses[i]['address']) {
                const confirmed = wallet.addresses[i].confirmed;
                const isChangeAddress = wallet.addresses[i].isChangeAddress;

                wallet.addresses[i] = AddressBase.create(this.formatAddress, wallet.addresses[i]['address']);
                wallet.addresses[i].confirmed = confirmed;
                wallet.addresses[i].isChangeAddress = isChangeAddress;
              }
            }
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

  formatAddress(address: string): string {
    address = address.trim();
    if (address.toLowerCase().startsWith('bc1') || address.toLowerCase().startsWith('tb1')) {
      address = address.toLowerCase();
    }

    return address;
  }
}

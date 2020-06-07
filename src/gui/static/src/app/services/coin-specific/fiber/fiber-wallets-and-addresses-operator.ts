import { of, Observable, throwError as observableThrowError, Subscription, ReplaySubject } from 'rxjs';
import { mergeMap, map } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { Injector } from '@angular/core';

import { HwWalletService } from '../../hw-wallet.service';
import { AppConfig } from '../../../app.config';
import { WalletBase, AddressBase, duplicateWalletBase, WalletTypes } from '../../wallet-operations/wallet-objects';
import { processServiceError, redirectToErrorPage } from '../../../utils/errors';
import { StorageService, StorageType } from '../../storage.service';
import { OldTransaction } from '../../wallet-operations/transaction-objects';
import { Coin } from '../../../coins/coin';
import { WalletsAndAddressesOperator, LastAddress, CreateWalletArgs, CreateSoftwareWalletArgs } from '../wallets-and-addresses-operator';
import { getTransactionsHistory, getIfAddressesUsed } from './utils/fiber-history-utils';
import { FiberApiService } from '../../api/fiber-api.service';

/**
 * Operator for WalletsAndAddressesService to be used with Fiber coins.
 *
 * NOTE: The compatibility with coins not being managed by the local node is extremely limited
 * at this time.
 *
 * You can find more information about the functions and properties this class implements by
 * checking WalletsAndAddressesOperator and WalletsAndAddressesService.
 */
export class FiberWalletsAndAddressesOperator implements WalletsAndAddressesOperator {
  /**
   * Key used for saving the hw wallet list in persistent storage. NOTE: the value is changed if
   * the wallets of the current coin are not managed by the local node.
   */
  private hwWalletsDataStorageKey = 'hw-wallets';
  /**
   * Key used for saving software wallet list in persistent storage. At this state it is only
   * for testing. NOTE: the value is changed if the wallets of the current coin are not managed
   * by the local node.
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
  private fiberApiService: FiberApiService;
  private hwWalletService: HwWalletService;
  private translate: TranslateService;
  private storageService: StorageService;

  /**
   * Processes the wallet data returned by the node API and converts it into a WalletBase instance.
   * @param wallet Wallet data returned by the node.
   * @param coinName Name of the coin that will be asigned to the wallet.
   */
  static processWallet(wallet: any, coinName: string): WalletBase {
    // Fill the properties related to the wallet itself.
    const processedWallet: WalletBase = {
      label: wallet.meta.label,
      id: wallet.meta.filename,
      addresses: [],
      encrypted: wallet.meta.encrypted,
      isHardware: false,
      hasHwSecurityWarnings: false,
      stopShowingHwSecurityPopup: true,
      walletType: wallet.meta.type,
      coin: coinName,
    };

    // Fill the addres list.
    if (wallet.entries) {
      processedWallet.addresses = (wallet.entries as any[]).map<AddressBase>((entry: any) => {
        const isChangeAddress = processedWallet.walletType !== WalletTypes.Deterministic ? (entry.change === 1) : false;

        return {
          address: entry.address,
          confirmed: true,
          isChangeAddress: isChangeAddress,
        };
      });
    }

    return processedWallet;
  }

  constructor(injector: Injector, currentCoin: Coin) {
    // Get the services.
    this.fiberApiService = injector.get(FiberApiService);
    this.hwWalletService = injector.get(HwWalletService);
    this.translate = injector.get(TranslateService);
    this.storageService = injector.get(StorageService);

    // Save the coin which will be used by this operator and change the persistent storage vars
    // to correspond to the selected coin, if needed.
    this.currentCoin = currentCoin;
    if (!currentCoin.isLocal) {
      this.hwWalletsDataStorageKey = this.hwWalletsDataStorageKey + '-' + currentCoin.coinName;
      this.swWalletsDataStorageKey = this.swWalletsDataStorageKey + '-' + currentCoin.coinName;
    }
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
    if (!wallet.isHardware) {
      // Software wallets managed by the local node.
      if (this.currentCoin.isLocal) {
        const params = new Object();
        params['id'] = wallet.id;
        params['num'] = num;
        if (password) {
          params['password'] = password;
        }

        // Add the addresses on the backend.
        return this.fiberApiService.post(this.currentCoin.nodeUrl, 'wallet/newAddress', params).pipe(map((response: any) => {
          // Find the affected wallet on the local list and add the addresses to it.
          const affectedWallet = this.walletsList.find(w => w.id === wallet.id);
          const newAddresses: AddressBase[] = [];
          (response.addresses as any[]).forEach(value => {
            const newAddress: AddressBase = {address: value, confirmed: true};
            newAddresses.push(newAddress);
            affectedWallet.addresses.push(newAddress);
          });

          this.informDataUpdated();

          return newAddresses;
        }));
      } else {
        // Software wallets not managed by the local node.

        // Not implemented.
        return of([]);
      }

    } else {
      // Generate the new addresses on the device.
      return this.hwWalletService.getAddresses(num, wallet.addresses.length, this.currentCoin.skywalletCoinType).pipe(map(response => {
        // Find the affected wallet on the local list and add the addresses to it.
        const affectedWallet = this.walletsList.find(w => w.id === wallet.id);
        const newAddresses: AddressBase[] = [];
        (response.rawResponse as any[]).forEach(value => {
          const newAddress: AddressBase = {address: value, confirmed: false};
          newAddresses.push(newAddress);
          affectedWallet.addresses.push(newAddress);
        });

        this.saveHardwareWalletsAndInformUpdate();

        return newAddresses;
      }));
    }
  }

  scanAddresses(wallet: WalletBase, password?: string): Observable<boolean> {
    if (!wallet.isHardware) {
      // Software wallets managed by the local node.
      if (this.currentCoin.isLocal) {
        const params = new Object();
        params['id'] = wallet.id;
        if (password) {
          params['password'] = password;
        }

        // Request the backend to scan the addresses.
        return this.fiberApiService.post(this.currentCoin.nodeUrl, 'wallet/scan', params).pipe(map((response: any) => {
          // Find the affected wallet on the local list and add the addresses to it.
          const affectedWallet = this.walletsList.find(w => w.id === wallet.id);
          const newAddresses: string[] = response.addresses;
          if (newAddresses && newAddresses.length > 0) {
            newAddresses.forEach(address => {
              affectedWallet.addresses.push({address: address, confirmed: true});
            });
            this.informDataUpdated();

            return true;
          } else {
            return false;
          }
        }));
      } else {
        // Software wallets not managed by the local node.

        // Not implemented.
        return of(false);
      }
    } else {
      // Not implemented.
      return of(false);
    }
  }

  getNextAddressAndUpdateWallet(wallet: WalletBase, password?: string): Observable<LastAddress> {
    if (!wallet.isHardware) {
      // Software wallets managed by the local node.
      if (this.currentCoin.isLocal) {
        if (wallet.walletType === WalletTypes.Deterministic) {
          throw new Error('Invalid wallet type.');
        }

        // Request the general info of the wallet, to get the updated address list.
        return this.fiberApiService.get(this.currentCoin.nodeUrl, 'wallet', { id: wallet.id }).pipe(mergeMap(walletData => {
          // Get the index of the last external address.
          const indexOfLast = this.getIndexOfLastExternalAddress(walletData.entries);

          // Check the transactions of the last external address.
          return this.fiberApiService.post(this.currentCoin.nodeUrl, 'transactions', {addrs: walletData.entries[indexOfLast].address});
        }), mergeMap(response => {
          if ((response as any[]).length === 0) {
            // If no new address is needed, complete the process for updating the wallet and
            // returning the address.
            return this.getLastAddressAndUpdateWallet(wallet, true);
          } else {
            if (!wallet.encrypted || password) {
              // Add one address and repeat the process.
              return this.addAddressesToWallet(wallet, 1, password).pipe(mergeMap(() => this.getNextAddressAndUpdateWallet(wallet, password)));
            } else {
              return of(null);
            }
          }
        }));
      } else {
        // Software wallets not managed by the local node.

        // Not implemented.
        return of(null);
      }
    } else {
      // Not implemented.
      return of(null);
    }
  }

  getLastAddressAndUpdateWallet(wallet: WalletBase, checkUnused: boolean): Observable<LastAddress> {
    if (!wallet.isHardware) {
      // Software wallets managed by the local node.
      if (this.currentCoin.isLocal) {
        const finalResponse: LastAddress = { lastAddress: '' };

        // Map with all the addreses which have already received coins.
        let usedMap = new Map<string, boolean>();

        let firstStep: Observable<Map<string, boolean>>;
        if (checkUnused) {
          // Get which addresses have been used.
          firstStep = getIfAddressesUsed(this.currentCoin, wallet, this.fiberApiService, this.storageService);
        } else {
          firstStep = of(undefined);
        }

        return firstStep.pipe(mergeMap(response => {
          if (checkUnused) {
            usedMap = response;
          }

          // Request the general info of the wallet, to get the updated address list.
          return this.fiberApiService.get(this.currentCoin.nodeUrl, 'wallet', { id: wallet.id });
        }), map(response => {

          // Get the index of the wallet on the wallet list.
          let indexOnTheList = -1;
          for (let i = 0; i < this.walletsList.length; i++) {
            if (this.walletsList[i].id === wallet.id) {
              indexOnTheList = i;
              break;
            }
          }

          if (indexOnTheList === -1) {
            throw new Error('Wallet not found.');
          }

          // Update the wallet and the balance.
          this.walletsList[indexOnTheList] = FiberWalletsAndAddressesOperator.processWallet(response, this.currentCoin.coinName);
          this.informDataUpdated();

          // Get the index of the last external address.
          const indexOfLastAddress = wallet.walletType !== WalletTypes.Deterministic ?
            this.getIndexOfLastExternalAddress(response.entries) : (response.entries as any[]).length - 1;

          finalResponse.lastAddress = response.entries[indexOfLastAddress].address;
          if (checkUnused) {
            // Check how many previous addresses are unused.
            let previousUnused = 0;
            (response.entries as any[]).forEach((address, i) => {
              if (i < indexOfLastAddress && (!address.change || address.change === 0) && (!usedMap.has(address.address) || !usedMap.get(address.address))) {
                previousUnused += 1;
              }
            });

            finalResponse.alreadyUsed = usedMap.has(finalResponse.lastAddress) && usedMap.get(finalResponse.lastAddress);
            finalResponse.previousUnusedAddresses = previousUnused;
          }

          return finalResponse;
        }));
      } else {
        // Software wallets not managed by the local node.

        // Not implemented.
        return of(null);
      }
    } else {
      // Not implemented.
      return of(null);
    }
  }

  updateWallet(wallet: WalletBase): Observable<void> {
    if (!wallet.isHardware) {
      // Software wallets managed by the local node.
      if (this.currentCoin.isLocal) {
        return this.getLastAddressAndUpdateWallet(wallet, false).pipe(map(() => null));
      } else {
        // Software wallets not managed by the local node.

        // Not implemented.
        return of(null);
      }
    } else {
      // Not implemented.
      return of(null);
    }
  }

  /**
   * Checks the address list of a wallet returned by the node API and returns the
   * index of the last address for receiving coins (change addresses are ignored).
   * It does not work with deterministic wallets.
   * @param unprocessedAddressList Address list, as returned by the node API.
   */
  private getIndexOfLastExternalAddress(unprocessedAddressList: any[]): number {
    let indexOfLast = -1;
    let childNumberOfLast = -1;
    unprocessedAddressList.forEach((address, i) => {
      if ((!address.change || address.change === 0) && address.child_number > childNumberOfLast) {
        childNumberOfLast = address.child_number;
        indexOfLast = i;
      }
    });

    if (indexOfLast === -1) {
      throw new Error('Unexpected error checking the wallet.');
    }

    return indexOfLast;
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
      // Software wallets managed by the local node.
      if (this.currentCoin.isLocal) {
        return this.createNodeSoftwareWallet(args.softwareWalletArgs);
      } else {
        // Software wallets not managed by the local node.

        // Not implemented.
        return of(null);
      }
    } else {
      return this.createHardwareWallet();
    }
  }

  /**
   * Adds a new wallet to the node and adds it to the wallets list.
   * @returns The newly creatd wallet.
   */
  private createNodeSoftwareWallet(args: CreateSoftwareWalletArgs): Observable<WalletBase> {
    // Sanitize the seed.
    args.seed = args.seed.replace(/(\n|\r\n)$/, '');

    // Build the params object for the API request.
    const params = {
      label: args.label ? args.label : 'undefined',
      scan: 100,
      type: args.type,
    };

    if (args.type === WalletTypes.XPub) {
      params['xpub'] = args.xPub;
    } else {
      params['seed'] = args.seed;
    }

    if (args.password) {
      params['password'] = args.password;
      params['encrypt'] = true;
    }

    if (args.type === WalletTypes.Bip44 && args.passphrase) {
      params['seed-passphrase'] = args.passphrase;
    }

    // Ask the node to create the wallet and return the data of the newly created wallet.
    return this.fiberApiService.post(this.currentCoin.nodeUrl, 'wallet/create', params).pipe(map(response => {
      const wallet: WalletBase = FiberWalletsAndAddressesOperator.processWallet(response, this.currentCoin.coinName);
      this.walletsList.push(wallet);

      this.informDataUpdated();

      return wallet;
    }));
  }

  /**
   * Adds a new hardware wallet to the wallets list, with the data of the currently connected device.
   * @returns The newly creatd wallet.
   */
  private createHardwareWallet(): Observable<WalletBase> {
    let addresses: string[];
    let lastAddressWithTx = 0;
    let id: string;
    const addressesMap: Map<string, boolean> = new Map<string, boolean>();
    const addressesWithTxMap: Map<string, boolean> = new Map<string, boolean>();

    // Ask the device to return as many addresses as set on AppConfig.maxHardwareWalletAddresses.
    return this.hwWalletService.getAddresses(AppConfig.maxHardwareWalletAddresses, 0, this.currentCoin.skywalletCoinType).pipe(mergeMap(response => {
      // Save all addresses in a map.
      addresses = response.rawResponse;
      addresses.forEach(address => {
        addressesMap.set(address, true);
      });

      id = this.getHwWalletID(addresses[0]);

      // Throw an error if any wallet has the same ID.
      let walletAlreadyExists = false;
      this.walletsList.forEach(wallet => {
        if (wallet.id === id) {
          walletAlreadyExists = true;
        }
      });
      if (walletAlreadyExists) {
        return observableThrowError(processServiceError('The wallet already exists'));
      }

      // Request the transaction history of all addresses.
      const addressesString = addresses.join(',');

      return this.fiberApiService.post(this.currentCoin.nodeUrl, 'transactions', { addrs: addressesString });
    }), map(response => {
      // Get the index of the last address of the list with transaction.
      response.forEach(tx => {
        tx.txn.outputs.forEach(output => {
          if (addressesMap.has(output.dst)) {
            addressesWithTxMap.set(output.dst, true);
          }
        });
      });
      addresses.forEach((address, i) => {
        if (addressesWithTxMap.has(address)) {
          lastAddressWithTx = i;
        }
      });

      const newWallet = this.createHardwareWalletData(
        this.translate.instant('hardware-wallet.general.default-wallet-name'),
        addresses.slice(0, lastAddressWithTx + 1).map(add => {
          return { address: add, confirmed: false };
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

    // Get the software wallets using the appropiate method.
    let softwareWalletsStep: Observable<WalletBase[]>;
    if (this.currentCoin.isLocal) {
      softwareWalletsStep = this.loadNodeWallets();
    } else {
      softwareWalletsStep = this.loadSoftwareWallets();
    }

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
   * Loads the software wallets managed by the local node.
   */
  private loadNodeWallets(): Observable<WalletBase[]> {
    // Request the list from the node.
    return this.fiberApiService.get(this.currentCoin.nodeUrl, 'wallets').pipe(map((response: any[]) => {
      const wallets: WalletBase[] = [];

      // Process each wallet and include it if appropiate.
      response.forEach(wallet => {
        const processedWallet = FiberWalletsAndAddressesOperator.processWallet(wallet, this.currentCoin.coinName);
        if (processedWallet.walletType === WalletTypes.Bip44 && AppConfig.bip44Enabled) {
          wallets.push(processedWallet);
        }
        if (processedWallet.walletType === WalletTypes.XPub && AppConfig.xPubEnabled) {
          wallets.push(processedWallet);
        }
        if (processedWallet.walletType === WalletTypes.Deterministic) {
          wallets.push(processedWallet);
        }
      });

      return wallets;
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
              wallet.addresses = [{ address: 'invalid', confirmed: true, }];
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
}

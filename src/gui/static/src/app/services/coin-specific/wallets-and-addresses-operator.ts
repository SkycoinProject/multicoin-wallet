import { Observable } from 'rxjs';

import { WalletBase, AddressBase, WalletTypes } from '../wallet-operations/wallet-objects';

/**
 * Last external address (ignoring change addresses) of a wallet.
 */
export interface LastAddress {
  /**
   * Address string.
   */
  lastAddress: string;
  /**
   * If the address has already been used (meaning that it has already received coins).
   */
  alreadyUsed?: boolean;
  /**
   * How many unused external addresses the wallet has before this one.
   */
  previousUnusedAddresses?: number;
}

/**
 * Data for the function for creating a wallet.
 */
export interface CreateWalletArgs {
  /**
   * If the wallet is from a hardware device.
   */
  isHardwareWallet: boolean;
  /**
   * If creating a software wallet, the required data for creating it.
   */
  softwareWalletArgs?: CreateSoftwareWalletArgs;
}

/**
 * Data needed for creating a software wallet.
 */
export interface CreateSoftwareWalletArgs {
  /**
   * Name given by the user to the wallet.
   */
  label: string;
  /**
   * Type of the wallet to create.
   */
  type: WalletTypes;
  /**
   * Wallet seed, if the selected type uses a seed.
   */
  seed: string;
  /**
   * Wallet password, if it will be encrypted, null otherwise.
   */
  password: string;
  /**
   * Passphrase for protecting the seed, if the selected type allows to use a passphrase.
   */
  passphrase: string;
  /**
   * xPub key, if the xPub type was selected.
   */
  xPub: string;
}

/**
 * Interface with the elements the operators for WalletsAndAddressesService must have.
 * Much of it is similar to WalletsAndAddressesService, so you can find more info in that class.
 */
export interface WalletsAndAddressesOperator {
  // Properties for getting access to the wallet lists. Documented on the service.
  allWallets: Observable<WalletBase[]>;
  currentWallets: Observable<WalletBase[]>;

  /**
   * Initilizes the operator, so it can start to be used.
   * @param wallets List with all the wallets of all coins registered in the app. Please make
   * sure of not changing the reference of the array, so that any modification made inside the
   * operation is reflected on the reference the service has.
   */
  initialize(wallets: WalletBase[]): void;
  /**
   * Makes the operator close all observables and run cleaning procedures. Must be called when
   * the operator is going to be replaced.
   */
  dispose(): void;

  // Functions for creating and modifying the wallets. Documented on the service.
  addAddressesToWallet(wallet: WalletBase, num: number, password?: string): Observable<AddressBase[]>;
  scanAddresses(wallet: WalletBase, password?: string): Observable<boolean>;
  getNextAddressAndUpdateWallet(wallet: WalletBase, password?: string): Observable<LastAddress>;
  getLastAddressAndUpdateWallet(wallet: WalletBase, checkUnused: boolean): Observable<LastAddress>;
  updateWallet(wallet: WalletBase): Observable<void>;
  informValuesUpdated(wallet: WalletBase);
  createWallet(args: CreateWalletArgs): Observable<WalletBase>;
  deleteWallet(walletId: string): void;
  formatAddress(address: string): string;

  /**
   * Loads the wallets of the coin configured when the operator was created. The wallet list will
   * be returned and won't be saved inside the operator, so you will still have to initialize
   * the operator. The wallet list will contain the hw wallets first.
   */
  loadWallets(): Observable<WalletBase[]>;
}

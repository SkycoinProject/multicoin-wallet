import BigNumber from 'bignumber.js';

import { Output } from './transaction-objects';

/**
 * This file contains the objects used to represent the wallets and addresses in the app.
 */

 /**
  * List with the different wallet types.
  */
export enum WalletTypes {
  Deterministic = 'deterministic',
  Bip44 = 'bip44',
  XPub = 'xpub',
}

// Base wallets
////////////////////////////////////////////////

/**
 * Basic wallet object with the most important properties.
 */
export class WalletBase {
  // NOTE: All properties must have an initial value or there could be problems creating duplicates.

  /**
   * Name used to identify the wallet.
   */
  label = '';
  /**
   * Unique ID of the wallet. In software wallets it is the name of the file and in hw
   * wallets it is the first address in printable format.
   */
  id = '';
  /**
   * Address list.
   */
  addresses: AddressBase[] = [];
  /**
   * If the wallet is encrypted with a password. Only valid for software wallets.
   */
  encrypted = false;
  /**
   * If it is a software wallet (false) or a hw wallet (true).
   */
  isHardware = false;
  /**
   * If the last time the wallet was checked there were security warning found. Only valid for
   * hw wallets.
   */
  hasHwSecurityWarnings = false;
  /**
   * If the user asked the app to stop blocking access to some functions by showing a security
   * popup when hasHwSecurityWarnings is true. Only valid for hw wallets.
   */
  stopShowingHwSecurityPopup = false;
  /**
   * Type of the wallet.
   */
  walletType: WalletTypes = WalletTypes.Deterministic;
  /**
   * Name of the coin this wallet belongs to.
   */
  coin = '';
}

/**
 * Special map type, specially created for using an address string as the key. As somme
 * addresses may be represented in different ways, with rules like "a" being equial to "A",
 * normal maps are not adequate when an address string is going to be used a the key, as
 * addresses from different sources may be represented in different ways, making a normal
 * map unable to retrieve the desired value. The special class takes care of that, ensuring
 * the desired data is retrieved even when using different representations of the same address.
 *
 * All available functions are equivalents for the same functions found in the Map class.
 */
export class AddressMap<T> {
  private baseMap = new Map<string, T>();
  private addressFormatter: (address: string) => string;

  /**
   * Creates an instance of AddressMap.
   * @param addressFormatter Function to apply to the addresses the format used by the currently
   * selected coin. Found in WalletsAndAddressesService or the appropiate operator.
   */
  constructor(addressFormatter: (address: string) => string) {
    this.addressFormatter = addressFormatter;
  }

  has(key: string): boolean {
    return this.baseMap.has(this.addressFormatter(key));
  }

  get(key: string): T {
    return this.baseMap.get(this.addressFormatter(key));
  }

  set(key: string, value: T) {
    this.baseMap.set(this.addressFormatter(key), value);
  }

  forEach(callbackfn: (value: T, key: string, map: Map<string, T>) => void): void {
    this.baseMap.forEach(callbackfn);
  }

  delete(key: string): void {
    this.baseMap.delete(key);
  }

  get size(): number {
    return this.baseMap.size;
  }
}

/**
 * Properties for AddressBase. It is a separated class to make it easier to perform
 * some operations.
 */
class AddressBaseProperties {
  // NOTE: All properties must have an initial value or there could be problems creating duplicates.
  protected addressFormatterInternal: (address: string) => string = null;
  protected printableAddressInternal = '';

  /**
   * If the address has been confirmed by the user on the hw wallet and can be shown on the UI.
   * Only valid if the address is in a hw wallet.
   */
  confirmed = false;
  /**
   * If the address is a change address. Only relevant for bip44 wallets.
   */
  isChangeAddress ? = false;
}

/**
 * Basic address object with the most important properties.
 */
export class AddressBase extends AddressBaseProperties {
  /**
   * Creates a new instance of AddressBase.
   * @param addressFormatter Function to apply to the addresses the format used by the currently
   * selected coin. Found in WalletsAndAddressesService or the appropiate operator.
   * @param addressString String with the address.
   */
  static create(addressFormatter: (address: string) => string, addressString = ''): AddressBase {
    const newInstance = new AddressBase();
    newInstance.addressFormatterInternal = addressFormatter;
    newInstance.printableAddressInternal = addressFormatter(addressString);

    return newInstance;
  }

  protected constructor() { super(); }

  /**
   * Address formater used for creating this instance.
   */
  get addressFormatter(): (address: string) => string { return this.addressFormatterInternal; }

  /**
   * Address string with optimal format for showing it in the UI. Some addresses can
   * only be represented in one way, but others, like ETH addresses and Bech32 addreeses, can be
   * represented in different ways. This property returns the address with a consistent format,
   * which may be different from the string used for creating the current instance, so it is
   * possible to use the value of this property to compare addresses, but as it would be needed
   * to make the comparation with another formatted address, which may make the code much more
   * difficult to read and maintain, it is recommended to use instead the compareAddress()
   * function available in this class or to use the AddressMap class, is a map is needed.
   */
  get printableAddress(): string { return this.printableAddressInternal; }

  /**
   * Compares an address with the one contained by this instance.
   * @param unformattedAddress Address to compare. If the address is of a type which may be
   * represented in different ways, this function takes care of processing it, so it is not
   * needed to format it before sending it to this function.
   */
  compareAddress(unformattedAddress: string): boolean {
    return this.addressFormatter(unformattedAddress as string) === this.printableAddress;
  }
}

/**
 * Creates a duplicate of a WalletBase object. If the provided wallet has properties which are not
 * part of WalletBase, those properties are removed.
 * @param wallet Object to duplicate.
 * @param duplicateAddresses If the addresses must be duplicated as instancies of AddressBase
 * (true) or if the address arrays must be returned empty (false).
 */
export function duplicateWalletBase(wallet: WalletBase, duplicateAddresses: boolean): WalletBase {
  const response = new WalletBase();
  Object.assign(response, wallet);
  removeAdditionalProperties(true, response);

  response.addresses = [];
  if (duplicateAddresses) {
    wallet.addresses.forEach(address => {
      response.addresses.push(duplicateAddressBase(address));
    });
  }

  return response;
}

/**
 * Creates a duplicate of a AddressBase object. If the provided address has properties which
 * are not part of AddressBase, those properties are removed.
 * @param address Object to duplicate.
 */
function duplicateAddressBase(address: AddressBase): AddressBase {
  const response = AddressBase.create(address.addressFormatter);
  Object.assign(response, address);
  removeAdditionalProperties(false, response);

  return response;
}

/**
 * Removes from an object all the properties which are not part of WalletBase or AddressBase.
 * @param useWalletBaseAsReference If true, only the properties of WalletBase will be keep; if
 * false, only the properties of AddressBase will be keep.
 * @param objectToClean Object to be cleaned.
 */
function removeAdditionalProperties(useWalletBaseAsReference: boolean, objectToClean: any) {
  const knownPropertiesMap = new Map<string, boolean>();
  const reference: Object = useWalletBaseAsReference ? new WalletBase() : new AddressBaseProperties();
  Object.keys(reference).forEach(property => {
    knownPropertiesMap.set(property, true);
  });

  const propertiesToRemove: string[] = [];
  Object.keys(objectToClean).forEach(property => {
    if (!knownPropertiesMap.has(property)) {
      propertiesToRemove.push(property);
    }
  });

  propertiesToRemove.forEach(property => {
    delete objectToClean[property];
  });
}

// Wallets with balance
////////////////////////////////////////////////

/**
 * Object with the basic data of a wallet and data about its balance.
 */
export class WalletWithBalance extends WalletBase {
  /**
   * Balance taking into account all transactions.
   */
  coins = new BigNumber(0);
  hours = new BigNumber(0);
  /**
   * Balance taking into account only the confirmed transactions.
   */
  confirmedCoins = new BigNumber(0);
  confirmedHours = new BigNumber(0);
  /**
   * Balance taking into account the confirmed transactions, minus all coins sent in
   * pending transacions.
   */
  availableCoins = new BigNumber(0);
  availableHours = new BigNumber(0);
  hasPendingCoins = false;
  hasPendingHours = false;
  addresses: AddressWithBalance[] = [];
}

/**
 * Object with the basic data of an address and data about its balance.
 */
export class AddressWithBalance extends AddressBase {
  public constructor() { super(); }

  coins = new BigNumber(0);
  hours = new BigNumber(0);
  confirmedCoins = new BigNumber(0);
  confirmedHours = new BigNumber(0);
  availableCoins = new BigNumber(0);
  availableHours = new BigNumber(0);
  hasPendingCoins = false;
  hasPendingHours = false;
}

/**
 * Creates a new WalletWithBalance instance with copies of the values of
 * a WalletBase object.
 */
export function walletWithBalanceFromBase(wallet: WalletBase): WalletWithBalance {
  const response = new WalletWithBalance();
  Object.assign(response, duplicateWalletBase(wallet, false));

  wallet.addresses.forEach(address => {
    response.addresses.push(addressWithBalanceFromBase(address));
  });

  return response;
}

/**
 * Creates a new AddressWithBalance instance with copies of the values of
 * an AddressBase object.
 */
function addressWithBalanceFromBase(address: AddressBase): AddressWithBalance {
  const response = new AddressWithBalance();
  Object.assign(response, duplicateAddressBase(address));

  return response;
}

// Wallets with outputs
////////////////////////////////////////////////

/**
 * Object with the basic data of a wallet and data about its unspent outputs.
 */
export class WalletWithOutputs extends WalletBase {
  addresses: AddressWithOutputs[] = [];
}

/**
 * Object with the basic data of an address and data about its unspent outputs.
 */
export class AddressWithOutputs extends AddressBase {
  public constructor() { super(); }

  outputs: Output[] = [];
}

/**
 * Creates a new WalletWithOutputs instance with copies of the values of
 * a WalletBase object.
 */
export function walletWithOutputsFromBase(wallet: WalletBase): WalletWithOutputs {
  const response = new WalletWithOutputs();
  Object.assign(response, duplicateWalletBase(wallet, false));

  wallet.addresses.forEach(address => {
    response.addresses.push(addressWithOutputsFromBase(address));
  });

  return response;
}

/**
 * Creates a new AddressWithOutputs instance with copies of the values of
 * an AddressBase object.
 */
function addressWithOutputsFromBase(address: AddressBase): AddressWithOutputs {
  const response = new AddressWithOutputs();
  Object.assign(response, duplicateAddressBase(address));

  return response;
}

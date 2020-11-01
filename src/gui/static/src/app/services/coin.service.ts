import { Injectable } from '@angular/core';
import { ReplaySubject, Observable } from 'rxjs';

import { Coin } from '../coins/coin';
import { environment } from '../../environments/environment';
import { AppConfig } from '../app.config';

/**
 * Allows to know which coins the wallet can work with and to change the currently selected coin.
 */
@Injectable()
export class CoinService {

  /**
   * Allows to know the currently selected coin.
   */
  get currentCoin(): Observable<Coin> {
    return this.currentCoinInternal.asObservable();
  }
  private currentCoinInternal: ReplaySubject<Coin> = new ReplaySubject<Coin>(1);

  /**
   * Allows to know the currently selected coin, as a synchronous value.
   */
  get currentCoinInmediate(): Coin {
    return this.currentCoinInmediateInternal;
  }
  private currentCoinInmediateInternal: Coin = null;

  /**
   * List with the coins the wallet can work with. Values must not be overwritten.
   */
  get coins(): Coin[] {
    return this.coinsInternal;
  }
  private coinsInternal: Coin[] = [];

  private readonly currentCoinStorageKey = 'currentCoin';
  private readonly confirmationsStorageKeyPrefix = 'confirmations_';

  /**
   * Makes the service load the data it needs to work.
   */
  initialize() {
    this.loadAvailableCoins();
    this.loadAndUseSelectedCoin();

    this.currentCoinInternal.subscribe(coin => {
      // Keep synchronous value up to date.
      this.currentCoinInmediateInternal = coin;
    });
  }

  /**
   * Changes the currently selected coin.
   */
  changeCoin(coin: Coin) {
    if (coin.coinName !== this.currentCoinInmediate.coinName) {
      this.currentCoinInternal.next(coin);
      this.saveCurrentCoin();
    }
  }

  updateConfirmationsNeeded(newNumber: number) {
    const convertedValue = Number(newNumber);
    if (convertedValue === NaN || convertedValue < 1) {
      throw new Error('Invalid number');
    }

    this.currentCoinInmediateInternal.confirmationsNeeded = newNumber;
    localStorage.setItem(this.confirmationsStorageKeyPrefix + this.currentCoinInmediate.coinName, newNumber.toString());

    this.currentCoinInternal.next(this.currentCoinInmediateInternal);
  }

  /**
   * Saves the name of the currently selected coin in persistent storage, to be abe to
   * select it again by default.
   */
  private saveCurrentCoin() {
    // Save on session storage to be able to have different coins on different tabs.
    sessionStorage.setItem(this.currentCoinStorageKey, this.currentCoinInmediate.coinName);
    // Save on persistent storage.
    localStorage.setItem(this.currentCoinStorageKey, this.currentCoinInmediate.coinName);
  }

  /**
   * Loads from the configuration file the list of the coins this wallet can work with.
   */
  private loadAvailableCoins() {
    // The names of the coins on the configuration file must be unique and only one coin can use
    // the local node.
    const Names = new Map<string, boolean>();
    let localFound = false;
    AppConfig.coins.forEach((value: Coin) => {
      if (value.isLocal) {
        if (localFound) {
          throw new Error('Invalid configuration: the local node can be used by one coin only.');
        } else {
          localFound = true;
          // If using electron, get the local node URL from it.
          if (window['electron']) {
            value.nodeUrl = window['electron'].getLocalServerUrl() + '/api/';
          }
        }
      }
      if (Names[value.coinName]) {
        throw new Error('Invalid configuration: more than one coin with the same name.');
      }
      if (value.normalConfirmationsNeeded < 1) {
        throw new Error('Invalid configuration: coins must request at least one confirmation.');
      }

      // Get how many confirmations the coin needs.
      const savedConfirmations = localStorage.getItem(this.confirmationsStorageKeyPrefix + value.coinName);
      if (!savedConfirmations) {
        value.confirmationsNeeded = value.normalConfirmationsNeeded;
      } else {
        value.confirmationsNeeded = value.normalConfirmationsNeeded;
        value.confirmationsNeeded = Number(savedConfirmations);
      }

      Names[value.coinName] = true;
    });

    // Get the coins, but ignore the dev only ones while running in production.
    this.coinsInternal = AppConfig.coins.filter((coin: Coin) => {
      if (environment.production) {
        return !coin.devOnly;
      } else {
        return true;
      }
    });

    // Sanitize the explorer URLs and the URL prefixes.
    this.coinsInternal.forEach(coin => {
      if (coin.explorerUrl && coin.explorerUrl.endsWith('/')) {
        coin.explorerUrl = coin.explorerUrl.substr(0, coin.explorerUrl.length - 1);
      }

      if (coin.uriSpecificatioPrefix && coin.uriSpecificatioPrefix.endsWith(':')) {
        coin.uriSpecificatioPrefix = coin.uriSpecificatioPrefix.substr(0, coin.uriSpecificatioPrefix.length - 1);
      }
    });
  }

  /**
   * Loads the coin saved as the last selected one and sets it as selected.
   */
  private loadAndUseSelectedCoin() {
    // First try to get the one saved on sessionStorage. If the wallet is open in more than
    // one tab, this allows to have a different coin selected in each tab.
    const sessionCoin = sessionStorage.getItem(this.currentCoinStorageKey);
    if (sessionCoin) {
      const retrievedCoin = this.tryToGetCoin(sessionCoin);

      if (retrievedCoin) {
        this.currentCoinInternal.next(retrievedCoin);

        return;
      }
    }

    // Try using the persistent storage.
    const coin = localStorage.getItem(this.currentCoinStorageKey);
    if (coin) {
      const retrievedCoin = this.tryToGetCoin(coin);

      if (retrievedCoin) {
        this.currentCoinInternal.next(retrievedCoin);

        return;
      }
    }

    const defaultCoin = this.tryToGetCoin('');
    this.currentCoinInternal.next(defaultCoin);
  }

  /**
   * Checks the list of available coins and tries to get the one with the provided name. If it
   * is not possible to find it, the function will try to get the default one or at least the
   * first one on the list.
   * @param name Name of the coin to find.
   */
  private tryToGetCoin(name: string): Coin {
    let coin: Coin;

    if (name) {
      coin = this.coins.find((c: Coin) => c.coinName === name);
    }
    if (!coin) {
      coin = this.coins.find((c: Coin) => c.coinName === AppConfig.defaultCoinName);
    }
    if (!coin) {
      coin = this.coins[0];
    }

    return coin;
  }
}

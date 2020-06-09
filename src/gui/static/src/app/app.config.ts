import { SkycoinCoin } from './coins/skycoin.coin';
import { TestCoin } from './coins/test.coin';
import { BtcCoin } from './coins/btc.coin';
import { EthCoin } from './coins/eth.coin';

export const AppConfig = {

  // General settings.
  ////////////////////////////////

  /**
   * If the wallet will allow to work with bip44 wallets.
   */
  bip44Enabled: true,
  /**
   * If the wallet will allow to work with xpub wallets.
   */
  xPubEnabled: true,
  /**
   * If true, the option for buying coins via the OTC service will be enabled.
   */
  otcEnabled: false,
  /**
   * How many coins the hw wallet can have.
   */
  maxHardwareWalletAddresses: 1,
  /**
   * Max gap of unused addresses a wallet can have between 2 used addresses before the user is
   * alerted about potential problems that could appear for restoring all addresses when loading
   * the wallet again using the seed.
   */
  maxAddressesGap: 20,
  /**
   * Normal size for some modal windows.
   */
  mediumModalWidth: '566px',

  // History settings for coins using Blockbook.
  ////////////////////////////////

  /**
   * Max number of transactions per address to retrieve when building the transaction history and
   * the user has few addresses, for performance reasons. Must not be more than 250.
   */
  maxTxPerAddressIfFewAddresses: 50,
  /**
   * Max number of transactions per address to retrieve when building the transaction history and
   * the user has many addresses, for performance reasons. Must not be more than 250.
   */
  maxTxPerAddressIfManyAddresses: 25,
  /**
   * Value wich will multiply maxTxPerAddressIfFewAddresses and maxTxPerAddressIfManyAddresses
   * to get the max number of transactions per address to retrieve if the user asks for
   * more transactions.
   */
  maxTxPerAddressMultiplier: 3,
  /**
   * Absolute max number of transactions per address that can be requested when building the
   * transaction history. Must be less than 1000 and more than
   * maxTxPerAddressIfFewAddresses * maxTxPerAddressMultiplier.
   */
  maxTxPerAddressAllowedByBackend: 300,
  /**
   * Max number of addresses considered as "few" while building the transaction history.
   */
  fewAddressesLimit: 7,

  // Hw wallet firmware.
  ////////////////////////////////

  /**
   * URL for checking the number of the most recent version of the Skywallet firmware.
   */
  urlForHwWalletVersionChecking: 'https://version.skycoin.com/skywallet/version.txt',
  /**
   * First part of the URL for donwnloading the lastest firmware for the Skywallet. The number of
   * the lastest version and '.bin' is added at the end of the value by the code.
   */
  hwWalletDownloadUrlAndPrefix: 'https://downloads.skycoin.com/skywallet/skywallet-firmware-v',
  /**
   * URL were the user can download the lastest version of the hw wallet daemon.
   */
  hwWalletDaemonDownloadUrl: 'https://www.skycoin.com/downloads/',

  // Wallet update.
  ////////////////////////////////

  /**
   * URL for checking the number of the most recent version of the wallet software.
   */
  urlForVersionChecking: 'https://version.skycoin.com/skycoin/version.txt',
  /**
   * URL were the user can download the lastest version of the wallet software.
   */
  walletDownloadUrl: 'https://www.skycoin.com/downloads/',

  // Coins.
  ////////////////////////////////

  /**
   * Array with the coins that will be available in the app.
   */
  coins: [
    new SkycoinCoin(),
    new TestCoin(),
    new BtcCoin(),
    new EthCoin(),
  ],

  /**
   * Name of the default coin.
   */
  defaultCoinName: 'Skycoin',

  // Translations.
  ////////////////////////////////

  /**
   * Array with the available translations. For more info check the readme file in the
   * folder with the translation files.
   */
  languages: [{
      code: 'en',
      name: 'English',
      iconName: 'en.png',
    },
    {
      code: 'zh',
      name: '中文',
      iconName: 'zh.png',
    },
    {
      code: 'es',
      name: 'Español',
      iconName: 'es.png',
    },
  ],

  /**
   * Default language used by the software.
   */
  defaultLanguage: 'en',
};

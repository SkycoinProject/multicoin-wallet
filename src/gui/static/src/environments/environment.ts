// The file contents for the current environment will overwrite these during build.
// The build system defaults to the dev environment which uses `environment.ts`, but if you do
// `ng build --env=prod` then `environment.prod.ts` will be used instead.
// The list of which env maps to which file can be found in `.angular-cli.json`.

export const environment = {
  nodeUrl: window['electron'] ? window['electron'].getLocalServerUrl() : '/api/',
  production: false,
  tellerUrl: '/teller/',
  isInE2eMode: false,
  /**
   * If true and while using non-fiber coins, the blockchain will always appear as synchronized
   * and no error will be shown if the node is not connected to other nodes.
   */
  ignoreNonFiberNetworIssues: true,

  // NOTE: the Swaplab integration currently works with Skycoin only.
  swaplab: {
    apiKey: 'w4bxe2tbf9beb72r', // if set to null, integration will be disabled
    activateTestMode: true,
    endStatusInError: false,
  },
};

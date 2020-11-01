export const environment = {
  nodeUrl: window['electron'] ? window['electron'].getLocalServerUrl() : '/api/',
  production: true,
  tellerUrl: 'https://event.skycoin.com/api/',
  isInE2eMode: false,
  ignoreNonFiberNetworIssues: false,

  // NOTE: the Swaplab integration currently works with Skycoin only.
  swaplab: {
    apiKey: 'w4bxe2tbf9beb72r', // if set to null, integration will be disabled
    activateTestMode: false,
    endStatusInError: false,
  },
};

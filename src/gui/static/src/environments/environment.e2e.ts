// This file is for the e2e tests ony.

export const environment = {
  nodeUrl: window['electron'] ? window['electron'].getLocalServerUrl() : '/api/',
  production: true,
  tellerUrl: '/teller/',
  isInE2eMode: true,
  ignoreNonFiberNetworIssues: false,

  // NOTE: the Swaplab integration currently works with Skycoin only.
  swaplab: {
    apiKey: 'w4bxe2tbf9beb72r', // if set to null, integration will be disabled
    activateTestMode: true,
    endStatusInError: false,
  },
};

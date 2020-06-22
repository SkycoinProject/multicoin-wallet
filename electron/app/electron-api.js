const { contextBridge, ipcRenderer } = require('electron')

// Allows to check the URL of the local node while using Electron, as the port number
// is selected randomly.

contextBridge.exposeInMainWorld('electron', {
    getLocalServerUrl: () => {
        return ipcRenderer.sendSync('localNodeUrl');
    }
});

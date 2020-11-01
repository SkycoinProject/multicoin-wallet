'use strict'

const { app, Menu, BrowserWindow, shell, session, ipcMain } = require('electron');
const path = require('path');
const childProcess = require('child_process');
const url = require('url');
const axios = require('axios');

// This adds refresh and devtools console keybindings
// Page can refresh with cmd+r, ctrl+r, F5
// Devtools can be toggled with cmd+alt+i, ctrl+shift+i, F12
require('electron-debug')({enabled: true, showDevTools: false});
require('electron-context-menu')({});

global.eval = function() { throw new Error('bad!!'); }

let splashLoaded = false

// Session of the current window.
let currentSession;
// Folder in which the local node saves the wallet files.
let walletsFolder = null;

// URLs for accessing the local node and the app contents.
let currentLocalNodeURL;
let currentLocalNodeHost;
let guiURL;
ipcMain.on('localNodeUrl', (event) => {
  event.returnValue = currentLocalNodeURL;
})

// Detect if the code is running with the "dev" arg. The "dev" arg is added when running npm
// start. If this is true, a local node will not be started, but one is expected to be running
// in 127.0.0.1:6420; also, the local web server will not be started, the contents served in
// http://localhost:4200 will be displayed and it will be allowed to reload the URLs using the
// Electron window, so that it is easier to test the changes made to the UI using npm start.
let dev = process.argv.find(arg => arg === 'dev') ? true : false;

// Basic settings.
app.commandLine.appendSwitch('ssl-version-fallback-min', 'tls1.2');
app.commandLine.appendSwitch('--no-proxy-server');
app.setAsDefaultProtocolClient('skycoin');
app.allowRendererProcessReuse = true;

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win;

// Local node and web server.
var skycoin = null;
let server = null;
const serverPort= 8412;

// It is only possible to make connections to hosts that are in this list.
var allowedHosts = new Map();
// Local server.
allowedHosts.set('127.0.0.1:' + serverPort, true);
// Skywallet daemon.
allowedHosts.set('127.0.0.1:9510', true);
// Price service.
allowedHosts.set('api.coinpaprika.com', true);
// For multiple operations.
allowedHosts.set('version.skycoin.com', true);
allowedHosts.set('downloads.skycoin.com', true);
if (dev) {
  // Local server while testing.
  allowedHosts.set('localhost:4200', true);
}

// Starts the local node.
function startSkycoin() {
  if (!dev) {
    console.log('Starting local node from Electron');

    if (skycoin) {
      console.log('Local node already running');
      app.emit('skycoin-ready');
      return;
    }

    // Resolve the local node binary location.
    var appPath = app.getPath('exe');
    var exe = (() => {
      switch (process.platform) {
        case 'darwin':
          return path.join(appPath, '../../Resources/app/skycoin');
        case 'win32':
          // Use only the relative path on windows due to short path length
          // limits
          return './resources/app/skycoin.exe';
        case 'linux':
          return path.join(path.dirname(appPath), './resources/app/skycoin');
        default:
          return './resources/app/skycoin';
      }
    })()

    // Start the local node.
    var args = [
      '-launch-browser=false',
      '-color-log=false', // must be disabled for web interface detection
      '-logtofile=true',
      '-download-peerlist=true',
      '-enable-all-api-sets=true',
      '-enable-api-sets=INSECURE_WALLET_SEED',
      '-disable-csrf=false',
      '-reset-corrupt-db=true',
      '-enable-gui=false',
      '-web-interface-port=0' // random port assignment
      // will break
      // broken (automatically generated certs do not work):
      // '-web-interface-https=true',
    ]
    skycoin = childProcess.spawn(exe, args);

    createWindow();

    // Print the local node messages and check for the local node URL.
    skycoin.stdout.on('data', (data) => {
      console.log(data.toString());
      if (currentLocalNodeURL) {
        return;
      }

      // String which is expected to precede the local node URL.
      const marker = 'Full address: ';
      // Get the local node URL.
      data.toString().split('\n').forEach(line => {
        if (line.indexOf(marker) !== -1) {
          setLocalNodeUrl(line.split(marker)[1].trim());

          var id = setInterval(function() {
            // Wait till the splash page loading is finished.
            if (splashLoaded) {
              app.emit('skycoin-ready', { url: currentLocalNodeURL });
              clearInterval(id);
            }
          }, 500);
        }
      });
    });
    skycoin.stderr.on('data', (data) => {
      console.log(data.toString());
    });

    // Close the app if there is a problem.
    skycoin.on('error', (e) => {
      console.log('Error starting the local node: ' + e);
      app.quit();
    });
    skycoin.on('close', (code) => {
      console.log('Local node closed');
      app.quit();
    });
    skycoin.on('exit', (code) => {
      console.log('Local node exited');
      app.quit();
    });
  } else {
    // If in dev mode, use 127.0.0.1:6420 as the local node. It must have been started before.
    setLocalNodeUrl('http://127.0.0.1:6420');
    app.emit('skycoin-ready', { url: currentLocalNodeURL });
  }
}

// Starts the local web server.
function startLocalServer() {
  if (!dev) {
    console.log('Starting the local server');

    if (server) {
      console.log('Server already running');
      return
    }

    // Resolve the server binary location.
    var appPath = app.getPath('exe');
    var exe = (() => {
      switch (process.platform) {
        case 'darwin':
          return path.join(appPath, '../../Resources/app/server')
        case 'win32':
          // User only the relative path on windows due to short path length
          // limits
          return './resources/app/server.exe';
        case 'linux':
          return path.join(path.dirname(appPath), './resources/app/server');
        default:
          return './resources/app/server';
      }
    })()

    // Get the path to the app files.
    var contentsPath = (() => {
      switch (process.platform) {
        case 'darwin':
          return path.join(appPath, '../../Resources/app/dist/')
        case 'win32':
          return path.join(path.dirname(appPath), './resources/app/dist/');
        case 'linux':
          return path.join(path.dirname(appPath), './resources/app/dist/');
        default:
          return './resources/app/dist/';
      }
    })()

    // Start the server
    server = childProcess.spawn(exe, ['-port=' + serverPort, '-path=' + contentsPath]);

    // Close the app if there is a problem.
    server.on('error', (e) => {
      console.log('Failed to start the local server: ' + e);
      app.quit();
    });
    server.on('close', (code) => {
      console.log('Local server closed');
      app.quit();
    });
    server.on('exit', (code) => {
      console.log('Local server exited');
      app.quit();
    });

    // Load the contents.
    guiURL = 'http://127.0.0.1:' + serverPort;
    win.loadURL(guiURL);
  } else {
    // If in dev mode, simply open the dev server URL. It must have been started before.
    guiURL = 'http://localhost:4200/';
    createWindow(guiURL);
  }
}

// Creates and configures the main app window.
function createWindow(urltoOpen) {
  // To fix appImage doesn't show icon in dock issue.
  var appPath = app.getPath('exe');
  var iconPath = (() => {
    switch (process.platform) {
      case 'linux':
        return path.join(path.dirname(appPath), './resources/icon512x512.png');
    }
  })()

  // Create the browser window.
  win = new BrowserWindow({
    width: 1200,
    height: 900,
    backgroundColor: '#000000',
    title: 'Skycoin Multicoin Wallet',
    icon: iconPath,
    nodeIntegration: false,
    webPreferences: {
      webgl: false,
      webaudio: false,
      contextIsolation: true,
      webviewTag: false,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      allowRunningInsecureContent: false,
      webSecurity: true,
      plugins: false,
      enableRemoteModule: false,
      preload: __dirname + '/electron-api.js',
    },
  });

  win.webContents.on('did-finish-load', function() {
    if (!splashLoaded) {
      splashLoaded = true;
    }
  });

  // patch out eval
  win.eval = global.eval;
  win.webContents.executeJavaScript('window.eval = 0;');

  currentSession = win.webContents.session
/*
  currentSession.clearCache().then(response => {
    console.log('Cleared the caching of the skycoin wallet.');
  });
  */

  // When an options request to a swaplab https endpoint is detected, asume that it is a cors
  // request and redirect it to an invalid endpoint on the node API.
  currentSession.protocol.registerHttpProtocol('https', (request, callback) => {
    if (request.method.toLowerCase().includes('options') && request.url.toLowerCase().includes('swaplab.cc')) {
      callback({ url: currentLocalNodeURL + '/api/v1/unused', method: 'get' });
    } else {
      callback({ url:request.url });
    }
  });

  // Block the connection if the URL is not in allowedHosts.
  currentSession.webRequest.onBeforeRequest((details, callback) => {
    // This if is needed for allowing the devtools to work.
    if (!details.url.startsWith('devtools://devtools')) {
      let requestUrl = details.url;
      if (details.url.startsWith('blob:')) {
        requestUrl = requestUrl.substr('blob:'.length, requestUrl.length - 'blob:'.length);
      }

      let requestHost = url.parse(requestUrl).host;
      if (!allowedHosts.has(requestHost)) {
        callback({cancel: true})
        return;
      }
    }
    callback({cancel: false})
  });

  // Configure some filters for special cases.
  configureFilters();

  // Open the url if it is already known. If not, open the loading page.
  if (urltoOpen) {
    win.loadURL(urltoOpen);
  } else {
    win.loadURL('file://' + __dirname + '/splash/index.html');
  }

  // Emitted when the window is closed.
  win.on('closed', () => {
    win = null;
  });

  // If in dev mode, allow to open URLs.
  if (!dev) {
    win.webContents.on('will-navigate', function(e, destinationUrl) {
      const requestHost = url.parse(destinationUrl).host;
      if (requestHost !== '127.0.0.1:' + serverPort) {
        e.preventDefault();
        require('electron').shell.openExternal(destinationUrl);
      }
    });
  }

  // Open links with target='_blank' in the default browser.
  win.webContents.on('new-window', function(e, url) {
    e.preventDefault();
    require('electron').shell.openExternal(url);
  });

  // Create the main menu.
  var template = [{
    label: 'Skycoin',
    submenu: [
      { label: 'Quit', accelerator: 'Command+Q', click: function() { app.quit(); } }
    ]
  }, {
    label: 'Edit',
    submenu: [
      { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
      { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
      { type: 'separator' },
      { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
      { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
      { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
      { label: 'Select All', accelerator: 'CmdOrCtrl+A', role: 'selectall' }
    ]
  }, {
    label: 'Show',
    submenu: [
      {
        label: 'Wallets folder',
        click: () => {
          if (walletsFolder) {
            shell.showItemInFolder(walletsFolder)
          } else {
            shell.showItemInFolder(path.join(app.getPath("home"), '.skycoin', 'wallets'));
          }
        },
      },
      {
        label: 'Logs folder',
        click: () => {
          if (walletsFolder) {
            shell.showItemInFolder(walletsFolder.replace('wallets', 'logs'))
          } else {
            shell.showItemInFolder(path.join(app.getPath("home"), '.skycoin', 'logs'));
          }
        },
      },
      {
        label: 'DevTools',
        accelerator: process.platform === 'darwin' ? 'Alt+Command+I' : 'Ctrl+Shift+I',
        click: (item, focusedWindow) => {
          if (focusedWindow) {
            focusedWindow.toggleDevTools();
          }
        }
      },
    ]
  }];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  session
    .fromPartition('')
    .setPermissionRequestHandler((webContents, permission, callback) => {
      return callback(false);
    });
}

// Makes the window correctly manage some special cases.
function configureFilters() {
  if (!currentSession) {
    return;
  }

  // URLs to check.
  const urls = ['https://swaplab.cc/*'];
  if (currentLocalNodeURL) {
    urls.push(currentLocalNodeURL + '/*');
  }

  // Use the origin headers expected by Swaplab and the local node.
  currentSession.webRequest.onBeforeSendHeaders({
    urls: urls
  }, (details, callback) => {
    if (details.url.indexOf('swaplab.cc') !== -1) {
      details.requestHeaders['origin'] = null;
      details.requestHeaders['referer'] = null;
      details.requestHeaders['host'] = null;
      details.requestHeaders['Origin'] = null;
      details.requestHeaders['Referer'] = null;
      details.requestHeaders['Host'] = null;
    } else {
      details.requestHeaders['origin'] = currentLocalNodeURL;
      details.requestHeaders['referer'] = currentLocalNodeURL;
      details.requestHeaders['host'] = currentLocalNodeHost;
    }

    callback({ requestHeaders: details.requestHeaders });
  })

  // Add the CORS headers needed for accessing Swaplab and the local node.
  currentSession.webRequest.onHeadersReceived({
    urls: urls
  }, (details, callback) => {
    const headers = details.responseHeaders;
    if (headers) {
      headers['Access-Control-Allow-Origin'] = '*';
      headers['Access-Control-Allow-Headers'] = '*';
    }
    const response = { responseHeaders: headers };

    // Options request are redirected in other part of this code to an invalid url, so the
    // status must be changed to 200 to simulate a good response.
    if (details.method.toLowerCase().includes('options')) {
      response['statusLine'] = '200';
    }

    callback(response);
  });
}

// Allow only one window.
const singleInstanceLockObtained = app.requestSingleInstanceLock()
if (!singleInstanceLockObtained) {
  app.quit()
  return;
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (win) {
      if (win.isMinimized()) {
        win.restore();
      }
      win.focus();
    } else {
      createWindow(guiURL);
    }
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', startSkycoin);

// Called when the local node is running and ready.
app.on('skycoin-ready', (e) => {
  // Start the local web server.
  startLocalServer();

  // Get the folder in which the local node saves the wallet files.
  axios
    .get(e.url + '/api/v1/wallets/folderName')
    .then(response => {
      walletsFolder = response.data.address;
    })
    .catch(() => {});
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createWindow(guiURL);
  }
});

app.on('will-quit', () => {
  if (skycoin) {
    skycoin.kill('SIGINT');
  }
});

app.on('web-contents-created', (event, contents) => {
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    // Strip away preload scripts if unused or verify their location is legitimate
    delete webPreferences.preload
    delete webPreferences.preloadURL

    // Disable Node.js integration
    webPreferences.nodeIntegration = false

    // Verify URL being loaded
    if (!params.src.startsWith(url)) {
      event.preventDefault();
    }
  });
});

// Populates currentLocalNodeURL and currentLocalNodeHost. It cleans the URL if needed and adds
// it to the list of allowed URLs (it also removes the previous value from the list, if needed).
// After finishing, configureFilters() is called, to make sure the new URL is processed correctly.
function setLocalNodeUrl(url) {
  if (currentLocalNodeHost) {
    allowedHosts.delete(currentLocalNodeHost);
  }

  currentLocalNodeURL = url;
  if (currentLocalNodeURL.endsWith('/')) {
    currentLocalNodeURL = currentLocalNodeURL.substr(0, currentLocalNodeURL.length - 1);
  }

  if (currentLocalNodeURL.startsWith('https://')) {
    currentLocalNodeHost = currentLocalNodeURL.substr(8);
  } else {
    currentLocalNodeHost = currentLocalNodeURL.substr(7);
  }
  
  allowedHosts.set(currentLocalNodeHost, true);
  configureFilters();
}

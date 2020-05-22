const PROXY_CONFIG = {
  "/swaplab": {
    "target": "https://swaplab.cc",
    "logLevel": "debug",
    "changeOrigin": true,
    pathRewrite: {'^/swaplab' : ''}
  },
  "/api": {
    "target": "http://127.0.0.1:6420",
    "secure": false,
    "logLevel": "debug",
    "bypass": function (req) {
      req.headers["host"] = '127.0.0.1:6420';
      req.headers["referer"] = 'http://127.0.0.1:6420';
      req.headers["origin"] = 'http://127.0.0.1:6420';
    }
  },
  "/local-btc": {
    "target": "http://127.0.0.1:18443/",
    "logLevel": "debug",
    "changeOrigin": true,
    pathRewrite: {'^/local-btc' : ''}
  },
  "/local-blockbook": {
    "target": "http://127.0.0.1:9130/",
    "logLevel": "debug",
    "changeOrigin": true,
    pathRewrite: {'^/local-blockbook' : ''}
  },
  "/teller/*": {
    "target": "http://127.0.0.1:7071",
    "pathRewrite": {
      "^/teller" : "api/"
    },
    "secure": true,
    "logLevel": "debug"
  }
};

module.exports = PROXY_CONFIG;

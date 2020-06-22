# Build system

The GUI client is an Electron (http://electron.atom.io/) app.

It cross compiles for osx, linux and windows 64 bit systems.

## Requirements

The Skycoin repository must be cloned in the parent directory.

gox (go cross compiler), node and npm.

### gox

To install gox:

```sh
go get github.com/gz-c/gox
```

### NPM

Node and npm installation is system dependent.

## Make sure that the wallet dist is up to date

Recompile the wallet frontend. See [Wallet GUI Development README](../src/gui/static/README.md) for instructions.

## Use electron-builder to pack and create app installer

Use this command for preparing the build process.

```sh
./perpare-build.sh
```

Then you can compile the version for the OS you need with any of these commands:

```sh
npm run dist-win32
npm run dist-win64
npm run dist-win
npm run dist-linux
npm run dist-mac
npm run dist-mac
```

Final results are placed in the `release` folder.

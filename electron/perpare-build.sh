#!/bin/bash

# Prepares the files needed for building the Electron release using npm.
# The app must have been already built with npm run build.

echo "Installing node modules"
npm install
cd app/
npm install
cd ..

echo
echo "==========================="
echo "Building the local web server"
build-server.sh

echo
echo "==========================="
echo "Building the local node"
GOX_OSARCH="linux/amd64 linux/arm windows/amd64 windows/386 darwin/amd64"
GOX_OUTPUT_DIR=".gox_output"
GOX_GUI_OUTPUT_DIR="${GOX_OUTPUT_DIR}/gui"
cd ../../skycoin/electron
CONFIG_MODE=STANDALONE_CLIENT ./gox.sh "$GOX_OSARCH" "$GOX_GUI_OUTPUT_DIR"
cp -R .gox_output ../../multicoin-wallet/electron/.gox_output

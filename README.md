## wasm-dummy

This is a toy repo to test/develop proper integration of wasm with typescript development:
- neat integration of emscripten buildchain
- automated wasm builds from npm
- proper distribution / bundling of wasm modules

Tested on linux.


### Usage

```bash
# clone repo
git clone https://github.com/jerch/wasm-dummy.git
cd wasm-dummy
# if you have a working emsdk v2, maybe place a symlink
ln -s /path/to/emsdk .
# install dependencies (pulls emsdk, if not symlinked)
yarn
```

Now things are ready to use, with `yarn start` browser support can be tested (see console.log).

### Wasm integration

Wasm C/C++ sources reside under `/wasm`. The main build script is `./build.sh`,
which coordinates compile settings and exports to typescript. The wasm binaries get wrapped
into a Typescript source file (as base64), which can be used normally from Typescript side (see `/src/index.js`).
The wasm integration itself is quite low level, it doesn't use any of emscripten's higher level interfaces,
instead simply uses exposed memory addresses and functions.

### Missing / Todo

- better ESM story for node package
- windows support
- better vscode integration (header resolution, build scripts)

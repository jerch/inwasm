#!/usr/bin/env bash

# some custom build steps (just calling wat2wasm for simplicity)
if [ -d "../node_modules/inwasm/node_modules/wabt/bin/" ]; then
  ../node_modules/inwasm/node_modules/wabt/bin/wat2wasm module.wat
else
  ../node_modules/wabt/bin/wat2wasm module.wat
fi

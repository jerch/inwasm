#!/usr/bin/env bash

# some custom build steps (just calling wat2wasm for simplicity)
../node_modules/inwasm/node_modules/wabt/bin/wat2wasm module.wat

#!/bin/bash

#################################
# compile time decoder settings #
#################################

# EMSCRIPTEN_PATH
# Path to your emscripten SDK.
EMSCRIPTEN_PATH=../emsdk/emsdk_env.sh

# CHUNK_SIZE
# Maximum size of a single chunk, that can be loaded into the decoder.
# This has only a tiny impact on the decoder speed, thus we can go with
# a rather low value (aligned with typical PIPE_BUF values).
# Use one of 2 ^ (12 .. 16).
CHUNK_SIZE=16384

# INITIAL_MEMORY
# This is the total memory the wasm instance will occupy.
# Always adjust this after changes to values above.
# If not enough memory was given, emscripten will throw a linking error.
# This can be used to spot the real usage and round it up to the next 64KiB multiple.
INITIAL_MEMORY=$((1 * 65536))


##################
# compile script #
##################

# activate emscripten env
source $EMSCRIPTEN_PATH

# simd variant
emcc -O3 \
-DCHUNK_SIZE=$CHUNK_SIZE \
-DUSE_SIMD=1 \
-s ASSERTIONS=0 \
-s SUPPORT_ERRNO=0 \
-s TOTAL_STACK=0 \
-s MALLOC=none \
-s INITIAL_MEMORY=$INITIAL_MEMORY \
-s MAXIMUM_MEMORY=$INITIAL_MEMORY \
-s DEFAULT_TO_CXX=0 \
-s EXPORTED_FUNCTIONS='[
  "_convert",
  "_chunk_addr",
  "_target_addr"
]' \
-msimd128 -msse -msse2 -mssse3 -msse4.1 -mbulk-memory -std=c99 -Wall -Wextra --no-entry convert.c -o convert-simd.wasm

# none simd variant (safari)
emcc -O3 \
-DCHUNK_SIZE=$CHUNK_SIZE \
-s ASSERTIONS=0 \
-s SUPPORT_ERRNO=0 \
-s TOTAL_STACK=16384 \
-s MALLOC=none \
-s INITIAL_MEMORY=$INITIAL_MEMORY \
-s MAXIMUM_MEMORY=$INITIAL_MEMORY \
-s DEFAULT_TO_CXX=0 \
-s EXPORTED_FUNCTIONS='[
  "_convert",
  "_chunk_addr",
  "_target_addr"
]' \
-mbulk-memory -std=c99 -Wall -Wextra --no-entry convert.c -o convert.wasm


#################################
# export settings to Typescript #
#################################

# export compile time settings
# The settings are evaluates by the script in /bin/wrap_wasm.js and
# expected to be in json format.
# Entries starting with BYTES* are handled as wasm files,
# that should be added to the typescript source file.
echo "{\"CHUNK_SIZE\": $CHUNK_SIZE, \"BYTES\": \"convert.wasm\", \"BYTES_SIMD\": \"convert-simd.wasm\"}" > settings.json

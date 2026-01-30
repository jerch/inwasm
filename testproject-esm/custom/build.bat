@echo off
IF exist ..\node_modules\inwasm\node_modules\wabt\bin\ (
    node ..\node_modules\inwasm\node_modules\wabt\bin\wat2wasm module.wat
) ELSE (
    node ..\node_modules\wabt\bin\wat2wasm module.wat
)

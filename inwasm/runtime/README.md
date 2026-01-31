## InWasm - Inline WebAssembly for Typescript.

This package contains the runtime only for inwasm. It separates the actual loading runtime
of built packages from the full inwasm package with the cli. For the full package see `inwasm`.

### Usage

For new packages install the runtime as normal dependency and the full inwasm package
as development dependency:

```bash
npm install inwasm-runtime      # provides InWasm() and type definitions 
npm install --save-dev inwasm   # provides inwasm cli for compiling
```

In your code use `inwasm-runtime` like this:

```typescript
// src/xy.wasm.ts
import { InWasm, OutputMode, OutputType } from 'inwasm-runtime';

const getAdder = InWasm({
  name: 'adder',
  type: OutputType.INSTANCE,
  mode: OutputMode.SYNC,
  srctype: 'C',
  exports: {
    add: (a: number, b: number) => 0
  },
  code: `
    int add(int a, int b) {
      return a + b;
    }`
});
const adder = getAdder();

// use the wasm instance:
console.log(adder.exports.add(23, 42));
```

### Distribution

The compiled package can be distributed normally. On install it will only pull
the runtime instead of the full inwasm package.

declare let describe: any;
declare let it: any;


/**
 * Hack around mocha definitions for internal tests.
 *
 * This should not be used for general purpose testing with InWasm declarations,
 * instead place inline wasm definitions in separate module to be processed by
 * `inwasm` upfront, then test functionality in additional test modules.
 */
export function applyMochaShim() {
  if (typeof describe === 'undefined') {
    (global as any).describe = (s: string, f: Function) => f();
  }
  if (typeof it === 'undefined') {
    (global as any).it = (s: string, f: Function) => f();
  }
}

/**
 * Output type of `InWasm`.
 * Determines whether to return bytes, a wasm module or a wasm instance.
 * Returns for async corresponding promises.
 */
export const enum OutputType {
  INSTANCE = 0,
  MODULE = 1,
  BYTES = 2
}


/**
 * Whether `InWasm` returns the requested type sync or async (promise).
 * Note that synchronous processing of wasm modules/instances is highly restricted
 * in browsers' main JS context (works only reliable in nodejs or a web worker).
 */
export const enum OutputMode {
  ASYNC = 0,
  SYNC = 1
}


/**
 * Wasm source definition, holds all relevant compiler info.
 */
export interface IWasmDefinition {
  // Name of the wasm target, should be unique.
  name: string;
  // Type determines, whether to provide bytes | module | instance at runtime.
  type: OutputType;
  // Sync (discouraged) vs. async wasm bootstrapping at runtime.
  mode: OutputMode,
  // Exported wasm functions, for proper TS typing simply stub them.
  exports: { [key: string]: Function | WebAssembly.Global | WebAssembly.Memory };
  // Name of the env import object (must be visible at runtime). Only used for OutputType.INSTANCE.
  imports?: WebAssembly.Imports;
  memoryDescriptor?: WebAssembly.MemoryDescriptor;
  // whether to treat `code` below as C or C++ source.
  srctype: 'C' | 'C++' | 'Clang-C' | 'Zig' | 'wat' | 'custom' | 'Rust';
  // custom compiler settings
  compile?: {
    // Custom cmdline defines, e.g. {ABC: 123} provided as -DABC=123 to the compiler.
    defines?: { [key: string]: string | number };
    // Additional include paths, should be absolute. (TODO...)
    include?: string[];
    // Additional source files (copied over). (TODO...)
    sources?: string[];
    // FIXME: check support for -lxy with wasm
    //libs?: string[],
    // Custom cmdline switches, overriding any from above. (TODO...)
    switches?: string[];
  };
  customRunner?: CompilerRunner;
  // Inline source code (C or C++).
  code: string
}
export interface IWasmDefinitionSync extends IWasmDefinition {
  mode: OutputMode.SYNC
}
export interface IWasmDefinitionAsync extends IWasmDefinition {
  mode: OutputMode.ASYNC
}
export interface IWasmDefinitionSyncBytes extends IWasmDefinitionSync {
  type: OutputType.BYTES;
}
export interface IWasmDefinitionSyncModule extends IWasmDefinitionSync {
  type: OutputType.MODULE;
}
export interface IWasmDefinitionSyncInstance extends IWasmDefinitionSync {
  type: OutputType.INSTANCE;
}
export interface IWasmDefinitionAsyncBytes extends IWasmDefinitionAsync {
  type: OutputType.BYTES;
}
export interface IWasmDefinitionAsyncModule extends IWasmDefinitionAsync {
  type: OutputType.MODULE;
}
export interface IWasmDefinitionAsyncInstance extends IWasmDefinitionAsync {
  type: OutputType.INSTANCE;
}


// dummy type to carry forward definition type info on BYTES
export interface IWasmBytes<T extends IWasmDefinition> extends Uint8Array { }

// dummy type to carry forward definition type info on MODULE
export interface IWasmModule<T extends IWasmDefinition> extends WebAssemblyExtended.Module { }

// extends WebAssembly.Instance with proper exports typings
// FIXME: needs better memory story (not always exported)
export interface IWasmInstance<T extends IWasmDefinition> extends WebAssemblyExtended.Instance {
  exports: T['exports'];
}

// Type helper to infer wasm definition from BYTES, MODULE and INSTANCE manually.
export type ExtractDefinition<Type> = Type extends IWasmBytes<infer X> ? X
  : Type extends Promise<IWasmBytes<infer X>> ? X
  : Type extends IWasmModule<infer X> ? X
  : Type extends Promise<IWasmModule<infer X>> ? X
  : Type extends IWasmInstance<infer X> ? X
  : Type extends Promise<IWasmInstance<infer X>> ? X
  : never;

// Respone overload to carry definition forward
export interface IWasmResponse<T extends IWasmDefinition> extends Response {}


/**
 * Overload WebAssembly namespace with extended type information.
 */
export declare namespace WebAssemblyExtended {
  interface CompileError extends Error {
  }

  var CompileError: {
      prototype: CompileError;
      new(): CompileError;
  };

  interface Global {
      value: any;
      valueOf(): any;
  }

  var Global: {
      prototype: Global;
      new(descriptor: GlobalDescriptor, v?: any): Global;
  };

  interface Instance {
      readonly exports: Exports;
  }

  var Instance: {
      prototype: Instance;
      new<T>(
        module: (T extends IWasmDefinition ? IWasmModule<T> : Module),
        importObject?: Imports
      ): (T extends IWasmDefinition ? IWasmInstance<T> : Instance);
  };

  interface LinkError extends Error {
  }

  var LinkError: {
      prototype: LinkError;
      new(): LinkError;
  };

  interface Memory {
      readonly buffer: ArrayBuffer;
      grow(delta: number): number;
  }

  var Memory: {
      prototype: Memory;
      new(descriptor: MemoryDescriptor): Memory;
  };

  interface Module {
  }

  var Module: {
      prototype: Module;
      new<T>(bytes: (T extends IWasmDefinition ? IWasmBytes<T> : BufferSource)):
        (T extends IWasmDefinition ? IWasmModule<T> : Module);
      customSections(moduleObject: Module, sectionName: string): ArrayBuffer[];
      exports(moduleObject: Module): ModuleExportDescriptor[];
      imports(moduleObject: Module): ModuleImportDescriptor[];
  };

  interface RuntimeError extends Error {
  }

  var RuntimeError: {
      prototype: RuntimeError;
      new(): RuntimeError;
  };

  interface Table {
      readonly length: number;
      get(index: number): any;
      grow(delta: number, value?: any): number;
      set(index: number, value?: any): void;
  }

  var Table: {
      prototype: Table;
      new(descriptor: TableDescriptor, value?: any): Table;
  };

  interface GlobalDescriptor {
      mutable?: boolean;
      value: ValueType;
  }

  interface MemoryDescriptor {
      initial: number;
      maximum?: number;
      shared?: boolean;
  }

  interface ModuleExportDescriptor {
      kind: ImportExportKind;
      name: string;
  }

  interface ModuleImportDescriptor {
      kind: ImportExportKind;
      module: string;
      name: string;
  }

  interface TableDescriptor {
      element: TableKind;
      initial: number;
      maximum?: number;
  }

  interface WebAssemblyInstantiatedSource {
      instance: Instance;
      module: Module;
  }

  interface IWasmInstantiatedSource<T extends IWasmDefinition> {
    instance: IWasmInstance<T>;
    module: IWasmModule<T>;
  }

  type ImportExportKind = "function" | "global" | "memory" | "table";
  type TableKind = "anyfunc" | "externref";
  type ValueType = "anyfunc" | "externref" | "f32" | "f64" | "i32" | "i64";
  type ExportValue = Function | Global | Memory | Table;
  type Exports = Record<string, ExportValue>;
  type ImportValue = ExportValue | number;
  type Imports = Record<string, ModuleImports>;
  type ModuleImports = Record<string, ImportValue>;

  function compile<T>(bytes: (T extends IWasmDefinition ? IWasmBytes<T> : BufferSource)):
    (T extends IWasmDefinition ? Promise<IWasmModule<T>> : Promise<Module>);

  function compileStreaming<T>(
    source: (T extends IWasmDefinition ? IWasmResponse<T> | PromiseLike<IWasmResponse<T>> : Response | PromiseLike<Response>)
  ): (T extends IWasmDefinition ? Promise<IWasmModule<T>> : Promise<Module>);

  function instantiate<T>(
    bytes: (T extends IWasmDefinition ? IWasmBytes<T> : BufferSource),
    importObject?: Imports
  ): (T extends IWasmDefinition ? Promise<IWasmInstantiatedSource<T>> : Promise<WebAssemblyInstantiatedSource>);

  function instantiate<T>(
    moduleObject: (T extends IWasmDefinition ? IWasmModule<T> : Module),
    importObject?: Imports
  ): (T extends IWasmDefinition ? Promise<IWasmInstance<T>> : Promise<Instance>);

  function instantiateStreaming<T>(
    source: (T extends IWasmDefinition ? IWasmResponse<T> | PromiseLike<IWasmResponse<T>> : Response | PromiseLike<Response>),
    importObject?: Imports
  ): (T extends IWasmDefinition ? Promise<IWasmInstantiatedSource<T>> : Promise<WebAssemblyInstantiatedSource>);

  function validate(bytes: BufferSource): boolean;
}

// compiler runner
export type CompilerRunner = (def: IWasmDefinition, buildDir: string, filename: string, memorySettings: IMemorySettings) => Uint8Array;

// memory settings extracted from wasm definition
export interface IMemorySettings {
  /**
   * Memory descriptor as derived from the wasm definition.
   * Might be undefined in case, no memory directive was found in wasm definition.
   * Not using any memory directive is discouraged, as it has several drawbacks:
   * - real allocated memory at runtime is compiler dependent (undefined behavior for inwasm)
   * - memory tends to be much bigger than really needed (runtime penalty)
   * - memory is still exposed in exports, but not properly typed anymore 
   */
  descriptor?: WebAssembly.MemoryDescriptor;
  /** Whether the memory is imported or exported. */
  mode: 'imported' | 'exported';
}


// tiny compile ctx for inwasm
export interface _IWasmCtx {
  // adds definition for compile evaluation and raises
  add(def: IWasmDefinition): void;
}


// runtime helper - decode base64
function _dec(s: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return Buffer.from(s, 'base64');
  const bs = atob(s);
  const r = new Uint8Array(bs.length);
  for (let i = 0; i < r.length; ++i) r[i] = bs.charCodeAt(i);
  return r;
}


// compiler ctx helper (only defined during compile run from inwasm)
declare const _wasmCtx: _IWasmCtx;


/**
 * Inline wasm from a source definition.
 *
 * coding stage\
 * Place a `InWasm` call with a valid wasm source definition (see `IWasmDefinition`)
 * in a TS source file.
 *
 * `InWasm` with its source definition has a few additional coding restrictions:
 *   - The source module should not have complicated imports (close to leaves in dependency tree,
 *     no cycling) and should import `InWasm` directly.
 *   - The wasm definition must be coded inline as literal object on distinct
 *     `InWasm` calls, eg. `InWasm({...})`.
 *   - All `InWasm` calls must execute on import of the module (e.g. defined at top level),
 *     as the compiler script relies on partial import execution.
 *   - Importing the module should be side-effect free, eg. not contain other complicated
 *     state altering constructs at top level.
 *   - Values provided to the source definition must be final and not change later at runtime.
 *     This results from the fact, that most values get compiled into the wasm binary and
 *     cannot be altered later on anymore.
 *
 * compile stage\
 * After TS compilation run `inwasm` on files containing `InWasm` calls.
 * `inwasm` grabs the source definitions from partial execution, compiles them into
 * wasm binaries and replaces the source definitions with base64 encoded runtime definitions.
 * Note that this currently happens inplace, thus the original file content gets overwritten.
 * Alternatively run `inwasm` in watch mode with `inwasm -w glob*pattern`.
 * Note: `inwasm` does not yet work with ES6 modules.
 *
 * runtime stage\
 * At runtime `InWasm` decodes the base64 wasm data and returns a function returning the
 * requested output type (bytes, module or instance; as promises for async mode).
 * If the compilation step was skipped in between, `InWasm` will throw an error.
 */
export function InWasm<T extends IWasmDefinitionSyncBytes>(def: T): () => IWasmBytes<T>;
export function InWasm<T extends IWasmDefinitionAsyncBytes>(def: T): () => Promise<IWasmBytes<T>>;
export function InWasm<T extends IWasmDefinitionSyncModule>(def: T): () => IWasmModule<T>;
export function InWasm<T extends IWasmDefinitionAsyncModule>(def: T): () => Promise<IWasmModule<T>>;
export function InWasm<T extends IWasmDefinitionSyncInstance>(def: T): (importObject?: WebAssembly.Imports) => IWasmInstance<T>;
export function InWasm<T extends IWasmDefinitionAsyncInstance>(def: T): (importObject?: WebAssembly.Imports) => Promise<IWasmInstance<T>>;
export function InWasm<T extends IWasmDefinition>(def: T): any {
  if ((def as any).d) {
    // default compiled call: wasm loading during runtime
    // for the sake of small bundling size (<900 bytes) the code is somewhat degenerated
    // see cli.ts for the meaning of the {t, s, d, e} object properties
    const { t, s, d } = def as any;
    // memorize bytes and module
    let bytes: IWasmBytes<T>;
    let mod: IWasmModule<T>;
    const W = WebAssembly;
    if (t === OutputType.BYTES) {
      if (s) return () => bytes || (bytes = _dec(d));
      return () => Promise.resolve(bytes || (bytes = _dec(d)));
    }
    if (t === OutputType.MODULE) {
      if (s) return () => mod || (mod = new W.Module(bytes || (bytes = _dec(d))));
      return () => mod
        ? Promise.resolve(mod)
        : W.compile(bytes || (bytes = _dec(d))).then(m => mod = m as IWasmModule<T>);
    }
    if (s)
      return (e?: WebAssembly.Imports) => new W.Instance(mod || (mod = new W.Module(bytes || (bytes = _dec(d)))), e) as IWasmInstance<T>;
    return (e?: WebAssembly.Imports) => mod
      ? W.instantiate(mod, e) as Promise<IWasmInstance<T>>
      : W.instantiate(bytes || (bytes = _dec(d)), e).then(r => (mod = r.module) && r.instance as IWasmInstance<T>);
  }
  // invalid call: uncompiled normal run throws
  if (typeof _wasmCtx === 'undefined') throw new Error('must run "inwasm"');
  _wasmCtx.add(def);
}

import { expectType } from 'tsd';
import { ExtractDefinition, InWasm, IWasmBytes, IWasmInstance, IWasmModule, IWasmResponse, OutputMode, OutputType, WebAssemblyExtended } from './';


// TODO: test imports type

/**
 * Basic InWasm return types.
 */
expectType<() => IWasmBytes<{
  name: string,
  type: OutputType.BYTES,
  mode: OutputMode.SYNC,
  srctype: 'C',
  exports: {},
  code: string
}>>(
  InWasm({
    name: 'some_unit',
    type: OutputType.BYTES,
    mode: OutputMode.SYNC,
    srctype: 'C',
    exports: {},
    code: ''
  })
);
expectType<() => Promise<IWasmBytes<{
  name: string,
  type: OutputType.BYTES,
  mode: OutputMode.ASYNC,
  srctype: 'C',
  exports: {},
  code: string
}>>>(
  InWasm({
    name: 'some_unit',
    type: OutputType.BYTES,
    mode: OutputMode.ASYNC,
    srctype: 'C',
    exports: {},
    code: ''
  })
);
expectType<() => IWasmModule<{
  name: string,
  type: OutputType.MODULE,
  mode: OutputMode.SYNC,
  srctype: 'C',
  exports: {},
  code: string
}>>(
  InWasm({
    name: 'some_unit',
    type: OutputType.MODULE,
    mode: OutputMode.SYNC,
    srctype: 'C',
    exports: {},
    code: ''
  })
);
expectType<() => Promise<IWasmModule<{
  name: string,
  type: OutputType.MODULE,
  mode: OutputMode.ASYNC,
  srctype: 'C',
  exports: {},
  code: string
}>>>(
  InWasm({
    name: 'some_unit',
    type: OutputType.MODULE,
    mode: OutputMode.ASYNC,
    srctype: 'C',
    exports: {},
    code: ''
  })
);
expectType<(importObject?: WebAssembly.Imports) => IWasmInstance<{
  name: string,
  type: OutputType.INSTANCE,
  mode: OutputMode.SYNC,
  srctype: 'C',
  exports: {},
  code: string
}>>(
  InWasm({
    name: 'some_unit',
    type: OutputType.INSTANCE,
    mode: OutputMode.SYNC,
    srctype: 'C',
    exports: {},
    code: ''
  })
);
expectType<(importObject?: WebAssembly.Imports) => Promise<IWasmInstance<{
  name: string,
  type: OutputType.INSTANCE,
  mode: OutputMode.ASYNC,
  srctype: 'C',
  exports: {},
  code: string
}>>>(
  InWasm({
    name: 'some_unit',
    type: OutputType.INSTANCE,
    mode: OutputMode.ASYNC,
    srctype: 'C',
    exports: {},
    code: ''
  })
);


/**
 * explicit type conversions
 */
 const bytes = new Uint8Array() as IWasmBytes<{
  name: string,
  type: OutputType.BYTES,
  mode: OutputMode.SYNC,
  srctype: 'C',
  exports: {},
  code: string
}>;

// definition extraction
expectType<{
  name: string,
  type: OutputType.BYTES,
  mode: OutputMode.SYNC,
  srctype: 'C',
  exports: {},
  code: string
}>({} as ExtractDefinition<typeof bytes>);

// redeclare module type
const mod = new WebAssembly.Module(bytes) as IWasmModule<ExtractDefinition<typeof bytes>>;
expectType<IWasmModule<{
  name: string,
  type: OutputType.BYTES,
  mode: OutputMode.SYNC,
  srctype: 'C',
  exports: {},
  code: string
}>>(mod);

// redeclaring instance type
const inst = new WebAssembly.Instance(new WebAssembly.Module(bytes)) as
  IWasmInstance<ExtractDefinition<typeof bytes>>;
expectType<IWasmInstance<{
  name: string,
  type: OutputType.BYTES,
  mode: OutputMode.SYNC,
  srctype: 'C',
  exports: {},
  code: string
}>>(inst);

// redeclaring response type
const resp = new Promise<Response>(r => r(new Response)) as Promise<IWasmResponse<ExtractDefinition<typeof bytes>>>;
expectType<Promise<IWasmResponse<ExtractDefinition<{
  name: string,
  type: OutputType.BYTES,
  mode: OutputMode.SYNC,
  srctype: 'C',
  exports: {},
  code: string
}>>>>(resp);


/**
 * WebAssemblyExtended overloads
 */
const WAE = WebAssembly as unknown as typeof WebAssemblyExtended;
expectType<typeof WebAssemblyExtended>(WAE);

// new Module() - overloaded
expectType<IWasmModule<{
  name: string,
  type: OutputType.BYTES,
  mode: OutputMode.SYNC,
  srctype: 'C',
  exports: {},
  code: string
}>>(new WAE.Module(
  InWasm({
    name: 'some_unit',
    type: OutputType.BYTES,
    mode: OutputMode.SYNC,
    srctype: 'C',
    exports: {},
    code: ''
  })()
));
// new Module() - generic
expectType<WebAssemblyExtended.Module>(new WAE.Module(new Uint8Array()));

/**
 * new Instance()
 * Note: This is only weak checking proper argument type.
 * Reason here is the fact, that a WebaSsembly.Module instance is
 * interfaced as plain object, thus almost everything matches.
 * It is still possible to spot during coding, whether a proper InWasm type
 * was given - it will show `IWasmInstance<{...}>` instead of generic `Module`.
 */
expectType<IWasmInstance<{
  name: string,
  type: OutputType.MODULE,
  mode: OutputMode.SYNC,
  srctype: 'C',
  exports: {},
  code: string
}>>(new WAE.Instance(
  InWasm({
    name: 'some_unit',
    type: OutputType.MODULE,
    mode: OutputMode.SYNC,
    srctype: 'C',
    exports: {},
    code: ''
  })()
));
// new Instance() - generic
// error in tsd: Parameter type Instance is declared too wide for argument type IWasmInstance<IWasmDefinition>.
// expectType<WebAssemblyExtended.Instance>(new WAE.Instance(new Uint8Array()));

// compile - overloaded
expectType<Promise<IWasmModule<{
  name: string,
  type: OutputType.BYTES,
  mode: OutputMode.SYNC,
  srctype: 'C',
  exports: {},
  code: string
}>>>(WAE.compile(
  InWasm({
    name: 'some_unit',
    type: OutputType.BYTES,
    mode: OutputMode.SYNC,
    srctype: 'C',
    exports: {},
    code: ''
  })()
));
// compile - generic
expectType<Promise<WebAssemblyExtended.Module>>(WAE.compile(new Uint8Array()));

// compileStreaming - overloaded
expectType<Promise<IWasmModule<{
  name: string,
  type: OutputType.BYTES,
  mode: OutputMode.SYNC,
  srctype: 'C',
  exports: {},
  code: string
}>>>(WAE.compileStreaming(resp));
// compileStreaming - generic
expectType<Promise<WebAssemblyExtended.Module>>(WAE.compileStreaming(new Promise<Response>(r => r(new Response))));

// instantiate - overloaded
// from bytes
expectType<Promise<WebAssemblyExtended.IWasmInstantiatedSource<{
  name: string,
  type: OutputType.BYTES,
  mode: OutputMode.SYNC,
  srctype: 'C',
  exports: {},
  code: string
}>>>(WAE.instantiate(
  InWasm({
    name: 'some_unit',
    type: OutputType.BYTES,
    mode: OutputMode.SYNC,
    srctype: 'C',
    exports: {},
    code: ''
  })()
));
// from module
expectType<Promise<IWasmInstance<{
  name: string,
  type: OutputType.MODULE,
  mode: OutputMode.SYNC,
  srctype: 'C',
  exports: {},
  code: string
}>>>(WAE.instantiate(
  InWasm({
    name: 'some_unit',
    type: OutputType.MODULE,
    mode: OutputMode.SYNC,
    srctype: 'C',
    exports: {},
    code: ''
  })()
));
// instantiate - generic
// from bytes
expectType<Promise<WebAssemblyExtended.WebAssemblyInstantiatedSource>>(WAE.instantiate(new Uint8Array()));
// from module
expectType<Promise<WebAssemblyExtended.Instance>>(WAE.instantiate(new WAE.Module(new Uint8Array())));

// instantiateStreaming - overloaded
expectType<Promise<WebAssemblyExtended.IWasmInstantiatedSource<{
  name: string,
  type: OutputType.BYTES,
  mode: OutputMode.SYNC,
  srctype: 'C',
  exports: {},
  code: string
}>>>(WAE.instantiateStreaming(resp));
// instantiateStreaming - generic
expectType<Promise<WebAssemblyExtended.WebAssemblyInstantiatedSource>>(WAE.instantiateStreaming(new Promise<Response>(r => r(new Response))));

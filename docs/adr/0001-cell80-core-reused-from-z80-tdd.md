# The cell80 Z80 core, reused from z80-tdd

easyZ80 runs Z80 code with the WebAssembly build of [cell80-z80](https://github.com/chrishayuk/cell80) that z80-tdd already ships (`z80-tdd/src/cpu/cell80.wasm`, 44 KB, MIT or Apache-2.0). It passes SingleStepTests/z80 and carries its own disassembler, which the debugger needs. The only Node-specific part of z80-tdd's wrapper is the `readFileSync` that loads the file; a browser compiles it with `WebAssembly.compile` instead, since Chrome refuses a synchronous compile of more than 4 KB on the main thread.

The prototype on tag `prototype/wasm-chain` (`prototype-wasm-chain.html`) showed that the whole chain works in a browser: hand-assembled programs drawing on a 32×32 screen, reading random bytes and keys, step by step, with registers, flags and the disassembly.

## Consequences

- The published site carries the cell80-z80 licence notice next to the `.wasm` file.
- A change to the core is made in z80-tdd, then the `.wasm` file is copied here.

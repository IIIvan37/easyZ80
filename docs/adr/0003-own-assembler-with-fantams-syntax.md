# Our own assembler, with the syntax of FantAMS

easyZ80 assembles in the browser with its own TypeScript assembler, which accepts a subset of [FantAMS](https://github.com/sikorama/fantams)'s syntax: the Z80 instructions, labels, `org`, `equ`, `defb`, `defw`, `defs`, and numbers written `#C000`. The subset is what the tutorial needs, so every program written in easyZ80 also assembles with FantAMS.

FantAMS itself cannot run in the site: it has no licence file, so its WebAssembly build cannot be published. Our own assembler also lets us write error messages for complete beginners, and map each source line to its address for the debugger.

## Considered options

- **FantAMS compiled to WebAssembly**: ruled out by the missing licence.
- **RASM compiled to WebAssembly**: a heavier binary, error messages written for experienced users, and not the syntax chosen.

## Consequences

- Compatibility is checked by tests, not assumed: a test assembles the same sources with our assembler and with the `fantams` binary, and compares the bytes. FantAMS stays a local development tool, never shipped.
- Each instruction is also checked against cell80's disassembler: assemble, disassemble, compare.
- One known exception: FantAMS fails with "unrecognized EX form" on `ex af,af'` followed by a comment, which our assembler accepts. Its test goes through cell80 instead.

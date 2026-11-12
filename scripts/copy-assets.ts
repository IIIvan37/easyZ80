// Copies what tsc does not emit next to the compiled modules that load it:
// the CPU's WebAssembly file with the licences of the cell80-z80 code compiled into it,
// and the playground's CSS.
import { copyFileSync } from "node:fs";

for (const file of [
  "cpu/cell80.wasm",
  "cpu/LICENSE-APACHE",
  "cpu/LICENSE-MIT",
  "playground/z80-playground.css",
]) {
  copyFileSync(`src/${file}`, `dist/${file}`);
}

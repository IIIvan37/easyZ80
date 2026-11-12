// Copies what tsc does not emit next to the compiled modules that load it.
import { copyFileSync } from "node:fs";

for (const [from, to] of [
  ["cpu/cell80.wasm", "cpu/cell80.wasm"],
  ["cpu/LICENSE-APACHE", "cpu/cell80.LICENSE-APACHE"],
  ["cpu/LICENSE-MIT", "cpu/cell80.LICENSE-MIT"],
  ["playground/z80-playground.css", "playground/z80-playground.css"],
]) {
  copyFileSync(`src/${from}`, `dist/${to}`);
}

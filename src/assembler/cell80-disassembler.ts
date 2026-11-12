import { readFileSync } from "node:fs";
import { type Cell80, decode, NO_DEVICES } from "../cpu/cell80.ts";

const cell80 = new WebAssembly.Instance(
  new WebAssembly.Module(
    readFileSync(new URL("../cpu/cell80.wasm", import.meta.url)),
  ),
  NO_DEVICES,
).exports as unknown as Cell80;

/**
 * The instruction that `bytes` start with, decoded by cell80 at address 0: the
 * reference the round-trip tests compare against (ADR 0003). Numbers are written
 * `#34` as in FantAMS; displacements stay in decimal, `(IX+52)`.
 */
export function disassemble(bytes: readonly number[]): {
  text: string;
  length: number;
} {
  return decode(cell80, 0, (i) => bytes[i] ?? 0);
}

// Forms cell80 decodes that are not documented by Zilog, or not instructions at all.
const UNDOCUMENTED = [
  /I[XY][HL]/, // halves of IX and IY
  /\bSLL\b/,
  /^IN \(C\)$/,
  /^OUT \(C\),0$/,
  /^DEFB\b/, // bytes that decode to no instruction
  /^HOSTCALL$/, // cell80's own escape, ED FE
];

const PREFIXES = [0xcb, 0xdd, 0xed, 0xfd];

/**
 * The text of every documented instruction whose opcode follows `prefix`, once
 * each, with `#34` as its byte operand and `#1234` as its word operand. A prefix
 * that ends with CB takes the displacement before the opcode, as the Z80 does.
 */
export function documentedInstructions(prefix: readonly number[]): string[] {
  const indexed = prefix[0] === 0xdd || prefix[0] === 0xfd;
  const texts = new Set<string>();
  for (let opcode = 0; opcode < 0x100; opcode++) {
    // Another prefix: its instructions are swept with that prefix.
    if (PREFIXES.includes(opcode) && prefix.at(-1) !== 0xcb) continue;
    const bytes =
      prefix.at(-1) === 0xcb && indexed
        ? [...prefix, 0x34, opcode]
        : [...prefix, opcode, 0x34, 0x12];
    const { text } = disassemble(bytes);
    // A DD or FD prefix before an instruction that ignores it.
    const prefixIgnored = indexed && !/I[XY]/.test(text);
    // DDCB and FDCB forms that also copy the result into a register.
    const copies = indexed && prefix.at(-1) === 0xcb && /\),[A-Z]$/.test(text);
    if (
      !prefixIgnored &&
      !copies &&
      !UNDOCUMENTED.some((form) => form.test(text))
    ) {
      texts.add(text);
    }
  }
  return [...texts];
}

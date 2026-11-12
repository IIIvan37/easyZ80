import { readFileSync } from "node:fs";

interface Exports {
  readonly memory: WebAssembly.Memory;
  text_ptr(): number;
  disassemble(pc: number, bytes: number): number;
}

const cell80 = new WebAssembly.Instance(
  new WebAssembly.Module(
    readFileSync(new URL("../cpu/cell80.wasm", import.meta.url)),
  ),
  { env: { io_in: () => 0xff, io_out: () => {} } },
).exports as unknown as Exports;

/**
 * The instruction that `bytes` start with, decoded by cell80 at address 0: the
 * reference the round-trip tests compare against (ADR 0003). Numbers are written
 * `#34` as in FantAMS; displacements stay in decimal, `(IX+52)`.
 */
export function disassemble(bytes: readonly number[]): {
  text: string;
  length: number;
} {
  const firstFourBytes = [0, 1, 2, 3].reduce(
    (word, i) => word + (bytes[i] ?? 0) * 2 ** (8 * i),
    0,
  );
  // The instruction's length in the high byte, the text's length in the low byte.
  const lengths = cell80.disassemble(0, firstFourBytes);
  const text = new TextDecoder().decode(
    new Uint8Array(cell80.memory.buffer, cell80.text_ptr(), lengths & 0xff),
  );
  return { text: text.replaceAll("$", "#"), length: lengths >> 8 };
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

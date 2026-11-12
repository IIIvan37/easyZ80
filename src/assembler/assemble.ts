import {
  byte,
  encodeInstruction,
  isRegister,
  type Problem,
  word16,
} from "./instructions.ts";
import { isReservedWord } from "./reserved-words.ts";

/** Bytes stored from `address` on. */
export interface Block {
  readonly address: number;
  readonly bytes: readonly number[];
}

/** A mistake in the source, at its 1-based line (ADR 0005). */
export type AssemblyError = { readonly line: number } & Problem;

export interface Assembly {
  readonly blocks: readonly Block[];
  readonly errors: readonly AssemblyError[];
}

/** The first address past the 64 KB the Z80 reaches. */
const MEMORY_END = 0x10000;

/** The value of a name, or why the line cannot use it. */
type Lookup = (name: string) => number | Problem;

export function assemble(source: string): Assembly {
  const { labels } = pass(source, undefined);
  const { blocks, errors } = pass(source, labels);
  return { blocks, errors };
}

/**
 * One reading of the source. Without `known`, it is the first pass, which only
 * finds where each label lands.
 */
function pass(
  source: string,
  known: ReadonlyMap<string, number> | undefined,
): Assembly & { readonly labels: ReadonlyMap<string, number> } {
  let origin = 0;
  let placed = false;
  const labels = new Map<string, number>(known);
  const definedAt = new Map<string, number>();
  const bytes: number[] = [];
  const errors: AssemblyError[] = [];
  /** Gives `name` its value, unless an earlier line already did. */
  const define = (name: string, value: number, line: number) => {
    const firstLine = definedAt.get(name);
    if (firstLine === undefined) {
      definedAt.set(name, line);
      labels.set(name, value);
    } else {
      errors.push({
        line,
        kind: "label-defined-twice",
        label: name,
        firstLine,
      });
    }
  };
  /** Whether `name` is a reserved word, which then gets its error. */
  const reserved = (name: string, line: number) => {
    if (!isReservedWord(name)) return false;
    errors.push({ line, kind: "reserved-word", label: name });
    return true;
  };
  const unknown = (label: string): Problem => ({
    kind: "unknown-label",
    label,
  });
  const addressOf: Lookup = (name) => labels.get(name) ?? unknown(name);
  // FantAMS sizes DEFS in its first pass: only names defined above are known.
  const sizeOf: Lookup = (name) => {
    if (definedAt.has(name)) return labels.get(name) ?? unknown(name);
    if (labels.has(name)) return { kind: "size-defined-later", label: name };
    return unknown(name);
  };
  for (const [index, rawLine] of source.split("\n").entries()) {
    let line = withoutComment(rawLine).trim();
    const label = /^([A-Z_]\w*):\s*(.*)$/i.exec(line);
    if (label) {
      const name = (label[1] ?? "").toUpperCase();
      // FantAMS reads `halt: nop` as two instructions: skip the whole line.
      if (reserved(name, index + 1)) continue;
      const address = origin + bytes.length;
      if (address >= MEMORY_END)
        errors.push({ line: index + 1, kind: "past-end-of-memory" });
      define(name, address, index + 1);
      line = label[2] ?? "";
    }
    if (line === "") continue;
    const equ = /^([A-Z_]\w*)\s+equ\s+(.*)$/i.exec(line);
    if (equ) {
      const name = (equ[1] ?? "").toUpperCase();
      if (reserved(name, index + 1)) continue;
      const value = directiveValue("EQU", equ[2] ?? "");
      if (typeof value === "number") define(name, value, index + 1);
      else errors.push({ line: index + 1, ...value });
      continue;
    }
    const org = /^org\s+(.*)$/i.exec(line);
    if (org && placed) {
      errors.push({ line: index + 1, kind: "misplaced-org" });
      continue;
    }
    if (org) {
      placed = true;
      const address = directiveValue("ORG", org[1] ?? "");
      if (typeof address === "number") origin = address;
      else errors.push({ line: index + 1, ...address });
      continue;
    }
    placed = true;
    const address = origin + bytes.length;
    const encoded =
      known === undefined
        ? sized(line, address, labels, sizeOf)
        : encode(line, address, addressOf, sizeOf);
    if (!Array.isArray(encoded)) {
      errors.push({ line: index + 1, ...encoded });
    } else if (address + encoded.length > MEMORY_END) {
      errors.push({ line: index + 1, kind: "past-end-of-memory" });
    } else {
      bytes.push(...encoded);
    }
  }
  return { blocks: [{ address: origin, bytes }], errors, labels };
}

/** The 16-bit number a directive takes, or why it does not fit. */
function directiveValue(mnemonic: string, text: string): number | Problem {
  const value = word16(text.toUpperCase());
  return value ?? { kind: "wrong-operands", mnemonic };
}

/**
 * The bytes of one instruction in the first pass, where a name not defined yet
 * must keep its size: it stands for `address`, which keeps a relative jump in
 * reach, or else for 0, which fits in 8 bits.
 */
function sized(
  line: string,
  address: number,
  labels: ReadonlyMap<string, number>,
  sizeOf: Lookup,
): number[] | Problem {
  const here = encode(
    line,
    address,
    (name) => labels.get(name) ?? address,
    sizeOf,
  );
  if (Array.isArray(here)) return here;
  return encode(line, address, (name) => labels.get(name) ?? 0, sizeOf);
}

/**
 * The bytes of one instruction at `address`, or why there are none. The
 * operands of DEFS read names with `sizeOf`, the others with `addressOf`.
 */
function encode(
  line: string,
  address: number,
  addressOf: Lookup,
  sizeOf: Lookup,
): number[] | Problem {
  const [word = "", rest = ""] = line.split(/\s+(.*)/);
  const mnemonic = word.toUpperCase();
  const lookup = mnemonic === "DEFS" ? sizeOf : addressOf;
  const operands =
    rest === ""
      ? []
      : splitOperands(rest).map((text) =>
          isText(text) ? text : resolve(text.toUpperCase(), lookup),
        );
  const unknown = operands.find((operand) => typeof operand === "object");
  if (unknown) return unknown;
  if (mnemonic === "DEFB") return defb(operands as string[]);
  if (mnemonic === "DEFW") return defw(operands as string[]);
  if (mnemonic === "DEFS") return defs(operands as string[]);
  return encodeInstruction(mnemonic, operands as string[], address);
}

/**
 * `operand` with a label, alone or in brackets, replaced by its value, or why
 * the label cannot be used.
 */
function resolve(operand: string, lookup: Lookup): string | Problem {
  const [, open = "", name = "", close = ""] =
    /^(\(?)([A-Z_]\w*)(\)?)$/.exec(operand) ?? [];
  if (name === "" || isRegister(name) || open.length !== close.length)
    return operand;
  const value = lookup(name);
  if (typeof value === "object") return value;
  return `${open}#${value.toString(16).toUpperCase()}${close}`;
}

/**
 * Whether each character of `line` stands outside a text in quotes. A quote
 * opens a text only at the start of an operand: the one of AF' does not.
 */
function outsideQuotes(line: string): boolean[] {
  let quote: string | undefined;
  return [...line].map((char, i) => {
    if (quote !== undefined) {
      if (char === quote) quote = undefined;
      return false;
    }
    if ((char === '"' || char === "'") && /^$|[\s,]/.test(line[i - 1] ?? "")) {
      quote = char;
      return false;
    }
    return true;
  });
}

/** `line` without its comment; a `;` inside quotes is text. */
function withoutComment(line: string): string {
  const outside = outsideQuotes(line);
  const start = [...line].findIndex((char, i) => char === ";" && outside[i]);
  return start === -1 ? line : line.slice(0, start);
}

/** The operands of `rest`, trimmed; a comma inside quotes is text. */
function splitOperands(rest: string): string[] {
  const outside = outsideQuotes(rest);
  const operands = [""];
  [...rest].forEach((char, i) => {
    if (char === "," && outside[i]) operands.push("");
    else operands[operands.length - 1] += char;
  });
  return operands.map((operand) => operand.trim());
}

/** A text in quotes, as DEFB takes it. */
const isText = (operand: string) => /^(["']).*\1$/.test(operand);

/** The bytes of DEFB: one per number, one per character of a text. */
function defb(operands: readonly string[]): number[] | Problem {
  const bytes: number[] = [];
  for (const operand of operands) {
    if (isText(operand)) {
      for (const character of operand.slice(1, -1)) {
        const code = character.codePointAt(0) ?? 0;
        if (code > 127) return { kind: "unsupported-character", character };
        bytes.push(code);
      }
      continue;
    }
    const value = byte(operand);
    if (value === undefined)
      return { kind: "wrong-operands", mnemonic: "DEFB" };
    if (typeof value === "object") return value;
    bytes.push(value);
  }
  return bytes;
}

/** The bytes of DEFW: two per number, low byte first. */
function defw(operands: readonly string[]): number[] | Problem {
  const bytes: number[] = [];
  for (const operand of operands) {
    const value = word16(operand);
    if (value === undefined)
      return { kind: "wrong-operands", mnemonic: "DEFW" };
    if (typeof value === "object") return value;
    bytes.push(value & 0xff, value >> 8);
  }
  return bytes;
}

/** The bytes of DEFS: a count of bytes, filled with 0 or the byte given. */
function defs(operands: readonly string[]): number[] | Problem {
  const [countText = "", fillText = "0", ...extra] = operands;
  const count = word16(countText);
  const fill = byte(fillText);
  if (count === undefined || fill === undefined || extra.length > 0)
    return { kind: "wrong-operands", mnemonic: "DEFS" };
  if (typeof count === "object") return count;
  if (typeof fill === "object") return fill;
  return new Array<number>(count).fill(fill);
}

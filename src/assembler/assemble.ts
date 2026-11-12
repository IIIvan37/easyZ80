import {
  byte,
  encodeInstruction,
  type InstructionProblem,
  isRegister,
  littleEndian,
  word16,
} from "./instructions.ts";
import { isReservedWord } from "./reserved-words.ts";

/** Bytes stored from `address` on. */
export interface Block {
  readonly address: number;
  readonly bytes: readonly number[];
}

/** Why a line gives no bytes, as a code with data (ADR 0005). */
export type Problem =
  | InstructionProblem
  | { readonly kind: "misplaced-org" }
  | { readonly kind: "unknown-label"; readonly label: string }
  | { readonly kind: "size-defined-later"; readonly label: string }
  | { readonly kind: "reserved-word"; readonly label: string }
  | { readonly kind: "past-end-of-memory" }
  | { readonly kind: "unsupported-character"; readonly character: string }
  | {
      readonly kind: "label-defined-twice";
      readonly label: string;
      readonly firstLine: number;
    };

/** A mistake in the source, at its 1-based line. */
export type AssemblyError = { readonly line: number } & Problem;

export interface Assembly {
  readonly blocks: readonly Block[];
  readonly errors: readonly AssemblyError[];
}

/** The first address past the 64 KB the Z80 reaches. */
const MEMORY_END = 0x10000;

/** The value of a name, or why the line cannot use it. */
type Lookup = (name: string) => number | Problem;

const unknown = (label: string): Problem => ({ kind: "unknown-label", label });

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
  const addressOr =
    (fallback?: number): Lookup =>
    (name) =>
      labels.get(name) ?? fallback ?? unknown(name);
  // FantAMS sizes DEFS in its first pass: only names defined above are known.
  const sizeOf: Lookup = (name) => {
    const value = labels.get(name);
    if (value === undefined) return unknown(name);
    if (definedAt.has(name)) return value;
    return { kind: "size-defined-later", label: name };
  };
  for (const [index, rawLine] of source.split("\n").entries()) {
    const line = index + 1;
    const here = origin + bytes.length;
    let text = withoutComment(rawLine).trim();
    const label = /^([A-Z_]\w*):\s*(.*)$/i.exec(text);
    if (label) {
      const name = (label[1] ?? "").toUpperCase();
      // FantAMS reads `halt: nop` as two instructions: skip the whole line.
      if (reserved(name, line)) continue;
      if (here >= MEMORY_END) errors.push({ line, kind: "past-end-of-memory" });
      define(name, here, line);
      text = label[2] ?? "";
    }
    if (text === "") continue;
    const equ = /^([A-Z_]\w*)\s+equ\s+(.*)$/i.exec(text);
    if (equ) {
      const name = (equ[1] ?? "").toUpperCase();
      if (reserved(name, line)) continue;
      const value = read(word16, "EQU", (equ[2] ?? "").toUpperCase());
      if (typeof value === "number") define(name, value, line);
      else errors.push({ line, ...value });
      continue;
    }
    const org = /^org\s+(.*)$/i.exec(text);
    if (org) {
      if (placed) {
        errors.push({ line, kind: "misplaced-org" });
      } else {
        const address = read(word16, "ORG", (org[1] ?? "").toUpperCase());
        if (typeof address === "number") origin = address;
        else errors.push({ line, ...address });
      }
      placed = true;
      continue;
    }
    placed = true;
    const encoded =
      known === undefined
        ? sized(text, here, addressOr, sizeOf)
        : encode(text, here, addressOr(), sizeOf);
    if (!Array.isArray(encoded)) {
      errors.push({ line, ...encoded });
    } else if (here + encoded.length > MEMORY_END) {
      errors.push({ line, kind: "past-end-of-memory" });
    } else {
      // Not push(...encoded): a DEFS of 64 KB is too many arguments.
      for (const value of encoded) bytes.push(value);
    }
  }
  return { blocks: [{ address: origin, bytes }], errors, labels };
}

/** The number `reader` finds in `text`, or why there is none. */
function read(
  reader: (text: string) => number | Problem | undefined,
  mnemonic: string,
  text: string,
): number | Problem {
  return reader(text) ?? { kind: "wrong-operands", mnemonic };
}

/**
 * The bytes of one instruction in the first pass, where a name not defined yet
 * must keep its size: it stands for `address`, which keeps a relative jump in
 * reach, or else for 0, which fits in 8 bits.
 */
function sized(
  line: string,
  address: number,
  addressOr: (fallback: number) => Lookup,
  sizeOf: Lookup,
): number[] | Problem {
  const near = encode(line, address, addressOr(address), sizeOf);
  if (Array.isArray(near)) return near;
  return encode(line, address, addressOr(0), sizeOf);
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
  const operands: string[] = [];
  for (const text of rest === "" ? [] : splitOperands(rest)) {
    const operand = isText(text) ? text : resolve(text.toUpperCase(), lookup);
    if (typeof operand === "object") return operand;
    operands.push(operand);
  }
  const data = DATA.get(mnemonic);
  return data ? data(operands) : encodeInstruction(mnemonic, operands, address);
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
    const value = read(byte, "DEFB", operand);
    if (typeof value === "object") return value;
    bytes.push(value);
  }
  return bytes;
}

/** The bytes of DEFW: two per number, low byte first. */
function defw(operands: readonly string[]): number[] | Problem {
  const bytes: number[] = [];
  for (const operand of operands) {
    const value = read(word16, "DEFW", operand);
    if (typeof value === "object") return value;
    bytes.push(...littleEndian(value));
  }
  return bytes;
}

/** The bytes of DEFS: a count of bytes, filled with 0 or the byte given. */
function defs(operands: readonly string[]): number[] | Problem {
  const [countText = "", fillText = "0", ...extra] = operands;
  if (extra.length > 0) return { kind: "wrong-operands", mnemonic: "DEFS" };
  const count = read(word16, "DEFS", countText);
  if (typeof count === "object") return count;
  const fill = read(byte, "DEFS", fillText);
  if (typeof fill === "object") return fill;
  return new Array<number>(count).fill(fill);
}

/** The directives that store data, by mnemonic. */
const DATA = new Map([
  ["DEFB", defb],
  ["DEFW", defw],
  ["DEFS", defs],
]);

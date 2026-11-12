import {
  encodeInstruction,
  isRegister,
  type Problem,
  word16,
} from "./instructions.ts";

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
  for (const [index, rawLine] of source.split("\n").entries()) {
    let line = rawLine.replace(/;.*/, "").trim();
    const label = /^([A-Z_]\w*):\s*(.*)$/i.exec(line);
    if (label) {
      define((label[1] ?? "").toUpperCase(), origin + bytes.length, index + 1);
      line = label[2] ?? "";
    }
    if (line === "") continue;
    const equ = /^([A-Z_]\w*)\s+equ\s+(.*)$/i.exec(line);
    if (equ) {
      const value = directiveValue("EQU", equ[2] ?? "");
      if (typeof value === "number")
        define((equ[1] ?? "").toUpperCase(), value, index + 1);
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
        ? sized(line, address, labels)
        : encode(line, address, (name) => labels.get(name));
    if (Array.isArray(encoded)) {
      bytes.push(...encoded);
    } else {
      errors.push({ line: index + 1, ...encoded });
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
): number[] | Problem {
  const here = encode(line, address, (name) => labels.get(name) ?? address);
  if (Array.isArray(here)) return here;
  return encode(line, address, (name) => labels.get(name) ?? 0);
}

/** The bytes of one instruction at `address`, or why there are none. */
function encode(
  line: string,
  address: number,
  addressOf: (label: string) => number | undefined,
): number[] | Problem {
  const [mnemonic = "", rest = ""] = line.toUpperCase().split(/\s+(.*)/);
  const operands =
    rest === ""
      ? []
      : rest.split(",").map((text) => resolve(text.trim(), addressOf));
  const unknown = operands.find((operand) => typeof operand === "object");
  if (unknown) return unknown;
  return encodeInstruction(mnemonic, operands as string[], address);
}

/**
 * `operand` with a label, alone or in brackets, replaced by its address, or the
 * label nobody defined.
 */
function resolve(
  operand: string,
  addressOf: (label: string) => number | undefined,
): string | Problem {
  const [, open = "", name = "", close = ""] =
    /^(\(?)([A-Z_]\w*)(\)?)$/.exec(operand) ?? [];
  if (name === "" || isRegister(name) || open.length !== close.length)
    return operand;
  const value = addressOf(name);
  if (value === undefined) return { kind: "unknown-label", label: name };
  return `${open}#${value.toString(16).toUpperCase()}${close}`;
}

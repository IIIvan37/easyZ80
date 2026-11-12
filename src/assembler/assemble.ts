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
 * One reading of the source. Without `known`, it is the first pass: a label not
 * defined yet stands for the current address, which keeps sizes right.
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
  for (const [index, rawLine] of source.split("\n").entries()) {
    let line = rawLine.replace(/;.*/, "").trim();
    const label = /^([A-Z_]\w*):\s*(.*)$/i.exec(line);
    if (label) {
      const name = (label[1] ?? "").toUpperCase();
      const firstLine = definedAt.get(name);
      if (firstLine === undefined) {
        definedAt.set(name, index + 1);
        labels.set(name, origin + bytes.length);
      } else {
        errors.push({
          line: index + 1,
          kind: "label-defined-twice",
          label: name,
          firstLine,
        });
      }
      line = label[2] ?? "";
    }
    if (line === "") continue;
    const org = /^org\s+(.*)$/i.exec(line);
    if (org && placed) {
      errors.push({ line: index + 1, kind: "misplaced-org" });
      continue;
    }
    if (org) {
      placed = true;
      const address = word16((org[1] ?? "").toUpperCase());
      if (address === undefined) {
        errors.push({
          line: index + 1,
          kind: "wrong-operands",
          mnemonic: "ORG",
        });
      } else if (typeof address === "object") {
        errors.push({ line: index + 1, ...address });
      } else {
        origin = address;
      }
      continue;
    }
    placed = true;
    const address = origin + bytes.length;
    const encoded = encode(line, address, (name) =>
      known === undefined ? (labels.get(name) ?? address) : labels.get(name),
    );
    if (Array.isArray(encoded)) {
      bytes.push(...encoded);
    } else {
      errors.push({ line: index + 1, ...encoded });
    }
  }
  return { blocks: [{ address: origin, bytes }], errors, labels };
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

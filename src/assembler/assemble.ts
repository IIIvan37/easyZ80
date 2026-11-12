import { encodeInstruction } from "./instructions.ts";

/** Bytes stored from `address` on. */
export interface Block {
  readonly address: number;
  readonly bytes: readonly number[];
}

/** A mistake in the source, at its 1-based line. */
export interface AssemblyError {
  readonly line: number;
  readonly message: string;
}

export interface Assembly {
  readonly blocks: readonly Block[];
  readonly errors: readonly AssemblyError[];
}

export function assemble(source: string): Assembly {
  const bytes: number[] = [];
  const errors: AssemblyError[] = [];
  for (const [index, rawLine] of source.split("\n").entries()) {
    const line = rawLine.replace(/;.*/, "").trim();
    if (line === "") continue;
    const encoded = encode(line, bytes.length);
    if (encoded === undefined) {
      errors.push({ line: index + 1, message: "unknown instruction" });
    } else {
      bytes.push(...encoded);
    }
  }
  return { blocks: [{ address: 0, bytes }], errors };
}

/** The bytes of one instruction at `address`, or undefined when no form fits. */
function encode(line: string, address: number): number[] | undefined {
  const [mnemonic = "", rest = ""] = line.toUpperCase().split(/\s+(.*)/);
  const operands =
    rest === "" ? [] : rest.split(",").map((operand) => operand.trim());
  return encodeInstruction(mnemonic, operands, address);
}

import { encodeInstruction, type Problem, word16 } from "./instructions.ts";

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
  let origin = 0;
  let placed = false;
  const bytes: number[] = [];
  const errors: AssemblyError[] = [];
  for (const [index, rawLine] of source.split("\n").entries()) {
    const line = rawLine.replace(/;.*/, "").trim();
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
    const encoded = encode(line, origin + bytes.length);
    if (Array.isArray(encoded)) {
      bytes.push(...encoded);
    } else {
      errors.push({ line: index + 1, ...encoded });
    }
  }
  return { blocks: [{ address: origin, bytes }], errors };
}

/** The bytes of one instruction at `address`, or why there are none. */
function encode(line: string, address: number): number[] | Problem {
  const [mnemonic = "", rest = ""] = line.toUpperCase().split(/\s+(.*)/);
  const operands =
    rest === "" ? [] : rest.split(",").map((operand) => operand.trim());
  return encodeInstruction(mnemonic, operands, address);
}

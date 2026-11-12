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
  for (const rawLine of source.split("\n")) {
    const line = rawLine.replace(/;.*/, "");
    const loadA = /^\s*ld\s+a\s*,\s*(\S+)\s*$/i.exec(line);
    if (loadA?.[1] !== undefined) {
      bytes.push(0x3e, number(loadA[1]));
    }
    const storeA = /^\s*ld\s+\(\s*(\S+)\s*\)\s*,\s*a\s*$/i.exec(line);
    if (storeA?.[1] !== undefined) {
      const address = number(storeA[1]);
      bytes.push(0x32, address & 0xff, address >> 8);
    }
    if (/^\s*halt\s*$/i.test(line)) {
      bytes.push(0x76);
    }
  }
  return { blocks: [{ address: 0, bytes }], errors: [] };
}

/** A number written in decimal, or in hexadecimal after `#`. */
function number(text: string): number {
  return text.startsWith("#")
    ? Number.parseInt(text.slice(1), 16)
    : Number(text);
}

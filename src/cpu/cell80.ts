/** The exports of cell80 (z80-tdd, `wasm/src/lib.rs`) that easyZ80 calls. */
export interface Cell80 {
  readonly memory: WebAssembly.Memory;
  memory_ptr(): number;
  state_ptr(): number;
  read_state(): void;
  write_state(): void;
  step(): void;
  text_ptr(): number;
  disassemble(pc: number, bytes: number): number;
}

/** The 64 KB the Z80 addresses. */
export const MEMORY_SIZE = 0x10000;

/** Imports for an instance with no device behind its ports: they read #FF. */
export const NO_DEVICES = { env: { io_in: () => 0xff, io_out: () => {} } };

/** An instruction decoded by cell80, numbers written `#34` as in FantAMS. */
export interface Instruction {
  readonly text: string;
  readonly length: number;
}

const decoder = new TextDecoder();

/** The instruction at `address`, whose first four bytes `byteAt` gives. */
export function decode(
  cell80: Cell80,
  address: number,
  byteAt: (offset: number) => number,
): Instruction {
  const firstFourBytes = [0, 1, 2, 3].reduce(
    (word, i) => word + byteAt(i) * 2 ** (8 * i),
    0,
  );
  // The instruction's length in the high byte, the text's length in the low byte.
  const lengths = cell80.disassemble(address, firstFourBytes);
  const text = decoder.decode(
    new Uint8Array(cell80.memory.buffer, cell80.text_ptr(), lengths & 0xff),
  );
  return { text: text.replaceAll("$", "#"), length: lengths >> 8 };
}

import type { Block } from "../assembler/assemble.ts";
import {
  type Cell80,
  decode,
  type Instruction,
  MEMORY_SIZE,
  NO_DEVICES,
} from "../cpu/cell80.ts";

// The layout of cell80's STATE: the 16-bit registers in this order, then I, R,
// WZ, IM, IFF1, IFF2, Q and the halted flag.
const WORD_NAMES = [
  "af",
  "bc",
  "de",
  "hl",
  "afPrime",
  "bcPrime",
  "dePrime",
  "hlPrime",
  "ix",
  "iy",
  "sp",
  "pc",
] as const;
const HALTED_SLOT = 19;
const SCREEN_START = 0x4000;
/** The screen's width and height, in pixels. */
export const SCREEN_SIZE = 32;
const RANDOM_PORT = 0xfe;
const KEY_PORT = 0xff;
const STATE_LENGTH = 20;

export type Registers = Readonly<Record<(typeof WORD_NAMES)[number], number>>;

/** The documented flags of F, from bit 7 to bit 0; bits 5 and 3 are left out. */
export interface Flags {
  readonly S: boolean;
  readonly Z: boolean;
  readonly H: boolean;
  readonly PV: boolean;
  readonly N: boolean;
  readonly C: boolean;
}

/** An instruction stored in memory, as the listing shows it. */
export interface ListingLine {
  readonly address: number;
  readonly bytes: readonly number[];
  readonly text: string;
}

export interface Snapshot {
  readonly registers: Registers;
  readonly flags: Flags;
  readonly halted: boolean;
  /** Instructions run since `load`. */
  readonly steps: number;
  readonly next: Instruction;
}

export interface MachineOptions {
  /** The byte that `IN A,(#FE)` reads; Math.random by default. */
  readonly random?: () => number;
}

export interface Machine {
  /** Clears memory, stores the blocks and starts at the first one, SP at #FFFF. */
  load(blocks: readonly Block[]): void;
  /** Runs one instruction; false when the CPU is halted. */
  step(): boolean;
  /** Runs up to `count` instructions; returns how many ran. */
  run(count: number): number;
  /**
   * Gives the next `IN A,(#FF)` the code of `key`, upper-cased, once. False when
   * `key` is not one ASCII character, which port #FF cannot hold (ADR 0002).
   */
  pressKey(key: string): boolean;
  snapshot(): Snapshot;
  /** The instructions stored from `start` for `byteCount` bytes. */
  listing(start: number, byteCount: number): ListingLine[];
  /** The 32×32 screen: one byte per pixel from #4000, row after row. */
  readonly screen: Uint8Array;
}

/**
 * The easyZ80 machine (ADR 0002) over cell80. The browser cannot compile more
 * than 4 KB synchronously on the main thread, hence the promise (ADR 0001).
 */
export async function createMachine(
  wasm: Uint8Array<ArrayBuffer>,
  { random = () => Math.floor(Math.random() * 256) }: MachineOptions = {},
): Promise<Machine> {
  const module = await WebAssembly.compile(wasm);
  let key = 0;
  // The ports are decoded on the low byte only: IN A,(n) puts A on the high byte (ADR 0002).
  const io_in = (port: number) => {
    switch (port & 0xff) {
      case RANDOM_PORT:
        return random() & 0xff;
      case KEY_PORT: {
        const read = key;
        key = 0;
        return read;
      }
      default:
        return 0xff;
    }
  };
  const cpu = (
    await WebAssembly.instantiate(module, { env: { io_in, io_out: () => {} } })
  ).exports as unknown as Cell80;
  // Disassembling may grow its memory: it gets its own instance, so the views below stay valid.
  const disassembler = (await WebAssembly.instantiate(module, NO_DEVICES))
    .exports as unknown as Cell80;
  const memory = new Uint8Array(
    cpu.memory.buffer,
    cpu.memory_ptr(),
    MEMORY_SIZE,
  );
  const state = new Uint16Array(
    cpu.memory.buffer,
    cpu.state_ptr(),
    STATE_LENGTH,
  );

  const isHalted = () => {
    cpu.read_state();
    return state[HALTED_SLOT] !== 0;
  };

  let steps = 0;
  const step = () => {
    if (isHalted()) return false;
    cpu.step();
    steps++;
    return true;
  };

  const disassemble = (address: number): Instruction =>
    decode(
      disassembler,
      address,
      (i) => memory[(address + i) % MEMORY_SIZE] ?? 0,
    );

  return {
    screen: memory.subarray(SCREEN_START, SCREEN_START + SCREEN_SIZE ** 2),

    load(blocks) {
      memory.fill(0);
      for (const { address, bytes } of blocks) memory.set(bytes, address);
      state.fill(0);
      state[WORD_NAMES.indexOf("af")] = 0xffff;
      state[WORD_NAMES.indexOf("sp")] = 0xffff;
      state[WORD_NAMES.indexOf("pc")] = blocks[0]?.address ?? 0;
      cpu.write_state();
      key = 0;
      steps = 0;
    },

    step,

    run(count) {
      let ran = 0;
      while (ran < count && step()) ran++;
      return ran;
    },

    pressKey(typed) {
      const code = typed.toUpperCase().charCodeAt(0);
      if (typed.length !== 1 || code > 0x7f) return false;
      key = code;
      return true;
    },

    snapshot() {
      cpu.read_state();
      const registers = Object.fromEntries(
        WORD_NAMES.map((name, i) => [name, state[i] ?? 0]),
      ) as Registers;
      const flag = (bit: number) => (registers.af & (1 << bit)) !== 0;
      return {
        registers,
        flags: {
          S: flag(7),
          Z: flag(6),
          H: flag(4),
          PV: flag(2),
          N: flag(1),
          C: flag(0),
        },
        halted: state[HALTED_SLOT] !== 0,
        steps,
        next: disassemble(registers.pc),
      };
    },

    listing(start, byteCount) {
      const lines: ListingLine[] = [];
      for (let address = start; address < start + byteCount; ) {
        const { text, length } = disassemble(address);
        lines.push({
          address,
          bytes: [...memory.subarray(address, address + length)],
          text,
        });
        address += Math.max(length, 1);
      }
      return lines;
    },
  };
}

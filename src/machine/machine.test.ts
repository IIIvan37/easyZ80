import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assemble } from "../assembler/assemble.ts";
import { createMachine, type MachineOptions } from "./machine.ts";

const wasm = readFileSync(new URL("../cpu/cell80.wasm", import.meta.url));

async function machineRunning(source: string, options?: MachineOptions) {
  const { blocks, errors } = assemble(source);
  expect(errors).toEqual([]);
  const machine = await createMachine(wasm, options);
  machine.load(blocks);
  return machine;
}

describe("machine", () => {
  it("runs a program until it halts", async () => {
    const machine = await machineRunning("ld a,5\nhalt");

    machine.run(10);

    const { registers, halted } = machine.snapshot();
    expect(registers.af >> 8).toBe(5);
    expect(halted).toBe(true);
  });

  it("starts at the first block, so a program placed by org runs from there", async () => {
    const machine = await machineRunning("org #8000\nld a,7\nhalt");

    machine.run(10);

    expect(machine.snapshot().registers.af >> 8).toBe(7);
  });

  it("shows the bytes stored from #4000 on the screen", async () => {
    const machine = await machineRunning(
      "ld a,5\nld (#4000),a\nld (#43FF),a\nhalt",
    );

    machine.run(10);

    expect(machine.screen).toHaveLength(32 * 32);
    expect(machine.screen[0]).toBe(5);
    expect(machine.screen[32 * 32 - 1]).toBe(5);
  });

  it("reads a random byte from port #FE", async () => {
    const machine = await machineRunning("in a,(#FE)\nhalt", {
      random: () => 42,
    });

    machine.run(10);

    expect(machine.snapshot().registers.af >> 8).toBe(42);
  });

  it("reads the last key from port #FF once, then 0", async () => {
    const machine = await machineRunning(
      "in a,(#FF)\nld b,a\nin a,(#FF)\nld c,a\nhalt",
    );

    machine.pressKey(65);
    machine.run(10);

    const { bc } = machine.snapshot().registers;
    expect(bc).toBe(65 * 256 + 0);
  });

  it("counts the instructions run and stops stepping once halted", async () => {
    const machine = await machineRunning("nop\nhalt");

    expect(machine.run(10)).toBe(2);
    expect(machine.step()).toBe(false);
    expect(machine.snapshot().steps).toBe(2);
  });

  it("reads the flags from F", async () => {
    const machine = await machineRunning("xor a\nhalt");

    machine.step();

    expect(machine.snapshot().flags).toEqual({
      S: false,
      Z: true,
      H: false,
      PV: true,
      N: false,
      C: false,
    });
  });

  it("decodes the instruction at PC", async () => {
    const machine = await machineRunning("ld a,5\nld hl,#4000\nhalt");

    machine.step();

    expect(machine.snapshot().next).toEqual({ text: "LD HL,#4000", length: 3 });
  });

  it("lists the instructions stored in a range, with their bytes", async () => {
    const machine = await machineRunning("ld a,5\nld (#4000),a\nhalt");

    expect(machine.listing(0, 6)).toEqual([
      { address: 0, bytes: [0x3e, 0x05], text: "LD A,#05" },
      { address: 2, bytes: [0x32, 0x00, 0x40], text: "LD (#4000),A" },
      { address: 5, bytes: [0x76], text: "HALT" },
    ]);
  });
});
